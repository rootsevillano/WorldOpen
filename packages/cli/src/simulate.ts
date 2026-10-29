import { randomUUID } from 'node:crypto';
import type { CommandEnvelope, CriterionValue, GameDate, WorldManifest } from '@worldopen/contracts';
import { Simulation, createManifest, tickToDate } from '@worldopen/engine';
import { REPORT_METRICS, metric } from '@worldopen/engine';
import { DEFAULT_MAPPACKS_DIR, loadRegion, regionFor } from './mappacks';

export interface SimulateOptions {
  seed: number;
  ticks: number;
  minutesPerTick?: number;
  /** Población inicial (criterio `society.initialPopulation`). */
  agents?: number;
  commands?: CommandEnvelope[];
  manifest?: Partial<WorldManifest>;
  /** Map-pack instalado (`<id>-<versión>`) en lugar del mapa sintético (ADR-0017). */
  mapPack?: string;
  mapPacksDir?: string;
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
  metrics: Record<string, CriterionValue | undefined>;
  elapsedMs: number;
  ticksPerSecond: number;
}

/** Crea una simulación con manifiesto por defecto (el host CLI aporta `worldId` y fecha). */
export function createSimulation(opts: Omit<SimulateOptions, 'ticks'>): Simulation {
  const base = createManifest({ worldId: randomUUID(), createdAt: new Date().toISOString(), seed: opts.seed });
  const manifest = createManifest({
    ...base,
    ...opts.manifest,
    time: { ...base.time, ...opts.manifest?.time, ...(opts.minutesPerTick ? { minutesPerTick: opts.minutesPerTick } : {}) },
    criteria: {
      ...opts.manifest?.criteria,
      ...(opts.agents === undefined ? {} : { 'society.initialPopulation': opts.agents }),
    },
    ...(opts.mapPack ? { regions: [regionFor(opts.mapPacksDir ?? DEFAULT_MAPPACKS_DIR, opts.mapPack)] } : {}),
  });
  const dir = opts.mapPacksDir ?? DEFAULT_MAPPACKS_DIR;
  const maps = Object.fromEntries(manifest.regions.filter((r) => r.mapPack).map((r) => [r.id, loadRegion(dir, r)]));
  return new Simulation(manifest, Object.keys(maps).length > 0 ? { maps } : {});
}

/** Ejecuta un mundo en headless tan rápido como sea posible. */
export function simulate(opts: SimulateOptions): { sim: Simulation; report: SimulateReport } {
  const sim = createSimulation(opts);
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
      worldId: sim.manifest.worldId,
      seed: opts.seed,
      ticks: sim.tick,
      finalDate: tickToDate(sim.tick, sim.manifest.time),
      hash: sim.hash().toString(16).padStart(8, '0'),
      commandsApplied: sim.commandLog().length,
      events,
      rejected,
      metrics: Object.fromEntries(REPORT_METRICS.map((m) => [m, metric(sim, m)])),
      elapsedMs: Math.round(elapsedMs * 10) / 10,
      ticksPerSecond: Math.round(opts.ticks / Math.max(elapsedMs / 1000, 1e-6)),
    },
  };
}
