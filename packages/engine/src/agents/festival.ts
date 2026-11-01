import { MINUTES_PER_DAY } from '../time/clock';
import type { World } from '../world/world';

/**
 * Fiestas del pueblo (ADR-0034). Del 15 al 18 de agosto (fiestas patronales; el 16 es festivo): verbena de 18:00 a
 * 03:00 en los locales junto a la plaza (el local más céntrico, donde para el autobús, y sus 2 vecinos), los vecinos
 * salen y trasnochan, se socializa el doble y vienen el triple de visitantes de los pueblos vecinos.
 * `society.festivities` (0–3) gradúa la intensidad; 0 = sin fiestas. Todo se deriva de la fecha: no hay estado.
 */

const MONTH = 8;
const FIRST_DAY = 15;
export const FESTIVAL_DAYS = 4;
/** Día festivo (sin trabajo ni comercio de jornada): el segundo de fiestas. */
const HOLIDAY = 2;
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
  const month = Math.floor(dayOfYear / 30) + 1;
  const day = (dayOfYear % 30) + 1;
  return month === MONTH && day >= FIRST_DAY && day < FIRST_DAY + FESTIVAL_DAYS ? day - FIRST_DAY + 1 : 0;
}

/** ¿Verbena ahora? */
export function verbena(world: World): boolean {
  if (festivalDay(world) === 0) return false;
  const m = (minutesSinceStart(world) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return m >= VERBENA_FROM || m < VERBENA_TO;
}

/** ¿Es el día festivo de las fiestas (de 03:00 a 03:00)? */
export function festivalHoliday(world: World): boolean {
  return festivalDay(world) === HOLIDAY;
}

/** Intensidad de las fiestas (`society.festivities`). */
export function festivities(world: World): number {
  return world.num('society.festivities');
}

/** Locales de la verbena: el más céntrico (la parada del autobús) y los 2 más cercanos a él. */
export function festivalVenues(world: World): number[] {
  const plaza = world.busRoad?.stopBuilding ?? world.map.venues[0];
  if (plaza === undefined) return [];
  const p = world.map.buildings[plaza]!.centroid;
  const d = (b: number) => {
    const c = world.map.buildings[b]!.centroid;
    return (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z);
  };
  return [...world.map.venues].sort((x, y) => d(x) - d(y) || x - y).slice(0, VENUES);
}

/** Avisos de inicio y fin de las fiestas (por cambio de día de fiestas entre este tick y el anterior). */
export function festivalSystem(world: World): void {
  const now = festivalDay(world);
  const before = festivalDay(world, -world.time.minutesPerTick);
  if (now === before) return;
  if (now === 1) world.emit('festival.started', { days: FESTIVAL_DAYS });
  else if (now === 0) world.emit('festival.ended', {});
  else world.emit('festival.day', { day: now, holiday: now === HOLIDAY });
}
