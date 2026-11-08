import type { BuildingRecord, MapLogic } from '@worldopen/contracts';
import { regionNodeBase } from './mappack';

/**
 * Ermitas en el campo (ADR-0049). Cada pueblo tiene una ermita a las afueras, unida al pueblo por un camino de
 * tierra: allí va la romería. Se coloca a `BEYOND_M` metros más allá del casco (el 90 % de las viviendas más cercanas
 * al centro), en la dirección (de las 8 de la rosa) más alejada de los demás pueblos; con un solo pueblo, la elige un
 * hash de la región. Un map-pack que ya traiga su ermita (`role: 'hermitage'`) la conserva.
 */

export const HERMITAGE_ROLE = 'hermitage';
export const HERMITAGE_TRACK = 'Camino de la ermita';
/** Distancia de la ermita al borde del casco (m). */
const BEYOND_M = 400;
const S = 0.7071067811865476;
const DIRECTIONS: [number, number][] = [[1, 0], [S, S], [0, 1], [-S, S], [-1, 0], [-S, -S], [0, -1], [S, -S]];
/** Id del nodo de la ermita dentro del espacio de ids de su región. */
const NODE_OFFSET = 999_999;

/** Centro (mediana de las viviendas) y radio (por defecto, el 90 % de las viviendas: cuantil `q`) del casco de un pueblo. */
export function core(m: MapLogic, q = 0.9): { x: number; z: number; r: number } {
  const homes = m.buildings.filter((b) => b.use === 'residential' && b.dwellings > 0);
  const src = homes.length > 0 ? homes : m.buildings;
  if (src.length === 0) return { x: (m.bounds.minX + m.bounds.maxX) / 2, z: (m.bounds.minZ + m.bounds.maxZ) / 2, r: 0 };
  const xs = src.map((b) => b.centroid.x).sort((a, b) => a - b);
  const zs = src.map((b) => b.centroid.z).sort((a, b) => a - b);
  const x = xs[Math.floor(xs.length / 2)]!;
  const z = zs[Math.floor(zs.length / 2)]!;
  const d = src.map((b) => Math.sqrt((b.centroid.x - x) * (b.centroid.x - x) +(b.centroid.z - z) * (b.centroid.z - z))).sort((a, b) => a - b);
  return { x, z, r: d[Math.floor(q * (d.length - 1))]! };
}

/** Valor en [0, 1) para la región y la clave `k` (FNV-1a). */
export function unit(text: string, k: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return (Math.imul(h ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) >>> 0) / 0x100000000;
}

/** Mapas con su ermita y el camino que la une al nodo de calle más cercano del pueblo. */
export function withHermitages(maps: MapLogic[]): MapLogic[] {
  const cores = maps.map((m) => core(m));
  return maps.map((m, t) => {
    if (m.buildings.some((b) => b.role === HERMITAGE_ROLE) || m.streets.nodes.length === 0) return m;
    const c = cores[t]!;
    const reach = c.r + BEYOND_M;
    let best = DIRECTIONS[0]!;
    let bestScore = -Infinity;
    DIRECTIONS.forEach(([dx, dz], k) => {
      const px = c.x + dx * reach;
      const pz = c.z + dz * reach;
      // Lejos de los demás pueblos (su casco); el hash solo desempata.
      let away = 0;
      let first = true;
      cores.forEach((o, s) => {
        if (s === t) return;
        const gap = Math.sqrt((px - o.x) * (px - o.x) + (pz - o.z) * (pz - o.z)) - o.r;
        away = first ? gap : Math.min(away, gap);
        first = false;
      });
      const score = away + unit(m.regionId, k);
      if (score > bestScore) {
        bestScore = score;
        best = [dx, dz];
      }
    });
    const x = c.x + best[0] * reach;
    const z = c.z + best[1] * reach;
    let near = m.streets.nodes[0]!;
    let nearD = Infinity;
    for (const n of m.streets.nodes) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < nearD) {
        nearD = d;
        near = n;
      }
    }
    const taken = new Set(m.streets.nodes.map((n) => n.id));
    let id = regionNodeBase(m.regionId) + NODE_OFFSET;
    while (taken.has(id)) id--;
    const hermitage: BuildingRecord = {
      id: `${m.regionId}-ermita`,
      use: 'unknown',
      role: HERMITAGE_ROLE,
      dwellings: 0,
      floorsAboveGround: 2,
      grossFloorAreaM2: 160,
      footprintAreaM2: 160,
      centroid: { x: x + best[0] * 12, z: z + best[1] * 12 },
      entrances: [{ x, z, streetNodeId: id }],
      // Cota del terreno: la del nodo de calle más cercano (ADR-0053).
      baseY: near.y,
    };
    return {
      ...m,
      buildings: [...m.buildings, hermitage],
      streets: {
        nodes: [...m.streets.nodes, { id, x, z, y: near.y }],
        edges: [
          ...m.streets.edges,
          {
            id: m.streets.edges.reduce((n, e) => Math.max(n, e.id + 1), 0),
            from: near.id,
            to: id,
            lengthM: Math.sqrt(nearD),
            kind: 'track',
            oneway: false,
            name: HERMITAGE_TRACK,
          },
        ],
      },
    };
  });
}

/**
 * Caminos del campo que añade el motor (de las ermitas y de las casas de campo, ADR-0053) en los pueblos con huellas
 * (map-pack): su red de calles no se dibuja del mapa lógico, así que van aparte (para el render).
 */
export function countryPaths(maps: MapLogic[], tracks: readonly string[]): MapLogic | null {
  const nodes: MapLogic['streets']['nodes'] = [];
  const edges: MapLogic['streets']['edges'] = [];
  for (const m of maps) {
    if (!m.buildings.some((b) => b.footprint?.length)) continue;
    const byId = new Map(m.streets.nodes.map((n) => [n.id, n]));
    for (const e of m.streets.edges) {
      if (e.name === null || !tracks.includes(e.name)) continue;
      nodes.push(byId.get(e.from)!, byId.get(e.to)!);
      edges.push(e);
    }
  }
  if (edges.length === 0) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minZ = Math.min(minZ, n.z);
    maxX = Math.max(maxX, n.x);
    maxZ = Math.max(maxZ, n.z);
  }
  return { regionId: 'campo', bounds: { minX, minZ, maxX, maxZ }, buildings: [], streets: { nodes, edges } };
}
