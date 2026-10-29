import { fileURLToPath } from 'node:url';
import type { WorldStore } from '@worldopen/contracts';
import { STUDY_METRICS } from '@worldopen/contracts';
import { ReplayAnalysis, Simulation, tickToDate, ticksPerDay } from '@worldopen/engine';

/** Carpeta por defecto del histórico de mundos del CLI (ignorada por Git). */
export const DEFAULT_WORLDS_DIR = fileURLToPath(new URL('../../../data/worlds', import.meta.url));

/** Guarda una simulación en curso: crea el mundo, y un snapshot + log nuevo por día de juego. */
export async function runAndSave(store: WorldStore, sim: Simulation, ticks: number, end: boolean): Promise<void> {
  const id = sim.manifest.worldId;
  await store.createWorld(sim.manifest);
  await store.putSnapshot(id, sim.snapshot());
  const day = ticksPerDay(sim.manifest.time);
  let saved = 0;
  while (sim.tick < ticks) {
    sim.step(Math.min(day, ticks - sim.tick));
    sim.drainEvents();
    const log = sim.commandLog();
    await store.appendCommands(id, log.slice(saved));
    saved = log.length;
    await store.putSnapshot(id, sim.snapshot());
  }
  await store.setStatus(id, end ? 'ended' : 'paused', sim.tick);
}

export interface VerifyResult {
  worldId: string;
  checked: { tick: number; ok: boolean }[];
  ok: boolean;
}

/**
 * Reproduce un mundo guardado desde su snapshot inicial con el log completo y comprueba que cada snapshot diario
 * guardado coincide bit a bit (ADR-0003/0004). Es la base del visor de estudio.
 */
export async function verifyWorld(store: WorldStore, worldId: string): Promise<VerifyResult> {
  const manifest = await store.getManifest(worldId);
  if (!manifest) throw new Error(`No existe el mundo ${worldId}`);
  const first = await store.getSnapshot(worldId, 0);
  const last = await store.getSnapshot(worldId);
  if (!first || !last) throw new Error(`El mundo ${worldId} no tiene snapshots`);
  const sim = Simulation.restore(manifest, first, await store.readCommands(worldId));
  const day = ticksPerDay(manifest.time);
  const checked: VerifyResult['checked'] = [];
  for (let t = first.tick + day; t <= last.tick + day; t += day) {
    const target = Math.min(t, last.tick);
    const stored = await store.getSnapshot(worldId, target);
    if (!stored || stored.tick <= sim.tick) continue;
    sim.step(stored.tick - sim.tick);
    checked.push({ tick: stored.tick, ok: sim.hash() === stored.hash });
    if (target === last.tick) break;
  }
  return { worldId, checked, ok: checked.length > 0 && checked.every((c) => c.ok) };
}

export interface StudyResult {
  csv: string;
  rows: number;
  verification: { checked: number; failed: number[]; total: number };
}

/** Exporta las series de métricas de un mundo guardado (una fila por muestra) en CSV: el visor de estudio sin UI. */
export async function studyWorld(store: WorldStore, worldId: string, everyTicks: number, metrics: string[] = [...STUDY_METRICS]): Promise<StudyResult> {
  const manifest = await store.getManifest(worldId);
  if (!manifest) throw new Error(`No existe el mundo ${worldId}`);
  const snapshots = await store.listSnapshots(worldId);
  const first = snapshots[0] ? await store.getSnapshot(worldId, snapshots[0].tick) : null;
  if (!first) throw new Error(`El mundo ${worldId} no tiene snapshots`);
  const end = snapshots.at(-1)!.tick;
  const analysis = new ReplayAnalysis(manifest, first, await store.readCommands(worldId), snapshots, end, everyTicks, metrics);
  while (!analysis.done) analysis.advance(10_000);
  const chunk = analysis.takeChunk();
  const lines = [['tick', 'day', 'time', ...metrics].join(',')];
  chunk.ticks.forEach((t, k) => {
    const d = tickToDate(t, manifest.time);
    const time = `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
    lines.push([t, d.elapsedDays, time, ...metrics.map((m) => Number(chunk.values[m]![k]!.toFixed(4)))].join(','));
  });
  return { csv: lines.join('\n') + '\n', rows: chunk.ticks.length, verification: analysis.verification };
}
