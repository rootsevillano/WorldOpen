import { randomUUID } from 'node:crypto';
import type { CommandEnvelope, GameDate, WorldManifest } from '@worldopen/contracts';
import { Simulation, createManifest, tickToDate } from '@worldopen/engine';

export interface SimulateOptions {
  seed: number;
  ticks: number;
  minutesPerTick?: number;
  commands?: CommandEnvelope[];
  manifest?: Partial<WorldManifest>;
}

export interface SimulateReport {
  worldId: string;
  seed: number;
  ticks: number;
  finalDate: GameDate;
  hash: string;
  commandsApplied: number;
  events: number;
  rejected: { id: string; message: string }[];
  elapsedMs: number;
  ticksPerSecond: number;
}

/** Ejecuta un mundo en headless tan rápido como sea posible. */
export function simulate(opts: SimulateOptions): { sim: Simulation; report: SimulateReport } {
  const base = createManifest({ worldId: randomUUID(), createdAt: new Date().toISOString(), seed: opts.seed });
  const manifest = createManifest({
    ...base,
    ...opts.manifest,
    time: { ...base.time, ...opts.manifest?.time, ...(opts.minutesPerTick ? { minutesPerTick: opts.minutesPerTick } : {}) },
  });
  const sim = new Simulation(manifest);
  const rejected: SimulateReport['rejected'] = [];
  for (const c of opts.commands ?? []) {
    const res = sim.submit(c);
    if (!res.ok) rejected.push({ id: c.id, message: res.message });
  }

  let events = 0;
  const chunk = 1000;
  const t0 = performance.now();
  for (let done = 0; done < opts.ticks; done += chunk) {
    sim.step(Math.min(chunk, opts.ticks - done));
    events += sim.drainEvents().length;
  }
  const elapsedMs = performance.now() - t0;

  return {
    sim,
    report: {
      worldId: manifest.worldId,
      seed: opts.seed,
      ticks: sim.tick,
      finalDate: tickToDate(sim.tick, manifest.time),
      hash: sim.hash().toString(16).padStart(8, '0'),
      commandsApplied: sim.commandLog().length,
      events,
      rejected,
      elapsedMs: Math.round(elapsedMs * 10) / 10,
      ticksPerSecond: Math.round(opts.ticks / Math.max(elapsedMs / 1000, 1e-6)),
    },
  };
}
