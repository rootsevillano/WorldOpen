import { describe, expect, it } from 'vitest';
import { Memory, Occupation, RelationKind, Simulation } from '../../src';
import { lifecycleSystem } from '../../src/agents/lifecycle';
import { manifest } from '../helpers';

const atMidnight = (sim: Simulation) => {
  // Avanza hasta el primer tick de un día nuevo (el ciclo de vida se evalúa a medianoche).
  while (sim.frame().date.minuteOfDay !== 0) sim.step();
};

describe('Ciclo de vida (S5, ADR-0019)', () => {
  it('cumpleaños: a los 6 va a la escuela, a los 18 busca trabajo, a los 67 se jubila', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 200, 'society.mortality': 0, 'society.fertility': 0 } }));
    const a = sim.world.agents;
    atMidnight(sim);
    const today = (sim.frame().date.month - 1) * 30 + sim.frame().date.day - 1;
    const pick = (pred: (i: number) => boolean) => Array.from({ length: a.count }, (_, i) => i).find(pred)!;
    const child = pick((i) => a.occupation[i] === Occupation.Child);
    const teen = pick((i) => a.occupation[i] === Occupation.Student);
    const worker = pick((i) => a.age[i]! >= 18 && a.age[i]! < 66);
    a.age[child] = 5; a.age[teen] = 17; a.age[worker] = 66;
    for (const i of [child, teen, worker]) a.birthDay[i] = today;
    lifecycleSystem(sim.world);
    expect([a.age[child], a.occupation[child]]).toEqual([6, Occupation.Student]);
    expect(a.age[teen]).toBe(18);
    expect(a.occupation[teen]).not.toBe(Occupation.Student);
    expect([a.age[worker], a.occupation[worker]]).toEqual([67, Occupation.Retired]);
  });

  it('una muerte avisa, deja la casa con un residente menos y la familia la recuerda', () => {
    const sim = new Simulation(manifest(6, { criteria: { 'society.initialPopulation': 120, 'society.mortality': 0, 'society.fertility': 0 } }));
    const a = sim.world.agents;
    atMidnight(sim);
    // Alguien con familia: se le agota la salud (hambre prolongada).
    const i = Array.from({ length: a.count }, (_, k) => k).find((k) => Array.from(a.relKind.subarray(k * 8, k * 8 + 8)).includes(RelationKind.Family))!;
    const id = a.ids[i]!;
    const home = a.home[i]!;
    const residents = sim.world.buildings.residents[home]!;
    const relatives = Array.from({ length: a.count }, (_, k) => k).filter((k) => a.household[k] === a.household[i] && k !== i).map((k) => a.ids[k]!);
    let died = false;
    for (let d = 0; d < 400 && !died; d++) {
      a.health[a.indexOf(id)] = 0;
      lifecycleSystem(sim.world);
      died = sim.drainEvents().some((e) => e.type === 'agent.died' && e.data.agentId === id && e.data.cause === 'starvation');
    }
    expect(died).toBe(true);
    expect(a.indexOf(id)).toBe(-1);
    expect(sim.world.buildings.residents[home]).toBe(residents - 1);
    const r = a.indexOf(relatives[0]!);
    expect(Array.from(a.memKind.subarray(r * 8, r * 8 + 8))).toContain(Memory.Grief);
    for (let s = 0; s < 8; s++) expect(a.relId[r * 8 + s]).not.toBe(id);
  });

  it('un embarazo dura 270 días y el bebé nace en casa, con su familia', () => {
    const sim = new Simulation(manifest(8, { criteria: { 'society.initialPopulation': 150, 'society.mortality': 0, 'society.fertility': 0 } }));
    const a = sim.world.agents;
    atMidnight(sim);
    const mother = Array.from({ length: a.count }, (_, k) => k).find((k) => a.sex[k] === 0 && a.age[k]! >= 20 && a.age[k]! <= 40)!;
    const motherId = a.ids[mother]!;
    const home = a.home[mother]!;
    a.pregnantDays[mother] = 268;
    lifecycleSystem(sim.world);
    expect(sim.drainEvents().some((e) => e.type === 'agent.born')).toBe(false);
    lifecycleSystem(sim.world);
    const born = sim.drainEvents().find((e) => e.type === 'agent.born')!;
    expect(born.data).toMatchObject({ motherId });
    const baby = a.indexOf(born.data.agentId as number);
    expect([a.age[baby], a.home[baby], a.occupation[baby]]).toEqual([0, home, Occupation.Child]);
    expect(a.pregnantDays[a.indexOf(motherId)]).toBe(0);
  });

  it('sin natalidad no hay embarazos; con la capacidad llena el nacimiento se omite', () => {
    const sim = new Simulation(manifest(8, { criteria: { 'society.initialPopulation': 100, 'society.fertility': 0, 'society.mortality': 0 } }), { agentCapacity: 100 });
    const a = sim.world.agents;
    atMidnight(sim);
    for (let d = 0; d < 30; d++) lifecycleSystem(sim.world);
    expect(Array.from(a.pregnantDays.subarray(0, a.count)).every((p) => p === 0)).toBe(true);
    const mother = Array.from({ length: a.count }, (_, k) => k).find((k) => a.sex[k] === 0 && a.age[k]! >= 20)!;
    a.pregnantDays[mother] = 269;
    lifecycleSystem(sim.world);
    expect(sim.drainEvents().some((e) => e.type === 'birth.skipped')).toBe(true);
    expect(a.count).toBe(100);
  });

  it('snapshot y restauración conservan embarazos y cumpleaños (determinismo)', () => {
    const m = manifest(3, { time: { minutesPerTick: 30, start: { year: 1, month: 3, day: 21, hour: 6, minute: 0 } }, criteria: { 'society.initialPopulation': 150, 'society.fertility': 5, 'society.mortality': 5 } });
    const full = new Simulation(m);
    full.step(48 * 60);
    const half = new Simulation(m);
    half.step(48 * 30);
    const resumed = Simulation.restore(m, JSON.parse(JSON.stringify(half.snapshot())), half.commandLog());
    resumed.step(48 * 30);
    expect(resumed.hash()).toBe(full.hash());
  });
});
