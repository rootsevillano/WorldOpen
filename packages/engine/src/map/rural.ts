import type { BuildingRecord, MapLogic } from '@worldopen/contracts';
import { core, unit } from './hermitage';
import { regionNodeBase } from './mappack';

/**
 * Casas de campo (ADR-0053). Cada pueblo tiene, además del casco, unas cuantas casas sueltas en el campo: una parte
 * (`society.ruralHomes`, por defecto el 5 %) de sus edificios de viviendas, como mucho 40. Cada una está entre
 * `RURAL_FROM` y `RURAL_FROM + RURAL_SPAN` metros más allá del casco, en una dirección que sale de un hash de la región
 * (sin sorteo), lejos de los demás pueblos y de cualquier otro edificio, y se une al pueblo por un camino de tierra hasta
 * el nodo de calle (o de camino) más cercano. En un map-pack, además, a menos de `PACK_REACH_M` de un camino del mapa, y
 * con la cota de ese nodo.
 */

export const FARMHOUSE_ROLE = 'farmhouse';
export const FARMHOUSE_TRACK = 'Camino del cortijo';
const MAX_PER_TOWN = 40;
/** Distancia al borde del casco (m): de 150 a 800. */
const RURAL_FROM = 150;
const RURAL_SPAN = 650;
/** Separación mínima a otro edificio (m) y al casco de otro pueblo (m). */
const CLEAR_M = 40;
const OTHER_TOWN_M = 300;
/** En un map-pack, distancia máxima a un camino del mapa (m): así la casa cae dentro del terreno. */
const PACK_REACH_M = 250;
/** Intentos por casa antes de renunciar a ella. */
const ATTEMPTS = 12;
/** Ids de nodo de las casas dentro del espacio de su región. */
const NODE_OFFSET = 998_000;

/** Mapas con sus casas de campo y sus caminos (`share` = parte de los edificios de viviendas del casco). */
export function withFarmhouses(maps: MapLogic[], share: number): MapLogic[] {
  if (share <= 0) return maps;
  const cores = maps.map(core);
  const taken: { x: number; z: number }[] = maps.flatMap((m) => m.buildings.map((b) => b.centroid));
  const clear = (x: number, z: number) => {
    for (const c of taken) if ((c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) < CLEAR_M * CLEAR_M) return false;
    return true;
  };
  return maps.map((m, t) => {
    const homes = m.buildings.filter((b) => b.use === 'residential' && b.dwellings > 0 && b.role === undefined).length;
    const count = Math.min(MAX_PER_TOWN, Math.round(homes * share));
    if (count === 0 || m.streets.nodes.length === 0) return m;
    const c = cores[t]!;
    const pack = m.buildings.some((b) => b.footprint?.length);
    const buildings = [...m.buildings];
    const nodes = [...m.streets.nodes];
    const edges = [...m.streets.edges];
    const ids = new Set(nodes.map((n) => n.id));
    let nextEdge = edges.reduce((n, e) => Math.max(n, e.id + 1), 0);
    let nextNode = regionNodeBase(m.regionId) + NODE_OFFSET;
    for (let k = 0; k < count; k++) {
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const s = k * ATTEMPTS + attempt;
        let dx = unit(m.regionId, 100 + 3 * s) * 2 - 1;
        let dz = unit(m.regionId, 101 + 3 * s) * 2 - 1;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.1) continue;
        dx /= len;
        dz /= len;
        const reach = c.r + RURAL_FROM + unit(m.regionId, 102 + 3 * s) * RURAL_SPAN;
        const x = c.x + dx * reach;
        const z = c.z + dz * reach;
        let far = true;
        cores.forEach((o, u) => {
          if (u !== t && Math.sqrt((x - o.x) * (x - o.x) + (z - o.z) * (z - o.z)) < o.r + OTHER_TOWN_M) far = false;
        });
        if (!far || !clear(x, z)) continue;
        // En un map-pack, junto a un camino del propio mapa (el terreno no cubre todo el rectángulo de sus límites).
        if (pack && !m.streets.nodes.some((n) => (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z) < PACK_REACH_M * PACK_REACH_M)) continue;
        // Entrada hacia el pueblo, a 8 m de la casa; el camino va al nodo más cercano (calle, ermita u otra casa).
        const ex = x - dx * 8;
        const ez = z - dz * 8;
        let near = nodes[0]!;
        let nearD = Infinity;
        for (const n of nodes) {
          const d = (n.x - ex) * (n.x - ex) + (n.z - ez) * (n.z - ez);
          if (d < nearD) {
            nearD = d;
            near = n;
          }
        }
        while (ids.has(nextNode)) nextNode++;
        const id = nextNode++;
        ids.add(id);
        const house: BuildingRecord = {
          id: `${m.regionId}-campo-${String(k).padStart(2, '0')}`,
          use: 'residential',
          role: FARMHOUSE_ROLE,
          dwellings: 1,
          floorsAboveGround: 2,
          grossFloorAreaM2: 180,
          footprintAreaM2: 110,
          centroid: { x, z },
          entrances: [{ x: ex, z: ez, streetNodeId: id }],
          baseY: near.y,
        };
        buildings.push(house);
        taken.push(house.centroid);
        nodes.push({ id, x: ex, z: ez, y: near.y });
        edges.push({ id: nextEdge++, from: near.id, to: id, lengthM: Math.sqrt(nearD), kind: 'track', oneway: false, name: FARMHOUSE_TRACK });
        break;
      }
    }
    return { ...m, buildings, streets: { nodes, edges } };
  });
}
