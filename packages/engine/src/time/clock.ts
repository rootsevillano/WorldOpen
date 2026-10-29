import type { GameDate, Season, TimeConfig } from '@worldopen/contracts';

/** ADR-0009: calendario de 12 meses × 30 días. */
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;

export const DEFAULT_TIME: TimeConfig = {
  minutesPerTick: 1,
  start: { year: 1, month: 3, day: 21, hour: 6, minute: 0 },
};

const SEASON_BY_MONTH: Season[] = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
];

export function validateTimeConfig(time: TimeConfig): void {
  const { minutesPerTick, start } = time;
  if (!Number.isInteger(minutesPerTick) || minutesPerTick < 1 || MINUTES_PER_DAY % minutesPerTick !== 0) {
    throw new Error(`minutesPerTick debe ser un divisor entero de ${MINUTES_PER_DAY}: ${minutesPerTick}`);
  }
  if (start.month < 1 || start.month > MONTHS_PER_YEAR || start.day < 1 || start.day > DAYS_PER_MONTH) {
    throw new Error(`Fecha de inicio fuera del calendario: ${start.month}/${start.day}`);
  }
  if (start.hour < 0 || start.hour > 23 || start.minute < 0 || start.minute > 59) {
    throw new Error(`Hora de inicio inválida: ${start.hour}:${start.minute}`);
  }
}

export function ticksPerDay(time: TimeConfig): number {
  return MINUTES_PER_DAY / time.minutesPerTick;
}

/** Convierte un tick en fecha de juego. Solo aritmética entera: determinista. */
export function tickToDate(tick: number, time: TimeConfig): GameDate {
  const { start } = time;
  const startMinute = start.hour * 60 + start.minute;
  const totalMinutes = startMinute + tick * time.minutesPerTick;
  const dayOffset = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const minuteOfDay = totalMinutes - dayOffset * MINUTES_PER_DAY;

  const startDayIndex = (start.month - 1) * DAYS_PER_MONTH + (start.day - 1);
  const daysPerYear = DAYS_PER_MONTH * MONTHS_PER_YEAR;
  const absDay = startDayIndex + dayOffset;
  const yearOffset = Math.floor(absDay / daysPerYear);
  const dayOfYear = absDay - yearOffset * daysPerYear;
  const month = Math.floor(dayOfYear / DAYS_PER_MONTH) + 1;

  return {
    year: start.year + yearOffset,
    month,
    day: (dayOfYear % DAYS_PER_MONTH) + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    season: SEASON_BY_MONTH[month - 1] ?? 'winter',
    minuteOfDay,
    elapsedDays: Math.floor((tick * time.minutesPerTick) / MINUTES_PER_DAY),
  };
}
