import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src';
import { manifest, setCriterion } from '../helpers';

describe('Comandos y criterios', () => {
  it('criteria.set aplica en el siguiente tick y emite evento', () => {
    const sim = new Simulation(manifest());
    const res = sim.submit(setCriterion('economy.foodAbundance', 0.2));
    expect(res).toEqual({ ok: true, appliedAtTick: 0 });
    expect(sim.world.criteria['economy.foodAbundance']).toBe(0.7);
    sim.step();
    expect(sim.world.criteria['economy.foodAbundance']).toBe(0.2);
    expect(sim.drainEvents().filter((e) => e.type === 'criteria.changed')).toEqual([
      { tick: 0, type: 'criteria.changed', data: { key: 'economy.foodAbundance', previous: 0.7, value: 0.2 } },
    ]);
    expect(sim.commandLog()).toHaveLength(1);
  });

  it('respeta atTick', () => {
    const sim = new Simulation(manifest());
    expect(sim.submit(setCriterion('society.sociability', 0.9, 'admin', 10))).toEqual({ ok: true, appliedAtTick: 10 });
    sim.step(10);
    expect(sim.world.criteria['society.sociability']).toBe(0.5);
    sim.step(1);
    expect(sim.world.criteria['society.sociability']).toBe(0.9);
  });

  it('un observador no puede mutar el mundo (ADR-0006)', () => {
    const sim = new Simulation(manifest());
    const res = sim.submit(setCriterion('economy.foodAbundance', 0.1, 'observer'));
    expect(res).toMatchObject({ ok: false, reason: 'unauthorized' });
  });

  it('valida el payload contra la definición del criterio', () => {
    const sim = new Simulation(manifest());
    expect(sim.submit(setCriterion('economy.foodAbundance', 2))).toMatchObject({ ok: false, reason: 'invalid_payload' });
    expect(sim.submit(setCriterion('no.existe', 1))).toMatchObject({ ok: false, reason: 'invalid_payload' });
    expect(sim.submit(setCriterion('world.era', 'medieval'))).toMatchObject({ ok: false, reason: 'invalid_payload' });
    expect(sim.submit(setCriterion('world.era', 'historical'))).toMatchObject({ ok: true });
  });

  it('comando desconocido y ciclo de vida deprecated/removed (ADR-0005)', () => {
    const sim = new Simulation(manifest());
    expect(sim.submit({ ...setCriterion('x', 1), type: 'nope' })).toMatchObject({ ok: false, reason: 'unknown_command' });

    sim.commands.setStatus('criteria.set', 1, 'deprecated');
    expect(sim.submit(setCriterion('society.sociability', 0.3))).toMatchObject({ ok: true });
    sim.commands.setStatus('criteria.set', 1, 'removed');
    expect(sim.submit(setCriterion('society.sociability', 0.4))).toMatchObject({ ok: false, reason: 'removed_command' });
    // Lo aceptado antes de retirarlo se sigue aplicando (replay).
    sim.step();
    expect(sim.world.criteria['society.sociability']).toBe(0.3);
  });

  it('setStatus no afecta a otras simulaciones', () => {
    const a = new Simulation(manifest());
    a.commands.setStatus('criteria.set', 1, 'removed');
    const b = new Simulation(manifest());
    expect(b.commands.describe().find((c) => c.type === 'criteria.set')!.status).toBe('active');
  });

  it('el catálogo publica comandos y criterios ordenados', () => {
    const cat = new Simulation(manifest()).catalog();
    expect(cat.commands.map((c) => c.type)).toEqual(['agent.remove', 'agent.spawn', 'criteria.set', 'disaster.fire']);
    expect(cat.criteria.map((c) => c.key)).toEqual([
      'climate.baseTemperatureC', 'economy.foodAbundance', 'economy.waterSupply', 'society.initialPopulation', 'society.sociability', 'world.era',
    ]);
    expect(cat.values['climate.baseTemperatureC']).toBe(18);
  });

  it('el manifiesto puede fijar criterios iniciales y rechaza los inválidos', () => {
    expect(new Simulation(manifest(1, { criteria: { 'economy.foodAbundance': 0.1 } })).world.criteria['economy.foodAbundance']).toBe(0.1);
    expect(() => new Simulation(manifest(1, { criteria: { 'economy.foodAbundance': 5 } }))).toThrow();
    expect(() => new Simulation(manifest(1, { criteria: { inventado: 1 } }))).toThrow();
    expect(() => new Simulation(manifest(1, { ruleset: 'fantasy' }))).toThrow();
  });
});
