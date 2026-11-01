import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src';
import { festivalDay, festivalHoliday, festivalVenues, verbena } from '../../src/agents/festival';
import { inSchool, inShift } from '../../src/agents/environment';
import { metric } from '../../src/metrics';
import { manifest } from '../helpers';

const at = (month: number, day: number, hour: number, criteria: Record<string, unknown> = {}, population = 50, minutesPerTick = 30) =>
  new Simulation(manifest(5, { time: { minutesPerTick, start: { year: 1, month, day, hour, minute: 0 } }, criteria: { 'society.initialPopulation': population, ...criteria } }));

describe('Fiestas del pueblo (ADR-0034)', () => {
  it('son del 15 al 18 de agosto, con verbena de 18:00 a 03:00 y el 16 festivo (sin trabajo ni escuela)', () => {
    expect(festivalDay(at(8, 14, 12).world)).toBe(0);
    expect(festivalDay(at(8, 15, 12).world)).toBe(1);
    expect(festivalDay(at(8, 18, 23).world)).toBe(4);
    // La madrugada cuenta como la noche anterior.
    expect(festivalDay(at(8, 19, 2).world)).toBe(4);
    expect(festivalDay(at(8, 19, 4).world)).toBe(0);
    expect(verbena(at(8, 15, 12).world)).toBe(false);
    expect(verbena(at(8, 15, 22).world)).toBe(true);
    // El 16 de agosto de este mundo cae en día laborable (el día 0 de la semana es el de inicio).
    const holiday = at(8, 16, 10);
    expect(festivalHoliday(holiday.world)).toBe(true);
    expect([inShift(holiday.world), inSchool(holiday.world)]).toEqual([false, false]);
    expect(inShift(at(8, 17, 10).world)).toBe(true);
    expect(festivalDay(at(8, 15, 12, { 'society.festivities': 0 }).world)).toBe(0);
  });

  it('la verbena reúne a los vecinos de noche en los locales de la plaza y vienen más visitantes', () => {
    const fiesta = at(8, 15, 6, {}, 300, 10);
    const normal = at(8, 10, 6, {}, 300, 10);
    fiesta.step(6 * 17);
    normal.step(6 * 17);
    expect(festivalVenues(fiesta.world)).toContain(fiesta.world.busRoad!.stopBuilding);
    expect(Number(metric(fiesta, 'agents.atFestivalRatio'))).toBeGreaterThan(0.2);
    expect(Number(metric(normal, 'agents.atFestivalRatio'))).toBeLessThan(0.05);
    expect(Number(metric(fiesta, 'agents.sleepingRatio'))).toBeLessThan(Number(metric(normal, 'agents.sleepingRatio')));
    expect(fiesta.world.visitorsToday).toBeGreaterThan(normal.world.visitorsToday);
  });

  it('avisa del principio, de cada día y del final', () => {
    const sim = at(8, 14, 6);
    const types: string[] = [];
    for (let d = 0; d < 6; d++) {
      sim.step(2 * 24);
      for (const e of sim.drainEvents()) if (e.type.startsWith('festival.')) types.push(e.type);
    }
    expect(types).toEqual(['festival.started', 'festival.day', 'festival.day', 'festival.day', 'festival.ended']);
  });
});
