import { fileURLToPath } from 'node:url';
import type { WorldStore } from '@worldopen/contracts';
import { Simulation, ticksPerDay } from '@worldopen/engine';

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
