import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src';
import { activeFiesta, festivalDay, festivalHoliday, festivalVenues, fireworkSites, romeriaParticipant, romeriaSite, verbena } from '../../src/agents/festival';
import { Action } from '../../src';
import { AgentFlag } from '@worldopen/contracts';
import { inSchool, inShift } from '../../src/agents/environment';
import { metric } from '../../src/metrics';
import { manifest, setCriterion } from '../helpers';

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

  it('el Modo Dios elige fecha, duración y día festivo; las fiestas pueden cruzar el cambio de año (ADR-0035)', () => {
    // Fiestas patronales a fin de año: tienen prioridad sobre la Navidad, que sigue antes y después (ADR-0046).
    const endOfYear = { 'society.festivalMonth': 12, 'society.festivalStartDay': 30, 'society.festivalLength': 3, 'society.festivalHoliday': 0 };
    const kind = (month: number, day: number) => activeFiesta(at(month, day, 12, endOfYear).world)?.fiesta.kind;
    expect(kind(12, 29)).toBe('navidad');
    expect(festivalDay(at(12, 30, 12, endOfYear).world)).toBe(1);
    expect(festivalDay(at(1, 1, 12, endOfYear).world)).toBe(2);
    expect(festivalDay(at(1, 2, 12, endOfYear).world)).toBe(3);
    expect(kind(1, 2)).toBe('patronal');
    expect(kind(1, 3)).toBe('navidad');
    // Sin día festivo en las patronales: ese 1 de enero se trabaja.
    expect(festivalHoliday(at(1, 1, 10, endOfYear).world)).toBe(false);
    // Cambiar el criterio en marcha mueve las fiestas al momento.
    const sim = at(5, 10, 12);
    expect(festivalDay(sim.world)).toBe(0);
    expect(sim.submit(setCriterion('society.festivalMonth', 5))).toMatchObject({ ok: true });
    expect(sim.submit(setCriterion('society.festivalStartDay', 9))).toMatchObject({ ok: true });
    sim.step();
    expect(festivalDay(sim.world)).toBe(2);
    expect(festivalHoliday(sim.world)).toBe(true);
  });

  it('las fechas son números enteros', () => {
    const sim = at(5, 10, 12);
    expect(sim.submit(setCriterion('society.festivalStartDay', 2.5))).toMatchObject({ ok: false, reason: 'invalid_payload' });
    expect(sim.submit(setCriterion('society.festivalMonth', 13))).toMatchObject({ ok: false, reason: 'invalid_payload' });
  });

  it('Navidad (ADR-0046): festivos el 25, el 1 y el 6; verbena y fuegos en Nochevieja; cabalgata de Reyes el 5 a las 18:00', () => {
    expect(activeFiesta(at(12, 24, 12).world)?.fiesta.kind).toBe('navidad');
    expect(festivalHoliday(at(12, 25, 10).world)).toBe(true);
    expect(inShift(at(12, 25, 10).world)).toBe(false);
    expect(festivalHoliday(at(12, 26, 10).world)).toBe(false);
    expect(festivalHoliday(at(1, 1, 10).world)).toBe(true);
    expect(festivalHoliday(at(1, 6, 10).world)).toBe(true);
    expect(activeFiesta(at(1, 7, 10).world)).toBeNull();
    expect(verbena(at(12, 29, 22).world)).toBe(false);
    expect(verbena(at(12, 30, 22).world)).toBe(true);
    expect(fireworkSites(at(1, 1, 0, {}, 50, 10).world).length).toBe(3);
    // Cabalgata: a las 18:10 del 5 de enero desfila parte del pueblo.
    const sim = at(1, 5, 16, {}, 400, 5);
    sim.step(26);
    const a = sim.world.agents;
    const marching = Array.from({ length: a.count }, (_, k) => k).filter((k) => a.action[k] === Action.Procession && a.location[k]! < 0 && a.paths[k] === null);
    expect(marching.length).toBeGreaterThan(20);
    expect(sim.frame().pasoCount).toBe(1);
  });

  it('romería (ADR-0046): el día es festivo y parte del pueblo pasa el día en el merendero', () => {
    // La del primer pueblo (región r1) cae el 27 de mayo.
    const sim = at(5, 27, 9, {}, 400, 10);
    expect(activeFiesta(sim.world)?.fiesta.kind).toBe('romeria');
    expect(festivalHoliday(sim.world)).toBe(true);
    const site = romeriaSite(sim.world, 0);
    expect(site).toBeGreaterThanOrEqual(0);
    expect(site).not.toBe(festivalVenues(sim.world)[0]);
    sim.step(6 * 4); // 13:00
    const a = sim.world.agents;
    const there = Array.from({ length: a.count }, (_, k) => k).filter((k) => a.location[k] === site).length;
    expect(there).toBeGreaterThan(30);
    expect(Number(metric(sim, 'festival.romeria'))).toBe(there);
  });

  it('carnaval (ADR-0048): tres días desde el 12 de febrero, desfile de disfraces, baile y el martes festivo', () => {
    expect(activeFiesta(at(2, 11, 12).world)).toBeNull();
    expect(activeFiesta(at(2, 12, 12).world)).toMatchObject({ fiesta: { kind: 'carnaval' }, day: 1 });
    expect(verbena(at(2, 13, 22).world)).toBe(true);
    expect(verbena(at(2, 14, 22).world)).toBe(false);
    expect(festivalHoliday(at(2, 13, 10).world)).toBe(false);
    expect(festivalHoliday(at(2, 14, 10).world)).toBe(true);
    expect(activeFiesta(at(2, 15, 12).world)).toBeNull();
    // Se puede mover desde el Modo Dios.
    expect(activeFiesta(at(3, 1, 12, { 'fiestas.r1.carnavalMonth': 3, 'fiestas.r1.carnavalDay': 1 }).world)?.fiesta.kind).toBe('carnaval');
    // Desfile de disfraces a las 17:00 del primer día; la mitad del pueblo va disfrazada.
    const sim = at(2, 12, 15, {}, 400, 5);
    sim.step(2 * 12 + 2); // 17:10
    const a = sim.world.agents;
    const marching = Array.from({ length: a.count }, (_, k) => k).filter((k) => a.action[k] === Action.Procession && a.location[k]! < 0 && a.paths[k] === null);
    expect(marching.length).toBeGreaterThan(20);
    const f = sim.frame();
    expect(f.pasoCount).toBe(1);
    const costumes = Array.from(f.agentFlags).filter((x) => x & AgentFlag.Costumed).length;
    expect(costumes).toBe(Number(metric(sim, 'festival.costumed')));
    expect(costumes / a.count).toBeGreaterThan(0.35);
    expect(costumes / a.count).toBeLessThan(0.65);
    // Fuera de carnaval, nadie.
    const after = at(2, 16, 12, {}, 100);
    expect(Array.from(after.frame().agentFlags).some((x) => x & AgentFlag.Costumed)).toBe(false);
    expect(metric(after, 'festival.costumed')).toBe(0);
  });

  it('romería (ADR-0050): a las 9:00 sale en procesión de la plaza a la ermita y los romeros se quedan allí', () => {
    const sim = at(5, 27, 8, {}, 400, 5);
    const a = sim.world.agents;
    const all = () => Array.from({ length: a.count }, (_, k) => k);
    const hermitage = sim.world.map.towns[0]!.hermitage;
    sim.step(12 + 2); // 09:10
    const marching = all().filter((k) => a.action[k] === Action.Procession && a.location[k]! < 0 && a.paths[k] === null);
    expect(marching.length).toBeGreaterThan(30);
    expect(sim.frame().pasoCount).toBe(1);
    // Van quienes van a la romería.
    expect(marching.every((k) => romeriaParticipant(sim.world, k))).toBe(true);
    // Hacia la ermita: la cabeza se ha alejado de la plaza.
    sim.step(12 * 2); // 11:10
    expect(all().filter((k) => a.action[k] === Action.Procession && a.location[k]! < 0 && a.paths[k] === null)).toHaveLength(0);
    expect(sim.frame().pasoCount).toBe(0);
    const there = all().filter((k) => a.location[k] === hermitage);
    expect(there.length).toBeGreaterThan(marching.length * 0.9);
    // Y siguen allí a mediodía.
    sim.step(12 * 2); // 13:10
    expect(all().filter((k) => a.location[k] === hermitage).length).toBeGreaterThan(marching.length * 0.8);
  });
});

