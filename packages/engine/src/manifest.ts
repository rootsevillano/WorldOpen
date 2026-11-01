import { ENGINE_VERSION, type RegionRef, type WorldManifest } from '@worldopen/contracts';
import { townName } from './content/names';
import { syntheticSize } from './map/synthetic';
import { Rng } from './math/rng';
import { DEFAULT_TIME } from './time/clock';

/** Región sintética mientras no exista el primer map-pack (ADR-0007). Nombre ficticio. */
export const SYNTHETIC_REGION: RegionRef = {
  id: 'r1',
  displayName: 'Valdeolivo',
  mapPack: null,
  offset: { x: 0, z: 0 },
};

/** Manifiesto con valores por defecto. `worldId` y `createdAt` los aporta el host (no son deterministas). */
export function createManifest(
  init: Pick<WorldManifest, 'worldId' | 'createdAt' | 'seed'> & Partial<WorldManifest>,
): WorldManifest {
  return {
    name: `Mundo ${init.seed}`,
    engineVersion: ENGINE_VERSION,
    time: DEFAULT_TIME,
    ruleset: 'contemporary',
    regions: [SYNTHETIC_REGION],
    criteria: {},
    ...init,
  };
}

/** Distancia (m) entre un pueblo y el siguiente por la carretera comarcal (ADR-0036). */
export const TOWN_GAP_M = 1500;

/**
 * Pueblos vecinos sintéticos (`r2`, `r3`…) al este del primero, cuyo borde este está en `eastOf` (m), alineados con
 * su centro (`centerZ`). Nombres inventados y deterministas según la semilla del mundo (ADR-0007, ADR-0036).
 */
export function neighbourTowns(seed: number, count: number, eastOf: number, centerZ = 0): RegionRef[] {
  const size = syntheticSize();
  return Array.from({ length: count }, (_, k) => ({
    id: `r${k + 2}`,
    displayName: townName(Rng.fromSeed((Math.imul(seed, 0x9e3779b1) ^ (k + 1)) >>> 0)),
    mapPack: null,
    offset: { x: eastOf + TOWN_GAP_M + k * (size + TOWN_GAP_M) + size / 2, z: centerZ },
  }));
}

/** Borde este del pueblo sintético de una región (para colocar vecinos a su lado). */
export function syntheticEastEdge(region: RegionRef): number {
  return region.offset.x + syntheticSize() / 2;
}
