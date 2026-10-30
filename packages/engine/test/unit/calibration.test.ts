import { describe, expect, it } from 'vitest';
import { Action, Occupation, Simulation } from '../../src';
import { inSleepWindow, minutesToBed, sleepMinutes } from '../../src/agents/environment';
import { manifest } from '../helpers';

describe('Calibración (ADR-0018)', () => {
  it('la ventana de sueño cruza la medianoche y depende de la edad', () => {
    expect(sleepMinutes(8)).toBe(600);
    expect(sleepMinutes(40)).toBe(450);
    // Adulto que se acuesta a las 23:30 (1410): dormido a la 01:00, despierto a las 08:00.
    expect(inSleepWindow(60, 1410, 40)).toBe(true);
    expect(inSleepWindow(400, 1410, 40)).toBe(true);
    expect(inSleepWindow(420, 1410, 40)).toBe(false); // 07:00: fin exacto de la ventana
    expect(inSleepWindow(480, 1410, 40)).toBe(false);
    expect(inSleepWindow(1380, 1410, 40)).toBe(false);
    expect(minutesToBed(1380, 1410)).toBe(30);
    expect(minutesToBed(1420, 1410)).toBe(1430);
  });

  it('la población nace por hogares: familia con hijos, menores sin trabajo, escuela para 6–17', () => {
    const sim = new Simulation(manifest(5, { criteria: { 'society.initialPopulation': 300 } }));
    const a = sim.world.agents;
    expect(a.count).toBe(300);
    let kids = 0;
    for (let i = 0; i < a.count; i++) {
      const age = a.age[i]!;
      if (age < 6) expect(a.occupation[i]).toBe(Occupation.Child);
      else if (age < 18) {
        kids++;
        expect(a.occupation[i]).toBe(Occupation.Student);
        expect(sim.world.map.buildings[a.workplace[i]!]!.use).toBe('publicServices');
      } else if (age >= 67) expect(a.occupation[i]).toBe(Occupation.Retired);
      const bed = a.bedtime[i]!;
      expect(age < 12 ? bed >= 1260 && bed <= 1320 : bed >= 1350 || bed <= 30).toBe(true);
    }
    expect(kids).toBeGreaterThan(0);
    // Ningún menor vive solo.
    for (let i = 0; i < a.count; i++) {
      if (a.age[i]! >= 18) continue;
      let adults = 0;
      for (let j = 0; j < a.count; j++) if (a.home[j] === a.home[i] && a.age[j]! >= 18) adults++;
      expect(adults).toBeGreaterThan(0);
    }
  });

  it('un agricultor lleva la cosecha de su huerta a una tienda', () => {
    const sim = new Simulation(manifest(3, { criteria: { 'society.initialPopulation': 400 } }));
    const w = sim.world;
    const a = w.agents;
    const farmer = Array.from({ length: a.count }, (_, i) => i).find((i) => a.occupation[i] === Occupation.Farmer)!;
    expect(farmer).toBeDefined();
    const farm = a.workplace[farmer]!;
    sim.step(4 * 60); // 10:00 del primer día (laborable)
    w.buildings.food[farm] = 30;
    let delivered = 0;
    for (let t = 0; t < 600 && delivered === 0; t++) {
      sim.step();
      delivered = sim.drainEvents().filter((e) => e.type === 'harvest.delivered').length;
    }
    expect(delivered).toBeGreaterThan(0);
    expect(w.buildings.food[farm]).toBeLessThan(30);
    expect([Action.Deliver, Action.Stay, Action.Work, Action.GoHome]).toContain(a.action[farmer]);
  });

  it('al cerrar las tiendas nadie se queda en la cola', () => {
    const sim = new Simulation(manifest(2, { criteria: { 'society.initialPopulation': 300 } }));
    sim.step(15 * 60 + 30); // 21:30
    const a = sim.world.agents;
    for (let i = 0; i < a.count; i++) {
      const loc = a.location[i]!;
      if (loc >= 0 && sim.world.map.buildings[loc]!.use === 'retail') expect(a.action[i]).not.toBe(Action.Provision);
    }
  });
});
