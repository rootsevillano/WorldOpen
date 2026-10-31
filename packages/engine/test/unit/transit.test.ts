import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src';
import { BUS_SPEED, MIN_LINE_M, Transit, buildLine, busCount, busesNow, fare, planRide, transitSystem } from '../../src/agents/transit';
import { manifest } from '../helpers';

const atMinute = (sim: Simulation, minute: number) => {
  while (sim.frame().date.minuteOfDay !== minute) sim.step();
};

/** Mundo sintético con una línea forzada (el pueblo es demasiado pequeño para tenerla por sí solo). */
function withLine(criteria: Record<string, unknown> = {}) {
  const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 100, ...criteria } }));
  expect(buildLine(sim.world.map)).toBeNull();
  sim.world.busLine = buildLine(sim.world.map, 0);
  return sim;
}

describe('Transporte público (ADR-0030)', () => {
  it('la línea es un recorrido cerrado por las calles entre paradas en locales; un pueblo pequeño no la tiene', () => {
    const sim = withLine();
    const line = sim.world.busLine!;
    expect(line.length).toBeLessThan(MIN_LINE_M);
    expect(line.stopNode.length).toBeGreaterThanOrEqual(2);
    expect(line.cum[line.cum.length - 1]).toBeCloseTo(line.length, 6);
    for (let s = 1; s < line.stopS.length; s++) expect(line.stopS[s]!).toBeGreaterThan(line.stopS[s - 1]!);
    expect([line.x[0], line.z[0]]).toEqual([line.x[line.x.length - 1], line.z[line.z.length - 1]]);
    for (const b of line.stopBuilding) expect(sim.world.map.venues).toContain(b);
  });

  it('los autobuses circulan de 07:00 a 22:00 (no en la época histórica ni sin servicio) y su posición depende solo de la hora', () => {
    const sim = withLine();
    atMinute(sim, 360);
    expect(busCount(sim.world)).toBe(0);
    atMinute(sim, 600);
    expect(busCount(sim.world)).toBeGreaterThanOrEqual(1);
    const twin = withLine();
    atMinute(twin, 600);
    expect(Array.from(busesNow(sim.world).positions)).toEqual(Array.from(busesNow(twin.world).positions));
    sim.world.criteria['society.transit'] = 0;
    expect(busCount(sim.world)).toBe(0);
    sim.world.criteria['society.transit'] = 1;
    sim.world.criteria['world.era'] = 'historical';
    expect(busCount(sim.world)).toBe(0);
  });

  it('quien espera sube al pasar el autobús (paga el billete), viaja con él y baja en su parada para seguir andando', () => {
    const sim = withLine();
    atMinute(sim, 600);
    const a = sim.world.agents;
    const line = sim.world.busLine!;
    const map = sim.world.map;
    const i = Array.from({ length: a.count }, (_, k) => k).find((k) => a.age[k]! >= 18)!;
    const target = map.homes[0]!;
    // Baja en la última parada: casi una vuelta entera, varios ticks dentro del autobús.
    const last = line.stopNode.length - 1;
    a.transit[i] = Transit.Waiting;
    a.boardStop[i] = 0;
    a.alightStop[i] = last;
    a.finalTarget[i] = target;
    a.transitSince[i] = sim.world.tick * sim.world.time.minutesPerTick;
    a.money[i] = 100;
    a.paths[i] = null;
    a.location[i] = -1;
    const stages: number[] = [];
    // Dos vueltas como mucho.
    for (let t = 0; t < (2 * line.length) / BUS_SPEED && a.transit[i] !== Transit.None; t++) {
      sim.world.tick++;
      transitSystem(sim.world);
      if (stages[stages.length - 1] !== a.transit[i]) stages.push(a.transit[i]!);
    }
    expect(stages.slice(-2)).toEqual([Transit.Riding, Transit.None]);
    expect(a.money[i]).toBeCloseTo(100 - fare(sim.world), 6);
    const stop = line.stopNode[last]!;
    expect(a.paths[i]).not.toBeNull();
    expect(a.target[i]).toBe(target);
    expect([a.paths[i]![0], a.paths[i]![1]]).toEqual([map.nodeX[stop], map.nodeZ[stop]]);
  });

  it('tras 40 minutos sin autobús desiste y sigue andando', () => {
    const sim = withLine({ 'society.transit': 0.01 });
    atMinute(sim, 600);
    const a = sim.world.agents;
    const i = Array.from({ length: a.count }, (_, k) => k).find((k) => a.age[k]! >= 18)!;
    a.transit[i] = Transit.Waiting;
    a.boardStop[i] = 0;
    a.alightStop[i] = 1;
    a.finalTarget[i] = sim.world.map.homes[0]!;
    a.transitSince[i] = sim.world.tick * sim.world.time.minutesPerTick - 41;
    transitSystem(sim.world);
    expect(a.transit[i]).toBe(Transit.None);
    expect(a.target[i]).toBe(sim.world.map.homes[0]);
  });

  it('se coge el autobús para un trayecto largo si compensa; para uno corto o sin dinero, no', () => {
    const sim = withLine();
    atMinute(sim, 600);
    const a = sim.world.agents;
    const line = sim.world.busLine!;
    const map = sim.world.map;
    const i = Array.from({ length: a.count }, (_, k) => k).find((k) => a.age[k]! >= 18)!;
    // Junto a la parada 0, hacia el local de la parada 2; la ruta a pie es (artificialmente) muy larga.
    const from = line.stopNode[0]!;
    const x = map.nodeX[from]!;
    const z = map.nodeZ[from]!;
    a.location[i] = -1;
    a.money[i] = 100;
    const longWalk = Float64Array.from([x + 3000, z, x, z]);
    const ride = planRide(sim.world, i, x, z, longWalk, line.stopBuilding[2]!);
    expect(ride).not.toBeNull();
    expect(ride!.board).toBe(0);
    expect(ride!.alight).toBe(2);
    expect(planRide(sim.world, i, x, z, Float64Array.from([x + 300, z]), line.stopBuilding[2]!)).toBeNull();
    a.money[i] = 0;
    expect(planRide(sim.world, i, x, z, longWalk, line.stopBuilding[2]!)).toBeNull();
  });
});
