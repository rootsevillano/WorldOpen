import { AgentFlag } from '@worldopen/contracts';
import { describe, expect, it } from 'vitest';
import { Action, Simulation } from '../../src';
import { animalSystem, dogHousehold } from '../../src/agents/animals';
import { Animal } from '../../src/world/animals';
import { metric } from '../../src/metrics';
import { manifest } from '../helpers';

const atMinute = (sim: Simulation, minute: number) => {
  while (sim.frame().date.minuteOfDay !== minute) sim.step();
};
const animalsOf = (sim: Simulation, kind: number) => Array.from({ length: sim.world.animals.count }, (_, k) => k).filter((k) => sim.world.animals.kind[k] === kind);

describe('Animales (ADR-0027)', () => {
  it('al crear el mundo hay perros en los hogares que suelen tenerlos y ganado según la superficie de cada huerta', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 600 } }));
    const a = sim.world.agents;
    const households = new Set(Array.from(a.household.subarray(0, a.count)));
    const owners = [...households].filter((hh) => dogHousehold(sim.world, hh)).length;
    expect(metric(sim, 'animals.dogs')).toBe(owners);
    expect(owners / households.size).toBeGreaterThan(0.2);
    expect(owners / households.size).toBeLessThan(0.4);
    let hens = 0;
    let sheep = 0;
    for (const f of sim.world.map.byUse.agriculture) {
      hens += Math.floor(sim.world.map.buildings[f]!.grossFloorAreaM2 / 20);
      sheep += Math.floor(sim.world.map.buildings[f]!.grossFloorAreaM2 / 100);
    }
    expect([metric(sim, 'animals.hens'), metric(sim, 'animals.sheep')]).toEqual([hens, sheep]);
    // Sin ganado: a medianoche se retira.
    sim.world.criteria['economy.livestock'] = 0;
    atMinute(sim, 0);
    sim.step();
    expect([metric(sim, 'animals.hens'), metric(sim, 'animals.sheep')]).toEqual([0, 0]);
  });

  it('el perro sale con quien va de paseo, le sigue un paso por detrás y vuelve a casa con él', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 200 } }));
    const a = sim.world.agents;
    const an = sim.world.animals;
    atMinute(sim, 600);
    const d = animalsOf(sim, Animal.Dog)[0]!;
    const hh = an.household[d]!;
    for (let j = 0; j < a.count; j++) if (a.household[j] === hh) a.action[j] = Action.Stay;
    const w = Array.from({ length: a.count }, (_, k) => k).find((k) => a.household[k] === hh && a.age[k]! >= 10)!;
    for (let j = 0; j < a.count; j++) if (a.household[j] === hh) a.location[j] = a.home[j]!;
    animalSystem(sim.world);
    expect(an.flags[d]).toBe(AgentFlag.Indoors);
    // Sale a la calle a pie por ocio.
    a.action[w] = Action.GoOut;
    a.location[w] = -1;
    a.driving[w] = 0;
    const before = an.walkedToday[d]!;
    a.positions[w * 3]! += 10;
    animalSystem(sim.world);
    const [x1, z1] = [a.positions[w * 3]!, a.positions[w * 3 + 2]!];
    a.positions[w * 3]! += 10;
    animalSystem(sim.world);
    expect(an.flags[d]).toBe(0);
    expect(an.walker[d]).toBe(a.ids[w]);
    expect([an.positions[d * 3], an.positions[d * 3 + 2]]).toEqual([x1, z1]);
    expect(an.walkedToday[d]).toBe(before + 2 * sim.world.time.minutesPerTick);
    // De vuelta en casa.
    a.location[w] = a.home[w]!;
    a.action[w] = Action.Stay;
    animalSystem(sim.world);
    expect(an.flags[d]).toBe(AgentFlag.Indoors);
    expect(an.walker[d]).toBe(0);
  });

  it('el ganado se recoge de noche, deambula cerca de su nave de día y da comida los días en que se trabaja la huerta', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 300 } }));
    const a = sim.world.agents;
    const an = sim.world.animals;
    const bs = sim.world.buildings;
    atMinute(sim, 720);
    sim.step(30);
    const stock = animalsOf(sim, Animal.Hen).concat(animalsOf(sim, Animal.Sheep));
    for (const k of stock) {
      expect(an.flags[k]).toBe(0);
      const b = sim.world.map.buildings[an.farm[k]!]!;
      const r = Math.sqrt(b.grossFloorAreaM2) / 2 + 12;
      expect(Math.abs(an.positions[k * 3]! - b.centroid.x)).toBeLessThanOrEqual(r + 1e-3);
      expect(Math.abs(an.positions[k * 3 + 2]! - b.centroid.z)).toBeLessThanOrEqual(r + 1e-3);
    }
    atMinute(sim, 0);
    // Solo la primera huerta se ha trabajado hoy.
    const farm = sim.world.map.byUse.agriculture[0]!;
    for (let j = 0; j < a.count; j++) a.workedToday[j] = a.workplace[j] === farm ? 300 : 0;
    const other = sim.world.map.byUse.agriculture[1]!;
    bs.food[farm] = 0;
    bs.food[other] = 0;
    animalSystem(sim.world);
    const hens = stock.filter((k) => an.farm[k] === farm && an.kind[k] === Animal.Hen).length;
    const sheep = stock.filter((k) => an.farm[k] === farm && an.kind[k] === Animal.Sheep).length;
    expect(bs.food[farm]).toBeCloseTo(hens * 0.5 + sheep, 4);
    expect(bs.food[other]).toBe(0);
    for (const k of stock) expect(an.flags[k]).toBe(AgentFlag.Indoors);
  });

  it('si el hogar deja el pueblo, el perro se va con él; snapshot y restauración conservan los animales', () => {
    const m = manifest(3, { time: { minutesPerTick: 30, start: { year: 1, month: 3, day: 21, hour: 6, minute: 0 } }, criteria: { 'society.initialPopulation': 150 } });
    const sim = new Simulation(m);
    const an = sim.world.animals;
    const d = animalsOf(sim, Animal.Dog)[0]!;
    const id = an.ids[d]!;
    const hh = an.household[d]!;
    for (let j = 0; j < sim.world.agents.count; j++) if (sim.world.agents.household[j] === hh) sim.world.agents.household[j] = 9_999_999;
    atMinute(sim, 0);
    sim.step();
    expect(Array.from(an.ids.subarray(0, an.count))).not.toContain(id);

    const full = new Simulation(m);
    full.step(48 * 6);
    const half = new Simulation(m);
    half.step(48 * 3 + 7);
    const resumed = Simulation.restore(m, JSON.parse(JSON.stringify(half.snapshot())), half.commandLog());
    resumed.step(48 * 3 - 7);
    expect(resumed.hash()).toBe(full.hash());
    expect(resumed.frame().animalCount).toBe(full.frame().animalCount);
  });
});
