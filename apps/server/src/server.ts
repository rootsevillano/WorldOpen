import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROTOCOL_VERSION, type EngineToHost, type HostToEngine, type WorldStore } from '@worldopen/contracts';
import { createManifest } from '@worldopen/engine';
import { EngineHostCore, decode, encode } from '@worldopen/host';
import { FileWorldStore } from '@worldopen/cli/fileStore';
import { WebSocketServer, type WebSocket } from 'ws';
import { LoginLimiter, SESSION_COOKIE, Sessions, readCookie, type Session } from './sessions';
import { UserStore } from './users';

export interface ServerOptions {
  dataDir: string;
  /** Carpeta con la web compilada (`apps/web/dist`); sin ella solo se sirven la API y los WebSockets. */
  webDir?: string;
  port?: number;
  host?: string;
  /** Velocidad del mundo vivo (ticks/s reales). Por defecto 1 (1 día de juego en 24 min). */
  ticksPerSecond?: number;
  /** Frames por segundo enviados a cada cliente (menos que en el Worker: van por red). */
  framesPerSecond?: number;
  /** Mundo nuevo si no hay ninguno sin terminar. */
  newWorld?: { name: string; seed: number; population: number };
  /** Orígenes extra admitidos en los WebSockets (además del propio host). */
  allowedOrigins?: string[];
  /** Cookie `Secure` (detrás de HTTPS). */
  secureCookies?: boolean;
  now?: () => number;
  /** Snapshot del mundo vivo cada este tiempo real (por defecto 30 s). */
  saveIntervalMs?: number;
  /** Intervalo del bucle del motor en ms. */
  pumpMs?: number;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm',
};

/** Mensajes que un observador puede enviar al mundo vivo. El resto exige `admin` (V2, ADR-0006). */
const OBSERVER_LIVE: HostToEngine['type'][] = ['query'];
const ADMIN_LIVE: HostToEngine['type'][] = ['query', 'control', 'step', 'command', 'init', 'load', 'end'];
/** El visor de estudio es privado de cada conexión: cualquiera puede manejarlo. */
const STUDY: HostToEngine['type'][] = ['replay', 'seek', 'analyze', 'control', 'step', 'query'];

/** Envoltorio de solo lectura: el visor de estudio nunca escribe en el histórico. */
function readOnlyStore(store: WorldStore): WorldStore {
  const deny = async () => {
    throw new Error('El visor de estudio es de solo lectura');
  };
  return {
    listWorlds: () => store.listWorlds(),
    getManifest: (id) => store.getManifest(id),
    readCommands: (id, from) => store.readCommands(id, from),
    listSnapshots: (id) => store.listSnapshots(id),
    getSnapshot: (id, at) => store.getSnapshot(id, at),
    createWorld: deny, setStatus: deny, appendCommands: deny, putSnapshot: deny,
  };
}

interface Client {
  id: string;
  socket: WebSocket;
  session: Session;
}

/**
 * Servidor de WorldOpen (Fase 5, ADR-0016): aloja el mundo vivo (sigue corriendo sin nadie conectado y se guarda en
 * ficheros), autentica usuarios, comparte el mundo por WebSocket con el Simulation Protocol y da a cada conexión su
 * propio visor de estudio.
 */
export class WorldOpenServer {
  readonly users: UserStore;
  readonly sessions = new Sessions();
  readonly store: FileWorldStore;
  readonly live: EngineHostCore;
  private readonly limiter = new LoginLimiter();
  private readonly http: Server;
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  private readonly clients = new Map<string, Client>();
  private readonly studySockets = new Set<WebSocket>();
  private readonly cache = new Map<'ready' | 'status' | 'frame', EngineToHost>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private closing = false;

  constructor(private readonly opts: ServerOptions) {
    this.now = opts.now ?? (() => performance.now());
    this.users = new UserStore(join(opts.dataDir, 'users.json'));
    this.store = new FileWorldStore(join(opts.dataDir, 'worlds'));
    const frameMs = 1000 / (opts.framesPerSecond ?? 10);
    this.live = new EngineHostCore((msg) => this.fromLive(msg), this.now, this.store, {
      frameIntervalMs: frameMs,
      saveIntervalMs: opts.saveIntervalMs ?? 30_000,
    });
    this.http = createServer((req, res) => void this.route(req, res).catch((err) => this.fail(res, err)));
    this.http.on('upgrade', (req, socket, head) => {
      const kind = new URL(req.url ?? '/', 'http://x').pathname;
      const session = this.sessions.get(readCookie(req.headers.cookie, SESSION_COOKIE));
      if (!this.originAllowed(req) || !session || (kind !== '/ws/live' && kind !== '/ws/study')) {
        socket.write(`HTTP/1.1 ${session ? 403 : 401} ${session ? 'Forbidden' : 'Unauthorized'}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => (kind === '/ws/live' ? this.attachLive(ws, session) : this.attachStudy(ws, session)));
    });
  }

  /** Arranca: usuarios, mundo vivo (reanuda el último sin terminar o crea uno) y escucha. */
  async start(): Promise<AddressInfo> {
    await this.users.load();
    const resume = (await this.store.listWorlds()).find((w) => w.status !== 'ended');
    const ready = new Promise<void>((resolveReady) => {
      const check = setInterval(() => {
        if (this.cache.has('ready')) {
          clearInterval(check);
          resolveReady();
        }
      }, 5);
    });
    if (resume) this.live.handle({ type: 'load', protocol: PROTOCOL_VERSION, worldId: resume.worldId });
    else {
      const w = this.opts.newWorld ?? { name: 'Valdeolivo', seed: 1, population: 50 };
      this.live.handle({
        type: 'init', protocol: PROTOCOL_VERSION,
        manifest: createManifest({ worldId: randomUUID(), createdAt: new Date().toISOString(), seed: w.seed, name: w.name, criteria: { 'society.initialPopulation': w.population } }),
      });
    }
    await ready;
    // T6: el mundo vive aunque no haya nadie conectado.
    this.live.handle({ type: 'control', action: 'setSpeed', ticksPerSecond: this.opts.ticksPerSecond ?? 1 });
    this.live.handle({ type: 'control', action: 'play' });
    this.loop();
    await new Promise<void>((r) => this.http.listen(this.opts.port ?? 8787, this.opts.host ?? '127.0.0.1', r));
    return this.http.address() as AddressInfo;
  }

  /** Para con orden: pausa el mundo (lo guarda), cierra conexiones y espera a las escrituras. */
  async close(): Promise<void> {
    this.closing = true;
    if (this.timer) clearTimeout(this.timer);
    this.live.handle({ type: 'control', action: 'pause' });
    await this.live.flush();
    for (const c of this.clients.values()) c.socket.close(1001, 'Servidor detenido');
    for (const s of this.studySockets) s.close(1001, 'Servidor detenido');
    this.wss.close();
    await new Promise<void>((r) => this.http.close(() => r()));
    this.http.closeAllConnections?.();
  }

  private loop(): void {
    if (this.closing) return;
    this.live.pump(this.now());
    this.timer = setTimeout(() => this.loop(), this.opts.pumpMs ?? 8);
  }

  // ——— Mundo vivo ———

  private fromLive(msg: EngineToHost): void {
    if (msg.type === 'ready' || msg.type === 'status' || msg.type === 'frame') this.cache.set(msg.type, msg);
    if (msg.type === 'queryResult') {
      // Las respuestas van solo a quien preguntó (id de cliente como prefijo).
      const sep = msg.requestId.indexOf(':');
      const client = this.clients.get(msg.requestId.slice(0, sep));
      client?.socket.send(encode({ ...msg, requestId: msg.requestId.slice(sep + 1) }));
      return;
    }
    if (msg.type === 'commandAccepted' || msg.type === 'commandRejected') {
      const sep = msg.commandId.indexOf(':');
      const client = this.clients.get(msg.commandId.slice(0, sep));
      client?.socket.send(encode({ ...msg, commandId: msg.commandId.slice(sep + 1) }));
      return;
    }
    const text = encode(msg);
    for (const c of this.clients.values()) if (c.socket.readyState === c.socket.OPEN) c.socket.send(text);
  }

  private attachLive(socket: WebSocket, session: Session): void {
    const client: Client = { id: randomUUID(), socket, session };
    this.clients.set(client.id, client);
    // Quien llega recibe el estado actual sin esperar al siguiente frame.
    for (const k of ['ready', 'status', 'frame'] as const) {
      const m = this.cache.get(k);
      if (m) socket.send(encode(m));
    }
    socket.on('message', (data) => this.fromClient(client, String(data)));
    socket.on('close', () => this.clients.delete(client.id));
  }

  private fromClient(client: Client, text: string): void {
    let msg: HostToEngine;
    try {
      msg = decode<HostToEngine>(text);
    } catch {
      client.socket.send(encode({ type: 'error', message: 'Mensaje ilegible' }));
      return;
    }
    // La sesión puede haber caducado o revocado desde que se abrió el socket.
    const session = this.sessions.get(client.session.token);
    if (!session) {
      client.socket.close(4401, 'Sesión caducada');
      return;
    }
    const allowed = session.role === 'admin' ? ADMIN_LIVE : OBSERVER_LIVE;
    if (!allowed.includes(msg.type)) {
      client.socket.send(encode({ type: 'error', message: `Solo el administrador puede hacer «${msg.type}» en el mundo compartido` }));
      return;
    }
    if (msg.type === 'query') this.live.handle({ ...msg, requestId: `${client.id}:${msg.requestId}` });
    else if (msg.type === 'command') {
      // El emisor lo fija el servidor según la sesión: no se puede suplantar el rol.
      const envelope = { ...msg.envelope, id: `${client.id}:${msg.envelope.id}`, issuer: { userId: session.name, role: session.role } };
      this.live.handle({ type: 'command', envelope });
    } else this.live.handle(msg);
  }

  // ——— Visor de estudio privado ———

  private attachStudy(socket: WebSocket, session: Session): void {
    const send = (msg: EngineToHost) => {
      if (socket.readyState === socket.OPEN) socket.send(encode(msg));
    };
    this.studySockets.add(socket);
    const core = new EngineHostCore(send, this.now, readOnlyStore(this.store), { frameIntervalMs: 1000 / 20 });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = () => {
      core.pump(this.now());
      timer = setTimeout(loop, this.opts.pumpMs ?? 8);
    };
    loop();
    socket.on('message', (data) => {
      let msg: HostToEngine;
      try {
        msg = decode<HostToEngine>(String(data));
      } catch {
        send({ type: 'error', message: 'Mensaje ilegible' });
        return;
      }
      if (!this.sessions.get(session.token)) {
        socket.close(4401, 'Sesión caducada');
        return;
      }
      if (!STUDY.includes(msg.type)) {
        send({ type: 'error', message: `«${msg.type}» no está disponible en el visor de estudio` });
        return;
      }
      // Estudiar el mundo que está vivo: se guarda antes para que el estudio llegue hasta el presente.
      if (msg.type === 'replay' && msg.worldId === this.live.current?.worldId) {
        const m = msg;
        void this.live.saveNow().then(() => core.handle(m));
        return;
      }
      core.handle(msg);
    });
    socket.on('close', () => {
      this.studySockets.delete(socket);
      if (timer) clearTimeout(timer);
    });
  }

  // ——— HTTP ———

  private originAllowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // clientes no navegador (tests, CLI)
    const host = req.headers.host;
    try {
      const u = new URL(origin);
      return u.host === host || (this.opts.allowedOrigins ?? []).includes(origin);
    } catch {
      return false;
    }
  }

  private ip(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? 'unknown';
  }

  private json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }

  private fail(res: ServerResponse, err: unknown): void {
    if (!res.headersSent) this.json(res, 500, { error: err instanceof Error ? err.message : 'Error interno' });
  }

  private async body(req: IncomingMessage, limit = 4096): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > limit) throw Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 });
      chunks.push(c as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }

  private cookie(token: string, maxAge: number): string {
    return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${this.opts.secureCookies ? '; Secure' : ''}`;
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x');
    const session = this.sessions.get(readCookie(req.headers.cookie, SESSION_COOKIE));

    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (!this.originAllowed(req)) return this.json(res, 403, { error: 'Origen no permitido' });
      const ip = this.ip(req);
      if (this.limiter.blocked(ip)) return this.json(res, 429, { error: 'Demasiados intentos. Prueba más tarde.' });
      let body: { name?: unknown; password?: unknown };
      try {
        body = (await this.body(req)) as typeof body;
      } catch (err) {
        return this.json(res, (err as { status?: number }).status ?? 400, { error: 'Petición inválida' });
      }
      const user = typeof body.name === 'string' && typeof body.password === 'string' ? await this.users.verify(body.name, body.password) : null;
      if (!user) {
        this.limiter.fail(ip);
        return this.json(res, 401, { error: 'Usuario o contraseña incorrectos' });
      }
      this.limiter.succeed(ip);
      const s = this.sessions.create(user.name, user.role);
      return this.json(res, 200, { name: s.name, role: s.role }, { 'Set-Cookie': this.cookie(s.token, 12 * 3600) });
    }
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      this.sessions.delete(session?.token);
      return this.json(res, 200, { ok: true }, { 'Set-Cookie': this.cookie('', 0) });
    }
    if (url.pathname === '/api/session') {
      return session ? this.json(res, 200, { name: session.name, role: session.role, mode: 'server' }) : this.json(res, 401, { error: 'Sin sesión' });
    }
    if (url.pathname === '/api/worlds') {
      if (!session) return this.json(res, 401, { error: 'Sin sesión' });
      return this.json(res, 200, await this.store.listWorlds());
    }
    if (url.pathname.startsWith('/api/')) return this.json(res, 404, { error: 'No encontrado' });

    if (req.method !== 'GET' && req.method !== 'HEAD') return this.json(res, 405, { error: 'Método no permitido' });
    return this.serveStatic(url.pathname, res);
  }

  private async serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    if (!this.opts.webDir) return this.json(res, 404, { error: 'Sin web compilada (npm run build)' });
    const root = resolve(this.opts.webDir);
    let file = resolve(root, normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, ''));
    // Nada fuera de la carpeta de la web.
    if (file !== root && !file.startsWith(root + sep)) return this.json(res, 403, { error: 'Prohibido' });
    let info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) {
      file = join(root, 'index.html');
      info = await stat(file).catch(() => null);
      if (!info) return this.json(res, 404, { error: 'No encontrado' });
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    createReadStream(file).pipe(res);
  }

  get address(): AddressInfo {
    return this.http.address() as AddressInfo;
  }
}
