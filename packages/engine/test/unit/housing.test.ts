import { describe, expect, it } from 'vitest';
import { Occupation, Simulation } from '../../src';
import { assignLandlord, downPaymentShare, housePrice } from '../../src/agents/housing';
import { householdsSystem } from '../../src/agents/households';
import { dailyMoney, rentNow } from '../../src/agents/money';
import { ticksPerDay } from '../../src/time/clock';
import { metric } from '../../src/metrics';
import { manifest } from '../helpers';

const indices = (sim: Simulation) => Array.from({ length: sim.world.agents.count }, (_, k) => k);
const members = (sim: Simulation, hh: number) => indices(sim).filter((k) => sim.world.agents.household[k] === hh);
const quiet = { 'society.emigration': 0, 'society.immigration': 0, 'society.mortality': 0, 'society.fertility': 0 };

/** Pasa días de dinero a medianoche (el día de la compra se deriva del tick). */
function days(sim: Simulation, n: number, each?: () => void): void {
  for (let d = 0; d < n; d++) {
    each?.();
    sim.world.tick += ticksPerDay(sim.world.time);
    dailyMoney(sim.world);
  }
}

describe('Propietarios y vivienda (ADR-0026)', () => {
  it('al crear el mundo, más de la mitad de los alquileres son de caseros del pueblo, que son propietarios', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, ...quiet } }));
    const a = sim.world.agents;
    const ratio = Number(metric(sim, 'households.localLandlordRatio'));
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.8);
    for (const i of indices(sim)) {
      if (!a.renting[i] || a.landlord[i] === 0) continue;
      const owner = members(sim, a.landlord[i]!);
      expect(owner.length).toBeGreaterThan(0);
      expect(a.renting[owner[0]!]).toBe(0);
    }
  });

  it('el alquiler lo cobra el casero; si se va del pueblo, pasa a un fondo de fuera', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, ...quiet } }));
    const a = sim.world.agents;
    const tenant = indices(sim).find((i) => a.renting[i] && a.landlord[i] !== 0 && a.age[i]! >= 18)!;
    const landlord = a.landlord[tenant]!;
    const owners = members(sim, landlord).filter((k) => a.age[k]! >= 14);
    for (const k of indices(sim)) a.workedToday[k] = 0;
    for (const k of members(sim, a.household[tenant]!)) a.money[k] = 1e5;
    const before = owners.reduce((s, k) => s + a.money[k]!, 0);
    sim.world.criteria['economy.creditAccess'] = 0; // que no compre todavía
    dailyMoney(sim.world);
    const after = owners.reduce((s, k) => s + a.money[k]!, 0);
    // Lo cobrado incluye al menos el alquiler (más sus propios ingresos y gastos del día).
    expect(after - before).toBeGreaterThan(rentNow(sim.world) - 100);
    for (const k of members(sim, landlord)) a.household[k] = 9_999_999;
    dailyMoney(sim.world);
    expect(a.landlord[tenant]).toBe(0);
  });

  it('con ahorros para la entrada se compra con hipoteca; si no se paga la cuota, ejecución hipotecaria', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 600, ...quiet } }));
    const a = sim.world.agents;
    const tenant = indices(sim).find((i) => a.renting[i] && a.landlord[i] !== 0 && a.age[i]! >= 18)!;
    const hh = a.household[tenant]!;
    const price = housePrice(sim.world);
    expect(downPaymentShare(sim.world)).toBeCloseTo(0.1, 6);
    sim.drainEvents();
    // Día a día con dinero para la entrada, hasta que el sorteo (hash del hogar y el día) le toca.
    for (let d = 0; d < 3000 && a.renting[members(sim, hh)[0]!]; d++) {
      for (const k of members(sim, hh)) if (a.age[k]! >= 14) a.money[k] = price;
      days(sim, 1);
    }
    const ev = sim.drainEvents().find((e) => e.type === 'home.bought');
    expect(ev).toBeDefined();
    const i = members(sim, hh)[0]!;
    expect(a.renting[i]).toBe(0);
    expect(a.landlord[i]).toBe(0);
    expect(a.mortgage[i]).toBeGreaterThan(0);
    expect(a.mortgage[i]).toBeLessThan(0.9 * price + 1);
    // Sin dinero no se paga la cuota: impago; a los 30 días, ejecución hipotecaria y se van del pueblo.
    while (sim.frame().date.minuteOfDay !== 0) sim.step();
    const ids = members(sim, hh).map((k) => a.ids[k]!);
    for (const k of indices(sim)) a.arrears[k] = a.household[k] === hh ? 30 : 0;
    sim.drainEvents();
    householdsSystem(sim.world);
    const evicted = sim.drainEvents().find((e) => e.type === 'household.evicted');
    expect(evicted?.data.cause).toBe('mortgage');
    for (const id of ids) expect(a.indexOf(id)).toBe(-1);
  });

  it('sin crédito se compra al contado; un hogar rico compra viviendas para alquilarlas', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 300, ...quiet, 'economy.creditAccess': 0 } }));
    const a = sim.world.agents;
    expect(downPaymentShare(sim.world)).toBe(1);
    const rich = indices(sim).find((i) => !a.renting[i] && a.age[i]! >= 18 && a.occupation[i] !== Occupation.Child)!;
    const price = housePrice(sim.world);
    for (const k of members(sim, a.household[rich]!)) if (a.age[k]! >= 14) a.money[k] = price * 3;
    const tenant = indices(sim).find((i) => a.renting[i] && a.age[i]! >= 18)!;
    sim.drainEvents();
    assignLandlord(sim.world, a.household[tenant]!);
    expect(a.landlord[tenant]).toBe(a.household[rich]);
    expect(sim.drainEvents().some((e) => e.type === 'home.investment')).toBe(true);
  });
});
