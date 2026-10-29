import {
  PROTOCOL_VERSION,
  ENGINE_VERSION,
  frameTransferables,
  type EngineStatus,
  type EngineToHost,
  type HostToEngine,
  type QueryResultMap,
} from '@worldopen/contracts';
import { Simulation, tickToDate } from '@worldopen/engine';

export type Post = (msg: EngineToHost, transfer?: ArrayBuffer[]) => void;

const FRAME_INTERVAL_MS = 1000 / 30;
const STATUS_INTERVAL_MS = 250;
/** Presupuesto de CPU por porción en modo 'max', para seguir atendiendo mensajes. */
const MAX_SLICE_MS = 12;

/**
 * Host del motor (ADR-0002): traduce el Simulation Protocol a llamadas a `Simulation` y decide el ritmo.
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

  constructor(private readonly post: Post, private readonly now: () => number) {}

  handle(msg: HostToEngine): void {
    try {
      this.dispatch(msg);
    } catch (err) {
      this.running = false;
      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Avanza la simulación según el tiempo real transcurrido. Devuelve `true` si sigue en marcha. */
  pump(nowMs: number): boolean {
    const sim = this.sim;
    if (!sim) return false;
    if (this.running) {
      try {
        const done = this.advance(sim, nowMs);
        this.tpsWindowTicks += done;
      } catch (err) {
        this.running = false;
        this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
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

  private dispatch(msg: HostToEngine): void {
    if (msg.type === 'init') {
      if (msg.protocol !== PROTOCOL_VERSION) {
        throw new Error(`Protocolo ${msg.protocol} incompatible (motor: ${PROTOCOL_VERSION})`);
      }
      this.sim = msg.snapshot
        ? Simulation.restore(msg.manifest, msg.snapshot, msg.log ?? [])
        : new Simulation(msg.manifest);
      this.running = false;
      this.post({ type: 'ready', protocol: PROTOCOL_VERSION, engineVersion: ENGINE_VERSION, worldId: msg.manifest.worldId, tick: this.sim.tick });
      this.publishFrame(this.now());
      this.publishStatus(this.now());
      return;
    }

    const sim = this.sim;
    if (!sim) throw new Error(`Mensaje "${msg.type}" antes de "init"`);

    switch (msg.type) {
      case 'control':
        if (msg.action === 'play') {
          this.running = true;
          this.lastPumpMs = null;
          this.tickDebt = 0;
        } else if (msg.action === 'pause') {
          this.running = false;
        } else if (msg.action === 'setSpeed') {
          if (msg.ticksPerSecond !== 'max' && !(msg.ticksPerSecond >= 0)) throw new Error('ticksPerSecond inválido');
          this.ticksPerSecond = msg.ticksPerSecond;
        }
        this.publishStatus(this.now());
        return;
      case 'step':
        sim.step(msg.ticks);
        this.flushEvents(sim);
        this.publishFrame(this.now());
        this.publishStatus(this.now());
        return;
      case 'command': {
        const res = sim.submit(msg.envelope);
        this.post(
          res.ok
            ? { type: 'commandAccepted', commandId: msg.envelope.id, appliedAtTick: res.appliedAtTick }
            : { type: 'commandRejected', commandId: msg.envelope.id, reason: res.reason, message: res.message },
        );
        return;
      }
      case 'query': {
        const results: { [K in keyof QueryResultMap]: () => QueryResultMap[K] } = {
          catalog: () => sim.catalog(),
          snapshot: () => sim.snapshot(),
          log: () => sim.commandLog(),
        };
        this.post({ type: 'queryResult', requestId: msg.requestId, kind: msg.query.kind, result: results[msg.query.kind]() });
        return;
      }
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
    };
    this.post({ type: 'status', status });
  }
}
