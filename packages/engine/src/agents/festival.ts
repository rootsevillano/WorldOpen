import { AgentActivity, AgentFlag, type CriterionDefinition, type RegionRef } from '@worldopen/contracts';
import { headingOf } from '../math/angles';
import { MINUTES_PER_DAY } from '../time/clock';
import { Action, Occupation } from '../world/agents';
import type { World } from '../world/world';
import { minuteOfDay } from './environment';

/**
 * Fiestas (ADR-0034, ADR-0035, ADR-0046). Cada pueblo tiene su calendario:
 * - Fiestas patronales: verbena cada noche, procesión el día grande (festivo) y fuegos la última noche. Las del primer
 *   pueblo las elige el Modo Dios (`society.festivalMonth`, `festivalStartDay`, `festivalLength`, `festivalHoliday`;
 *   por defecto del 15 al 18 de agosto, el 16 festivo); las de los demás, `fiestas.<región>.patronal…` (por defecto,
 *   según la región, de mayo a septiembre) (ADR-0047).
 * - Romería: un día festivo (`fiestas.<región>.romeria…`; por defecto, de abril o mayo según la región) en que parte
 *   de los vecinos pasa el día en el merendero del pueblo más alejado de la plaza.
 * - Carnaval (`fiestas.<región>.carnaval…`, por defecto del 12 al 14 de febrero) (ADR-0048): tres días con disfraces;
 *   el primero, desfile de disfraces a las 17:00; baile de disfraces las dos primeras noches; el martes, festivo.
 * - Navidad (todos los pueblos): del 24 de diciembre al 6 de enero; festivos el 25, el 1 y el 6; verbena y fuegos en
 *   Nochevieja (la noche del 30 de diciembre, último día del año de 360) y cabalgata de Reyes el 5 a las 18:00.
 * Verbena de 18:00 a 03:00 en la plaza (el local junto a la parada) y sus 2 locales más cercanos: se sale y se
 * trasnocha, se socializa el doble y vienen más visitantes. `society.festivities` (0–3) gradúa la intensidad; 0 = sin
 * fiestas. Todo se deriva de la fecha y del mapa: no hay estado.
 */

export type FiestaKind = 'patronal' | 'romeria' | 'navidad' | 'carnaval';

export interface Fiesta {
  kind: FiestaKind;
  /** Primer día (día del año 0–359: meses de 30 días). */
  first: number;
  length: number;
  /** Días festivos (1 = el primero). */
  holidays: number[];
  /** Días con verbena por la noche. */
  verbenaDays: number[];
  /** Procesión o cabalgata: día y hora de salida (minuto del día), o null. */
  procession: { day: number; from: number } | null;
  /** Día cuya noche (00:00–00:30 del siguiente) tiene fuegos artificiales; 0 = ninguno. */
  fireworks: number;
  /** Día de la salida al campo de la romería; 0 = ninguno. */
  outing: number;
  /** Visitantes: × (1 + `visitors` × `society.festivities`). */
  visitors: number;
}

/** Verbena: de 18:00 a 03:00 (la madrugada cuenta como la noche del día anterior). */
const VERBENA_FROM = 18 * 60;
const VERBENA_TO = 3 * 60;
/** Locales de la verbena: la plaza y sus vecinos más cercanos. */
const VENUES = 3;
/** Navidad: del 24 de diciembre (día 1) al 6 de enero (día 13). */
const CHRISTMAS: Omit<Fiesta, 'kind'> = {
  first: 11 * 30 + 23,
  length: 13,
  holidays: [2, 8, 13],
  verbenaDays: [7],
  procession: { day: 12, from: 18 * 60 },
  fireworks: 7,
  outing: 0,
  visitors: 0.5,
};
/** Carnaval (ADR-0048): tres días; desfile de disfraces el primero a las 17:00, baile las dos primeras noches. */
const CARNIVAL: Omit<Fiesta, 'kind' | 'first'> = {
  length: 3,
  holidays: [3],
  verbenaDays: [1, 2],
  procession: { day: 1, from: 17 * 60 },
  fireworks: 0,
  outing: 0,
  visitors: 1,
};
/** Se disfraza la mitad de los vecinos (× `festivities`, máx. 90 %), de cualquier edad. */
const COSTUME_SHARE = 0.5;
/** Fecha del carnaval por defecto: el mismo fin de semana en toda la comarca. */
const CARNIVAL_MONTH = 2;
const CARNIVAL_DAY = 12;
/** Romería: de 10:00 a 18:00 en el merendero; va un 40 % de los vecinos de 6 años o más (× `festivities`, máx. 80 %). */
const ROMERIA_FROM = 10 * 60;
const ROMERIA_TO = 18 * 60;
const ROMERIA_SHARE = 0.4;
/** Salida de la procesión de la romería hacia la ermita (ADR-0050). */
const PILGRIMAGE_FROM = 9 * 60;

/** Hash de una cadena (FNV-1a) y valor en [0, 1) para la clave `k`. */
function unit(text: string, k: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return (Math.imul(h ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) >>> 0) / 0x100000000;
}

/**
 * Fechas por defecto de un pueblo (ADR-0046), según su región: las patronales de los vecinos, de mayo a septiembre,
 * de 3 a 5 días, el segundo festivo; la romería, en abril o mayo. Meses y días empiezan en 1.
 */
export function defaultFiestaDates(regionId: string): {
  patronalMonth: number; patronalDay: number; patronalLength: number; patronalHoliday: number; romeriaMonth: number; romeriaDay: number;
  carnavalMonth: number; carnavalDay: number;
} {
  return {
    patronalMonth: 5 + Math.floor(unit(regionId, 1) * 5),
    patronalDay: 1 + Math.floor(unit(regionId, 2) * 26),
    patronalLength: 3 + Math.floor(unit(regionId, 3) * 3),
    patronalHoliday: 2,
    romeriaMonth: 4 + Math.floor(unit(regionId, 4) * 2),
    romeriaDay: 1 + Math.floor(unit(regionId, 5) * 28),
    carnavalMonth: CARNIVAL_MONTH,
    carnavalDay: CARNIVAL_DAY,
  };
}

/**
 * Criterios de fechas por pueblo (ADR-0047), que el Modo Dios puede cambiar: `fiestas.<región>.romeriaMonth` y
 * `romeriaDay` en todos los pueblos y, en los vecinos, `patronalMonth`, `patronalDay`, `patronalLength` y
 * `patronalHoliday` (las del primer pueblo siguen en `society.festival…`). Por defecto, las fechas de su región.
 */
export function fiestaCriteria(regions: readonly Pick<RegionRef, 'id' | 'displayName'>[]): CriterionDefinition[] {
  const defs: CriterionDefinition[] = [];
  regions.forEach((region, t) => {
    const d = defaultFiestaDates(region.id);
    const def = (field: keyof typeof d, label: string, min: number, max: number, description: string): CriterionDefinition => ({
      key: `fiestas.${region.id}.${field}`,
      label: `${region.displayName} · ${label}`,
      type: 'number', min, max, default: d[field], integer: true,
      description: `${region.displayName}: ${description}`,
      mutableBy: 'admin',
    });
    if (t > 0) {
      defs.push(
        def('patronalMonth', 'fiestas: mes', 1, 12, 'mes de las fiestas patronales (1–12).'),
        def('patronalDay', 'fiestas: día', 1, 30, 'día del mes en que empiezan las fiestas patronales.'),
        def('patronalLength', 'fiestas: días', 1, 10, 'duración de las fiestas patronales en días.'),
        def('patronalHoliday', 'fiestas: festivo', 0, 10, 'día de fiestas que es festivo, con procesión (0 = ninguno).'),
      );
    }
    defs.push(
      def('romeriaMonth', 'romería: mes', 1, 12, 'mes de la romería (1–12).'),
      def('romeriaDay', 'romería: día', 1, 30, 'día del mes de la romería, que es festivo.'),
      def('carnavalMonth', 'carnaval: mes', 1, 12, 'mes del carnaval (1–12).'),
      def('carnavalDay', 'carnaval: día', 1, 30, 'día del mes en que empieza el carnaval (tres días; el tercero, festivo).'),
    );
  });
  return defs;
}

/** Fiestas patronales: verbena cada noche, procesión el día festivo a las 12:00 y fuegos la última noche. */
function patronal(month: number, day: number, length: number, holiday: number): Fiesta {
  const big = holiday > 0 && holiday <= length ? holiday : 0;
  return {
    kind: 'patronal',
    first: (month - 1) * 30 + (day - 1),
    length,
    holidays: big ? [big] : [],
    verbenaDays: Array.from({ length }, (_, k) => k + 1),
    procession: big ? { day: big, from: 12 * 60 } : null,
    fireworks: length,
    outing: 0,
    visitors: 2,
  };
}

/** Calendario de fiestas de un pueblo, por prioridad (si coinciden dos, cuenta la primera). */
export function fiestas(world: World, town = 0): Fiesta[] {
  if (world.num('society.festivities') <= 0) return [];
  const region = world.map.towns[town]?.regionId ?? 'r1';
  // Fechas del Modo Dios (ADR-0047); sin el criterio (rulesets sin fechas por pueblo), las de su región.
  const d = defaultFiestaDates(region);
  const date = (field: keyof typeof d): number => {
    const v = world.criteria[`fiestas.${region}.${field}`];
    return typeof v === 'number' ? v : d[field];
  };
  const own = town === 0
    ? patronal(world.num('society.festivalMonth'), world.num('society.festivalStartDay'), world.num('society.festivalLength'), world.num('society.festivalHoliday'))
    : patronal(date('patronalMonth'), date('patronalDay'), date('patronalLength'), date('patronalHoliday'));
  const romeria: Fiesta = {
    kind: 'romeria',
    first: (date('romeriaMonth') - 1) * 30 + (date('romeriaDay') - 1),
    length: 1,
    holidays: [1],
    verbenaDays: [],
    // Procesión de la plaza a la ermita (ADR-0050), si el pueblo la tiene.
    procession: (world.map.towns[town]?.hermitage ?? -1) >= 0 ? { day: 1, from: PILGRIMAGE_FROM } : null,
    fireworks: 0,
    outing: 1,
    visitors: 1,
  };
  const carnaval: Fiesta = { kind: 'carnaval', first: (date('carnavalMonth') - 1) * 30 + (date('carnavalDay') - 1), ...CARNIVAL };
  return [own, { kind: 'navidad', ...CHRISTMAS }, carnaval, romeria];
}

function minutesSinceStart(world: World): number {
  const s = world.time.start;
  return ((s.month - 1) * 30 + (s.day - 1)) * MINUTES_PER_DAY + s.hour * 60 + s.minute + world.tick * world.time.minutesPerTick;
}

/** Fiesta en curso en un pueblo y su día (con la madrugada hasta las 03:00 como parte del día anterior), o null. */
export function activeFiesta(world: World, town = 0, offsetMinutes = 0): { fiesta: Fiesta; day: number } | null {
  const t = minutesSinceStart(world) + offsetMinutes - VERBENA_TO;
  const dayOfYear = Math.floor(t / MINUTES_PER_DAY) % 360;
  for (const fiesta of fiestas(world, town)) {
    // Días desde el primero (puede cruzar fin de mes o de año: meses de 30 días, años de 360).
    const index = (((dayOfYear - fiesta.first) % 360) + 360) % 360;
    if (index < fiesta.length) return { fiesta, day: index + 1 };
  }
  return null;
}

/** Duración de la fiesta en curso de un pueblo (o de sus fiestas patronales si no hay ninguna). */
export function festivalLength(world: World, town = 0): number {
  return activeFiesta(world, town)?.fiesta.length ?? (town === 0 ? world.num('society.festivalLength') : 0);
}

/** Día de la fiesta en curso de un pueblo (1…), o 0. */
export function festivalDay(world: World, offsetMinutes = 0, town = 0): number {
  return activeFiesta(world, town, offsetMinutes)?.day ?? 0;
}

/** ¿Verbena ahora en un pueblo? */
export function verbena(world: World, town = 0): boolean {
  const a = activeFiesta(world, town);
  if (!a || !a.fiesta.verbenaDays.includes(a.day)) return false;
  const m = (minutesSinceStart(world) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return m >= VERBENA_FROM || m < VERBENA_TO;
}

/** ¿Día de verbena en un pueblo (de 03:00 a 03:00)? Se trasnocha. */
export function verbenaDay(world: World, town = 0): boolean {
  const a = activeFiesta(world, town);
  return a !== null && a.fiesta.verbenaDays.includes(a.day);
}

/** ¿Es festivo en un pueblo (de 03:00 a 03:00)? */
export function festivalHoliday(world: World, town = 0): boolean {
  const a = activeFiesta(world, town);
  return a !== null && a.fiesta.holidays.includes(a.day);
}

/** Intensidad de las fiestas (`society.festivities`). */
export function festivities(world: World): number {
  return world.num('society.festivities');
}

/** Visitantes de más por la fiesta en curso de un pueblo (×). */
export function festivalVisitors(world: World, town = 0): number {
  const a = activeFiesta(world, town);
  return a ? 1 + a.fiesta.visitors * festivities(world) : 1;
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

/** Locales de fiesta ahora (se socializa el doble): las verbenas en curso y los merenderos de las romerías. */
export function partyVenues(world: World): Set<number> {
  const out = new Set<number>();
  world.map.towns.forEach((_, t) => {
    if (verbena(world, t)) for (const v of festivalVenues(world, t)) out.add(v);
    if (romeriaTime(world, t)) {
      const site = romeriaSite(world, t);
      if (site >= 0) out.add(site);
    }
  });
  return out;
}

/** Avisos de inicio, cambio de día y fin de las fiestas de cada pueblo. */
export function festivalSystem(world: World): void {
  world.map.towns.forEach((_, t) => {
    const now = activeFiesta(world, t);
    const before = activeFiesta(world, t, -world.time.minutesPerTick);
    if ((now?.day ?? 0) === (before?.day ?? 0) && now?.fiesta.kind === before?.fiesta.kind) return;
    const town = world.townNames[t] ?? '';
    if (now && now.day === 1) world.emit('festival.started', { town, kind: now.fiesta.kind, days: now.fiesta.length, holiday: now.fiesta.holidays.includes(1) });
    else if (!now && before) world.emit('festival.ended', { town, kind: before.fiesta.kind });
    else if (now) world.emit('festival.day', { town, kind: now.fiesta.kind, day: now.day, holiday: now.fiesta.holidays.includes(now.day) });
  });
}

/**
 * Romería (ADR-0046, ADR-0049): la ermita del pueblo en el campo o, si el mapa no tiene, el merendero (el local más
 * alejado de la plaza; cacheado por mundo), y quién va (por hash del id: sin sorteo).
 */
const sites = new WeakMap<World, number[]>();

export function romeriaSite(world: World, town: number): number {
  let list = sites.get(world);
  if (!list) {
    list = world.map.towns.map((t, k) => {
      if (t.hermitage >= 0) return t.hermitage;
      const plaza = festivalVenues(world, k)[0];
      if (plaza === undefined || t.venues.length < 2) return -1;
      const p = world.map.buildings[plaza]!.centroid;
      let best = -1;
      let bestD = -1;
      for (const v of t.venues) {
        const c = world.map.buildings[v]!.centroid;
        const d = (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z);
        if (d > bestD) {
          bestD = d;
          best = v;
        }
      }
      return best;
    });
    sites.set(world, list);
  }
  return list[town] ?? -1;
}

/** ¿Hora de la romería en un pueblo (su día, de 10:00 a 18:00)? */
export function romeriaTime(world: World, town = 0): boolean {
  const a = activeFiesta(world, town);
  if (!a || a.fiesta.outing !== a.day) return false;
  const m = minuteOfDay(world);
  return m >= ROMERIA_FROM && m < ROMERIA_TO;
}

/** ¿Va `i` a la romería? Una parte de los vecinos de 6 años o más. */
export function romeriaParticipant(world: World, i: number): boolean {
  const a = world.agents;
  if (a.age[i]! < 6 || a.occupation[i] === Occupation.Visitor || a.transit[i] || a.home[i]! < 0) return false;
  const share = Math.min(0.8, ROMERIA_SHARE * festivities(world));
  return (Math.imul(a.ids[i]! ^ 0x5bd1e995, 0x85ebca6b) >>> 0) / 0x100000000 < share;
}

/**
 * Procesión (ADR-0044) y cabalgata de Reyes (ADR-0046): una hora antes de la salida, parte de los vecinos del pueblo
 * va a su plaza; a la hora de salida sale detrás del paso (o la carroza), de dos en dos y despacio, hasta un punto de
 * la calle a unos 250 m y vuelve. Quien desfila es un vecino real: el sistema lo coloca en la fila (sin trayecto propio)
 * hasta que vuelve a la plaza. Todo se deriva de la fecha, del mapa y de quién está en la plaza: no hay estado nuevo.
 * La de la romería (ADR-0050) va de la plaza a la ermita por el camino, sin vuelta, con quienes van a la romería: al
 * llegar se quedan en la ermita y no deciden hasta que acaba la procesión.
 */
const GATHER_BEFORE = 60;
const PROCESSION_LASTS = 90;
/** Velocidad (m/min), separación entre parejas (m), distancia del paso a la primera pareja (m) y media fila (m). */
const PROCESSION_SPEED = 30;
const PROCESSION_SPACING = 1.6;
const PASO_AHEAD = 4;
const ROW_HALF = 0.8;
/** Distancia del punto de giro a la plaza (m) y parte de los vecinos que desfila (× `society.festivities`, máx. 0,6). */
const ROUTE_REACH = 250;
const PROCESSION_SHARE = 0.2;
/** Fuegos artificiales: de 00:00 a 00:30 de la noche que toque, en la plaza de cada pueblo. */
const FIREWORKS_TO = 30;

interface Route {
  plaza: number;
  /** Donde se quedan al acabar: la plaza o, en la romería, la ermita. */
  end: number;
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
    return routeOf(world, plaza, plaza, [...out, ...out.slice(0, -1).reverse()]);
  }
  return null;
}

const pilgrimages = new WeakMap<World, (Route | null)[]>();

/** Ruta de la romería de un pueblo: de la plaza a su ermita por las calles y el camino, sin vuelta (o null). */
export function pilgrimageRoute(world: World, town: number): Route | null {
  let list = pilgrimages.get(world);
  if (!list) {
    list = world.map.towns.map((t, k) => {
      const plaza = festivalVenues(world, k)[0];
      if (plaza === undefined || t.hermitage < 0) return null;
      const nodes = world.map.nodePath(world.map.entranceNode[plaza]!, world.map.entranceNode[t.hermitage]!);
      if (!nodes || nodes.length < 2) return null;
      return routeOf(world, plaza, t.hermitage, nodes);
    });
    pilgrimages.set(world, list);
  }
  return list[town] ?? null;
}

function routeOf(world: World, plaza: number, end: number, nodes: number[]): Route {
  const map = world.map;
  const x = Float64Array.from(nodes.map((n) => map.nodeX[n]!));
  const z = Float64Array.from(nodes.map((n) => map.nodeZ[n]!));
  const cum = new Float64Array(nodes.length);
  for (let k = 1; k < nodes.length; k++) cum[k] = cum[k - 1]! + Math.sqrt((x[k]! - x[k - 1]!) * (x[k]! - x[k - 1]!) + (z[k]! - z[k - 1]!) * (z[k]! - z[k - 1]!));
  return { plaza, end, x, z, cum, length: cum[nodes.length - 1]! };
}

/** Ruta de la procesión de hoy en un pueblo: a la ermita el día de la romería; si no, la de la plaza. */
function routeToday(world: World, town: number, offsetMinutes = 0): Route | null {
  return activeFiesta(world, town, offsetMinutes)?.fiesta.kind === 'romeria' ? pilgrimageRoute(world, town) : processionRoute(world, town);
}

/** Duración de la procesión de hoy (min): 90, o lo que tarde en llegar la última pareja a la ermita y media hora más. */
function processionLasts(world: World, town: number, offsetMinutes = 0): number {
  const route = routeToday(world, town, offsetMinutes);
  if (!route || route.end === route.plaza) return PROCESSION_LASTS;
  return Math.max(PROCESSION_LASTS, Math.ceil(route.length / PROCESSION_SPEED) + 30);
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

/** Hora de salida de la procesión de hoy en un pueblo (minuto del día), o −1 si hoy no hay. */
function processionFrom(world: World, town: number, offsetMinutes = 0): number {
  const a = activeFiesta(world, town, offsetMinutes);
  const p = a?.fiesta.procession;
  return p && p.day === a!.day ? p.from : -1;
}

/** ¿Hora de la procesión en un pueblo (de la reunión en la plaza a la vuelta)? */
export function processionTime(world: World, town = 0): boolean {
  const from = processionFrom(world, town);
  if (from < 0) return false;
  const m = minuteOfDay(world);
  return m >= from - GATHER_BEFORE && m < from + processionLasts(world, town);
}

/**
 * ¿Va `i` a la procesión de su pueblo? Una parte de los vecinos de 6 años o más (por hash del id: sin sorteo); en la
 * romería, quienes van a la romería.
 */
export function processionParticipant(world: World, i: number): boolean {
  const a = world.agents;
  if (a.age[i]! < 6 || a.occupation[i] === Occupation.Visitor || a.transit[i] || a.home[i]! < 0) return false;
  if (activeFiesta(world, world.map.townOfBuilding[a.home[i]!]!)?.fiesta.kind === 'romeria') return romeriaParticipant(world, i);
  const share = Math.min(0.6, PROCESSION_SHARE * festivities(world));
  return (Math.imul(a.ids[i]!, 0x9e3779b1) >>> 0) / 0x100000000 < share;
}

/** ¿Momento de ir a la plaza para la procesión de un pueblo? (antes de que salga). */
export function processionGathering(world: World, town = 0): boolean {
  return processionTime(world, town) && minuteOfDay(world) < processionFrom(world, town);
}

/** Plaza (salida de la procesión) del pueblo de `i`, o −1. */
export function processionPlaza(world: World, i: number): number {
  return routeToday(world, world.map.townOfBuilding[world.agents.home[i]!]!)?.plaza ?? -1;
}

/** ¿Está `i` desfilando (fuera, sin trayecto propio, colocado por la procesión)? */
function marching(world: World, i: number): boolean {
  const a = world.agents;
  return a.action[i] === Action.Procession && a.location[i]! < 0 && a.paths[i] === null;
}

/** Cada tick: a la hora salen quienes esperan en la plaza; se colocan en la fila; vuelven a la plaza al acabar. */
export function processionSystem(world: World): void {
  const a = world.agents;
  const map = world.map;
  const m = minuteOfDay(world);
  map.towns.forEach((_, t) => {
    if (!processionTime(world, t)) return;
    const from = processionFrom(world, t);
    if (m < from) return;
    const route = routeToday(world, t);
    if (!route) return;
    const lasts = processionLasts(world, t);
    const starting = m < from + world.time.minutesPerTick;
    const elapsed = m - from;
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
    const end = map.buildings[route.end]!.centroid;
    ids.forEach((id, rank) => {
      const i = a.indexOf(id);
      const s = elapsed * PROCESSION_SPEED - Math.floor(rank / 2) * PROCESSION_SPACING;
      if (s >= route.length || m + world.time.minutesPerTick >= from + lasts) {
        // De vuelta en la plaza (o, en la romería, en la ermita): se queda allí. En la ermita sigue en la procesión
        // hasta que acaba, para no volverse antes de que empiece el día de campo.
        a.location[i] = route.end;
        a.positions[i * 3] = end.x;
        a.positions[i * 3 + 2] = end.z;
        a.flags[i] = AgentFlag.Indoors;
        if (route.end === route.plaza) a.action[i] = Action.Stay;
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

/** Pasos (o carrozas) de las procesiones en curso (posición y rumbo), para el render (ADR-0044). */
export function processionPasos(world: World): { positions: Float32Array; headings: Float32Array } {
  const out: number[] = [];
  const headings: number[] = [];
  const a = world.agents;
  // El frame sale después de avanzar el reloj: el paso va donde lo dejó el último tick de la procesión.
  const dt = world.time.minutesPerTick;
  const m = minuteOfDay(world) - dt;
  world.map.towns.forEach((_, t) => {
    const from = processionFrom(world, t, -dt);
    if (from < 0 || m < from || m >= from + processionLasts(world, t, -dt)) return;
    const route = routeToday(world, t, -dt);
    if (!route) return;
    let any = false;
    for (let i = 0; i < a.count && !any; i++) any = marching(world, i) && world.map.townOfBuilding[a.home[i]!] === t;
    const s = (m - from) * PROCESSION_SPEED + PASO_AHEAD;
    if (!any || s >= route.length) return;
    const [x, z, heading] = along(route, s);
    out.push(x, 0, z);
    headings.push(heading);
  });
  return { positions: Float32Array.from(out), headings: Float32Array.from(headings) };
}

/** Plazas donde se tiran fuegos artificiales ahora (de 00:00 a 00:30 de la noche que toque), para el render. */
export function fireworkSites(world: World): Float32Array {
  const m = minuteOfDay(world);
  const out: number[] = [];
  if (m >= FIREWORKS_TO) return new Float32Array(0);
  world.map.towns.forEach((_, t) => {
    const a = activeFiesta(world, t);
    if (!a || a.fiesta.fireworks !== a.day) return;
    const route = processionRoute(world, t);
    if (!route) return;
    const c = world.map.buildings[route.plaza]!.centroid;
    out.push(c.x, 0, c.z);
  });
  return Float32Array.from(out);
}

/** ¿Va disfrazado `i`? En carnaval de su pueblo, la mitad de los vecinos (por hash del id: sin sorteo) (ADR-0048). */
export function costumed(world: World, i: number, carnival: readonly boolean[]): boolean {
  const a = world.agents;
  if (a.occupation[i] === Occupation.Visitor || a.home[i]! < 0 || !carnival[world.map.townOfBuilding[a.home[i]!]!]) return false;
  const share = Math.min(0.9, COSTUME_SHARE * festivities(world));
  return (Math.imul(a.ids[i]! ^ 0x5bd1e995, 0x85ebca6b) >>> 0) / 0x100000000 < share;
}

/** Pueblos en carnaval ahora. */
export function carnivalTowns(world: World): boolean[] {
  return world.map.towns.map((_, t) => activeFiesta(world, t)?.fiesta.kind === 'carnaval');
}

/** Banderas del frame con `AgentFlag.Costumed` para quien va disfrazado (se deriva: no es estado). */
export function costumeFlags(world: World, flags: Uint8Array): Uint8Array {
  const carnival = carnivalTowns(world);
  if (!carnival.includes(true)) return flags;
  for (let i = 0; i < flags.length; i++) if (costumed(world, i, carnival)) flags[i] = flags[i]! | AgentFlag.Costumed;
  return flags;
}

/** Pradera de la ermita (ADR-0049): de 12 a 40 m del centro, fuera del edificio. */
const MEADOW_FROM = 12;
const MEADOW_TO = 40;

/**
 * El día de la romería, quien está en la ermita se ve fuera, en la pradera de alrededor: el frame lo saca del
 * edificio y lo coloca en un punto fijo por persona (hash del id). Se deriva: no cambia el estado.
 */
export function meadowFrame(world: World, flags: Uint8Array, positions: Float32Array): void {
  const sites = picnicSites(world);
  if (sites.size === 0) return;
  const a = world.agents;
  for (let i = 0; i < flags.length; i++) {
    const loc = a.location[i]!;
    if (!sites.has(loc)) continue;
    const c = world.map.buildings[loc]!.centroid;
    const h = Math.imul(a.ids[i]! ^ 0x27d4eb2f, 0x165667b1) >>> 0;
    // Dirección en el cuadrado [-1, 1]² normalizada (sin trigonometría) y distancia en la pradera.
    let dx = ((h & 0xffff) / 0x8000) - 1;
    let dz = ((h >>> 16) / 0x8000) - 1;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const r = MEADOW_FROM + ((Math.imul(h, 0x9e3779b1) >>> 0) / 0x100000000) * (MEADOW_TO - MEADOW_FROM);
    dx = (dx / len) * r;
    dz = (dz / len) * r;
    positions[i * 3] = c.x + dx;
    positions[i * 3 + 2] = c.z + dz;
    flags[i] = flags[i]! & ~AgentFlag.Indoors;
  }
}

/** Ermitas de los pueblos que hoy tienen romería: allí se merienda y se está en la pradera (ADR-0049, ADR-0050). */
export function picnicSites(world: World): Set<number> {
  const sites = new Set<number>();
  world.map.towns.forEach((t, k) => {
    if (t.hermitage >= 0 && activeFiesta(world, k)?.fiesta.kind === 'romeria') sites.add(t.hermitage);
  });
  return sites;
}
