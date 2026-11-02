import { AgentActivity, AgentFlag } from '@worldopen/contracts';
import { headingOf } from '../math/angles';
import { MINUTES_PER_DAY } from '../time/clock';
import { Action, Occupation } from '../world/agents';
import type { World } from '../world/world';
import { minuteOfDay } from './environment';

/**
 * Fiestas del pueblo (ADR-0034). Por defecto del 15 al 18 de agosto, el 16 festivo; el Modo Dios elige mes, día de
 * inicio, duración y día festivo (ADR-0035: `society.festivalMonth`, `festivalStartDay`, `festivalLength`,
 * `festivalHoliday`). Verbena de 18:00 a 03:00 en los locales junto a la plaza (el local más céntrico, donde para el
 * autobús, y sus 2 vecinos): los vecinos salen y trasnochan, se socializa el doble y vienen el triple de visitantes.
 * `society.festivities` (0–3) gradúa la intensidad; 0 = sin fiestas. Todo se deriva de la fecha: no hay estado.
 */

/** Duración de las fiestas (días). */
export function festivalLength(world: World): number {
  return world.num('society.festivalLength');
}
/** Verbena: de 18:00 a 03:00 (la madrugada cuenta como la noche del día anterior). */
const VERBENA_FROM = 18 * 60;
const VERBENA_TO = 3 * 60;
/** Locales de la verbena: la plaza y sus vecinos más cercanos. */
const VENUES = 3;

function minutesSinceStart(world: World): number {
  const s = world.time.start;
  return ((s.month - 1) * 30 + (s.day - 1)) * MINUTES_PER_DAY + s.hour * 60 + s.minute + world.tick * world.time.minutesPerTick;
}

/** Día de fiestas (1–4) del instante (con la madrugada hasta las 03:00 como parte del día anterior), o 0. */
export function festivalDay(world: World, offsetMinutes = 0): number {
  if (world.num('society.festivities') <= 0) return 0;
  const t = minutesSinceStart(world) + offsetMinutes - VERBENA_TO;
  const dayOfYear = Math.floor(t / MINUTES_PER_DAY) % 360;
  // Días desde el primero de fiestas (puede cruzar fin de mes o de año: meses de 30 días, años de 360).
  const first = (world.num('society.festivalMonth') - 1) * 30 + (world.num('society.festivalStartDay') - 1);
  const index = (((dayOfYear - first) % 360) + 360) % 360;
  return index < festivalLength(world) ? index + 1 : 0;
}

/** ¿Verbena ahora? */
export function verbena(world: World): boolean {
  if (festivalDay(world) === 0) return false;
  const m = (minutesSinceStart(world) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return m >= VERBENA_FROM || m < VERBENA_TO;
}

/** ¿Es el día festivo de las fiestas (de 03:00 a 03:00)? */
export function festivalHoliday(world: World): boolean {
  const holiday = world.num('society.festivalHoliday');
  return holiday > 0 && festivalDay(world) === holiday;
}

/** Intensidad de las fiestas (`society.festivities`). */
export function festivities(world: World): number {
  return world.num('society.festivities');
}

/** Locales de la verbena de un pueblo: el más céntrico (su parada del autobús) y los 2 más cercanos a él. */
export function festivalVenues(world: World, town = 0): number[] {
  const plaza = world.busRoads[town]?.stopBuilding ?? world.map.towns[town]?.venues[0];
  if (plaza === undefined) return [];
  const p = world.map.buildings[plaza]!.centroid;
  const d = (b: number) => {
    const c = world.map.buildings[b]!.centroid;
    return (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z);
  };
  return [...world.map.towns[town]!.venues].sort((x, y) => d(x) - d(y) || x - y).slice(0, VENUES);
}

/** Locales de la verbena de todos los pueblos. */
export function allFestivalVenues(world: World): number[] {
  return world.map.towns.flatMap((_, t) => festivalVenues(world, t));
}

/** Avisos de inicio y fin de las fiestas (por cambio de día de fiestas entre este tick y el anterior). */
export function festivalSystem(world: World): void {
  const now = festivalDay(world);
  const before = festivalDay(world, -world.time.minutesPerTick);
  if (now === before) return;
  if (now === 1) world.emit('festival.started', { days: festivalLength(world), holiday: festivalHoliday(world) });
  else if (now === 0) world.emit('festival.ended', {});
  else world.emit('festival.day', { day: now, holiday: festivalHoliday(world) });
}

/**
 * Procesión del día grande (ADR-0044): en el festivo, de 11:00 a 12:00 una parte de los vecinos de cada pueblo va a
 * su plaza; a las 12:00 sale detrás del paso, de dos en dos y despacio, hasta un punto de la calle a unos 250 m y
 * vuelve. Quien desfila es un vecino real: el sistema lo coloca en la fila (sin trayecto propio) hasta que vuelve a
 * la plaza. Todo se deriva de la fecha, del mapa y de quién está en la plaza: no hay estado nuevo.
 */
const GATHER_FROM = 11 * 60;
const PROCESSION_FROM = 12 * 60;
const PROCESSION_TO = 13 * 60 + 30;
/** Velocidad (m/min), separación entre parejas (m), distancia del paso a la primera pareja (m) y media fila (m). */
const PROCESSION_SPEED = 30;
const PROCESSION_SPACING = 1.6;
const PASO_AHEAD = 4;
const ROW_HALF = 0.8;
/** Distancia del punto de giro a la plaza (m) y parte de los vecinos que desfila (× `society.festivities`, máx. 0,6). */
const ROUTE_REACH = 250;
const PROCESSION_SHARE = 0.2;
/** Fuegos artificiales: la última noche de fiestas, de 00:00 a 00:30, en la plaza de cada pueblo. */
const FIREWORKS_TO = 30;

interface Route {
  plaza: number;
  x: Float64Array;
  z: Float64Array;
  cum: Float64Array;
  length: number;
}

const routes = new WeakMap<World, (Route | null)[]>();

/** Ruta de la procesión de un pueblo: de la plaza al punto de giro por las calles y vuelta (o null). */
export function processionRoute(world: World, town: number): Route | null {
  let list = routes.get(world);
  if (!list) {
    list = world.map.towns.map((_, t) => buildRoute(world, t));
    routes.set(world, list);
  }
  return list[town] ?? null;
}

function buildRoute(world: World, town: number): Route | null {
  const map = world.map;
  const plaza = festivalVenues(world, town)[0];
  if (plaza === undefined) return null;
  const start = map.entranceNode[plaza]!;
  const sx = map.nodeX[start]!;
  const sz = map.nodeZ[start]!;
  const reach = (n: number) => Math.abs(Math.sqrt((map.nodeX[n]! - sx) * (map.nodeX[n]! - sx) + (map.nodeZ[n]! - sz) * (map.nodeZ[n]! - sz)) - ROUTE_REACH);
  const candidates = [...map.towns[town]!.nodes].sort((p, q) => reach(p) - reach(q) || p - q).slice(0, 8);
  for (const turn of candidates) {
    const out = map.nodePath(start, turn);
    if (!out || out.length < 2) continue;
    const nodes = [...out, ...out.slice(0, -1).reverse()];
    const x = Float64Array.from(nodes.map((n) => map.nodeX[n]!));
    const z = Float64Array.from(nodes.map((n) => map.nodeZ[n]!));
    const cum = new Float64Array(nodes.length);
    for (let k = 1; k < nodes.length; k++) cum[k] = cum[k - 1]! + Math.sqrt((x[k]! - x[k - 1]!) * (x[k]! - x[k - 1]!) + (z[k]! - z[k - 1]!) * (z[k]! - z[k - 1]!));
    return { plaza, x, z, cum, length: cum[nodes.length - 1]! };
  }
  return null;
}

/** Punto, rumbo y dirección unitaria (ux, uz) de la ruta a `s` metros del inicio. */
function along(route: Route, s: number): [number, number, number, number, number] {
  let k = 1;
  while (k < route.cum.length - 1 && route.cum[k]! < s) k++;
  const seg = route.cum[k]! - route.cum[k - 1]!;
  const f = seg > 0 ? Math.min(1, Math.max(0, (s - route.cum[k - 1]!) / seg)) : 0;
  const dx = route.x[k]! - route.x[k - 1]!;
  const dz = route.z[k]! - route.z[k - 1]!;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  return [route.x[k - 1]! + dx * f, route.z[k - 1]! + dz * f, headingOf(dx, dz), dx / len, dz / len];
}

/** ¿Hora de la procesión (de la reunión en la plaza a la vuelta)? */
export function processionTime(world: World): boolean {
  if (!festivalHoliday(world) || festivities(world) <= 0) return false;
  const m = minuteOfDay(world);
  return m >= GATHER_FROM && m < PROCESSION_TO;
}

/** ¿Va `i` a la procesión de su pueblo? Una parte de los vecinos de 6 años o más (por hash del id: sin sorteo). */
export function processionParticipant(world: World, i: number): boolean {
  const a = world.agents;
  if (a.age[i]! < 6 || a.occupation[i] === Occupation.Visitor || a.transit[i] || a.home[i]! < 0) return false;
  const share = Math.min(0.6, PROCESSION_SHARE * festivities(world));
  return (Math.imul(a.ids[i]!, 0x9e3779b1) >>> 0) / 0x100000000 < share;
}

/** ¿Momento de ir a la plaza para la procesión? (antes de que salga). */
export function processionGathering(world: World): boolean {
  return processionTime(world) && minuteOfDay(world) < PROCESSION_FROM;
}

/** Plaza (salida de la procesión) del pueblo de `i`, o −1. */
export function processionPlaza(world: World, i: number): number {
  return processionRoute(world, world.map.townOfBuilding[world.agents.home[i]!]!)?.plaza ?? -1;
}

/** ¿Está `i` desfilando (fuera, sin trayecto propio, colocado por la procesión)? */
function marching(world: World, i: number): boolean {
  const a = world.agents;
  return a.action[i] === Action.Procession && a.location[i]! < 0 && a.paths[i] === null;
}

/** Cada tick: a las 12:00 salen quienes esperan en la plaza; se colocan en la fila; vuelven a la plaza al acabar. */
export function processionSystem(world: World): void {
  if (!processionTime(world)) return;
  const a = world.agents;
  const map = world.map;
  const m = minuteOfDay(world);
  if (m < PROCESSION_FROM) return;
  const starting = m < PROCESSION_FROM + world.time.minutesPerTick;
  const elapsed = m - PROCESSION_FROM;
  map.towns.forEach((_, t) => {
    const route = processionRoute(world, t);
    if (!route) return;
    const ids: number[] = [];
    for (let i = 0; i < a.count; i++) {
      if (a.action[i] !== Action.Procession || a.home[i]! < 0 || map.townOfBuilding[a.home[i]!] !== t) continue;
      if (a.location[i] === route.plaza) {
        if (starting) {
          a.location[i] = -1;
          a.target[i] = -1;
          a.paths[i] = null;
          ids.push(a.ids[i]!);
        } else {
          // Llegó tarde: se queda en la plaza.
          a.action[i] = Action.Stay;
        }
      } else if (marching(world, i)) ids.push(a.ids[i]!);
    }
    ids.sort((p, q) => p - q);
    const plaza = map.buildings[route.plaza]!.centroid;
    ids.forEach((id, rank) => {
      const i = a.indexOf(id);
      const s = elapsed * PROCESSION_SPEED - Math.floor(rank / 2) * PROCESSION_SPACING;
      if (s >= route.length || m + world.time.minutesPerTick >= PROCESSION_TO) {
        // De vuelta en la plaza: se queda en la verbena del mediodía.
        a.location[i] = route.plaza;
        a.positions[i * 3] = plaza.x;
        a.positions[i * 3 + 2] = plaza.z;
        a.flags[i] = AgentFlag.Indoors;
        a.action[i] = Action.Stay;
        a.activities[i] = AgentActivity.Socializing;
        return;
      }
      const [x, z, heading, ux, uz] = along(route, Math.max(0, s));
      // Dos filas, a cada lado del eje de la calle (perpendicular al tramo).
      const side = rank % 2 === 0 ? ROW_HALF : -ROW_HALF;
      a.positions[i * 3] = x - uz * side;
      a.positions[i * 3 + 2] = z + ux * side;
      a.headings[i] = heading;
      a.flags[i] = 0;
      a.activities[i] = AgentActivity.Moving;
    });
  });
}

/** Pasos de las procesiones en curso (posición y rumbo), para el render (ADR-0044). */
export function processionPasos(world: World): { positions: Float32Array; headings: Float32Array } {
  const out: number[] = [];
  const headings: number[] = [];
  // El frame sale después de avanzar el reloj: el paso va donde lo dejó el último tick de la procesión.
  const m = minuteOfDay(world) - world.time.minutesPerTick;
  if (festivalHoliday(world) && festivities(world) > 0 && m >= PROCESSION_FROM && m < PROCESSION_TO) {
    const a = world.agents;
    world.map.towns.forEach((_, t) => {
      const route = processionRoute(world, t);
      if (!route) return;
      let any = false;
      for (let i = 0; i < a.count && !any; i++) any = marching(world, i) && world.map.townOfBuilding[a.home[i]!] === t;
      const s = (m - PROCESSION_FROM) * PROCESSION_SPEED + PASO_AHEAD;
      if (!any || s >= route.length) return;
      const [x, z, heading] = along(route, s);
      out.push(x, 0, z);
      headings.push(heading);
    });
  }
  return { positions: Float32Array.from(out), headings: Float32Array.from(headings) };
}

/** Plazas donde se tiran fuegos artificiales ahora (la última noche, de 00:00 a 00:30), para el render (ADR-0044). */
export function fireworkSites(world: World): Float32Array {
  const m = minuteOfDay(world);
  if (festivities(world) <= 0 || m >= FIREWORKS_TO || festivalDay(world) !== festivalLength(world)) return new Float32Array(0);
  const out: number[] = [];
  world.map.towns.forEach((_, t) => {
    const route = processionRoute(world, t);
    if (!route) return;
    const c = world.map.buildings[route.plaza]!.centroid;
    out.push(c.x, 0, c.z);
  });
  return Float32Array.from(out);
}
