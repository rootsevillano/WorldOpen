import { describe, expect, it } from 'vitest';
import { Occupation, Simulation } from '../../src';
import { chooseSource, storageCap } from '../../src/agents/economy';
import { lifecycleSystem } from '../../src/agents/lifecycle';
import { householdsSystem } from '../../src/agents/households';
import { buy, canAfford, dailyMoney, dailyWageAt, exportSurplus, positionsOf, priceAt, priceOf, rentIndex, rentNow, updatePrices, weeklyJobs } from '../../src/agents/money';
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

describe('Precios dinámicos (ADR-0023)', () => {
  it('una tienda sin existencias sube el precio y una con exceso lo baja, con inercia y dentro de 0.7×–2.5×', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 200 } }));
    const bs = sim.world.buildings;
    const [empty, full] = sim.world.map.byUse.retail;
    bs.demand[empty!] = 1000;
    bs.demand[full!] = 1000;
    bs.food[empty!] = 0;
    bs.food[full!] = 3000;
    const cap = (b: number) => storageCap(sim.world, b);
    updatePrices(sim.world, cap);
    // Objetivo 1.8 (vacía) y 0.7 (el triple de su demanda): un 25 % del camino al día.
    expect(bs.price[empty!]).toBeCloseTo(1.2, 5);
    expect(bs.price[full!]).toBeCloseTo(0.925, 5);
    for (let d = 0; d < 60; d++) updatePrices(sim.world, cap);
    expect(bs.price[empty!]).toBeCloseTo(1.8, 3);
    expect(bs.price[full!]).toBeCloseTo(0.7, 3);
    expect(priceAt(sim.world, empty!, Resource.Food)).toBeCloseTo(1.8 * priceOf(sim.world, Resource.Food), 3);
  });

  it('se compra al precio de la tienda y se prefiere la barata; donde no llega el dinero, ni se va', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 50 } }));
    const a = sim.world.agents;
    const bs = sim.world.buildings;
    const shops = sim.world.map.byUse.retail;
    const i = indices(sim).find((k) => a.age[k]! >= 18)!;
    // Entre las tiendas 0 y 1, más cerca de la 0.
    const p0 = sim.world.map.buildings[shops[0]!]!.centroid;
    const p1 = sim.world.map.buildings[shops[1]!]!.centroid;
    a.positions[i * 3] = p0.x + 0.4 * (p1.x - p0.x);
    a.positions[i * 3 + 2] = p0.z + 0.4 * (p1.z - p0.z);
    a.money[i] = 1000;
    expect(chooseSource(sim.world, i, Resource.Food)).toBe(shops[0]);
    // La 0 está más cerca, pero 2.5 veces más cara: "está" más lejos que la 1.
    bs.price[shops[0]!] = 2.5;
    expect(chooseSource(sim.world, i, Resource.Food)).not.toBe(shops[0]);
    const cash = bs.cash[shops[0]!]!;
    expect(buy(sim.world, i, shops[0]!, Resource.Food, 2)).toBe(2);
    expect(bs.cash[shops[0]!]).toBeCloseTo(cash + 2 * 2.5 * priceOf(sim.world, Resource.Food), 5);
    // Con dinero solo para la más barata, la cara queda descartada aunque fuera la única cercana.
    for (const s of shops) bs.price[s] = 2.5;
    bs.price[shops[shops.length - 1]!] = 1;
    a.money[i] = priceOf(sim.world, Resource.Food) * 1.5;
    expect(chooseSource(sim.world, i, Resource.Food)).toBe(shops[shops.length - 1]);
  });
});

describe('Salarios de mercado y alquileres (ADR-0024)', () => {
  it('el alquiler depende de la ocupación; quien no paga acumula impagos y al mes lo desahucian', () => {
    const sim = new Simulation(manifest(7, { criteria: { 'society.initialPopulation': 300, 'society.emigration': 0, 'society.immigration': 0, 'economy.welfare': 0 } }));
    const a = sim.world.agents;
    const index = rentIndex(sim.world);
    expect(index).toBeGreaterThanOrEqual(0.6);
    expect(index).toBeLessThanOrEqual(2.5);
    expect(rentNow(sim.world)).toBeCloseTo(10 * index, 6);
    const renters = indices(sim).filter((i) => a.renting[i] === 1);
    expect(renters.length / a.count).toBeGreaterThan(0.1);
    expect(renters.length / a.count).toBeLessThan(0.4);
    // Un hogar de alquiler sin dinero ni ingresos: impagos día a día.
    const i = renters.find((k) => a.age[k]! >= 18)!;
    const hh = a.household[i]!;
    const members = indices(sim).filter((k) => a.household[k] === hh);
    const ids = members.map((k) => a.ids[k]!);
    for (const k of members) {
      a.money[k] = 0;
      a.occupation[k] = Occupation.Child;
      a.workplace[k] = -1;
    }
    for (let d = 1; d <= 3; d++) {
      for (const k of members) a.money[k] = 0;
      dailyMoney(sim.world);
    }
    expect(a.arrears[a.indexOf(ids[0]!)]).toBe(3);
    // El sistema de hogares actúa a medianoche.
    while (sim.frame().date.minuteOfDay !== 0) sim.step();
    for (const id of ids) a.arrears[a.indexOf(id)] = 30;
    sim.drainEvents();
    householdsSystem(sim.world);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'household.evicted')).toBe(true);
    expect(events.filter((e) => e.type === 'agent.emigrated' && e.data.reason === 'eviction').length).toBe(ids.length);
    for (const id of ids) expect(a.indexOf(id)).toBe(-1);
  });

  it('sin nadie en paro, un negocio con caja sube el salario y ficha a quien gana menos; con poca caja, lo baja', () => {
    const sim = new Simulation(manifest(6, { criteria: { 'society.initialPopulation': 300 } }));
    const a = sim.world.agents;
    const bs = sim.world.buildings;
    const staffOf = (b: number) => indices(sim).filter((i) => a.workplace[i] === b).length;
    for (const i of indices(sim)) if (a.occupation[i] === Occupation.Unemployed) a.occupation[i] = Occupation.Retired;
    const businesses = [...sim.world.map.byUse.retail, ...sim.world.map.byUse.agriculture, ...sim.world.map.byUse.industrial];
    for (const b of businesses) bs.cash[b] = 2000;
    const rich = sim.world.map.byUse.retail.find((b) => staffOf(b) < positionsOf(sim.world, b))!;
    bs.cash[rich] = 1e6;
    bs.wage[rich] = 1.3;
    sim.drainEvents();
    weeklyJobs(sim.world);
    expect(bs.wage[rich]).toBeCloseTo(1.326, 5);
    const events = sim.drainEvents();
    const changed = events.find((e) => e.type === 'job.changed')!;
    expect(changed).toBeDefined();
    expect(a.workplace[a.indexOf(changed.data.agentId as number)]).toBe(rich);
    // Los negocios con caja para menos de 2 semanas de nóminas bajan el salario un 5 %.
    const poor = businesses.find((b) => b !== rich && staffOf(b) > 0 && bs.cash[b]! >= 0.5 * 5 * dailyWageAt(sim.world, b) * staffOf(b))!;
    expect(bs.wage[poor]).toBeLessThan(1);
  });

  it('un negocio sin plantilla y con gente en paro reabre con capital de fuera', () => {
    const sim = new Simulation(manifest(6, { criteria: { 'society.initialPopulation': 300 } }));
    const a = sim.world.agents;
    const bs = sim.world.buildings;
    const farm = sim.world.map.byUse.agriculture[0]!;
    for (const i of indices(sim)) {
      if (a.workplace[i] !== farm) continue;
      a.occupation[i] = Occupation.Unemployed;
      a.workplace[i] = -1;
    }
    bs.cash[farm] = 0;
    sim.drainEvents();
    weeklyJobs(sim.world);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'business.reopened')).toBe(true);
    expect(indices(sim).some((i) => a.workplace[i] === farm)).toBe(true);
  });
});
