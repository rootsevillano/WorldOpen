import { MINUTES_PER_DAY } from '../time/clock';
import type { World } from '../world/world';

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
