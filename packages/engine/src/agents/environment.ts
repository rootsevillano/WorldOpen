import { MINUTES_PER_DAY } from '../time/clock';
import type { World } from '../world/world';

/**
 * Magnitudes del entorno derivadas del tiempo y los criterios (no son estado: se recalculan).
 * Sin funciones trascendentes (ADR-0003): curvas lineales a trozos.
 */

function minuteOfDay(world: World): number {
  const s = world.time.start;
  const total = s.hour * 60 + s.minute + world.tick * world.time.minutesPerTick;
  return total - Math.floor(total / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

/** 0 = pleno día, 1 = noche cerrada. Transiciones 06:00–07:30 y 20:30–22:00. */
export function nightFactor(world: World): number {
  const m = minuteOfDay(world);
  if (m < 360) return 1;
  if (m < 450) return 1 - (m - 360) / 90;
  if (m < 1230) return 0;
  if (m < 1320) return (m - 1230) / 90;
  return 1;
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
