import type { LoggedCommand, SeriesChunk, Snapshot, Verification, WorldManifest } from '@worldopen/contracts';
import { metric } from './metrics';
import { Simulation } from './simulation';

/**
 * Análisis de un mundo guardado (visor de estudio, ADR-0015): reproduce el mundo desde un snapshot con el log completo,
 * muestrea métricas cada `everyTicks` y comprueba el hash en cada snapshot guardado. Se puede ejecutar de una vez
 * (CLI) o por porciones (Worker) con `advance(maxTicks)`.
 */
export class ReplayAnalysis {
  private readonly sim: Simulation;
  private readonly hashes: Map<number, number>;
  private readonly startTick: number;
  private pending: SeriesChunk;
  readonly verification: Verification;

  constructor(
    manifest: WorldManifest,
    first: Snapshot,
    log: LoggedCommand[],
    snapshots: { tick: number; hash: number }[],
    readonly endTick: number,
    readonly everyTicks: number,
    readonly metrics: string[],
  ) {
    if (everyTicks < 1) throw new Error('everyTicks debe ser ≥ 1');
    this.sim = Simulation.restore(manifest, first, log);
    this.startTick = first.tick;
    this.hashes = new Map(snapshots.filter((s) => s.tick > first.tick && s.tick <= endTick).map((s) => [s.tick, s.hash]));
    this.verification = { checked: 0, failed: [], total: this.hashes.size };
    this.pending = this.emptyChunk();
    this.sample();
  }

  get tick(): number {
    return this.sim.tick;
  }

  get done(): boolean {
    return this.sim.tick >= this.endTick;
  }

  get progress(): number {
    const span = this.endTick - this.startTick;
    return span <= 0 ? 1 : (this.sim.tick - this.startTick) / span;
  }

  /** Avanza como mucho `maxTicks`, parando en cada muestra y cada snapshot que verificar. */
  advance(maxTicks: number): void {
    let budget = maxTicks;
    while (budget > 0 && !this.done) {
      const t = this.sim.tick;
      const nextSample = t + this.everyTicks - ((t - this.startTick) % this.everyTicks);
      let nextCheck = this.endTick;
      for (const k of this.hashes.keys()) if (k > t && k < nextCheck) nextCheck = k;
      const target = Math.min(nextSample, nextCheck, this.endTick, t + budget);
      this.sim.step(target - t);
      this.sim.drainEvents();
      budget -= target - t;
      const expected = this.hashes.get(this.sim.tick);
      if (expected !== undefined) {
        this.verification.checked++;
        if (this.sim.hash() !== expected) this.verification.failed.push(this.sim.tick);
        this.hashes.delete(this.sim.tick);
      }
      if ((this.sim.tick - this.startTick) % this.everyTicks === 0 || this.done) this.sample();
    }
  }

  /** Devuelve y vacía las muestras acumuladas desde la última llamada. */
  takeChunk(): SeriesChunk {
    const chunk = this.pending;
    this.pending = this.emptyChunk();
    return chunk;
  }

  private emptyChunk(): SeriesChunk {
    return { ticks: [], values: Object.fromEntries(this.metrics.map((m) => [m, [] as number[]])) };
  }

  private sample(): void {
    const t = this.sim.tick;
    if (this.pending.ticks.at(-1) === t) return;
    this.pending.ticks.push(t);
    for (const m of this.metrics) {
      const v = metric(this.sim, m);
      this.pending.values[m]!.push(typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : Number.NaN);
    }
  }
}
