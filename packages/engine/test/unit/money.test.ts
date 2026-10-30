import { describe, expect, it } from 'vitest';
import { Occupation, Simulation } from '../../src';
import { storageCap } from '../../src/agents/economy';
import { lifecycleSystem } from '../../src/agents/lifecycle';
import { buy, canAfford, dailyMoney, exportSurplus, positionsOf, priceOf, weeklyJobs } from '../../src/agents/money';
import { Resource } from '../../src/world/agents';
import { manifest } from '../helpers';

const indices = (sim: Simulation) => Array.from({ length: sim.world.agents.count }, (_, k) => k);

describe('Dinero y empleo (ADR-0022)', () => {
  it('a medianoche se cobra el jornal: lo paga el negocio, o el Estado a los funcionarios; proporcional a lo trabajado', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 300 } }));
    const a = sim.world.agents;
    const bs = sim.world.buildings;
    const farmer = indices(sim).find((i) => a.occupation[i] === Occupation.Farmer)!;
    const clerk = indices(sim).find((i) => a.occupation[i] === Occupation.CivilServant)!;
    const farm = a.workplace[farmer]!;
    const office = a.workplace[clerk]!;
    for (const i of indices(sim)) a.workedToday[i] = 0;
    a.workedToday[farmer] = 300;
    a.workedToday[clerk] = 150;
    const [cash, officeCash] = [bs.cash[farm]!, bs.cash[office]!];
    dailyMoney(sim.world);
    // Jornada completa: el negocio paga 60; al funcionario le paga el Estado (la oficina no tiene caja).
    expect(bs.cash[farm]).toBeCloseTo(cash - 60, 6);
    expect(bs.cash[office]).toBe(officeCash);
    expect(a.workedToday[farmer]).toBe(0);
  });

  it('comprar cobra lo que se puede pagar y la caja de la tienda lo recibe', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 50 } }));
    const a = sim.world.agents;
    const shop = sim.world.map.byUse.retail[0]!;
    const i = indices(sim).find((k) => a.age[k]! >= 18)!;
    const price = priceOf(sim.world, Resource.Food);
    a.money[i] = price * 3.5;
    const cash = sim.world.buildings.cash[shop]!;
    expect(buy(sim.world, i, shop, Resource.Food, 10)).toBe(3);
    expect(a.money[i]).toBeCloseTo(price * 0.5, 6);
    expect(sim.world.buildings.cash[shop]).toBeCloseTo(cash + 3 * price, 6);
    expect(canAfford(sim.world, i, Resource.Food)).toBe(false);
    // El agua de las fuentes es gratis.
    expect(canAfford(sim.world, i, Resource.Water)).toBe(true);
  });

  it('el hogar reparte su dinero entre los mayores de 14; pensiones y ayuda de emergencia', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 300 } }));
    const a = sim.world.agents;
    for (const i of indices(sim)) a.workedToday[i] = 0;
    const retiree = indices(sim).find((i) => a.occupation[i] === Occupation.Retired && indices(sim).filter((k) => a.household[k] === a.household[i]).length === 1)!;
    a.money[retiree] = 100;
    const family = indices(sim).find((i) => a.age[i]! < 14 && indices(sim).filter((k) => a.household[k] === a.household[i] && a.age[k]! >= 14).length >= 2)!;
    const members = indices(sim).filter((k) => a.household[k] === a.household[family]);
    for (const k of members) a.money[k] = 0;
    dailyMoney(sim.world);
    // Pensión 45 − gastos fijos 8.
    expect(a.money[retiree]).toBeCloseTo(137, 6);
    const buyers = members.filter((k) => a.age[k]! >= 14);
    expect(a.money[family]).toBe(0);
    for (const k of buyers) expect(a.money[k]).toBeCloseTo(a.money[buyers[0]!]!, 6);
    // Sin dinero, la ayuda de emergencia cubre al menos un día de comida del hogar.
    const total = buyers.reduce((s, k) => s + a.money[k]!, 0);
    expect(total).toBeGreaterThanOrEqual(4.3 * priceOf(sim.world, Resource.Food) * members.length - 1e-6);
  });

  it('sin caja se despide; con caja y puestos libres se contrata a la persona en paro más cercana', () => {
    const sim = new Simulation(manifest(6, { criteria: { 'society.initialPopulation': 300 } }));
    const a = sim.world.agents;
    const bs = sim.world.buildings;
    const sawmill = sim.world.map.byUse.industrial.find((b) => indices(sim).some((i) => a.workplace[i] === b))!;
    for (const b of [...sim.world.map.byUse.retail, ...sim.world.map.byUse.agriculture, ...sim.world.map.byUse.industrial]) bs.cash[b] = 1000;
    bs.cash[sawmill] = 0;
    const staff = indices(sim).filter((i) => a.workplace[i] === sawmill).length;
    sim.drainEvents();
    weeklyJobs(sim.world);
    expect(indices(sim).filter((i) => a.workplace[i] === sawmill).length).toBe(staff - 1);
    expect(sim.drainEvents().some((e) => e.type === 'job.lost')).toBe(true);

    const staffOf = (b: number) => indices(sim).filter((i) => a.workplace[i] === b).length;
    const farm = sim.world.map.byUse.agriculture.find((b) => staffOf(b) < positionsOf(sim.world, b))!;
    expect(farm).toBeDefined();
    const jobless = indices(sim).filter((i) => a.occupation[i] === Occupation.Unemployed && a.age[i]! >= 18 && a.age[i]! < 67);
    expect(jobless.length).toBeGreaterThan(0);
    for (const b of [...sim.world.map.byUse.retail, ...sim.world.map.byUse.agriculture, ...sim.world.map.byUse.industrial]) bs.cash[b] = 1000;
    bs.cash[farm] = 1e6;
    weeklyJobs(sim.world);
    const hired = sim.drainEvents().filter((e) => e.type === 'job.hired');
    expect(hired.length).toBe(1);
    const i = a.indexOf(hired[0]!.data.agentId as number);
    expect([a.occupation[i], a.workplace[i]]).toEqual([Occupation.Farmer, farm]);
  });

  it('el Exterior compra el excedente de huertas y aserraderos (por encima del 20 % del almacén)', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 0 } }));
    const farm = sim.world.map.byUse.agriculture[0]!;
    const bs = sim.world.buildings;
    const cap = storageCap(sim.world, farm);
    bs.food[farm] = cap;
    const cash = bs.cash[farm]!;
    exportSurplus(sim.world, (b) => storageCap(sim.world, b));
    expect(bs.food[farm]).toBeCloseTo(0.2 * cap, 3);
    expect(bs.cash[farm]).toBeCloseTo(cash + 0.8 * cap * 2.2, 3);
  });

  it('a los 18 se empieza en paro, buscando trabajo', () => {
    const sim = new Simulation(manifest(4, { criteria: { 'society.initialPopulation': 200, 'society.mortality': 0, 'society.fertility': 0 } }));
    const a = sim.world.agents;
    while (sim.frame().date.minuteOfDay !== 0) sim.step();
    const today = (sim.frame().date.month - 1) * 30 + sim.frame().date.day - 1;
    const teen = indices(sim).find((i) => a.occupation[i] === Occupation.Student)!;
    a.age[teen] = 17;
    a.birthDay[teen] = today;
    lifecycleSystem(sim.world);
    expect([a.age[teen], a.occupation[teen], a.workplace[teen]]).toEqual([18, Occupation.Unemployed, -1]);
  });

  it('snapshot y restauración conservan monederos, cajas y minutos trabajados (determinismo)', () => {
    const m = manifest(3, { time: { minutesPerTick: 30, start: { year: 1, month: 3, day: 21, hour: 6, minute: 0 } }, criteria: { 'society.initialPopulation': 150 } });
    const full = new Simulation(m);
    full.step(48 * 10);
    const half = new Simulation(m);
    half.step(48 * 5 + 20);
    const resumed = Simulation.restore(m, JSON.parse(JSON.stringify(half.snapshot())), half.commandLog());
    resumed.step(48 * 5 - 20);
    expect(resumed.hash()).toBe(full.hash());
  });
});
