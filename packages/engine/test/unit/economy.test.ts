import { AgentActivity, BuildingState, type CommandEnvelope } from '@worldopen/contracts';
import { describe, expect, it } from 'vitest';
import { Action, Simulation } from '../../src';
import { manifest } from '../helpers';
import { nearestShop, storageCap } from '../../src/agents/economy';
import { metric } from '../../src/metrics';

const admin = { userId: 'god', role: 'admin' as const };
let n = 0;
const cmd = (type: string, payload: unknown, atTick?: number): CommandEnvelope => ({
  id: `e${n++}`, type, version: 1, issuer: admin, payload, ...(atTick === undefined ? {} : { atTick }),
});

describe('Economía', () => {
  it('al crear el mundo, cada habitante aporta existencias a su casa y hay ocupaciones', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 60 } }));
    const w = sim.world;
    let residents = 0;
    for (const h of w.map.homes) residents += w.buildings.residents[h]!;
    expect(residents).toBe(60);
    const e = sim.economy();
    expect(e.pantryFood).toBe(60 * 4);
    expect(e.shopFood).toBeGreaterThan(0);
    const occ = new Set(Array.from(w.agents.occupation.subarray(0, 60)));
    expect(occ.size).toBeGreaterThan(2);
  });

  it('comer gasta la despensa y sacia el hambre', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 1 } }));
    const w = sim.world;
    const home = w.agents.home[0]!;
    w.agents.hunger[0] = 0.2;
    const before = w.buildings.food[home]!;
    sim.step();
    expect(w.buildings.food[home]).toBe(before - 1);
    expect(w.agents.hunger[0]).toBeGreaterThan(0.75);
    expect(w.agents.activities[0]).toBe(AgentActivity.Eating);
  });

  it('con la despensa vacía y hambre, va a una tienda, hace cola y trae comida a casa', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 1 } }));
    const w = sim.world;
    const home = w.agents.home[0]!;
    sim.step(2 * 60 + 5); // 08:05: tiendas abiertas
    w.buildings.food[home] = 0;
    w.agents.hunger[0] = 0.1;
    let sawProvision = false;
    let sawQueue = false;
    for (let t = 0; t < 240 && w.buildings.food[home]! < 1; t++) {
      sim.step();
      sawProvision ||= w.agents.action[0] === Action.Provision;
      sawQueue ||= w.agents.activities[0] === AgentActivity.Queueing;
    }
    expect(sawProvision).toBe(true);
    expect(sawQueue).toBe(true);
    expect(w.buildings.food[home]! + (w.agents.hunger[0]! > 0.5 ? 1 : 0)).toBeGreaterThan(1);
  });

  it('sin agua corriente las casas dejan de reponerse', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 10, 'economy.waterSupply': 0 } }));
    const before = sim.economy().pantryWater;
    sim.step(600);
    expect(sim.economy().pantryWater).toBeLessThan(before);
  });
});

describe('Incendio (disaster.fire)', () => {
  it('evacúa, destruye existencias, se recuerda y pasa a dañado y luego a normal', () => {
    const sim = new Simulation(manifest(6, { criteria: { 'society.initialPopulation': 30 } }));
    const w = sim.world;
    const home = w.agents.home[0]!;
    const id = w.map.buildings[home]!.id;
    expect(sim.submit(cmd('disaster.fire', { buildingId: id }))).toMatchObject({ ok: true });
    expect(sim.submit(cmd('disaster.fire', { buildingId: 'nope' }))).toMatchObject({ ok: false });
    sim.step(1);
    expect(w.buildings.state[home]).toBe(BuildingState.Burning);
    expect(w.buildings.food[home]).toBe(0);
    for (let i = 0; i < w.agents.count; i++) expect(w.agents.location[i]).not.toBe(home);
    const detail = sim.agent(w.agents.ids[0]!)!;
    expect(detail.memory.some((m) => m.kind === 'lostHome' && m.building === id)).toBe(true);
    expect(sim.frame().buildingStates[home]).toBe(BuildingState.Burning);
    expect(sim.drainEvents().some((e) => e.type === 'fire.started')).toBe(true);

    sim.step(3 * 60);
    expect(w.buildings.state[home]).toBe(BuildingState.Damaged);
    // Los vecinos sin casa duermen en un servicio público.
    sim.step(17 * 60);
    expect(w.agents.location[0]).not.toBe(home);
    sim.step(2 * 1440);
    expect(w.buildings.state[home]).toBe(BuildingState.Normal);
  });
});

describe('Inspector', () => {
  it('describe agentes (con puntuaciones de su última decisión) y edificios', () => {
    const sim = new Simulation(manifest(8, { criteria: { 'society.initialPopulation': 20 } }));
    sim.step(180);
    const id = sim.world.agents.ids[3]!;
    const d = sim.agent(id)!;
    expect(d.name).toBe(sim.world.agents.names[3]);
    expect(Object.keys(d.needs)).toEqual(['energy', 'shelter', 'social', 'hunger', 'thirst', 'work']);
    expect(Object.keys(d.lastScores).length).toBeGreaterThan(0);
    expect(d.relations.every((r) => r.agentId !== id)).toBe(true);
    expect(sim.agent(999999)).toBeNull();
    const b = sim.building(d.home)!;
    expect(b.residents).toBeGreaterThan(0);
    expect(sim.building('nope')).toBeNull();
  });

  it('quien comparte hogar es familia o pareja', () => {
    const sim = new Simulation(manifest(1, { criteria: { 'society.initialPopulation': 80 } }));
    const a = sim.world.agents;
    let pair: [number, number] | null = null;
    for (let i = 0; i < a.count && !pair; i++) for (let j = i + 1; j < a.count && !pair; j++) if (a.household[i] === a.household[j]) pair = [i, j];
    expect(pair).not.toBeNull();
    const [i, j] = pair!;
    const rel = sim.agent(a.ids[i]!)!.relations.find((r) => r.agentId === a.ids[j]);
    expect(['family', 'partner']).toContain(rel!.kind);
  });
});


describe('Almacenes y caducidad (ADR-0021)', () => {
  const atMinute = (sim: Simulation, minute: number) => {
    while (sim.frame().date.minuteOfDay !== minute) sim.step();
  };

  it('huertas y aserraderos dejan de producir al llenarse', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 200 } }));
    const { byUse } = sim.world.map;
    const bs = sim.world.buildings;
    for (const f of byUse.agriculture) bs.food[f] = storageCap(sim.world, f);
    for (const s of byUse.industrial) bs.wood[s] = storageCap(sim.world, s);
    for (let t = 0; t < 1440; t++) {
      sim.step();
      for (const f of byUse.agriculture) expect(bs.food[f]).toBeLessThanOrEqual(storageCap(sim.world, f));
      for (const s of byUse.industrial) expect(bs.wood[s]).toBeLessThanOrEqual(storageCap(sim.world, s));
    }
    expect(metric(sim, 'economy.maxStorageRatio')).toBeLessThanOrEqual(1);
  });

  it('la comida de las tiendas caduca a medianoche (2 % diario)', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 0 } }));
    const shop = sim.world.map.byUse.retail[0]!;
    atMinute(sim, 0); // el próximo tick es el de medianoche
    sim.world.buildings.food[shop] = 1000;
    sim.step();
    expect(sim.world.buildings.food[shop]).toBeCloseTo(980, 3);
  });

  it('el reparto de cosecha va a la tienda más cercana con hueco; si todas están llenas, no hay reparto', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 0 } }));
    const shops = sim.world.map.byUse.retail;
    const bs = sim.world.buildings;
    // Sin habitantes no hay demanda: se fija a mano el objetivo de existencias de cada tienda (ADR-0022).
    for (const s of shops) bs.demand[s] = 10_000;
    const c = sim.world.map.buildings[shops[0]!]!.centroid;
    const nearest = nearestShop(sim.world, c.x, c.z);
    expect(nearest).toBe(shops[0]);
    bs.food[shops[0]!] = storageCap(sim.world, shops[0]!);
    const next = nearestShop(sim.world, c.x, c.z);
    expect(next).not.toBe(shops[0]);
    expect(next).toBeGreaterThanOrEqual(0);
    for (const s of shops) bs.food[s] = storageCap(sim.world, s);
    expect(nearestShop(sim.world, c.x, c.z)).toBe(-1);
  });
});
