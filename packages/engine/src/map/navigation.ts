import type { BuildingRecord, BuildingUse, MapLogic } from '@worldopen/contracts';

/** Usos de edificio donde un agente puede pasar el rato o refugiarse además de su casa. */
const VENUE_USES: BuildingUse[] = ['retail', 'publicServices'];

interface Neighbor {
  node: number;
  cost: number;
}

/**
 * Mapa listo para el motor: índices de edificios, grafo de calles con adyacencias y rutas A*.
 * Los edificios se referencian por índice (Int32 en el almacén de agentes); los nodos, por índice en `nodes`.
 */
export class NavMap {
  readonly buildings: BuildingRecord[];
  readonly nodeX: Float64Array;
  readonly nodeZ: Float64Array;
  private readonly adjacency: Neighbor[][];
  private readonly nodeIndex = new Map<number, number>();
  /** Índices de edificios residenciales con viviendas, en orden. */
  readonly homes: number[];
  /** Índices de edificios "de destino" (comercio, servicios públicos), en orden. */
  readonly venues: number[];
  /** Nodo de calle de la entrada principal de cada edificio. */
  readonly entranceNode: Int32Array;

  constructor(readonly logic: MapLogic[]) {
    this.buildings = logic.flatMap((m) => m.buildings);
    const nodes = logic.flatMap((m) => m.streets.nodes);
    this.nodeX = new Float64Array(nodes.length);
    this.nodeZ = new Float64Array(nodes.length);
    nodes.forEach((nd, i) => {
      if (this.nodeIndex.has(nd.id)) throw new Error(`Nodo de calle duplicado: ${nd.id}`);
      this.nodeIndex.set(nd.id, i);
      this.nodeX[i] = nd.x;
      this.nodeZ[i] = nd.z;
    });
    this.adjacency = nodes.map(() => []);
    for (const e of logic.flatMap((m) => m.streets.edges)) {
      const a = this.indexOfNode(e.from);
      const b = this.indexOfNode(e.to);
      this.adjacency[a]!.push({ node: b, cost: e.lengthM });
      if (!e.oneway) this.adjacency[b]!.push({ node: a, cost: e.lengthM });
    }
    for (const list of this.adjacency) list.sort((p, q) => p.node - q.node);

    this.homes = [];
    this.venues = [];
    this.entranceNode = new Int32Array(this.buildings.length);
    this.buildings.forEach((b, i) => {
      if (b.use === 'residential' && b.dwellings > 0) this.homes.push(i);
      if (VENUE_USES.includes(b.use)) this.venues.push(i);
      const entrance = b.entrances[0];
      this.entranceNode[i] =
        entrance?.streetNodeId != null ? this.indexOfNode(entrance.streetNodeId) : this.nearestNode(b.centroid.x, b.centroid.z);
    });
    if (this.homes.length === 0) throw new Error('El mapa no tiene viviendas');
  }

  get nodeCount(): number {
    return this.nodeX.length;
  }

  private indexOfNode(id: number): number {
    const i = this.nodeIndex.get(id);
    if (i === undefined) throw new Error(`Arista con nodo inexistente: ${id}`);
    return i;
  }

  nearestNode(x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.nodeX.length; i++) {
      const dx = this.nodeX[i]! - x;
      const dz = this.nodeZ[i]! - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Ruta A* entre nodos (lista de índices, incluye extremos) o `null` si no hay conexión. */
  nodePath(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const n = this.nodeX.length;
    const g = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const h = (i: number) => {
      const dx = this.nodeX[i]! - this.nodeX[to]!;
      const dz = this.nodeZ[i]! - this.nodeZ[to]!;
      return Math.sqrt(dx * dx + dz * dz);
    };
    g[from] = 0;
    heap.push(h(from), from);
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === to) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      for (const { node, cost } of this.adjacency[cur]!) {
        const ng = g[cur]! + cost;
        if (ng < g[node]!) {
          g[node] = ng;
          prev[node] = cur;
          heap.push(ng + h(node), node);
        }
      }
    }
    if (prev[to] === -1) return null;
    const path = [to];
    for (let c = to; c !== from; ) {
      c = prev[c]!;
      path.push(c);
    }
    return path.reverse();
  }

  /**
   * Waypoints (pares x, z) para ir del punto (x, z) — o del interior de `fromBuilding` — al interior de `toBuilding`.
   */
  route(x: number, z: number, fromBuilding: number, toBuilding: number): Float64Array | null {
    const pts: number[] = [];
    let startNode: number;
    if (fromBuilding >= 0) {
      const e = this.buildings[fromBuilding]!.entrances[0];
      if (e) pts.push(e.x, e.z);
      startNode = this.entranceNode[fromBuilding]!;
    } else {
      startNode = this.nearestNode(x, z);
    }
    const target = this.buildings[toBuilding]!;
    const path = this.nodePath(startNode, this.entranceNode[toBuilding]!);
    if (!path) return null;
    for (const i of path) pts.push(this.nodeX[i]!, this.nodeZ[i]!);
    const e = target.entrances[0];
    if (e) pts.push(e.x, e.z);
    pts.push(target.centroid.x, target.centroid.z);
    return Float64Array.from(pts);
  }
}

/** Montículo binario de (prioridad, nodo) con desempate por nodo: orden determinista. */
class MinHeap {
  private pri: number[] = [];
  private val: number[] = [];

  get size(): number {
    return this.val.length;
  }

  private less(a: number, b: number): boolean {
    return this.pri[a]! < this.pri[b]! || (this.pri[a] === this.pri[b] && this.val[a]! < this.val[b]!);
  }

  private swap(a: number, b: number): void {
    [this.pri[a], this.pri[b]] = [this.pri[b]!, this.pri[a]!];
    [this.val[a], this.val[b]] = [this.val[b]!, this.val[a]!];
  }

  push(p: number, v: number): void {
    this.pri.push(p);
    this.val.push(v);
    let i = this.val.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.val[0]!;
    const last = this.val.length - 1;
    this.swap(0, last);
    this.pri.pop();
    this.val.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.val.length && this.less(l, m)) m = l;
      if (r < this.val.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}
