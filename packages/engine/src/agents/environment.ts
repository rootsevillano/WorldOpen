import { MINUTES_PER_DAY } from '../time/clock';
import type { World } from '../world/world';

/**
 * Magnitudes del entorno derivadas del tiempo y los criterios (no son estado: se recalculan).
 * Sin funciones trascendentes (ADR-0003): curvas lineales a trozos.
 */

function totalMinutes(world: World): number {
  const s = world.time.start;
  return s.hour * 60 + s.minute + world.tick * world.time.minutesPerTick;
}

export function minuteOfDay(world: World): number {
  const total = totalMinutes(world);
  return total - Math.floor(total / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

/** Día de la semana 0–6 contado desde el día de inicio del mundo; 5 y 6 son festivos. */
export function dayOfWeek(world: World): number {
  return Math.floor(totalMinutes(world) / MINUTES_PER_DAY) % 7;
}

/** Jornada laboral: días 0–4, de 08:00 a 15:00. */
export function inShift(world: World): boolean {
  const m = minuteOfDay(world);
  return dayOfWeek(world) < 5 && m >= 480 && m < 900;
}

/** Horario escolar: días 0–4, de 09:00 a 14:00. */
export function inSchool(world: World): boolean {
  const m = minuteOfDay(world);
  return dayOfWeek(world) < 5 && m >= 540 && m < 840;
}

/** Comercios abiertos de 08:00 a 21:00. */
export function shopsOpen(world: World): boolean {
  const m = minuteOfDay(world);
  return m >= 480 && m < 1260;
}

/** Factor estacional de la cosecha (E4). */
export function harvestFactor(world: World): number {
  const s = world.time.start;
  const day = (s.month - 1) * 30 + (s.day - 1) + Math.floor(totalMinutes(world) / MINUTES_PER_DAY);
  const month = Math.floor((day % 360) / 30) + 1;
  if (month <= 2 || month === 12) return 0.5;
  if (month <= 5) return 1;
  if (month <= 8) return 1.3;
  return 1.1;
}

/** 0 = pleno día, 1 = noche cerrada. Transiciones 06:00–07:30 y 21:30–23:00 (horario español, ADR-0018). */
export function nightFactor(world: World): number {
  const m = minuteOfDay(world);
  if (m < 360) return 1;
  if (m < 450) return 1 - (m - 360) / 90;
  if (m < 1290) return 0;
  if (m < 1380) return (m - 1290) / 90;
  return 1;
}

/** Horas de sueño por edad (min): niños 10 h, adolescentes 9 h, adultos 7.5 h. */
export function sleepMinutes(age: number): number {
  return age < 12 ? 600 : age < 18 ? 540 : 450;
}

/** ¿Está el reloj dentro de la ventana de sueño que empieza en `bedtime` (minuto del día)? */
export function inSleepWindow(minute: number, bedtime: number, age: number): boolean {
  return (minute - bedtime + 1440) % 1440 < sleepMinutes(age);
}

/** Minutos que faltan para `bedtime` (0–1439). */
export function minutesToBed(minute: number, bedtime: number): number {
  return (bedtime - minute + 1440) % 1440;
}

/** Temperatura actual (°C): base del criterio ± 6 °C, mínima a las 06:00 y máxima a las 15:00. */
export function temperature(world: World): number {
  const base = world.num('climate.baseTemperatureC');
  const m = minuteOfDay(world);
  // Onda triangular: −1 a las 06:00 (360), +1 a las 15:00 (900).
  const rise = 540;
  const fall = MINUTES_PER_DAY - rise;
  const t = m >= 360 && m < 900 ? -1 + (2 * (m - 360)) / rise : 1 - (2 * ((m - 900 + MINUTES_PER_DAY) % MINUTES_PER_DAY)) / fall;
  return base + 6 * t;
}

/** Incomodidad térmica al aire libre: 0 entre 15 y 27 °C; 1 a 12 °C de distancia de esa franja. */
export function thermalDiscomfort(world: World): number {
  const t = temperature(world);
  const excess = t > 27 ? t - 27 : t < 15 ? 15 - t : 0;
  return excess / 12;
}
