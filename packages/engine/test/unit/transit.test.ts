import { AgentFlag } from '@worldopen/contracts';
import { describe, expect, it } from 'vitest';
import { Action, Occupation, Simulation } from '../../src';
import { startAction } from '../../src/agents/systems';
import { AwayReason, Transit, arrivals, buildRoad, busesNow, hostal, hostalRooms, leaveTown, season, seedCommuters } from '../../src/agents/transit';
import { metric } from '../../src/metrics';
import { manifest } from '../helpers';

const atMinute = (sim: Simulation, minute: number) => {
  while (sim.frame().date.minuteOfDay !== minute) sim.step();
};
const indices = (sim: Simulation) => Array.from({ length: sim.world.agents.count }, (_, k) => k);

describe('Transporte entre pueblos (ADR-0031)', () => {
  it('la carretera va del borde del mapa a una parada en el local más céntrico; no hay línea dentro del pueblo', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 100 } }));
    const road = sim.world.busRoad!;
    const map = sim.world.map;
    expect(road.length).toBeGreaterThan(0);
    expect(map.venues).toContain(road.stopBuilding);
    expect(map.entranceNode[road.stopBuilding]).toBe(road.stopNode);
    expect([road.x[0], road.z[0]]).toEqual([map.nodeX[road.edgeNode], map.nodeZ[road.edgeNode]]);
    expect(buildRoad(map)).toEqual(road);
  });

  it('el autobús llega cada hora de 07:00 a 21:00, entra por la carretera, para y se va', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 50 } }));
    expect(arrivals(sim.world)).toHaveLength(15);
    sim.world.criteria['society.transit'] = 2;
    expect(arrivals(sim.world)).toHaveLength(29);
    sim.world.criteria['society.transit'] = 0;
    expect(arrivals(sim.world)).toHaveLength(0);
    sim.world.criteria['society.transit'] = 1;
    sim.world.criteria['world.era'] = 'historical';
    expect(arrivals(sim.world)).toHaveLength(0);
    sim.world.criteria['world.era'] = 'contemporary';
    atMinute(sim, 600);
    // En la parada justo a la hora; a las 10:30, ninguno en la carretera.
    const road = sim.world.busRoad!;
    const at = busesNow(sim.world);
    expect(at.headings).toHaveLength(1);
    expect([at.positions[0], at.positions[2]]).toEqual([Math.fround(road.x[road.x.length - 1]!), Math.fround(road.z[road.z.length - 1]!)]);
    atMinute(sim, 630);
    expect(busesNow(sim.world).headings).toHaveLength(0);
  });

  it('parte de los parados trabaja en otro pueblo y cobra el jornal de fuera', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, 'society.commuting': 1 } }));
    const a = sim.world.agents;
    const commuters = indices(sim).filter((i) => a.occupation[i] === Occupation.Commuter);
    expect(commuters.length).toBeGreaterThan(0);
    for (const i of commuters) expect(a.workplace[i]).toBe(-1);
    expect(indices(sim).filter((i) => a.occupation[i] === Occupation.Unemployed && a.age[i]! >= 18 && a.age[i]! < 67)).toHaveLength(0);
    seedCommuters(sim.world); // idempotente
    expect(indices(sim).filter((i) => a.occupation[i] === Occupation.Commuter)).toHaveLength(commuters.length);
  });

  it('sin coche: va a la parada, sube al autobús, pasa la jornada fuera (trabajando) y vuelve por la tarde a casa', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 300, 'society.carOwnership': 0, 'society.commuting': 1 } }));
    const a = sim.world.agents;
    atMinute(sim, 470);
    const i = indices(sim).find((k) => a.occupation[k] === Occupation.Commuter && a.location[k] === a.home[k] && a.money[k]! > 10)!;
    const id = a.ids[i]!;
    startAction(sim.world, i, Action.Work, a.home[i]!);
    expect(a.transit[i]).toBe(Transit.ToStop);
    const seen = new Set<number>();
    let worked = 0;
    let wasAway = false;
    let backHome = false;
    for (let t = 0; t < 10 * 60 && !backHome; t++) {
      sim.step();
      const k = a.indexOf(id);
      seen.add(a.transit[k]!);
      if (a.transit[k] === Transit.Away) {
        expect(a.flags[k]).toBe(AgentFlag.Indoors);
        worked = Math.max(worked, a.workedToday[k]!);
        wasAway = true;
      }
      backHome = wasAway && a.location[k] === a.home[k];
    }
    expect([...seen]).toEqual(expect.arrayContaining([Transit.Waiting, Transit.Away, Transit.None]));
    expect(worked).toBeGreaterThan(300);
    expect(backHome).toBe(true);
  });

  it('con coche: sale por el borde, vuelve a su hora por el borde y aparca en casa', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 300, 'society.carOwnership': 1 } }));
    const a = sim.world.agents;
    atMinute(sim, 600);
    const i = indices(sim).find((k) => a.age[k]! >= 18 && a.location[k] === a.home[k] && !a.driving[k] && a.money[k]! > 20)!;
    const id = a.ids[i]!;
    sim.world.carsBusy.clear();
    expect(leaveTown(sim.world, i, AwayReason.Trip, 690)).toBe(true);
    expect([a.transit[i], a.driving[i], a.flags[i]]).toEqual([Transit.ToEdge, 1, AgentFlag.Driving]);
    let away = false;
    for (let t = 0; t < 180 && !(away && a.transit[a.indexOf(id)] === Transit.None && a.location[a.indexOf(id)] === a.home[a.indexOf(id)]); t++) {
      sim.step();
      away ||= a.transit[a.indexOf(id)] === Transit.Away;
    }
    const k = a.indexOf(id);
    expect(away).toBe(true);
    expect(a.location[k]).toBe(a.home[k]);
    expect(a.driving[k]).toBe(0);
  });

  it('cada autobús trae visitantes: agentes de paso que van a locales del centro, no cuentan como vecinos y se van', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 2000 } }));
    const a = sim.world.agents;
    atMinute(sim, 540); // el tick de las 09:00 (aún sin ejecutar)
    const neighbours = metric(sim, 'agents.count');
    sim.drainEvents();
    sim.step();
    const events = sim.drainEvents();
    const visitors = events.find((e) => e.type === 'bus.arrived')!.data.visitors as number;
    const arrived = events.filter((e) => e.type === 'visitor.arrived').map((e) => e.data.agentId as number);
    expect(visitors).toBeGreaterThanOrEqual(3);
    expect(arrived).toHaveLength(visitors);
    expect(metric(sim, 'agents.count')).toBe(neighbours);
    const v = arrived.map((id) => a.indexOf(id));
    for (const i of v) {
      expect(a.home[i]).toBe(sim.world.busRoad!.stopBuilding);
      expect(sim.world.map.venues).toContain(a.target[i]);
      expect(a.action[i]).toBe(Action.GoOut);
    }
    // Al final del día no queda ninguno de paso (los huéspedes duermen en el hostal), y nadie conserva relaciones con
    // quienes se fueron.
    const ids = new Set(v.map((i) => a.ids[i]!));
    atMinute(sim, 1400);
    expect(metric(sim, 'agents.dayVisitors')).toBe(0);
    for (const id of [...ids]) if (a.indexOf(id) >= 0) ids.delete(id);
    for (let k = 0; k < a.count * 8; k++) if (a.relKind[k]) expect(ids.has(a.relId[k]!)).toBe(false);
  });

  it('snapshot y restauración con visitantes en el pueblo (determinismo)', () => {
    const m = manifest(3, { criteria: { 'society.initialPopulation': 1500 } });
    const full = new Simulation(m);
    full.step(60 * 9);
    const half = new Simulation(m);
    half.step(60 * 6);
    expect(Number(metric(half, 'agents.visitors'))).toBeGreaterThan(0);
    const resumed = Simulation.restore(m, JSON.parse(JSON.stringify(half.snapshot())), half.commandLog());
    resumed.step(60 * 3);
    expect(resumed.hash()).toBe(full.hash());
  });
});

describe('Hostal y turismo (ADR-0033)', () => {
  it('el bar-hostal es la tienda junto a la parada; la temporada multiplica los visitantes', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 100 } }));
    const h = hostal(sim.world);
    expect(h).toBe(sim.world.busRoad!.shop);
    expect(hostalRooms(sim.world)).toBe(Math.max(4, Math.floor(sim.world.map.buildings[h]!.grossFloorAreaM2 / 25)));
    const at = (month: number) => new Simulation(manifest(5, { time: { minutesPerTick: 1, start: { year: 1, month, day: 1, hour: 6, minute: 0 } }, criteria: { 'society.initialPopulation': 10 } }));
    expect([season(at(7).world), season(at(1).world), season(at(4).world)]).toEqual([2, 0.5, 1]);
  });

  it('un turista duerme en el hostal (paga la noche), sigue en el pueblo a medianoche y por la mañana continúa la visita', () => {
    const m = manifest(5, { time: { minutesPerTick: 1, start: { year: 1, month: 7, day: 1, hour: 6, minute: 0 } }, criteria: { 'society.initialPopulation': 2000, 'society.tourism': 3 } });
    const sim = new Simulation(m);
    const a = sim.world.agents;
    const inn = hostal(sim.world);
    let tourist = -1;
    while (tourist < 0 && sim.frame().date.minuteOfDay < 1200) {
      sim.step();
      const ev = sim.drainEvents().find((e) => e.type === 'tourist.arrived');
      if (ev) tourist = ev.data.agentId as number;
    }
    expect(tourist).toBeGreaterThan(0);
    const nights = a.stayNights[a.indexOf(tourist)]!;
    expect(nights).toBeGreaterThanOrEqual(1);
    const cash = sim.world.buildings.cash[inn]!;
    atMinute(sim, 1439);
    const i = a.indexOf(tourist);
    expect([a.location[i], a.action[i]]).toEqual([inn, Action.Sleep]);
    expect(sim.world.buildings.cash[inn]!).toBeGreaterThanOrEqual(cash);
    expect(Number(metric(sim, 'tourism.guests'))).toBeLessThanOrEqual(hostalRooms(sim.world));
    expect(metric(sim, 'agents.dayVisitors')).toBe(0);
    // Pasa la medianoche en el pueblo (los sistemas diarios no la ven) y por la mañana sigue con una noche menos.
    atMinute(sim, 9 * 60);
    const k = a.indexOf(tourist);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(a.stayNights[k]).toBe(nights - 1);
    expect(a.action[k]).not.toBe(Action.Sleep);
  });

  it('snapshot y restauración con huéspedes durmiendo en el hostal (determinismo)', () => {
    const m = manifest(3, { time: { minutesPerTick: 5, start: { year: 1, month: 7, day: 1, hour: 6, minute: 0 } }, criteria: { 'society.initialPopulation': 1500, 'society.tourism': 3 } });
    const full = new Simulation(m);
    full.step(12 * 36);
    const half = new Simulation(m);
    half.step(12 * 18);
    expect(Number(metric(half, 'tourism.guests'))).toBeGreaterThan(0);
    const resumed = Simulation.restore(m, JSON.parse(JSON.stringify(half.snapshot())), half.commandLog());
    resumed.step(12 * 18);
    expect(resumed.hash()).toBe(full.hash());
  });
});
