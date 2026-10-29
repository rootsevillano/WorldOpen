import {
  PROTOCOL_VERSION,
  ENGINE_VERSION,
  frameTransferables,
  type EngineQuery,
  type EngineStatus,
  type EngineToHost,
  type HostToEngine,
  type LoggedCommand,
  type QueryResultMap,
  type Timeline,
  type WorldStatus,
  type WorldStore,
} from '@worldopen/contracts';
import { ReplayAnalysis, Simulation, tickToDate, ticksPerDay } from '@worldopen/engine';

export type Post = (msg: EngineToHost, transfer?: ArrayBuffer[]) => void;

export interface HostOptions {
  /** Intervalo mínimo entre frames publicados. Por defecto 30 por segundo (Worker); el servidor envía menos. */
  frameIntervalMs?: number;
  /** Además del snapshot por día de juego, uno cada este tiempo real (servidor: acota lo que se pierde si se cae). */
  saveIntervalMs?: number;
}

const FRAME_INTERVAL_MS = 1000 / 30;
const STATUS_INTERVAL_MS = 250;
/** Presupuesto de CPU por porción en modo 'max', para seguir atendiendo mensajes. */
const MAX_SLICE_MS = 12;

/**
 * Host del motor (ADR-0002): traduce el Simulation Protocol a llamadas a `Simulation`, decide el ritmo y, si tiene
 * `WorldStore`, guarda el mundo (ADR-0004): un snapshot por día de juego, al pausar y al terminar.
 * No conoce temporizadores: quien lo aloja llama a `pump(nowMs)` periódicamente (Worker hoy, servidor mañana).
 */
export class EngineHostCore {
  private sim: Simulation | null = null;
  private running = false;
  private ticksPerSecond: number | 'max' = 1;
  private lastPumpMs: number | null = null;
  private tickDebt = 0;
  private lastFrameMs = -Infinity;
  private lastStatusMs = -Infinity;
  private tpsWindowStart = 0;
  private tpsWindowTicks = 0;
  private measuredTps = 0;

  // Persistencia.
  private worldStatus: WorldStatus = 'created';
  private readOnly = false;
  private savedTick = -1;
  private savedLogCount = 0;
  private saving = false;
  private lastSaveMs = 0;
  /** Hay una escritura del log en cola (no bloquea los snapshots: la cola de escrituras es serie). */
  private logPending = false;
  private chain: Promise<void> = Promise.resolve();

  // Visor de estudio (ADR-0015).
  private mode: 'live' | 'replay' = 'live';
  private timeline: Timeline | null = null;
  private replayLog: LoggedCommand[] = [];
  private analysis: ReplayAnalysis | null = null;
  private seekSeq = 0;

  constructor(
    private readonly post: Post,
    private readonly now: () => number,
    private readonly store: WorldStore | null = null,
    private readonly options: HostOptions = {},
  ) {}

  /** Mundo cargado (para el servidor: saber qué mundo vive y en qué tick). */
  get current(): { worldId: string; tick: number; running: boolean; mode: 'live' | 'replay' } | null {
    return this.sim ? { worldId: this.sim.manifest.worldId, tick: this.sim.tick, running: this.running, mode: this.mode } : null;
  }

  handle(msg: HostToEngine): void {
    try {
      this.dispatch(msg);
    } catch (err) {
      this.fail(err);
    }
  }

  /** Guarda ya el mundo vivo (sin pausarlo). El servidor lo usa antes de abrirlo en un visor de estudio. */
  saveNow(): Promise<void> {
    if (this.mode !== 'live' || !this.sim || this.sim.tick === this.savedTick) return this.chain;
    return this.save();
  }

  /** Espera a que terminen las escrituras pendientes en el `WorldStore` (tests y cierre). */
  flush(): Promise<void> {
    return this.chain;
  }

  private fail(err: unknown): void {
    this.running = false;
    this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }

  /** Encadena una operación asíncrona de persistencia; los errores se notifican sin parar el host. */
  private enqueue(op: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(op).catch((err) => this.fail(err));
    return this.chain;
  }

  /** Avanza la simulación según el tiempo real transcurrido. Devuelve `true` si sigue en marcha. */
  pump(nowMs: number): boolean {
    const sim = this.sim;
    if (!sim) return false;
    if (this.running) {
      try {
        const done = this.advance(sim, nowMs);
        this.tpsWindowTicks += done;
        if (this.store && !this.saving) {
          const interval = this.options.saveIntervalMs;
          if (sim.tick - this.savedTick >= ticksPerDay(sim.manifest.time) || (interval && nowMs - this.lastSaveMs >= interval && sim.tick !== this.savedTick)) {
            this.lastSaveMs = nowMs;
            void this.save();
          }
        }
        if (this.store && !this.logPending && sim.commandLog().length > this.savedLogCount) this.persistLog();
      } catch (err) {
        this.fail(err);
      }
    }
    if (this.analysis && !this.analysis.done) this.analyzeSlice();
    this.lastPumpMs = nowMs;
    if (nowMs - this.tpsWindowStart >= 1000) {
      this.measuredTps = Math.round((this.tpsWindowTicks * 1000) / (nowMs - this.tpsWindowStart));
      this.tpsWindowStart = nowMs;
      this.tpsWindowTicks = 0;
    }
    if (nowMs - this.lastFrameMs >= (this.options.frameIntervalMs ?? FRAME_INTERVAL_MS)) this.publishFrame(nowMs);
    if (nowMs - this.lastStatusMs >= STATUS_INTERVAL_MS) this.publishStatus(nowMs);
    return this.running;
  }

  /** En replay no se puede pasar del último tick grabado. */
  private remaining(sim: Simulation): number {
    if (this.mode !== 'replay' || !this.timeline) return Infinity;
    return Math.max(0, this.timeline.endTick - sim.tick);
  }

  private advance(sim: Simulation, nowMs: number): number {
    if (this.remaining(sim) === 0) {
      this.running = false;
      this.publishStatus(nowMs);
      return 0;
    }
    if (this.ticksPerSecond === 'max') {
      let done = 0;
      const start = this.now();
      do {
        const n = Math.min(10, this.remaining(sim));
        if (n === 0) break;
        sim.step(n);
        done += n;
      } while (this.now() - start < MAX_SLICE_MS);
      this.flushEvents(sim);
      return done;
    }
    const dt = this.lastPumpMs === null ? 0 : Math.min(nowMs - this.lastPumpMs, 1000);
    // Deuda en "ms × ticks/s" para no acumular error de redondeo con pasos de tiempo enteros.
    this.tickDebt += dt * this.ticksPerSecond;
    const n = Math.min(Math.floor(this.tickDebt / 1000), this.remaining(sim));
    if (n > 0) {
      this.tickDebt -= n * 1000;
      sim.step(n);
      this.flushEvents(sim);
    }
    return n;
  }

  /** Una porción del análisis en segundo plano (la mitad del presupuesto de CPU de una porción). */
  private analyzeSlice(): void {
    const a = this.analysis!;
    const start = this.now();
    try {
      do a.advance(240);
      while (!a.done && this.now() - start < MAX_SLICE_MS / 2);
    } catch (err) {
      this.analysis = null;
      this.fail(err);
      return;
    }
    this.post({
      type: 'series',
      chunk: a.takeChunk(),
      analysis: { progress: a.progress, done: a.done, verification: { ...a.verification, failed: [...a.verification.failed] } },
    });
  }

  /** Salta a `tick` en replay: avanza si está cerca; si no, restaura el snapshot anterior y avanza desde él. */
  private seek(target: number): void {
    const sim = this.sim!;
    const tl = this.timeline!;
    const t = Math.max(tl.startTick, Math.min(tl.endTick, Math.round(target)));
    const seq = ++this.seekSeq;
    const after = () => {
      this.flushEvents(this.sim!);
      this.publishFrame(this.now());
      this.publishStatus(this.now());
    };
    if (t >= sim.tick && t - sim.tick <= ticksPerDay(sim.manifest.time)) {
      sim.step(t - sim.tick);
      after();
      return;
    }
    const store = this.store!;
    void this.enqueue(async () => {
      const snap = await store.getSnapshot(tl.worldId, t);
      // Un salto posterior deja obsoleto este.
      if (!snap || seq !== this.seekSeq) return;
      const restored = Simulation.restore(sim.manifest, snap, this.replayLog);
      restored.step(t - snap.tick);
      restored.drainEvents();
      this.sim = restored;
      after();
    });
  }

  /**
   * Escribe ya en el log los comandos aplicados desde el último guardado: un comando de Dios nunca se pierde aunque el
   * host se caiga antes del siguiente snapshot (al recargar se reproduce en su tick).
   */
  private persistLog(): void {
    const sim = this.sim;
    const store = this.store;
    if (!sim || !store || this.readOnly || this.mode !== 'live') return;
    const log = sim.commandLog();
    const worldId = sim.manifest.worldId;
    this.logPending = true;
    void this.enqueue(async () => {
      try {
        // El tramo se calcula al ejecutar: si un snapshot ya lo guardó, no se repite.
        const fresh = log.slice(this.savedLogCount);
        if (fresh.length > 0) await store.appendCommands(worldId, fresh);
        this.savedLogCount = Math.max(this.savedLogCount, log.length);
      } finally {
        this.logPending = false;
      }
    });
  }

  /** Guarda log nuevo + snapshot + estado. Una escritura a la vez. */
  private save(status?: WorldStatus): Promise<void> {
    const sim = this.sim;
    const store = this.store;
    if (!sim || !store || this.readOnly) return this.chain;
    this.saving = true;
    const snapshot = sim.snapshot();
    const log = sim.commandLog();
    const worldId = sim.manifest.worldId;
    const nextStatus = status ?? (this.running ? 'running' : 'paused');
    return this.enqueue(async () => {
      try {
        // Se calcula al ejecutar (las escrituras van en serie): nunca se duplica un tramo del log.
        await store.appendCommands(worldId, log.slice(this.savedLogCount));
        await store.putSnapshot(worldId, snapshot);
        await store.setStatus(worldId, nextStatus, snapshot.tick);
        this.savedLogCount = log.length;
        this.savedTick = snapshot.tick;
        this.worldStatus = nextStatus;
      } finally {
        this.saving = false;
      }
    });
  }

  private start(sim: Simulation, status: WorldStatus, readOnly: boolean, savedTick: number, mode: 'live' | 'replay' = 'live'): void {
    this.sim = sim;
    this.mode = mode;
    this.analysis = null;
    if (mode === 'live') {
      this.timeline = null;
      this.replayLog = [];
    }
    this.running = false;
    this.worldStatus = status;
    this.readOnly = readOnly;
    this.savedTick = savedTick;
    this.savedLogCount = sim.commandLog().length;
    this.post({ type: 'ready', protocol: PROTOCOL_VERSION, engineVersion: ENGINE_VERSION, worldId: sim.manifest.worldId, tick: sim.tick, manifest: sim.manifest });
    this.publishFrame(this.now());
    this.publishStatus(this.now());
  }

  private dispatch(msg: HostToEngine): void {
    if (msg.type === 'init' || msg.type === 'load' || msg.type === 'replay') {
      if (msg.protocol !== PROTOCOL_VERSION) {
        throw new Error(`Protocolo ${msg.protocol} incompatible (motor: ${PROTOCOL_VERSION})`);
      }
      // Antes de cambiar de mundo se guarda el progreso del mundo vivo (la carga va detrás en la misma cola).
      if (this.sim && this.store && this.mode === 'live' && !this.readOnly && this.sim.tick !== this.savedTick) {
        this.running = false;
        void this.save('paused');
      }
    }
    if (msg.type === 'init') {
      const sim = msg.snapshot
        ? Simulation.restore(msg.manifest, msg.snapshot, msg.log ?? [])
        : new Simulation(msg.manifest);
      // Hasta que el mundo quede registrado en el almacén, no hay nada guardado (savedTick = −1).
      this.start(sim, 'created', false, -1);
      if (this.store) {
        const store = this.store;
        const snapshot = sim.snapshot();
        void this.enqueue(async () => {
          await store.createWorld(msg.manifest);
          await store.putSnapshot(msg.manifest.worldId, snapshot);
          this.savedTick = snapshot.tick;
          this.publishStatus(this.now());
        });
      }
      return;
    }
    if (msg.type === 'load') {
      const store = this.store;
      if (!store) throw new Error('Este host no tiene almacén de mundos');
      void this.enqueue(async () => {
        const manifest = await store.getManifest(msg.worldId);
        if (!manifest) throw new Error(`No existe el mundo ${msg.worldId}`);
        const snapshot = await store.getSnapshot(msg.worldId);
        if (!snapshot) throw new Error(`El mundo ${msg.worldId} no tiene snapshots`);
        const log = await store.readCommands(msg.worldId);
        const summary = (await store.listWorlds()).find((w) => w.worldId === msg.worldId);
        const status = summary?.status ?? 'paused';
        this.start(Simulation.restore(manifest, snapshot, log), status, status === 'ended', snapshot.tick);
      });
      return;
    }

    if (msg.type === 'replay') {
      const store = this.store;
      if (!store) throw new Error('Este host no tiene almacén de mundos');
      void this.enqueue(async () => {
        const manifest = await store.getManifest(msg.worldId);
        if (!manifest) throw new Error(`No existe el mundo ${msg.worldId}`);
        const snapshots = await store.listSnapshots(msg.worldId);
        const first = snapshots.length > 0 ? await store.getSnapshot(msg.worldId, snapshots[0]!.tick) : null;
        if (!first) throw new Error(`El mundo ${msg.worldId} no tiene snapshots`);
        const log = await store.readCommands(msg.worldId);
        const summary = (await store.listWorlds()).find((w) => w.worldId === msg.worldId);
        const endTick = Math.max(summary?.lastTick ?? 0, snapshots.at(-1)!.tick);
        this.replayLog = log;
        this.timeline = {
          worldId: manifest.worldId, name: manifest.name, time: manifest.time,
          startTick: first.tick, endTick, snapshots, commands: log,
        };
        this.start(Simulation.restore(manifest, first, log), summary?.status ?? 'ended', true, snapshots.at(-1)!.tick, 'replay');
      });
      return;
    }

    const sim = this.sim;
    if (!sim) throw new Error(`Mensaje "${msg.type}" antes de "init"`);

    switch (msg.type) {
      case 'seek':
        if (this.mode !== 'replay') throw new Error('seek solo está disponible en el visor de estudio');
        this.seek(msg.tick);
        return;
      case 'analyze': {
        const tl = this.timeline;
        if (this.mode !== 'replay' || !tl) throw new Error('analyze solo está disponible en el visor de estudio');
        const store = this.store!;
        void this.enqueue(async () => {
          const first = await store.getSnapshot(tl.worldId, tl.startTick);
          if (!first) throw new Error('Falta el snapshot inicial');
          this.analysis = new ReplayAnalysis(sim.manifest, first, this.replayLog, tl.snapshots, tl.endTick, msg.everyTicks, msg.metrics);
        });
        return;
      }
      case 'end':
        if (this.mode === 'replay') throw new Error('Un replay no se puede terminar');
        this.running = false;
        void this.save('ended').then(() => {
          this.readOnly = true;
          this.publishStatus(this.now());
        });
        return;
      case 'control':
        if (msg.action === 'play') {
          if (this.readOnly && this.mode === 'live') throw new Error('El mundo ha terminado: es de solo lectura');
          this.running = true;
          this.lastPumpMs = null;
          this.tickDebt = 0;
        } else if (msg.action === 'pause') {
          this.running = false;
          if (this.store && sim.tick !== this.savedTick) void this.save('paused');
        } else if (msg.action === 'setSpeed') {
          if (msg.ticksPerSecond !== 'max' && !(msg.ticksPerSecond >= 0)) throw new Error('ticksPerSecond inválido');
          this.ticksPerSecond = msg.ticksPerSecond;
        }
        this.publishStatus(this.now());
        return;
      case 'step':
        if (this.readOnly && this.mode === 'live') throw new Error('El mundo ha terminado: es de solo lectura');
        sim.step(Math.min(msg.ticks, this.remaining(sim)));
        this.flushEvents(sim);
        if (this.store && !this.logPending && sim.commandLog().length > this.savedLogCount) this.persistLog();
        this.publishFrame(this.now());
        this.publishStatus(this.now());
        return;
      case 'command': {
        if (this.readOnly) {
          this.post({ type: 'commandRejected', commandId: msg.envelope.id, reason: 'read_only', message: 'El mundo ha terminado: es de solo lectura' });
          return;
        }
        const res = sim.submit(msg.envelope);
        this.post(
          res.ok
            ? { type: 'commandAccepted', commandId: msg.envelope.id, appliedAtTick: res.appliedAtTick }
            : { type: 'commandRejected', commandId: msg.envelope.id, reason: res.reason, message: res.message },
        );
        return;
      }
      case 'query':
        this.post({ type: 'queryResult', requestId: msg.requestId, kind: msg.query.kind, result: this.query(sim, msg.query) });
        return;
    }
  }

  private query(sim: Simulation, q: EngineQuery): QueryResultMap[EngineQuery['kind']] {
    switch (q.kind) {
      case 'catalog': return sim.catalog();
      case 'snapshot': return sim.snapshot();
      case 'log': return sim.commandLog();
      case 'map': return sim.mapLogic();
      case 'agent': return sim.agent(q.agentId);
      case 'building': return sim.building(q.buildingId);
      case 'economy': return sim.economy();
      case 'timeline': return this.timeline;
    }
  }

  private flushEvents(sim: Simulation): void {
    const events = sim.drainEvents();
    if (events.length > 0) this.post({ type: 'events', events });
  }

  private publishFrame(nowMs: number): void {
    if (!this.sim) return;
    this.lastFrameMs = nowMs;
    const frame = this.sim.frame();
    this.post({ type: 'frame', frame }, frameTransferables(frame));
  }

  private publishStatus(nowMs: number): void {
    if (!this.sim) return;
    this.lastStatusMs = nowMs;
    const status: EngineStatus = {
      running: this.running,
      ticksPerSecond: this.ticksPerSecond,
      measuredTps: this.running ? this.measuredTps : 0,
      tick: this.sim.tick,
      date: tickToDate(this.sim.tick, this.sim.manifest.time),
      worldId: this.sim.manifest.worldId,
      worldStatus: this.worldStatus,
      readOnly: this.readOnly,
      savedTick: this.savedTick,
      mode: this.mode,
      endTick: this.timeline?.endTick ?? null,
    };
    this.post({ type: 'status', status });
  }
}
