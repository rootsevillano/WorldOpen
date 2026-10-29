import { ENGINE_VERSION, type RegionRef, type WorldManifest } from '@worldopen/contracts';
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
