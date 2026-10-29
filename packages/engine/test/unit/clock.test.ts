import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME, tickToDate, ticksPerDay, validateTimeConfig } from '../../src';

describe('GameClock', () => {
  it('el tick 0 es la fecha de inicio', () => {
    const d = tickToDate(0, DEFAULT_TIME);
    expect(d).toMatchObject({ year: 1, month: 3, day: 21, hour: 6, minute: 0, season: 'spring', elapsedDays: 0 });
  });

  it('1 tick = 1 minuto por defecto; un día = 1440 ticks', () => {
    expect(ticksPerDay(DEFAULT_TIME)).toBe(1440);
    expect(tickToDate(1440, DEFAULT_TIME)).toMatchObject({ day: 22, hour: 6, elapsedDays: 1 });
    expect(tickToDate(18 * 60, DEFAULT_TIME)).toMatchObject({ day: 22, hour: 0, minute: 0, minuteOfDay: 0 });
  });

  it('cambia de mes y de año', () => {
    const t = { ...DEFAULT_TIME, start: { year: 1, month: 12, day: 30, hour: 23, minute: 59 } };
    expect(tickToDate(1, t)).toMatchObject({ year: 2, month: 1, day: 1, hour: 0, minute: 0, season: 'winter' });
  });

  it('la duración del tick es parametrizable (T1)', () => {
    const t = { ...DEFAULT_TIME, minutesPerTick: 10 };
    expect(ticksPerDay(t)).toBe(144);
    expect(tickToDate(6, t)).toMatchObject({ hour: 7, minute: 0 });
  });

  it('rechaza duraciones que no dividen el día y fechas fuera de calendario', () => {
    expect(() => validateTimeConfig({ ...DEFAULT_TIME, minutesPerTick: 7 })).toThrow();
    expect(() => validateTimeConfig({ ...DEFAULT_TIME, minutesPerTick: 0 })).toThrow();
    expect(() => validateTimeConfig({ ...DEFAULT_TIME, start: { ...DEFAULT_TIME.start, day: 31 } })).toThrow();
  });
});
