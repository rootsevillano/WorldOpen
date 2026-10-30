import { describe, expect, it } from 'vitest';
import { RelationKind, Simulation } from '../../src';
import { householdsSystem } from '../../src/agents/households';
import { spawnAgent } from '../../src/agents/population';
import { bond, partnerId } from '../../src/agents/social';
import { metric } from '../../src/metrics';
import { manifest } from '../helpers';

const atMidnight = (sim: Simulation) => {
  while (sim.frame().date.minuteOfDay !== 0) sim.step();
};
const indices = (sim: Simulation) => Array.from({ length: sim.world.agents.count }, (_, k) => k);
const quiet = { 'society.mortality': 0, 'society.fertility': 0, 'society.emigration': 0, 'society.immigration': 0 };

/** Los residentes empadronados de cada edificio coinciden con los agentes que viven en él. */
function residentsConsistent(sim: Simulation): boolean {
  const a = sim.world.agents;
  const count = new Uint16Array(sim.world.map.buildings.length);
  for (let i = 0; i < a.count; i++) count[a.home[i]!]!++;
  return count.every((c, b) => c === sim.world.buildings.residents[b]);
}

describe('Hogares, parejas y migración (ADR-0020)', () => {
  it('la población inicial forma hogares: las parejas conviven y la familia es solo la del hogar', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 400, ...quiet } }));
    const a = sim.world.agents;
    const partnered = indices(sim).filter((i) => partnerId(sim.world, i) !== 0);
    expect(partnered.length).toBeGreaterThan(100);
    for (const i of partnered) {
      const j = a.indexOf(partnerId(sim.world, i));
      expect(a.household[j]).toBe(a.household[i]);
      expect(partnerId(sim.world, j)).toBe(a.ids[i]);
    }
    for (const i of indices(sim)) {
      for (let s = 0; s < 8; s++) {
        if (a.relKind[i * 8 + s] !== RelationKind.Family) continue;
        expect(a.household[a.indexOf(a.relId[i * 8 + s]!)]).toBe(a.household[i]);
      }
    }
    expect(metric(sim, 'agents.partneredRatio')).toBeGreaterThan(0.5);
    expect(metric(sim, 'agents.partneredRatio')).toBeLessThan(0.8);
  });

  it('dos amigos solteros forman pareja y se van a vivir juntos', () => {
    const sim = new Simulation(manifest(7, { criteria: { 'society.initialPopulation': 40, ...quiet } }));
    const a = sim.world.agents;
    atMidnight(sim);
    const [h1, h2] = [sim.world.map.homes[0]!, sim.world.map.homes[1]!];
    const id1 = spawnAgent(sim.world, h1, 30, 0, 0);
    const id2 = spawnAgent(sim.world, h2, 32, 0, 1);
    const [i, j] = [a.indexOf(id1), a.indexOf(id2)];
    bond(sim.world, i, id2, 0.9);
    bond(sim.world, j, id1, 0.9);
    sim.drainEvents();
    let days = 0;
    while (partnerId(sim.world, a.indexOf(id1)) === 0 && days++ < 3000) householdsSystem(sim.world);
    expect(partnerId(sim.world, a.indexOf(id1))).toBe(id2);
    const events = sim.drainEvents().map((e) => e.type);
    expect(events).toContain('couple.formed');
    expect(events).toContain('household.moved');
    expect(a.household[a.indexOf(id1)]).toBe(a.household[a.indexOf(id2)]);
    expect(residentsConsistent(sim)).toBe(true);
  });

  it('llegan hogares a viviendas libres y nunca a una vivienda ocupada', () => {
    const sim = new Simulation(manifest(9, { criteria: { 'society.initialPopulation': 60, ...quiet, 'society.immigration': 5 } }));
    atMidnight(sim);
    const before = sim.world.agents.count;
    const occupancy = Number(metric(sim, 'households.occupancy'));
    let arrived = 0;
    for (let d = 0; d < 360; d++) {
      householdsSystem(sim.world);
      arrived += sim.drainEvents().filter((e) => e.type === 'household.arrived').length;
    }
    expect(arrived).toBeGreaterThan(0);
    expect(sim.world.agents.count).toBeGreaterThan(before);
    expect(Number(metric(sim, 'households.occupancy'))).toBeGreaterThan(occupancy);
    expect(Number(metric(sim, 'households.occupancy'))).toBeLessThanOrEqual(1);
    expect(residentsConsistent(sim)).toBe(true);
  });

  it('emigran jóvenes solteros; los menores que se quedan sin adultos se van con familia de fuera', () => {
    const sim = new Simulation(manifest(11, { criteria: { 'society.initialPopulation': 300, ...quiet, 'society.emigration': 5 } }));
    const a = sim.world.agents;
    atMidnight(sim);
    const orphan = spawnAgent(sim.world, sim.world.map.homes[2]!, 8);
    sim.drainEvents();
    const reasons: string[] = [];
    for (let d = 0; d < 120; d++) {
      householdsSystem(sim.world);
      for (const e of sim.drainEvents()) if (e.type === 'agent.emigrated') reasons.push(e.data.reason as string);
    }
    expect(a.indexOf(orphan)).toBe(-1);
    expect(reasons).toContain('orphan');
    expect(reasons.filter((r) => r === 'emigration').length).toBeGreaterThan(0);
    expect(residentsConsistent(sim)).toBe(true);
  });

  it('snapshot y restauración conservan los hogares (determinismo)', () => {
    const m = manifest(3, { time: { minutesPerTick: 30, start: { year: 1, month: 3, day: 21, hour: 6, minute: 0 } }, criteria: { 'society.initialPopulation': 150, 'society.immigration': 5, 'society.emigration': 5 } });
    const full = new Simulation(m);
    full.step(48 * 60);
    const half = new Simulation(m);
    half.step(48 * 30);
    const resumed = Simulation.restore(m, JSON.parse(JSON.stringify(half.snapshot())), half.commandLog());
    resumed.step(48 * 30);
    expect(resumed.hash()).toBe(full.hash());
  });
});
