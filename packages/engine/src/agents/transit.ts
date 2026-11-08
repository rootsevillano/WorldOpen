import { AgentActivity, AgentFlag } from '@worldopen/contracts';
import type { NavMap } from '../map/navigation';
import { headingOf } from '../math/angles';
import { ticksPerDay } from '../time/clock';
import { Action, Occupation } from '../world/agents';
import type { World } from '../world/world';
import { dayOfWeek, minuteOfDay } from './environment';
import { personName } from '../content/names';
import { Rng } from '../math/rng';
import { festivalVisitors } from './festival';
import { forgetAgent } from './lifecycle';
import { removeAgent } from './population';
import { fuelCost, householdHasCar, pathLength, shouldDrive } from './vehicles';

/**
 * Transporte entre pueblos (ADR-0031). El mundo es un pueblo; los vecinos quedan fuera de la simulación. Un autobús
 * interurbano entra por la carretera del borde del mapa hasta una parada en el centro, se detiene y se va. Dentro del
 * pueblo no hay transporte público. Hay quien sale (trabaja fuera, pasa el día en otro pueblo), en coche hasta el borde
 * o en autobús, y vuelve; mientras está fuera no se dibuja ni gasta necesidades. Cada autobús trae visitantes que gastan
 * en la tienda del centro (sin simularlos como agentes). Los autobuses no tienen estado: su posición sale del horario.
 */

/** Etapas de una salida del pueblo (`transit`). */
export const Transit = { None: 0, ToStop: 1, Waiting: 2, Away: 3, ToEdge: 4 } as const;
/** Motivo de la salida (`awayReason`). */
export const AwayReason = { Work: 0, Trip: 1 } as const;

/** Autobús: velocidad (m/min, ≈ 36 km/h por carretera), parada (min), primer y último autobús, frecuencia base (min). */
const BUS_SPEED = 600;
const DWELL = 3;
export const FIRST_BUS = 420;
export const LAST_BUS = 1260;
const HEADWAY = 60;
/**
 * Horarios según la demanda (ADR-0045), por pueblo. En las horas punta (07:00–09:00 y 15:00–17:00) se añade un autobús
 * por cada 15 viajeros (quien trabaja fuera y no tiene coche en casa), hasta 4 por hora y como mucho uno cada 15 min.
 * En un pueblo de menos de 150 vecinos, fuera de las horas punta pasa la mitad. Cada autobús lleva 50 viajeros: quien
 * no cabe espera al siguiente.
 */
const PEAKS: [number, number][] = [[420, 540], [900, 1020]];
const RIDERS_PER_EXTRA = 15;
const MAX_EXTRA = 3;
const MIN_HEADWAY = 15;
const QUIET_RESIDENTS = 150;
export const BUS_CAPACITY = 50;
/** Billete de ida (× `economy.priceLevel`) y espera máxima en la parada (min). */
const FARE = 2;
const MAX_WAIT = 70;
/** Vuelta del trabajo de fuera (15:00, más el trayecto) y de una excursión (19:00 + hasta 1 h). */
const WORK_BACK = 15 * 60;
const TRIP_BACK = 19 * 60;
/** Excursiones: fines de semana, al salir de casa entre las 09:00 y las 13:00, el 8 % de las veces. */
const TRIP_SHARE = 0.08;
const TRIP_WINDOW: [number, number] = [540, 780];
/** Gasto de quien pasa el día fuera (comida) (× `economy.priceLevel`) y rato de un visitante en cada local (min). */
const VISIT_STAY = 45;
const AWAY_SPEND = 6;
/** Recorrido fuera del pueblo hasta el pueblo vecino (m, cada sentido): cuenta para la gasolina. */
const OUTSIDE_M = 10_000;
/**
 * Hostal y turismo (ADR-0033): el bar-hostal es la tienda más cercana a la parada; una habitación por cada 25 m² (mín.
 * 4), 35 la noche (× `economy.priceLevel`). Parte de los visitantes (30 % × `society.tourism`, hasta 1) se aloja 1–3
 * noches si quedan habitaciones: a las 21:00 va a dormir al hostal y por la mañana sigue de visita.
 */
const ROOM_M2 = 25;
const MIN_ROOMS = 4;
const NIGHT_PRICE = 35;
const OVERNIGHT_SHARE = 0.3;
const CHECK_IN = 21 * 60;
const WAKE_UP = 8 * 60 + 30;
/** Visitantes por autobús: 1,5 por cada 1 000 habitantes (el doble en fin de semana; × temporada × `society.tourism`). */
const VISITORS_PER_PERSON = 0.0015;

const hash = (a: number, b: number) => (Math.imul(Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b), 0xc2b2ae35) >>> 0) / 0x100000000;

export interface Road {
  /** Pueblo (índice de región) al que sirve (ADR-0036). */
  town: number;
  /** Nodo del borde por el que se sale del pueblo y nodo de la parada (en el centro). */
  edgeNode: number;
  stopNode: number;
  /** Local de referencia de la parada y tienda más cercana a ella (donde gastan los visitantes; −1 si no hay). */
  stopBuilding: number;
  shop: number;
  x: Float64Array;
  z: Float64Array;
  cum: Float64Array;
  length: number;
}

/**
 * Carretera del borde al centro de un pueblo (`town`): del nodo de calle del pueblo más alejado del centro de sus
 * viviendas a su local más céntrico. Cada pueblo tiene la suya (ADR-0036).
 */
export function buildRoad(map: NavMap, town = 0): Road | null {
  const t = map.towns[town];
  if (!t || t.venues.length === 0 || t.homes.length === 0) return null;
  let cx = 0;
  let cz = 0;
  for (const h of t.homes) {
    cx += map.buildings[h]!.centroid.x / t.homes.length;
    cz += map.buildings[h]!.centroid.z / t.homes.length;
  }
  const d2 = (x: number, z: number, ox = cx, oz = cz) => (x - ox) * (x - ox) + (z - oz) * (z - oz);
  const at = (b: number) => map.buildings[b]!.centroid;
  let stopBuilding = t.venues[0]!;
  for (const v of t.venues) if (d2(at(v).x, at(v).z) < d2(at(stopBuilding).x, at(stopBuilding).z)) stopBuilding = v;
  const stopNode = map.entranceNode[stopBuilding]!;
  let edgeNode = t.nodes[0]!;
  for (const n of t.nodes) if (d2(map.nodeX[n]!, map.nodeZ[n]!) > d2(map.nodeX[edgeNode]!, map.nodeZ[edgeNode]!)) edgeNode = n;
  const nodes = map.nodePath(edgeNode, stopNode);
  if (!nodes || nodes.length < 2) return null;
  const x = Float64Array.from(nodes.map((n) => map.nodeX[n]!));
  const z = Float64Array.from(nodes.map((n) => map.nodeZ[n]!));
  const cum = new Float64Array(nodes.length);
  for (let v = 1; v < nodes.length; v++) cum[v] = cum[v - 1]! + Math.sqrt(d2(x[v]!, z[v]!, x[v - 1]!, z[v - 1]!));
  const s = at(stopBuilding);
  let shop = -1;
  for (const r of t.retail) if (shop < 0 || d2(at(r).x, at(r).z, s.x, s.z) < d2(at(shop).x, at(shop).z, s.x, s.z)) shop = r;
  return { town, edgeNode, stopNode, stopBuilding, shop, x, z, cum, length: cum[nodes.length - 1]! };
}

function serviceOn(world: World): boolean {
  return world.busRoads.some((r) => r !== null) && world.num('society.transit') > 0 && world.criteria['world.era'] !== 'historical';
}

/** Carretera (y parada, hostal…) del pueblo del edificio `b` (ADR-0036). */
export function roadOf(world: World, b: number): Road | null {
  return b < 0 ? null : (world.busRoads[world.map.townOfBuilding[b]!] ?? null);
}

/** Demanda de cada pueblo (ADR-0045): vecinos y viajeros (trabajan fuera sin coche en casa). Se recalcula cada tick. */
interface Demand {
  world: World | null;
  tick: number;
  residents: number[];
  riders: number[];
}
let demandCache: Demand = { world: null, tick: -1, residents: [], riders: [] };

export function busDemand(world: World): Demand {
  if (demandCache.world === world && demandCache.tick === world.tick) return demandCache;
  const a = world.agents;
  const map = world.map;
  const res = map.towns.map(() => 0);
  const riders = map.towns.map(() => 0);
  for (let i = 0; i < a.count; i++) {
    const h = a.home[i]!;
    if (h < 0 || a.occupation[i] === Occupation.Visitor) continue;
    const t = map.townOfBuilding[h]!;
    res[t]!++;
    if (a.occupation[i] === Occupation.Commuter && !householdHasCar(world, a.household[i]!, a.home[i]!)) riders[t]!++;
  }
  demandCache = { world, tick: world.tick, residents: res, riders };
  return demandCache;
}

/** Minutos hasta el siguiente autobús de un pueblo a partir de `t`, según la hora y su demanda (ADR-0045). */
function headwayAt(world: World, town: number, t: number): number {
  const base = HEADWAY / world.num('society.transit');
  const d = busDemand(world);
  if (PEAKS.some(([from, to]) => t >= from && t < to)) {
    const extra = Math.min(MAX_EXTRA, Math.floor((d.riders[town] ?? 0) / RIDERS_PER_EXTRA));
    return Math.max(Math.min(base, MIN_HEADWAY), base / (1 + extra));
  }
  return (d.residents[town] ?? 0) < QUIET_RESIDENTS ? base * 2 : base;
}

/** Llegadas del día a la parada de un pueblo (minuto del día), según la demanda (ADR-0045). */
export function arrivals(world: World, town = 0): number[] {
  if (!serviceOn(world) || !world.busRoads[town]) return [];
  const out: number[] = [];
  for (let t = FIRST_BUS; t <= LAST_BUS + 1e-9; t += headwayAt(world, town, t)) out.push(Math.round(t));
  return out;
}

/** Próxima llegada a la parada de un pueblo a partir del minuto `m` (o `null`). */
export function nextArrival(world: World, m: number, town = 0): number | null {
  for (const t of arrivals(world, town)) if (t >= m) return t;
  return null;
}

/** Punto y rumbo de la carretera a `s` metros del borde. */
function roadPoint(road: Road, s: number): [number, number, number] {
  let lo = 0;
  let hi = road.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (road.cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const seg = road.cum[hi]! - road.cum[lo]!;
  const t = seg > 0 ? (s - road.cum[lo]!) / seg : 0;
  const dx = road.x[hi]! - road.x[lo]!;
  const dz = road.z[hi]! - road.z[lo]!;
  return [road.x[lo]! + dx * t, road.z[lo]! + dz * t, headingOf(dx, dz)];
}

/** Autobuses en la carretera ahora (entrando, en la parada o saliendo), para el frame. */
export function busesNow(world: World): { positions: Float32Array; headings: Float32Array } {
  const pos: number[] = [];
  const head: number[] = [];
  for (const road of world.busRoads) {
    if (!road) continue;
    const m = minuteOfDay(world);
    const drive = road.length / BUS_SPEED;
    for (const ta of arrivals(world, road.town)) {
      let s = -1;
      let out = false;
      if (m >= ta - drive && m < ta) s = road.length - (ta - m) * BUS_SPEED;
      else if (m >= ta && m < ta + DWELL) s = road.length;
      else if (m >= ta + DWELL && m < ta + DWELL + drive) {
        s = road.length - (m - ta - DWELL) * BUS_SPEED;
        out = true;
      }
      if (s < 0) continue;
      const [x, z, h] = roadPoint(road, Math.min(road.length, Math.max(0, s)));
      pos.push(x, 0, z);
      // De vuelta, el rumbo es el contrario (se suma media vuelta sin trigonometría: el render solo lo usa para rotar).
      head.push(out ? h + 3.141592653589793 : h);
    }
  }
  return { positions: Float32Array.from(pos), headings: Float32Array.from(head) };
}

export function fare(world: World): number {
  return FARE * world.num('economy.priceLevel');
}

function begin(world: World, i: number, stage: number, path: Float64Array, reason: number, back: number, byCar: number): void {
  const a = world.agents;
  a.transit[i] = stage;
  a.awayReason[i] = reason;
  a.awayUntil[i] = back;
  a.awayByCar[i] = byCar;
  a.paths[i] = path;
  a.pathPos[i] = 0;
  a.target[i] = -1;
  a.location[i] = -1;
  a.flags[i] = byCar ? AgentFlag.Driving : 0;
  a.activities[i] = AgentActivity.Moving;
}

/**
 * Sale del pueblo (`reason`), de vuelta hacia `back` (min del día): en coche hasta el borde si puede llevárselo, o
 * andando a la parada a esperar el autobús. Devuelve `false` si no puede (ni coche ni autobús que le sirva).
 */
export function leaveTown(world: World, i: number, reason: number, back: number): boolean {
  const a = world.agents;
  const road = roadOf(world, a.home[i]!);
  if (!road) return false;
  const map = world.map;
  const x = a.positions[i * 3]!;
  const z = a.positions[i * 3 + 2]!;
  const from = a.location[i]!;
  const toEdge = map.routeToNode(x, z, from, road.edgeNode);
  const drive = toEdge ? pathLength(x, z, toEdge) + OUTSIDE_M : 0;
  if (toEdge && from === a.home[i] && shouldDrive(world, i, drive, world.carsBusy)) {
    a.driving[i] = 1;
    world.carsBusy.add(a.household[i]!);
    // La gasolina de fuera del pueblo (ida y vuelta) se paga al salir; la de dentro, al circular.
    a.money[i] = Math.max(0, a.money[i]! - fuelCost(world, 2 * OUTSIDE_M));
    begin(world, i, Transit.ToEdge, toEdge, reason, back, 1);
    return true;
  }
  const m = minuteOfDay(world);
  const next = nextArrival(world, m, road.town);
  const toStop = map.routeToNode(x, z, from, road.stopNode);
  if (!toStop || next === null || next - m > MAX_WAIT || a.money[i]! < 2 * fare(world) || nextArrival(world, back, road.town) === null) return false;
  begin(world, i, Transit.ToStop, toStop, reason, back, 0);
  return true;
}

/** Trabajo fuera: sale a la jornada y vuelve a las 15:00 (más el trayecto). */
export function commute(world: World, i: number): boolean {
  return leaveTown(world, i, AwayReason.Work, WORK_BACK);
}

/** ¿Una excursión de fin de semana en lugar de salir por el pueblo? (hash del agente y el día; sin PRNG) */
export function dayTrip(world: World, i: number): boolean {
  const a = world.agents;
  const m = minuteOfDay(world);
  if (dayOfWeek(world) < 5 || m < TRIP_WINDOW[0] || m > TRIP_WINDOW[1] || a.age[i]! < 18 || a.location[i] !== a.home[i]) return false;
  const day = Math.floor(world.tick / ticksPerDay(world.time));
  if (hash(a.ids[i]!, day) >= TRIP_SHARE) return false;
  return leaveTown(world, i, AwayReason.Trip, TRIP_BACK + Math.floor(hash(a.ids[i]!, day + 1) * 60));
}

/** Fin de la ruta hacia el borde (en coche: se va) o hacia la parada (a esperar). Lo llama el movimiento. */
export function reachedRoadEnd(world: World, i: number): void {
  const a = world.agents;
  a.paths[i] = null;
  if (a.transit[i] === Transit.ToEdge) depart(world, i);
  else {
    a.transit[i] = Transit.Waiting;
    a.transitSince[i] = world.tick * world.time.minutesPerTick;
    a.activities[i] = AgentActivity.Idle;
  }
}

function depart(world: World, i: number): void {
  const a = world.agents;
  a.transit[i] = Transit.Away;
  a.flags[i] = AgentFlag.Indoors;
  a.location[i] = -1;
  a.money[i] = Math.max(0, a.money[i]! - AWAY_SPEND * world.num('economy.priceLevel'));
}

/** Vuelve: aparece en (x, z) — el borde en coche o la parada — y se va a casa. */
function comeBack(world: World, i: number, x: number, z: number): void {
  const a = world.agents;
  a.transit[i] = Transit.None;
  a.positions[i * 3] = x;
  a.positions[i * 3 + 2] = z;
  a.location[i] = -1;
  a.action[i] = Action.GoHome;
  a.flags[i] = a.driving[i] ? AgentFlag.Driving : 0;
  const path = world.map.route(x, z, -1, a.home[i]!);
  a.paths[i] = path;
  a.pathPos[i] = 0;
  a.target[i] = path ? a.home[i]! : -1;
  a.activities[i] = AgentActivity.Moving;
}

/** Al crear el mundo: parte de los parados en edad de trabajar (`society.commuting`) trabaja fuera del pueblo. */
export function seedCommuters(world: World): void {
  const a = world.agents;
  const share = world.num('society.commuting');
  for (let i = 0; i < a.count; i++) {
    if (a.occupation[i] === Occupation.Unemployed && a.age[i]! >= 18 && a.age[i]! < 67 && hash(a.ids[i]!, 31) < share) {
      a.occupation[i] = Occupation.Commuter;
      a.workplace[i] = -1;
    }
  }
}

/** Lunes: parte de quienes siguen en paro encuentra trabajo fuera (10 % × `society.commuting` por semana). */
export function outsideJobs(world: World, jobless: number[]): void {
  const a = world.agents;
  const week = Math.floor(world.tick / (7 * ticksPerDay(world.time)));
  const p = 0.1 * world.num('society.commuting');
  for (const i of jobless) {
    if (a.occupation[i] !== Occupation.Unemployed || hash(a.ids[i]!, week) >= p) continue;
    a.occupation[i] = Occupation.Commuter;
    a.workplace[i] = -1;
    world.emit('job.outside', { agentId: a.ids[i], name: a.names[i] });
  }
}

/**
 * Tras el movimiento: en cada llegada del autobús suben quienes esperan y bajan quienes vuelven; llegan visitantes. Quien
 * fue en coche vuelve por el borde a su hora. Quien espera demasiado, o pierde el último autobús, se vuelve a casa.
 */
export function transitSystem(world: World): void {
  if (!world.busRoads.some((r) => r !== null)) return;
  const a = world.agents;
  const dt = world.time.minutesPerTick;
  const m = minuteOfDay(world);
  const now = world.tick * dt;
  const day = Math.floor(world.tick / ticksPerDay(world.time));
  if (world.visitorsDay !== day) {
    world.visitorsDay = day;
    world.visitorsToday = 0;
  }
  // Llegadas del autobús de cada pueblo en este tick (minuto del día en (m − dt, m]) (ADR-0045).
  const dues = world.busRoads.map((_, t) => arrivals(world, t).filter((ta) => ta > m - dt && ta <= m));
  // Plazas libres de los autobuses que llegan ahora a cada parada; quien no cabe espera al siguiente.
  const seats = dues.map((d) => d.length * BUS_CAPACITY);
  const leftBehind = dues.map(() => 0);
  const price = fare(world);
  const leavers: number[] = [];
  for (let i = 0; i < a.count; i++) {
    const stage = a.transit[i]!;
    if (stage === Transit.None || stage === Transit.ToStop || stage === Transit.ToEdge) continue;
    // Parada y borde del pueblo de cada cual (ADR-0036).
    const road = roadOf(world, a.home[i]!);
    if (!road) continue;
    const due = dues[road.town]!;
    const stopX = world.map.nodeX[road.stopNode]!;
    const stopZ = world.map.nodeZ[road.stopNode]!;
    const edgeX = world.map.nodeX[road.edgeNode]!;
    const edgeZ = world.map.nodeZ[road.edgeNode]!;
    if (stage === Transit.Away) {
      if (a.awayReason[i] === AwayReason.Work) a.workedToday[i] = Math.min(1440, a.workedToday[i]! + dt);
      if (a.awayByCar[i]) {
        if (m >= a.awayUntil[i]! || m < FIRST_BUS) comeBack(world, i, edgeX, edgeZ);
      } else if ((due.length > 0 && due[due.length - 1]! >= a.awayUntil[i]!) || m >= LAST_BUS + DWELL || !serviceOn(world)) {
        a.money[i] = Math.max(0, a.money[i]! - price);
        comeBack(world, i, stopX, stopZ);
      }
    } else if (stage === Transit.Waiting) {
      if (due.length > 0 && a.occupation[i] === Occupation.Visitor) {
        // Los visitantes se van siempre (ocupan plaza, pero no se quedan en el pueblo).
        seats[road.town]!--;
        leavers.push(a.ids[i]!);
      } else if (due.length > 0 && a.money[i]! >= price && seats[road.town]! > 0) {
        seats[road.town]!--;
        a.money[i]! -= price;
        depart(world, i);
      } else if (due.length > 0 && a.money[i]! >= price) {
        leftBehind[road.town]!++;
      } else if (now - a.transitSince[i]! > MAX_WAIT || !serviceOn(world)) {
        comeBack(world, i, a.positions[i * 3]!, a.positions[i * 3 + 2]!);
      }
    }
  }
  for (const id of leavers) leave(world, id);
  visitorsSystem(world, m, now);
  leftBehind.forEach((n, t) => {
    const road = world.busRoads[t];
    if (n > 0 && road) world.emit('bus.full', { stop: world.map.buildings[road.stopBuilding]!.id, leftBehind: n });
  });
  {
    const weekend = dayOfWeek(world) >= 5 ? 2 : 1;
    // Cada pueblo recibe visitantes según sus vecinos (ADR-0036) y sus fiestas (ADR-0034, ADR-0046).
    for (const road of world.busRoads) {
      if (!road) continue;
      const due = dues[road.town]!;
      if (due.length === 0) continue;
      const fiesta = festivalVisitors(world, road.town);
      const expected = residents(world, road.town) * VISITORS_PER_PERSON * weekend * due.length * season(world) * world.num('society.tourism') * fiesta;
      let visitors = 0;
      for (let v = 0; v < Math.floor(expected + hash(day + road.town * 7919, m)); v++) {
        if (spawnVisitor(world, road, m, day * 10_000 + m * 10 + v + road.town * 100_000_000)) visitors++;
      }
      world.visitorsToday += visitors;
      world.emit('bus.arrived', { visitors, stop: world.map.buildings[road.stopBuilding]!.id });
    }
  }
}

/** Temporada turística: ×2 en verano (jun–ago), ×0,5 en invierno (dic–feb), ×1 el resto. */
export function season(world: World): number {
  const s = world.time.start;
  const day = (s.month - 1) * 30 + (s.day - 1) + Math.floor((s.hour * 60 + s.minute + world.tick * world.time.minutesPerTick) / 1440);
  const month = Math.floor((day % 360) / 30) + 1;
  return month >= 6 && month <= 8 ? 2 : month === 12 || month <= 2 ? 0.5 : 1;
}

/** El bar-hostal del pueblo `town` (la tienda junto a su parada) o −1. */
export function hostal(world: World, town = 0): number {
  return world.busRoads[town]?.shop ?? -1;
}

/** Habitaciones del hostal de `town` (sin pueblo: de todos). */
export function hostalRooms(world: World, town?: number): number {
  if (town === undefined) return world.busRoads.reduce((s, r) => s + (r ? hostalRooms(world, r.town) : 0), 0);
  const h = hostal(world, town);
  return h < 0 ? 0 : Math.max(MIN_ROOMS, Math.floor(world.map.buildings[h]!.grossFloorAreaM2 / ROOM_M2));
}

/** Huéspedes del hostal ahora (visitantes con noches por delante), de `town` o de todos los pueblos. */
export function hostalGuests(world: World, town?: number): number {
  const a = world.agents;
  let n = 0;
  for (let i = 0; i < a.count; i++) {
    if (a.stayNights[i]! > 0 && (town === undefined || world.map.townOfBuilding[a.home[i]!] === town)) n++;
  }
  return n;
}

export function nightPrice(world: World): number {
  return NIGHT_PRICE * world.num('economy.priceLevel');
}

/** Vecinos (sin los visitantes), de `town` o de todos los pueblos. */
export function residents(world: World, town?: number): number {
  const a = world.agents;
  let n = 0;
  for (let i = 0; i < a.count; i++) {
    if (a.occupation[i] !== Occupation.Visitor && (town === undefined || world.map.townOfBuilding[a.home[i]!] === town)) n++;
  }
  return n;
}

/** Visitantes en el pueblo ahora. */
export function visitorsNow(world: World): number {
  return world.agents.count - residents(world);
}

/** Locales cercanos a la parada (los 8 más próximos): adonde van los visitantes. */
function visitorVenues(world: World, road: Road): number[] {
  const map = world.map;
  const s = map.buildings[road.stopBuilding]!.centroid;
  const d = (b: number) => {
    const c = map.buildings[b]!.centroid;
    return (c.x - s.x) * (c.x - s.x) + (c.z - s.z) * (c.z - s.z);
  };
  return map.venues.filter((v) => world.buildings.state[v] === 0).sort((x, y) => d(x) - d(y) || x - y).slice(0, 8);
}

/**
 * Baja del autobús un visitante (ADR-0032): un agente de paso, sin hogar en el pueblo (su "casa" es la parada) y con la
 * hora a la que se irá. Sus rasgos salen de un PRNG propio sembrado por hash: no altera el del mundo.
 */
function spawnVisitor(world: World, road: Road, m: number, key: number): boolean {
  const a = world.agents;
  if (a.count >= a.capacity) return false;
  const rng = Rng.fromSeed((Math.imul(key, 0x9e3779b1) ^ 0x5bd1e995) >>> 0);
  const x = world.map.nodeX[road.stopNode]!;
  const z = world.map.nodeZ[road.stopNode]!;
  const i = a.add(x, 0, z);
  a.sex[i] = rng.int(0, 1);
  a.age[i] = rng.int(18, 75);
  a.names[i] = personName(rng, a.sex[i]!);
  a.sociability[i] = rng.nextFloat();
  a.bravery[i] = rng.nextFloat();
  a.occupation[i] = Occupation.Visitor;
  a.home[i] = road.stopBuilding;
  a.household[i] = 0;
  a.money[i] = rng.int(30, 90);
  a.bedtime[i] = 1380;
  // Se va en un autobús de 1 a 4 horas después (como muy tarde, el último)…
  a.stayNights[i] = 0;
  a.awayUntil[i] = Math.min(LAST_BUS - 10, m + 60 + rng.int(0, 180));
  // …o se aloja en el hostal 1–3 noches si quedan habitaciones (ADR-0033).
  if (hostal(world, road.town) >= 0 && rng.nextFloat() < OVERNIGHT_SHARE * Math.min(1, world.num('society.tourism')) && hostalGuests(world, road.town) < hostalRooms(world, road.town)) {
    a.stayNights[i] = rng.int(1, 3);
    a.money[i] = rng.int(150, 350);
    a.awayUntil[i] = CHECK_IN;
    world.emit('tourist.arrived', { agentId: a.ids[i], name: a.names[i], nights: a.stayNights[i] });
  }
  a.transitSince[i] = m;
  goToVenue(world, i, road, key);
  world.emit('visitor.arrived', { agentId: a.ids[i], name: a.names[i] });
  return true;
}

/** El visitante va a uno de los locales cercanos a la parada (por hash), distinto del que está. */
function goToVenue(world: World, i: number, road: Road, key: number): void {
  const a = world.agents;
  const venues = visitorVenues(world, road).filter((v) => v !== a.location[i]);
  if (venues.length === 0) return;
  const venue = venues[Math.floor(hash(a.ids[i]!, key) * venues.length)]!;
  const path = world.map.route(a.positions[i * 3]!, a.positions[i * 3 + 2]!, a.location[i]!, venue);
  if (!path) return;
  a.action[i] = Action.GoOut;
  a.paths[i] = path;
  a.pathPos[i] = 0;
  a.target[i] = venue;
  a.location[i] = -1;
  a.flags[i] = 0;
  a.activities[i] = AgentActivity.Moving;
}

/**
 * Visitantes en el pueblo: pasan un rato (unos 45 min) en cada local, cambian de local, y a su hora vuelven a la parada
 * para irse en el próximo autobús. Al subir, dejan el pueblo. Quien siga aquí tras el último autobús se va igualmente.
 */
function visitorsSystem(world: World, m: number, now: number): void {
  const a = world.agents;
  const gone: number[] = [];
  for (let i = 0; i < a.count; i++) {
    if (a.occupation[i] !== Occupation.Visitor) continue;
    // Su pueblo es el de la parada en la que bajó (su "casa").
    const road = roadOf(world, a.home[i]!);
    if (!road) {
      gone.push(a.ids[i]!);
      continue;
    }
    const inn = road.shop;
    const guest = a.stayNights[i]! > 0;
    // De paso en el día: tras el último autobús ya no queda nadie. Los huéspedes pasan la noche en el hostal.
    if (!guest && (m >= LAST_BUS + DWELL + 10 || m < FIRST_BUS)) {
      gone.push(a.ids[i]!);
      continue;
    }
    if (a.transit[i] !== Transit.None || a.paths[i] !== null || a.location[i]! < 0) continue;
    if (guest && a.action[i] === Action.Sleep) {
      // Por la mañana se levanta: una noche menos; si era la última, se irá en un autobús de hoy.
      if (m < WAKE_UP || m >= CHECK_IN) continue;
      a.stayNights[i]!--;
      a.awayUntil[i] = a.stayNights[i] === 0 ? Math.min(LAST_BUS - 10, m + 60 + Math.floor(hash(a.ids[i]!, m) * 180)) : CHECK_IN;
      a.action[i] = Action.Stay;
      a.transitSince[i] = m;
      goToVenue(world, i, road, now);
      continue;
    }
    if (guest && m >= a.awayUntil[i]!) {
      // A dormir al hostal: paga la noche (si no puede, se va como un visitante de paso).
      if (a.money[i]! < nightPrice(world) || inn < 0) {
        a.stayNights[i] = 0;
        a.awayUntil[i] = m;
        continue;
      }
      a.money[i]! -= nightPrice(world);
      world.buildings.cash[inn]! += nightPrice(world);
      const path = a.location[i] === inn ? null : world.map.route(a.positions[i * 3]!, a.positions[i * 3 + 2]!, a.location[i]!, inn);
      a.action[i] = Action.Sleep;
      if (path) {
        a.paths[i] = path;
        a.pathPos[i] = 0;
        a.target[i] = inn;
        a.location[i] = -1;
        a.flags[i] = 0;
        a.activities[i] = AgentActivity.Moving;
      }
      continue;
    }
    if (m >= a.awayUntil[i]!) {
      const toStop = world.map.routeToNode(a.positions[i * 3]!, a.positions[i * 3 + 2]!, a.location[i]!, road.stopNode);
      if (toStop) begin(world, i, Transit.ToStop, toStop, AwayReason.Trip, a.awayUntil[i]!, 0);
      else gone.push(a.ids[i]!);
    } else if (m - a.transitSince[i]! >= VISIT_STAY) {
      a.transitSince[i] = m;
      goToVenue(world, i, road, now);
    }
  }
  for (const id of gone) leave(world, id);
}

/** El visitante se va del pueblo (y sus conocidos lo olvidan). */
function leave(world: World, id: number): void {
  forgetAgent(world, id, false);
  removeAgent(world, id, 'visitor.left');
}

/** Distancia de la marquesina al eje de la calle (m): en la acera (calles de 10 m). */
const STOP_SIDE_M = 6.5;

/** Marquesinas de las paradas (ADR-0045): en la acera, a un lado del final de la carretera de cada pueblo. */
export function busStops(world: World): { positions: Float32Array; headings: Float32Array } {
  const pos: number[] = [];
  const head: number[] = [];
  for (const road of world.busRoads) {
    if (!road || road.x.length < 2) continue;
    const n = road.x.length;
    const dx = road.x[n - 1]! - road.x[n - 2]!;
    const dz = road.z[n - 1]! - road.z[n - 2]!;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    pos.push(road.x[n - 1]! - (dz / len) * STOP_SIDE_M, 0, road.z[n - 1]! + (dx / len) * STOP_SIDE_M);
    head.push(headingOf(dx, dz));
  }
  return { positions: Float32Array.from(pos), headings: Float32Array.from(head) };
}
