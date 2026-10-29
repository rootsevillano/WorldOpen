import type { BuildingRecord, BuildingUse, MapLogic, RegionRef, StreetGraph } from '@worldopen/contracts';
import { streetName } from '../content/names';
import { Rng } from '../math/rng';

/**
 * Mapa sintético (ADR-0007) mientras no exista el primer map-pack: un pueblo ficticio en cuadrícula, generado
 * de forma determinista a partir de la semilla del mundo y del id de región.
 *
 * Manzanas de `BLOCK` m separadas por calles de `STREET` m; cada manzana tiene 2×2 parcelas con un edificio.
 * Los nodos del grafo son los cruces; las entradas de los edificios están en la acera, frente a su esquina.
 */
const BLOCK = 64;
const STREET = 10;
const PITCH = BLOCK + STREET;
const LOT = BLOCK / 2;
const BUILDING = 20;

export interface SyntheticOptions {
  /** Manzanas por lado. */
  blocks?: number;
}

function regionSeed(seed: number, regionId: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < regionId.length; i++) h = Math.imul(h ^ regionId.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function syntheticMap(seed: number, region: RegionRef, options: SyntheticOptions = {}): MapLogic {
  const n = options.blocks ?? 5;
  const rng = Rng.fromSeed(regionSeed(seed, region.id));
  const half = (n * PITCH) / 2;
  const ox = region.offset.x - half;
  const oz = region.offset.z - half;
  const nodeId = (i: number, j: number) => j * (n + 1) + i;

  const streets: StreetGraph = { nodes: [], edges: [] };
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) streets.nodes.push({ id: nodeId(i, j), x: ox + i * PITCH, z: oz + j * PITCH, y: 0 });
  }
  // Una calle con nombre por fila y por columna de cruces.
  const rowNames = Array.from({ length: n + 1 }, () => streetName(rng));
  const colNames = Array.from({ length: n + 1 }, () => streetName(rng));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      if (i < n) streets.edges.push({ id: streets.edges.length, from: nodeId(i, j), to: nodeId(i + 1, j), lengthM: PITCH, kind: 'carriageway', oneway: false, name: rowNames[j]! });
      if (j < n) streets.edges.push({ id: streets.edges.length, from: nodeId(i, j), to: nodeId(i, j + 1), lengthM: PITCH, kind: 'carriageway', oneway: false, name: colNames[i]! });
    }
  }

  const center = Math.floor(n / 2);
  const buildings: BuildingRecord[] = [];
  for (let bj = 0; bj < n; bj++) {
    for (let bi = 0; bi < n; bi++) {
      const x0 = ox + bi * PITCH + STREET / 2;
      const z0 = oz + bj * PITCH + STREET / 2;
      for (let q = 0; q < 4; q++) {
        const qx = q % 2;
        const qz = (q - qx) / 2;
        const cx = x0 + qx * LOT + LOT / 2;
        const cz = z0 + qz * LOT + LOT / 2;
        const use = pickUse(rng, bi, bj, center, n);
        const floors = use === 'residential' ? rng.int(1, 3) : use === 'publicServices' ? 2 : 1;
        // Entrada en la acera de la calle horizontal más cercana (fila qz), frente a la esquina más cercana.
        const corner = nodeId(bi + qx, bj + qz);
        const sidewalkZ = oz + (bj + qz) * PITCH + (qz === 0 ? STREET / 2 : -STREET / 2);
        buildings.push({
          id: `${region.id}-b${String(buildings.length).padStart(4, '0')}`,
          use,
          dwellings: use === 'residential' ? floors * rng.int(1, 2) : 0,
          floorsAboveGround: floors,
          grossFloorAreaM2: BUILDING * BUILDING * floors,
          footprintAreaM2: BUILDING * BUILDING,
          centroid: { x: cx, z: cz },
          entrances: [{ x: cx, z: sidewalkZ, streetNodeId: corner }],
        });
      }
    }
  }

  return {
    regionId: region.id,
    bounds: { minX: ox, minZ: oz, maxX: ox + n * PITCH, maxZ: oz + n * PITCH },
    buildings,
    streets,
  };
}

function pickUse(rng: Rng, bi: number, bj: number, center: number, n: number): BuildingUse {
  if (bi === center && bj === center) return rng.nextFloat() < 0.5 ? 'publicServices' : 'retail';
  if (bi === n - 1 && bj === 0) return 'industrial';
  const r = rng.nextFloat();
  // Corona exterior: huertas y olivar (E4).
  const edge = bi === 0 || bj === 0 || bi === n - 1 || bj === n - 1;
  if (edge && r < 0.2) return 'agriculture';
  if (r < 0.1) return 'retail';
  if (r < 0.14) return 'publicServices';
  return 'residential';
}
