import {
  PROTOCOL_VERSION,
  ENGINE_VERSION,
  frameTransferables,
  type EngineQuery,
  type EngineStatus,
  type EngineToHost,
  type HostToEngine,
  type QueryResultMap,
  type WorldStatus,
  type WorldStore,
} from '@worldopen/contracts';
import { Simulation, tickToDate, ticksPerDay } from '@worldopen/engine';

export type Post = (msg: EngineToHost, transfer?: ArrayBuffer[]) => void;

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
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly post: Post,
    private readonly now: () => number,
    private readonly store: WorldStore | null = null,
  ) {}

  handle(msg: HostToEngine): void {
    try {
      this.dispatch(msg);
    } catch (err) {
      this.fail(err);
    }
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
        if (this.store && !this.saving && sim.tick - this.savedTick >= ticksPerDay(sim.manifest.time)) this.save();
      } catch (err) {
        this.fail(err);
      }
    }
    this.lastPumpMs = nowMs;
    if (nowMs - this.tpsWindowStart >= 1000) {
      this.measuredTps = Math.round((this.tpsWindowTicks * 1000) / (nowMs - this.tpsWindowStart));
      this.tpsWindowStart = nowMs;
      this.tpsWindowTicks = 0;
    }
    if (nowMs - this.lastFrameMs >= FRAME_INTERVAL_MS) this.publishFrame(nowMs);
    if (nowMs - this.lastStatusMs >= STATUS_INTERVAL_MS) this.publishStatus(nowMs);
    return this.running;
  }

  private advance(sim: Simulation, nowMs: number): number {
    if (this.ticksPerSecond === 'max') {
      let done = 0;
      const start = this.now();
      do {
        sim.step(10);
        done += 10;
      } while (this.now() - start < MAX_SLICE_MS);
      this.flushEvents(sim);
      return done;
    }
    const dt = this.lastPumpMs === null ? 0 : Math.min(nowMs - this.lastPumpMs, 1000);
    // Deuda en "ms × ticks/s" para no acumular error de redondeo con pasos de tiempo enteros.
    this.tickDebt += dt * this.ticksPerSecond;
    const n = Math.floor(this.tickDebt / 1000);
    if (n > 0) {
      this.tickDebt -= n * 1000;
      sim.step(n);
      this.flushEvents(sim);
    }
    return n;
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

  private start(sim: Simulation, status: WorldStatus, readOnly: boolean, savedTick: number): void {
    this.sim = sim;
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
    if (msg.type === 'init' || msg.type === 'load') {
      if (msg.protocol !== PROTOCOL_VERSION) {
        throw new Error(`Protocolo ${msg.protocol} incompatible (motor: ${PROTOCOL_VERSION})`);
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

    const sim = this.sim;
    if (!sim) throw new Error(`Mensaje "${msg.type}" antes de "init"`);

    switch (msg.type) {
      case 'end':
        this.running = false;
        void this.save('ended').then(() => {
          this.readOnly = true;
          this.publishStatus(this.now());
        });
        return;
      case 'control':
        if (msg.action === 'play') {
          if (this.readOnly) throw new Error('El mundo ha terminado: es de solo lectura');
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
        if (this.readOnly) throw new Error('El mundo ha terminado: es de solo lectura');
        sim.step(msg.ticks);
        this.flushEvents(sim);
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
    };
    this.post({ type: 'status', status });
  }
}
