/** ADR-0009. Calendario simplificado: 12 meses de 30 días (año de 360 días). */
export interface TimeConfig {
  /** Duración de un tick en minutos de juego. Por defecto 1. Fijo durante la vida del mundo. */
  minutesPerTick: number;
  /** Fecha de juego del tick 0. `month` y `day` empiezan en 1. */
  start: { year: number; month: number; day: number; hour: number; minute: number };
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export interface GameDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–30 */
  day: number;
  hour: number;
  minute: number;
  season: Season;
  /** Minutos transcurridos desde la medianoche (0–1439). */
  minuteOfDay: number;
  /** Días completos transcurridos desde el tick 0. */
  elapsedDays: number;
}
