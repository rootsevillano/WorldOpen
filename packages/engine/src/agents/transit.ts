import { AgentActivity, AgentFlag } from '@worldopen/contracts';
import type { NavMap } from '../map/navigation';
import { headingOf } from '../math/angles';
import type { World } from '../world/world';
import { minuteOfDay } from './environment';
import { pathLength } from './vehicles';

/**
 * Transporte público (ADR-0030): una línea circular de autobús generada del mapa (paradas repartidas entre tiendas y
 * servicios públicos, unidas por las calles). Los autobuses no tienen estado: su posición es función de la hora
 * (velocidad constante, desfase entre ellos), así que no van en el snapshot. Los viajeros sí: van andando a la parada,
 * esperan, suben (pagan el billete), viajan dentro del autobús, bajan en la parada más cercana a su destino y acaban
 * el camino andando.
 */

/** Etapas del viaje de un agente (`transit`). */
export const Transit = { None: 0, ToStop: 1, Waiting: 2, Riding: 3 } as const;

/** Velocidad media del autobús (m/min, ≈ 24 km/h con paradas), frecuencia base (min) y capacidad. */
export const BUS_SPEED = 400;
const HEADWAY_MINUTES = 15;
const BUS_CAPACITY = 60;
/** Servicio de 07:00 a 22:00. */
const SERVICE: [number, number] = [420, 1320];
/** Billete (× `economy.priceLevel`), trayecto mínimo para plantearse el autobús (m) y espera máxima (min). */
const FARE = 1.2;
const RIDE_MIN_M = 1000;
const MAX_WAIT_MINUTES = 40;
/** El autobús se coge si el viaje esperado tarda menos del 80 % de ir andando. */
const WORTH = 0.8;
/** Paradas: una por cada 4 locales (tiendas y servicios públicos), entre 4 y 10. */
const STOPS: [number, number] = [4, 10];
const WALK_SPEED = 75;
/** Un pueblo cuya línea saldría de menos de 2 km no tiene autobús (se va andando a todas partes). */
export const MIN_LINE_M = 2000;
/** Rodeo medio por las calles respecto a la línea recta. */
const DETOUR = 1.3;

export interface BusLine {
  /** Nodo de calle y local de referencia (para el nombre) de cada parada, en el orden de la línea. */
  stopNode: number[];
  stopBuilding: number[];
  /** Recorrido (vértices) y longitud acumulada en cada vértice; `stopS` = posición de cada parada en el recorrido. */
  x: Float64Array;
  z: Float64Array;
  cum: Float64Array;
  stopS: number[];
  length: number;
}

/** Genera la línea: paradas por muestreo del punto más lejano entre los locales y recorrido del vecino más cercano. */
export function buildLine(map: NavMap, minLength = MIN_LINE_M): BusLine | null {
  const venues = map.venues;
  const k = Math.min(STOPS[1], Math.max(STOPS[0], Math.floor(venues.length / 4)));
  if (venues.length < STOPS[0]) return null;
  const c = (b: number) => map.buildings[b]!.centroid;
  let cx = 0;
  let cz = 0;
  for (const v of venues) {
    cx += c(v).x / venues.length;
    cz += c(v).z / venues.length;
  }
  const sq = (v: number) => v * v;
  const d2 = (b: number, x: number, z: number) => sq(c(b).x - x) + sq(c(b).z - z);
  const chosen = [venues.reduce((best, v) => (d2(v, cx, cz) < d2(best, cx, cz) ? v : best))];
  while (chosen.length < k) {
    let far = -1;
    let farD = -1;
    for (const v of venues) {
      if (chosen.includes(v)) continue;
      const d = Math.min(...chosen.map((s) => d2(v, c(s).x, c(s).z)));
      if (d > farD) {
        farD = d;
        far = v;
      }
    }
    if (far < 0) break;
    chosen.push(far);
  }
  // Orden del vecino más cercano desde la primera parada.
  const tour = [chosen[0]!];
  const left = new Set(chosen.slice(1));
  while (left.size > 0) {
    const last = c(tour[tour.length - 1]!);
    let next = -1;
    let nextD = Infinity;
    for (const v of left) {
      const d = d2(v, last.x, last.z);
      if (d < nextD) {
        nextD = d;
        next = v;
      }
    }
    tour.push(next);
    left.delete(next);
  }
  const stopNode: number[] = [];
  const stopBuilding: number[] = [];
  for (const b of tour) {
    const node = map.entranceNode[b]!;
    if (!stopNode.includes(node)) {
      stopNode.push(node);
      stopBuilding.push(b);
    }
  }
  if (stopNode.length < 2) return null;
  const xs: number[] = [];
  const zs: number[] = [];
  const stopVertex: number[] = [];
  for (let s = 0; s < stopNode.length; s++) {
    const seg = map.nodePath(stopNode[s]!, stopNode[(s + 1) % stopNode.length]!);
    if (!seg) return null;
    stopVertex.push(xs.length);
    for (let v = 0; v < seg.length - 1; v++) {
      xs.push(map.nodeX[seg[v]!]!);
      zs.push(map.nodeZ[seg[v]!]!);
    }
  }
  xs.push(xs[0]!);
  zs.push(zs[0]!);
  const cum = new Float64Array(xs.length);
  for (let v = 1; v < xs.length; v++) cum[v] = cum[v - 1]! + Math.sqrt(sq(xs[v]! - xs[v - 1]!) + sq(zs[v]! - zs[v - 1]!));
  const length = cum[xs.length - 1]!;
  if (length <= 0 || length < minLength) return null;
  return { stopNode, stopBuilding, x: Float64Array.from(xs), z: Float64Array.from(zs), cum, stopS: stopVertex.map((v) => cum[v]!), length };
}

/** Autobuses en servicio ahora según la frecuencia (`society.transit` la multiplica; 0 = sin servicio). */
export function busCount(world: World): number {
  const line = world.busLine;
  const level = world.num('society.transit');
  if (!line || level <= 0 || world.criteria['world.era'] === 'historical') return 0;
  const m = minuteOfDay(world);
  if (m < SERVICE[0] || m >= SERVICE[1]) return 0;
  return Math.max(1, Math.round((line.length / (BUS_SPEED * HEADWAY_MINUTES)) * level));
}

/** Posición en el recorrido (m) del autobús `k` de `n` en el minuto absoluto `minute`. */
function busS(line: BusLine, k: number, n: number, minute: number): number {
  return (((minute * BUS_SPEED + (k * line.length) / n) % line.length) + line.length) % line.length;
}

/** Punto y rumbo del recorrido en la posición `s`. */
export function linePoint(line: BusLine, s: number): [number, number, number] {
  let lo = 0;
  let hi = line.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line.cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const seg = line.cum[hi]! - line.cum[lo]!;
  const t = seg > 0 ? (s - line.cum[lo]!) / seg : 0;
  const dx = line.x[hi]! - line.x[lo]!;
  const dz = line.z[hi]! - line.z[lo]!;
  return [line.x[lo]! + dx * t, line.z[lo]! + dz * t, headingOf(dx, dz)];
}

function absMinute(world: World): number {
  return world.tick * world.time.minutesPerTick;
}

/** Autobuses ahora: posiciones (x, z) y rumbos, para el frame. */
export function busesNow(world: World): { positions: Float32Array; headings: Float32Array } {
  const line = world.busLine;
  const n = busCount(world);
  const positions = new Float32Array(n * 3);
  const headings = new Float32Array(n);
  if (!line) return { positions, headings };
  for (let k = 0; k < n; k++) {
    const [x, z, h] = linePoint(line, busS(line, k, n, absMinute(world)));
    positions[k * 3] = x;
    positions[k * 3 + 2] = z;
    headings[k] = h;
  }
  return { positions, headings };
}

function nearestStop(line: BusLine, map: NavMap, x: number, z: number): [number, number] {
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s < line.stopNode.length; s++) {
    const n = line.stopNode[s]!;
    const dx = map.nodeX[n]! - x;
    const dz = map.nodeZ[n]! - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return [best, Math.sqrt(bestD)];
}

export function fare(world: World): number {
  return FARE * world.num('economy.priceLevel');
}

/**
 * ¿Coge el autobús para ir de (x, z) a `target` en lugar de seguir `path` andando? Si conviene, devuelve la ruta hasta
 * la parada de subida y las paradas de subida y bajada.
 */
export function planRide(world: World, i: number, x: number, z: number, path: Float64Array, target: number): { path: Float64Array; board: number; alight: number } | null {
  const line = world.busLine;
  const a = world.agents;
  if (!line || a.age[i]! < 12 || a.money[i]! < fare(world)) return null;
  const n = busCount(world);
  const m = minuteOfDay(world);
  if (n === 0 || m + MAX_WAIT_MINUTES > SERVICE[1]) return null;
  const walk = pathLength(x, z, path);
  if (walk < RIDE_MIN_M) return null;
  const map = world.map;
  const dest = map.buildings[target]!.centroid;
  const [board, toStop] = nearestStop(line, map, x, z);
  const [alight, fromStop] = nearestStop(line, map, dest.x, dest.z);
  if (board === alight) return null;
  const ride = (((line.stopS[alight]! - line.stopS[board]!) % line.length) + line.length) % line.length;
  const headway = line.length / (n * BUS_SPEED);
  const byBus = ((toStop + fromStop) * DETOUR) / WALK_SPEED + headway / 2 + ride / BUS_SPEED;
  if (byBus >= WORTH * (walk / WALK_SPEED)) return null;
  const toStopPath = map.routeToNode(x, z, a.location[i]!, line.stopNode[board]!);
  return toStopPath ? { path: toStopPath, board, alight } : null;
}

/** Baja del autobús (o desiste de esperarlo) y sigue andando hasta su destino. */
function walkOn(world: World, i: number): void {
  const a = world.agents;
  const target = a.finalTarget[i]!;
  a.transit[i] = Transit.None;
  a.flags[i] = 0;
  a.location[i] = -1;
  const path = target >= 0 ? world.map.route(a.positions[i * 3]!, a.positions[i * 3 + 2]!, -1, target) : null;
  a.paths[i] = path;
  a.pathPos[i] = 0;
  a.target[i] = path ? target : -1;
  a.activities[i] = AgentActivity.Moving;
}

/**
 * Tras el movimiento: cada autobús pasa por las paradas que recorre en este tick (en orden): bajan quienes llegan y suben
 * quienes esperan (hasta la capacidad). Quienes viajan van con su autobús; quien espera demasiado (o se acaba el
 * servicio) sigue andando.
 */
export function transitSystem(world: World): void {
  const a = world.agents;
  const line = world.busLine;
  if (!line) return;
  const n = busCount(world);
  const dt = world.time.minutesPerTick;
  const now = absMinute(world);
  if (n === 0) {
    for (let i = 0; i < a.count; i++) if (a.transit[i] === Transit.Waiting || a.transit[i] === Transit.Riding) walkOn(world, i);
    return;
  }
  const waiting = new Map<number, number[]>();
  const riding = new Map<number, number[]>();
  for (let i = 0; i < a.count; i++) {
    if (a.transit[i] === Transit.Waiting) {
      if (now - a.transitSince[i]! > MAX_WAIT_MINUTES) {
        walkOn(world, i);
        continue;
      }
      const list = waiting.get(a.boardStop[i]!) ?? [];
      list.push(i);
      waiting.set(a.boardStop[i]!, list);
    } else if (a.transit[i] === Transit.Riding) {
      const k = Math.min(a.bus[i]!, n - 1);
      const list = riding.get(k) ?? [];
      list.push(i);
      riding.set(k, list);
    }
  }
  const advance = Math.min(line.length - 1e-6, dt * BUS_SPEED);
  const price = fare(world);
  for (let k = 0; k < n; k++) {
    const s1 = busS(line, k, n, now);
    const s0 = s1 - advance;
    const onBoard = riding.get(k) ?? [];
    // Paradas que cruza en este tick, en orden de paso.
    const crossed = line.stopS
      .map((s, stop) => [stop, (((s - s0) % line.length) + line.length) % line.length] as const)
      .filter(([, d]) => d > 0 && d <= advance)
      .sort((p, q) => p[1] - q[1] || p[0] - q[0]);
    for (const [stop] of crossed) {
      const node = line.stopNode[stop]!;
      for (let r = onBoard.length - 1; r >= 0; r--) {
        const i = onBoard[r]!;
        if (a.alightStop[i] !== stop) continue;
        onBoard.splice(r, 1);
        a.positions[i * 3] = world.map.nodeX[node]!;
        a.positions[i * 3 + 2] = world.map.nodeZ[node]!;
        walkOn(world, i);
      }
      const queue = waiting.get(stop) ?? [];
      while (queue.length > 0 && onBoard.length < BUS_CAPACITY) {
        const i = queue.shift()!;
        if (a.money[i]! < price) {
          walkOn(world, i);
          continue;
        }
        a.money[i]! -= price;
        a.transit[i] = Transit.Riding;
        a.bus[i] = k;
        a.flags[i] = AgentFlag.Indoors;
        onBoard.push(i);
      }
    }
    // Quienes van dentro, con el autobús.
    const [x, z, h] = linePoint(line, s1);
    for (const i of onBoard) {
      a.positions[i * 3] = x;
      a.positions[i * 3 + 2] = z;
      a.headings[i] = h;
    }
  }
}
