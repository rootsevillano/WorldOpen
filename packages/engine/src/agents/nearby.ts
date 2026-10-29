import type { World } from '../world/world';

/**
 * Elección con decaimiento por distancia (mapa real, ADR-0017): entre `candidates`, uno al azar con peso
 * 1 / (1 + (d / scale)²) respecto a (x, z). Con el mapa real, elegir al azar en todo el término daba trayectos de
 * hasta 4 km a pie; la gente prefiere lo cercano sin descartar lo lejano. Determinista (PRNG del mundo).
 */
export function pickNearby(world: World, x: number, z: number, candidates: readonly number[], scale: number, accept: (b: number) => boolean = () => true): number {
  const b = world.map.buildings;
  let total = 0;
  const weights = new Float64Array(candidates.length);
  for (let k = 0; k < candidates.length; k++) {
    const c = candidates[k]!;
    if (!accept(c)) continue;
    const dx = b[c]!.centroid.x - x;
    const dz = b[c]!.centroid.z - z;
    const r = (dx * dx + dz * dz) / (scale * scale);
    weights[k] = 1 / (1 + r);
    total += weights[k]!;
  }
  if (total === 0) return -1;
  let r = world.rng.nextFloat() * total;
  for (let k = 0; k < candidates.length; k++) {
    r -= weights[k]!;
    if (r < 0 && weights[k]! > 0) return candidates[k]!;
  }
  for (let k = candidates.length - 1; k >= 0; k--) if (weights[k]! > 0) return candidates[k]!;
  return -1;
}

/** Escala de distancia al elegir puesto de trabajo y local de ocio (m). */
export const WORK_SCALE_M = 600;
export const LEISURE_SCALE_M = 400;
