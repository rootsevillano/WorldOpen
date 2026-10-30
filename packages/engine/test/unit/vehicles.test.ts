import { AgentFlag } from '@worldopen/contracts';
import { describe, expect, it } from 'vitest';
import { Action, Simulation } from '../../src';
import { movementSystem, startAction } from '../../src/agents/systems';
import { DRIVE_MIN_M, householdHasCar, pathLength, shouldDrive } from '../../src/agents/vehicles';
import { metric } from '../../src/metrics';
import { manifest } from '../helpers';

const indices = (sim: Simulation) => Array.from({ length: sim.world.agents.count }, (_, k) => k);

/** Vivienda y huerta con la ruta más larga del mapa sintético (≥ 800 m). */
function longestCommute(sim: Simulation): [number, number, number] {
  const map = sim.world.map;
  let best: [number, number, number] = [-1, -1, 0];
  for (const h of map.homes) {
    const c = map.buildings[h]!.centroid;
    for (const w of map.byUse.agriculture) {
      const p = map.route(c.x, c.z, h, w);
      const len = p ? pathLength(c.x, c.z, p) : 0;
      if (len > best[2]) best = [h, w, len];
    }
  }
  return best;
}

describe('Vehículos (ADR-0025)', () => {
  it('la proporción de hogares con coche sigue el criterio; en la época histórica no hay coches', () => {
    const sim = new Simulation(manifest(3, { criteria: { 'society.initialPopulation': 600 } }));
    expect(Number(metric(sim, 'households.carRatio'))).toBeGreaterThan(0.65);
    expect(Number(metric(sim, 'households.carRatio'))).toBeLessThan(0.85);
    sim.world.criteria['society.carOwnership'] = 0;
    expect(metric(sim, 'households.carRatio')).toBe(0);
    sim.world.criteria['society.carOwnership'] = 1;
    expect(metric(sim, 'households.carRatio')).toBe(1);
    sim.world.criteria['world.era'] = 'historical';
    expect(householdHasCar(sim.world, 1)).toBe(false);
  });

  it('solo conduce un adulto con coche libre, trayecto largo y dinero para la gasolina', () => {
    const sim = new Simulation(manifest(3, { criteria: { 'society.initialPopulation': 100, 'society.carOwnership': 1 } }));
    const a = sim.world.agents;
    const i = indices(sim).find((k) => a.age[k]! >= 18)!;
    a.money[i] = 100;
    const busy = new Set<number>();
    expect(shouldDrive(sim.world, i, DRIVE_MIN_M, busy)).toBe(true);
    expect(shouldDrive(sim.world, i, DRIVE_MIN_M - 1, busy)).toBe(false);
    expect(shouldDrive(sim.world, i, DRIVE_MIN_M, new Set([a.household[i]!]))).toBe(false);
    a.money[i] = 0;
    expect(shouldDrive(sim.world, i, DRIVE_MIN_M, busy)).toBe(false);
    a.money[i] = 100;
    a.age[i] = 17;
    expect(shouldDrive(sim.world, i, DRIVE_MIN_M, busy)).toBe(false);
  });

  it('sale de casa en coche, paga la gasolina, el coche queda ocupado para el hogar y al volver se aparca', () => {
    const sim = new Simulation(manifest(3, { criteria: { 'society.initialPopulation': 100, 'society.carOwnership': 1 } }));
    const a = sim.world.agents;
    const [home, farm, length] = longestCommute(sim);
    expect(length).toBeGreaterThanOrEqual(DRIVE_MIN_M);
    const [i, j] = indices(sim).filter((k) => a.age[k]! >= 18).slice(0, 2) as [number, number];
    const c = sim.world.map.buildings[home]!.centroid;
    for (const k of [i, j]) {
      a.home[k] = home;
      a.location[k] = home;
      a.household[k] = 999_999;
      a.money[k] = 100;
      a.driving[k] = 0;
      a.positions[k * 3] = c.x;
      a.positions[k * 3 + 2] = c.z;
      a.workplace[k] = farm;
    }
    sim.world.carsBusy.clear();
    startAction(sim.world, i, Action.Work, home);
    expect(a.driving[i]).toBe(1);
    expect(a.flags[i]).toBe(AgentFlag.Driving);
    // El otro adulto del hogar no puede llevárselo.
    a.location[j] = home;
    a.positions[j * 3] = c.x;
    a.positions[j * 3 + 2] = c.z;
    a.paths[j] = null;
    a.driving[j] = 0;
    startAction(sim.world, j, Action.Work, home);
    expect(a.driving[j]).toBe(0);
    // Llega en pocos minutos (a pie serían más de 10) y paga ≈ 0.15 por km.
    let minutes = 0;
    while (a.location[i] !== farm && minutes < 10) {
      movementSystem(sim.world);
      minutes += sim.world.time.minutesPerTick;
    }
    expect(a.location[i]).toBe(farm);
    expect(minutes).toBeLessThanOrEqual(Math.ceil(length / 400));
    expect(a.money[i]).toBeCloseTo(100 - (length / 1000) * 0.15, 3);
    expect(a.driving[i]).toBe(1);
    // Vuelve a casa: el coche queda aparcado.
    startAction(sim.world, i, Action.GoHome, home);
    for (let t = 0; t < 10 && a.location[i] !== home; t++) movementSystem(sim.world);
    expect(a.location[i]).toBe(home);
    expect(a.driving[i]).toBe(0);
  });
});
