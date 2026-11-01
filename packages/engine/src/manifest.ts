import { ENGINE_VERSION, type MapLogic, type RegionRef, type WorldManifest } from '@worldopen/contracts';
import { townName } from './content/names';
import { syntheticMap, syntheticSize } from './map/synthetic';
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

/** Distancia (m) entre un pueblo y el más cercano por la carretera comarcal (ADR-0036). */
export const TOWN_GAP_M = 1500;

/** Dónde se colocan los pueblos vecinos respecto al primero (ADR-0037). */
export type TownSide = 'east' | 'west' | 'north' | 'south' | 'around';

export interface NeighbourOptions {
  seed: number;
  /** Pueblos vecinos (sin contar el primero). */
  count: number;
  /** Límites del primer pueblo (m). */
  bounds: Bounds;
  /** Viviendas del primer pueblo: cada vecino tiene entre el 35 % y el 80 % (según la semilla). */
  dwellings: number;
  side?: TownSide;
  /** Nombres ya usados (el del primer pueblo): los vecinos no los repiten. */
  taken?: string[];
}

type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number };

const MIN_BLOCKS = 3;
const MAX_BLOCKS = 24;
const AROUND: Exclude<TownSide, 'around'>[] = ['east', 'west', 'north', 'south'];

/**
 * Pueblos vecinos sintéticos (`r2`, `r3`…) junto al primero: de tamaño proporcional a él, a `TOWN_GAP_M` de su borde (o
 * del vecino anterior del mismo lado), con nombres inventados y deterministas según la semilla (ADR-0007, ADR-0037).
 */
export function neighbourTowns(o: NeighbourOptions): RegionRef[] {
  const taken = new Set(o.taken ?? []);
  // Borde libre de cada lado (Z = −Norte: el norte es la Z menor).
  const edge = { east: o.bounds.maxX, west: o.bounds.minX, north: o.bounds.minZ, south: o.bounds.maxZ };
  const cx = (o.bounds.minX + o.bounds.maxX) / 2;
  const cz = (o.bounds.minZ + o.bounds.maxZ) / 2;
  return Array.from({ length: o.count }, (_, k) => {
    const id = `r${k + 2}`;
    const rng = Rng.fromSeed((Math.imul(o.seed, 0x9e3779b1) ^ (k + 1)) >>> 0);
    let displayName = townName(rng);
    while (taken.has(displayName)) displayName = townName(rng);
    taken.add(displayName);
    const blocks = blocksFor(o.seed, id, o.dwellings * (0.35 + 0.45 * rng.nextFloat()));
    const size = syntheticSize(blocks);
    const side = o.side === 'around' ? AROUND[k % 4]! : (o.side ?? 'east');
    let offset: { x: number; z: number };
    if (side === 'east') {
      offset = { x: edge.east + TOWN_GAP_M + size / 2, z: cz };
      edge.east += TOWN_GAP_M + size;
    } else if (side === 'west') {
      offset = { x: edge.west - TOWN_GAP_M - size / 2, z: cz };
      edge.west -= TOWN_GAP_M + size;
    } else if (side === 'north') {
      offset = { x: cx, z: edge.north - TOWN_GAP_M - size / 2 };
      edge.north -= TOWN_GAP_M + size;
    } else {
      offset = { x: cx, z: edge.south + TOWN_GAP_M + size / 2 };
      edge.south += TOWN_GAP_M + size;
    }
    return { id, displayName, mapPack: null, offset, blocks };
  });
}

/** Menor número de manzanas por lado cuyo pueblo sintético llega a `dwellings` viviendas. */
function blocksFor(seed: number, id: string, dwellings: number): number {
  for (let b = MIN_BLOCKS; b < MAX_BLOCKS; b++) if (countDwellings(syntheticMap(seed, { id, displayName: '', mapPack: null, offset: { x: 0, z: 0 } }, { blocks: b })) >= dwellings) return b;
  return MAX_BLOCKS;
}

/** Viviendas de un mapa lógico. */
export function countDwellings(map: Pick<MapLogic, 'buildings'>): number {
  let n = 0;
  for (const b of map.buildings) if (b.use === 'residential') n += b.dwellings;
  return n;
}

/** Límites del pueblo sintético de una región (para colocar vecinos a su lado). */
export function syntheticBounds(region: RegionRef): Bounds {
  const half = syntheticSize(region.blocks) / 2;
  return { minX: region.offset.x - half, minZ: region.offset.z - half, maxX: region.offset.x + half, maxZ: region.offset.z + half };
}
