import { describe, expect, it } from 'vitest';
import { RelationKind, Simulation } from '../../src';
import { bequeath, buyHome, letSpareHome, sellHome, sellSpareHomes } from '../../src/agents/estate';
import { manifest } from '../helpers';

const indices = (sim: Simulation) => Array.from({ length: sim.world.agents.count }, (_, k) => k);
const members = (sim: Simulation, hh: number) => indices(sim).filter((k) => sim.world.agents.household[k] === hh);
const quiet = { 'society.emigration': 0, 'society.immigration': 0, 'society.mortality': 0, 'society.fertility': 0 };

/** Alguien que vive solo, propietario y sin hipoteca, con un familiar adulto en otro hogar. */
function lonelyOwnerWithHeir(sim: Simulation): [number, number] {
  const a = sim.world.agents;
  for (const i of indices(sim)) {
    if (members(sim, a.household[i]!).length !== 1 || a.renting[i] || a.mortgage[i]! > 0) continue;
    for (let s = 0; s < 8; s++) {
      if (a.relKind[i * 8 + s] !== RelationKind.Family) continue;
      const j = a.indexOf(a.relId[i * 8 + s]!);
      if (j >= 0 && a.household[j] !== a.household[i] && a.age[j]! >= 18) return [i, j];
    }
  }
  throw new Error('sin candidato');
}

describe('Herencia y compraventa (ADR-0028)', () => {
  it('los mayores tienen hijos adultos en otros hogares del pueblo', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, ...quiet } }));
    const a = sim.world.agents;
    const elders = indices(sim).filter((i) => a.age[i]! >= 60);
    const withKin = elders.filter((i) => {
      for (let s = 0; s < 8; s++) {
        if (a.relKind[i * 8 + s] !== RelationKind.Family) continue;
        const j = a.indexOf(a.relId[i * 8 + s]!);
        if (j >= 0 && a.household[j] !== a.household[i]) return true;
      }
      return false;
    });
    expect(withKin.length / elders.length).toBeGreaterThan(0.6);
  });

  it('al morir el último adulto del hogar, su familiar hereda el dinero, la vivienda y los inquilinos', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, ...quiet } }));
    const a = sim.world.agents;
    const [i, heir] = lonelyOwnerWithHeir(sim);
    const hh = a.household[i]!;
    const heirHousehold = a.household[heir]!;
    a.money[i] = 5000;
    a.spare[i] = 1;
    const tenant = indices(sim).find((k) => a.renting[k] && a.household[k] !== hh && a.household[k] !== heirHousehold)!;
    for (const k of members(sim, a.household[tenant]!)) a.landlord[k] = hh;
    const before = a.money[heir]!;
    sim.drainEvents();
    bequeath(sim.world, i);
    expect(a.money[heir]).toBeCloseTo(before + 5000, 6);
    for (const k of members(sim, heirHousehold)) expect(a.spare[k]).toBe(2);
    expect(a.landlord[tenant]).toBe(heirHousehold);
    const ev = sim.drainEvents().find((e) => e.type === 'inheritance')!;
    expect(ev.data).toMatchObject({ homes: 2, amount: 5000 });
    expect(ev.data.tenants as number).toBeGreaterThanOrEqual(1);
  });

  it('si quedan adultos en el hogar, el dinero se queda en casa; sin herederos, va al Estado', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, ...quiet } }));
    const a = sim.world.agents;
    const couple = indices(sim).find((i) => members(sim, a.household[i]!).filter((k) => a.age[k]! >= 18).length === 2)!;
    const other = members(sim, a.household[couple]!).find((k) => k !== couple && a.age[k]! >= 18)!;
    a.money[couple] = 300;
    const before = a.money[other]!;
    bequeath(sim.world, couple);
    expect(a.money[other]).toBeCloseTo(before + 300, 6);

    const [alone] = lonelyOwnerWithHeir(sim);
    for (let s = 0; s < 8; s++) a.relKind[alone * 8 + s] = RelationKind.None;
    sim.drainEvents();
    bequeath(sim.world, alone);
    expect(sim.drainEvents().some((e) => e.type === 'estate.toState')).toBe(true);
  });

  it('una vivienda de sobra se alquila antes que comprar otra, y se vende al hogar más rico si falta dinero', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, ...quiet } }));
    const a = sim.world.agents;
    const owner = indices(sim).find((i) => !a.renting[i] && a.mortgage[i] === 0 && a.age[i]! >= 18)!;
    const hh = a.household[owner]!;
    for (const k of members(sim, hh)) a.spare[k] = 2;
    const tenantHousehold = a.household[indices(sim).find((i) => a.renting[i])!]!;
    expect(letSpareHome(sim.world, tenantHousehold)).toBe(hh);
    for (const k of members(sim, hh)) expect(a.spare[k]).toBe(1);

    // Venta por necesidad: sin dinero, vende al hogar propietario más rico.
    const first = new Map<number, number>();
    const pool = new Map<number, [number, number]>();
    for (const i of indices(sim)) if (!first.has(a.household[i]!)) first.set(a.household[i]!, i);
    for (const h of first.keys()) pool.set(h, [100, 1]);
    const rich = a.household[indices(sim).find((i) => !a.renting[i] && a.mortgage[i] === 0 && a.household[i] !== hh)!]!;
    pool.set(hh, [0, 1]);
    pool.set(rich, [1e6, 1]);
    const change = sellSpareHomes(sim.world, pool, 40_000, 0, first);
    expect(change.get(hh)).toBe(-1);
    expect(change.get(rich)).toBe(1);
    expect(pool.get(hh)![0]).toBe(40_000);
    expect(pool.get(rich)![0]).toBe(1e6 - 40_000);
  });
});

describe('Vender para mudarse (ADR-0039)', () => {
  const money = (sim: Simulation, hh: number) => members(sim, hh).reduce((t, k) => t + (sim.world.agents.age[k]! >= 14 ? sim.world.agents.money[k]! : 0), 0);

  it('el propietario vende: cobra el precio, salda la hipoteca y el comprador local la tiene de sobra', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, ...quiet } }));
    const a = sim.world.agents;
    const adults = indices(sim).filter((k) => a.age[k]! >= 30 && !a.renting[k]);
    const seller = a.household[adults[0]!]!;
    const rich = a.household[adults.find((k) => a.household[k] !== seller)!]!;
    for (const k of members(sim, seller)) a.mortgage[k] = 10_000;
    for (const k of members(sim, rich)) {
      a.mortgage[k] = 0;
      if (a.age[k]! >= 14) a.money[k] = 1e6;
    }
    const before = money(sim, seller);
    const spare = a.spare[members(sim, rich)[0]!]!;
    expect(sellHome(sim.world, seller, 40_000)).toBe(true);
    expect(money(sim, seller)).toBeCloseTo(before + 30_000, 3);
    expect(members(sim, seller).every((k) => a.mortgage[k] === 0)).toBe(true);
    expect(a.spare[members(sim, rich)[0]!]).toBe(spare + 1);
  });

  it('si la venta no cubre la hipoteca y no tiene el resto, no vende', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 300, ...quiet } }));
    const a = sim.world.agents;
    const hh = a.household[indices(sim).find((k) => a.age[k]! >= 30 && !a.renting[k])!]!;
    for (const k of members(sim, hh)) {
      a.mortgage[k] = 50_000;
      a.money[k] = 0;
    }
    expect(sellHome(sim.world, hh, 40_000)).toBe(false);
    expect(a.mortgage[members(sim, hh)[0]!]).toBe(50_000);
  });

  it('compra al contado, con hipoteca o, si no le llega, no compra', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 300, ...quiet } }));
    const a = sim.world.agents;
    const k = indices(sim).find((x) => a.age[x]! >= 30 && a.renting[x])!;
    const hh = a.household[k]!;
    const setMoney = (m: number) => members(sim, hh).forEach((x) => (a.money[x] = a.age[x]! >= 14 ? m / members(sim, hh).filter((y) => a.age[y]! >= 14).length : 0));
    setMoney(100);
    expect(buyHome(sim.world, hh, a.home[k]!, 40_000, 4_000, 1_000)).toBe(false);
    expect(a.renting[k]).toBe(1);
    setMoney(6_000);
    expect(buyHome(sim.world, hh, a.home[k]!, 40_000, 4_000, 1_000)).toBe(true);
    expect(a.renting[k]).toBe(0);
    expect(a.mortgage[k]).toBe(36_000);
    expect(money(sim, hh)).toBeCloseTo(2_000, 3);
    setMoney(50_000);
    expect(buyHome(sim.world, hh, a.home[k]!, 40_000, 4_000, 1_000)).toBe(true);
    expect(a.mortgage[k]).toBe(0);
  });
});

