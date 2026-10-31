import { AgentFlag } from '@worldopen/contracts';
import { describe, expect, it } from 'vitest';
import { Action, Occupation, Simulation } from '../../src';
import { startAction } from '../../src/agents/systems';
import { AwayReason, Transit, arrivals, buildRoad, busesNow, leaveTown, seedCommuters } from '../../src/agents/transit';
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
    for (let t = 0; t < 10 * 60; t++) {
      sim.step();
      const k = a.indexOf(id);
      seen.add(a.transit[k]!);
      if (a.transit[k] === Transit.Away) {
        expect(a.flags[k]).toBe(AgentFlag.Indoors);
        worked = Math.max(worked, a.workedToday[k]!);
      }
    }
    const k = a.indexOf(id);
    expect([...seen]).toEqual(expect.arrayContaining([Transit.Waiting, Transit.Away, Transit.None]));
    expect(worked).toBeGreaterThan(300);
    expect(a.transit[k]).toBe(Transit.None);
    expect(a.location[k]).toBe(a.home[k]);
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

  it('cada autobús trae visitantes que gastan en la tienda del centro', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 2000 } }));
    const shop = sim.world.busRoad!.shop;
    atMinute(sim, 540); // el tick de las 09:00 (aún sin ejecutar)
    const cash = sim.world.buildings.cash[shop]!;
    sim.drainEvents();
    sim.step();
    const ev = sim.drainEvents().find((e) => e.type === 'bus.arrived')!;
    expect(ev).toBeDefined();
    expect(ev.data.visitors as number).toBeGreaterThanOrEqual(3);
    expect(sim.world.visitorsToday).toBeGreaterThanOrEqual(ev.data.visitors as number);
    expect(sim.world.buildings.cash[shop]!).toBeGreaterThan(cash);
  });
});
