import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION, type EngineToHost, type HostToEngine } from '@worldopen/contracts';
import { decode, encode } from '@worldopen/host';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { SYNTHETIC_REGION, syntheticMap } from '@worldopen/engine';
import { WorldOpenServer } from '../../src/server';

/** Map-pack de prueba (formato real, contenido sintético) en una carpeta de instalados. */
function fixturePacks(): string {
  const root = mkdtempSync(join(tmpdir(), 'wo-packs-'));
  const logic = syntheticMap(4, SYNTHETIC_REGION);
  const dir = join(root, 'prueba-0.0.1');
  mkdirSync(join(dir, 'logic'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, id: 'prueba', version: '0.0.1', displayName: 'Villaprueba',
    crs: { frame: 'local', axes: 'X=East,Y=Up,Z=-North', units: 'm' }, bounds: logic.bounds,
    logic: { buildings: 'logic/buildings.json', streets: 'logic/streets.json' }, render: {}, attribution: [],
  }));
  writeFileSync(join(dir, 'logic/buildings.json'), JSON.stringify(logic.buildings));
  writeFileSync(join(dir, 'logic/streets.json'), JSON.stringify(logic.streets));
  return root;
}

const ADMIN_PW = 'contraseña-de-dios';
const GUEST_PW = 'contraseña-invitada';
const servers: WorldOpenServer[] = [];

async function boot(dataDir = mkdtempSync(join(tmpdir(), 'wo-server-')), webDir?: string, extra: Partial<ConstructorParameters<typeof WorldOpenServer>[0]> = {}) {
  const server = new WorldOpenServer({
    dataDir, port: 0, ticksPerSecond: 300, framesPerSecond: 20, pumpMs: 5,
    newWorld: { name: 'Pruebas', seed: 3, population: 20 }, ...(webDir ? { webDir } : {}), ...extra,
  });
  servers.push(server);
  await server.users.load();
  if (server.users.list().length === 0) {
    await server.users.add('dios', ADMIN_PW, 'admin');
    await server.users.add('invitada', GUEST_PW, 'observer');
  }
  const addr = await server.start();
  return { server, dataDir, base: `http://127.0.0.1:${addr.port}`, port: addr.port };
}

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

async function login(base: string, name: string, password: string) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password }) });
  const cookie = res.headers.get('set-cookie') ?? '';
  return { res, cookie, header: cookie.split(';')[0]! };
}

/** Cliente WebSocket de prueba que guarda los mensajes y permite esperar condiciones. */
function connect(port: number, path: string, cookie?: string, origin?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
  const msgs: EngineToHost[] = [];
  ws.on('message', (d) => msgs.push(decode<EngineToHost>(String(d))));
  const opened = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.once('error', reject);
  });
  const until = async <T extends EngineToHost>(pred: (m: EngineToHost) => m is T, ms = 4000): Promise<T> => {
    const t0 = Date.now();
    for (;;) {
      const found = msgs.find(pred);
      if (found) return found;
      if (Date.now() - t0 > ms) throw new Error('Tiempo de espera agotado');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const send = (m: HostToEngine) => ws.send(encode(m));
  return { ws, msgs, opened, until, send, close: () => ws.close() };
}

const isType = <K extends EngineToHost['type']>(k: K) => (m: EngineToHost): m is Extract<EngineToHost, { type: K }> => m.type === k;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Servidor · autenticación (V2, ADR-0006)', () => {
  it('rechaza credenciales malas y da una cookie de sesión segura a las buenas', async () => {
    const { base } = await boot();
    expect((await login(base, 'dios', 'mala-contraseña')).res.status).toBe(401);
    expect((await login(base, 'nadie', ADMIN_PW)).res.status).toBe(401);
    const ok = await login(base, 'dios', ADMIN_PW);
    expect(ok.res.status).toBe(200);
    expect(await ok.res.json()).toEqual({ name: 'dios', role: 'admin' });
    expect(ok.cookie).toMatch(/HttpOnly/);
    expect(ok.cookie).toMatch(/SameSite=Strict/);
    const session = await fetch(`${base}/api/session`, { headers: { cookie: ok.header } });
    expect(await session.json()).toMatchObject({ name: 'dios', role: 'admin' });
    await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie: ok.header } });
    expect((await fetch(`${base}/api/session`, { headers: { cookie: ok.header } })).status).toBe(401);
    expect((await fetch(`${base}/api/worlds`)).status).toBe(401);
  });

  it('bloquea una IP tras 5 intentos fallidos, aunque luego acierte', async () => {
    const { base } = await boot();
    for (let k = 0; k < 5; k++) expect((await login(base, 'dios', `mal-${k}-xxxxxx`)).res.status).toBe(401);
    expect((await login(base, 'dios', ADMIN_PW)).res.status).toBe(429);
  });

  it('los WebSockets exigen sesión y mismo origen', async () => {
    const { base, port } = await boot();
    await expect(connect(port, '/ws/live').opened).rejects.toThrow('401');
    const { header } = await login(base, 'invitada', GUEST_PW);
    await expect(connect(port, '/ws/live', header, 'http://atacante.example').opened).rejects.toThrow('403');
    await expect(connect(port, '/ws/otra', header).opened).rejects.toThrow('403');
    const ok = connect(port, '/ws/live', header, base);
    await ok.opened;
    ok.close();
  });
});

describe('Servidor · mundo vivo (T6)', () => {
  it('el mundo avanza sin nadie conectado y quien llega recibe el estado actual', async () => {
    const { base, port } = await boot();
    const { header } = await login(base, 'invitada', GUEST_PW);
    const a = connect(port, '/ws/live', header);
    await a.opened;
    const first = await a.until(isType('status'));
    a.close();
    await sleep(500); // nadie conectado
    const b = connect(port, '/ws/live', header);
    await b.opened;
    expect(await b.until(isType('ready'))).toMatchObject({ manifest: { name: 'Pruebas' } });
    await b.until(isType('frame'));
    const later = await b.until(isType('status'));
    expect(later.status.tick).toBeGreaterThan(first.status.tick + 50);
    expect(later.status).toMatchObject({ running: true, mode: 'live' });
    b.close();
  });

  it('un observador ve pero no manda: ni control del tiempo ni comandos', async () => {
    const { base, port } = await boot();
    const { header } = await login(base, 'invitada', GUEST_PW);
    const c = connect(port, '/ws/live', header);
    await c.opened;
    await c.until(isType('ready'));
    c.send({ type: 'control', action: 'pause' });
    c.send({ type: 'command', envelope: { id: 'x', type: 'criteria.set', version: 1, issuer: { userId: 'dios', role: 'admin' }, payload: { key: 'economy.foodAbundance', value: 0 } } });
    c.send({ type: 'end' });
    await sleep(200);
    expect(c.msgs.filter(isType('error')).map((m) => m.message).join(' ')).toMatch(/Solo el administrador puede hacer «control».*«command».*«end»/s);
    c.send({ type: 'query', requestId: 'cat', query: { kind: 'catalog' } });
    const cat = await c.until((m): m is Extract<EngineToHost, { type: 'queryResult' }> => m.type === 'queryResult' && m.requestId === 'cat');
    expect((cat.result as { values: Record<string, unknown> }).values['economy.foodAbundance']).toBe(0.7);
    const st = c.msgs.filter(isType('status')).at(-1)!;
    expect(st.status.running).toBe(true);
    c.close();
  });

  it('el administrador manda; el servidor fija el emisor (no se puede suplantar el rol)', async () => {
    const { base, port } = await boot();
    const { header } = await login(base, 'dios', ADMIN_PW);
    const c = connect(port, '/ws/live', header);
    await c.opened;
    await c.until(isType('ready'));
    // Aunque el sobre diga "observer", la sesión es de admin: se acepta y queda a nombre de "dios".
    c.send({ type: 'command', envelope: { id: 'c1', type: 'criteria.set', version: 1, issuer: { userId: 'otro', role: 'observer' }, payload: { key: 'society.sociability', value: 0.9 } } });
    expect(await c.until(isType('commandAccepted'))).toMatchObject({ commandId: 'c1' });
    await sleep(100);
    c.send({ type: 'query', requestId: 'log', query: { kind: 'log' } });
    const log = await c.until((m): m is Extract<EngineToHost, { type: 'queryResult' }> => m.type === 'queryResult' && m.requestId === 'log');
    expect((log.result as { envelope: { issuer: unknown } }[]).at(-1)!.envelope.issuer).toEqual({ userId: 'dios', role: 'admin' });
    c.close();
  });

  it('cada respuesta va solo a quien preguntó', async () => {
    const { base, port } = await boot();
    const { header } = await login(base, 'invitada', GUEST_PW);
    const a = connect(port, '/ws/live', header);
    const b = connect(port, '/ws/live', header);
    await Promise.all([a.opened, b.opened]);
    a.send({ type: 'query', requestId: 'q', query: { kind: 'economy' } });
    b.send({ type: 'query', requestId: 'q', query: { kind: 'catalog' } });
    expect((await a.until(isType('queryResult'))).kind).toBe('economy');
    expect((await b.until(isType('queryResult'))).kind).toBe('catalog');
    await sleep(100);
    expect(a.msgs.filter(isType('queryResult'))).toHaveLength(1);
    expect(b.msgs.filter(isType('queryResult'))).toHaveLength(1);
    a.close();
    b.close();
  });

  it('el visor de estudio es privado: estudiar no toca el mundo vivo', async () => {
    const { base, port, server } = await boot();
    const { header } = await login(base, 'invitada', GUEST_PW);
    await sleep(300);
    const live = connect(port, '/ws/live', header);
    await live.opened;
    const ready = await live.until(isType('ready'));
    const study = connect(port, '/ws/study', header);
    await study.opened;
    study.send({ type: 'replay', protocol: PROTOCOL_VERSION, worldId: ready.worldId });
    expect(await study.until(isType('ready'))).toMatchObject({ worldId: ready.worldId, tick: 0 });
    study.send({ type: 'seek', tick: 30 });
    await sleep(200);
    const st = study.msgs.filter(isType('status')).at(-1)!.status;
    expect({ mode: st.mode, tick: st.tick, readOnly: st.readOnly, errors: study.msgs.filter(isType('error')).map((m) => m.message) }).toEqual({ mode: 'replay', tick: 30, readOnly: true, errors: [] });
    study.send({ type: 'command', envelope: { id: 'z', type: 'agent.spawn', version: 1, issuer: { userId: 'x', role: 'admin' }, payload: {} } });
    study.send({ type: 'init', protocol: PROTOCOL_VERSION, manifest: ready.manifest });
    await sleep(100);
    expect(study.msgs.filter(isType('error'))).toHaveLength(2);
    expect(server.live.current).toMatchObject({ worldId: ready.worldId, mode: 'live', running: true });
    live.close();
    study.close();
  });
});

describe('Servidor · persistencia y web', () => {
  it('al detenerse guarda el mundo y al arrancar lo reanuda donde quedó', async () => {
    const first = await boot();
    await sleep(400);
    const before = first.server.live.current!;
    await first.server.close();
    servers.length = 0;
    const saved = (await first.server.store.listWorlds())[0]!;
    expect(saved).toMatchObject({ worldId: before.worldId, status: 'paused' });
    expect(saved.lastTick).toBeGreaterThanOrEqual(before.tick);

    const second = await boot(first.dataDir);
    expect(second.server.live.current).toMatchObject({ worldId: before.worldId, running: true });
    expect(second.server.live.current!.tick).toBeGreaterThanOrEqual(saved.lastTick);
  });

  it('sirve la web compilada y no deja salir de su carpeta', async () => {
    const web = mkdtempSync(join(tmpdir(), 'wo-web-'));
    mkdirSync(join(web, 'assets'));
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>WorldOpen</title>');
    writeFileSync(join(web, 'assets', 'app.js'), 'console.log(1)');
    const { base } = await boot(undefined, web);
    expect(await (await fetch(`${base}/`)).text()).toContain('WorldOpen');
    expect((await fetch(`${base}/assets/app.js`)).headers.get('content-type')).toBe('text/javascript');
    expect(await (await fetch(`${base}/cualquier/ruta`)).text()).toContain('WorldOpen');
    const escape = await fetch(`${base}/..%2f..%2fusers.json`);
    expect(escape.status === 403 || (await escape.text()).includes('WorldOpen')).toBe(true);
  });

  it('el mundo nuevo puede nacer sobre un map-pack; los map-packs se sirven solo con sesión', async () => {
    const packs = fixturePacks();
    const { base, server } = await boot(undefined, undefined, { mapPacksDir: packs, newWorldMapPack: 'prueba-0.0.1' });
    await server.live.flush();
    expect((await server.store.getManifest(server.live.current!.worldId))!.regions[0]).toMatchObject({ displayName: 'Villaprueba', mapPack: { id: 'prueba' } });
    expect((await fetch(`${base}/map-packs/index.json`)).status).toBe(401);
    const { header } = await login(base, 'invitada', GUEST_PW);
    const index = await (await fetch(`${base}/map-packs/index.json`, { headers: { cookie: header } })).json();
    expect(index.map((m: { id: string }) => m.id)).toEqual(['prueba']);
    expect((await fetch(`${base}/map-packs/prueba-0.0.1/logic/streets.json`, { headers: { cookie: header } })).status).toBe(200);
    expect((await fetch(`${base}/map-packs/..%2f..%2fusers.json`, { headers: { cookie: header } })).status).toBeGreaterThanOrEqual(403);
    expect((await fetch(`${base}/map-packs/no-existe.json`, { headers: { cookie: header } })).status).toBe(404);
  });
});
