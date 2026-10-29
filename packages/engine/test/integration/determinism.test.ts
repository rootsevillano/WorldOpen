import type { CommandEnvelope } from '@worldopen/contracts';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src';
import { manifest, setCriterion } from '../helpers';

/** Mundo de prueba con agentes colocados por el PRNG para que el hash cubra el almacén de agentes. */
function run(seed: number, ticks: number, commands: CommandEnvelope[] = []): Simulation {
  const sim = new Simulation(manifest(seed));
  for (let i = 0; i < 50; i++) sim.world.agents.add(sim.world.rng.nextFloat() * 100, 0, sim.world.rng.nextFloat() * 100);
  for (const c of commands) sim.submit(c);
  sim.step(ticks);
  return sim;
}

describe('Determinismo (ADR-0003)', () => {
  const cmds = () => [
    setCriterion('economy.foodAbundance', 0.3, 'admin', 100),
    setCriterion('climate.baseTemperatureC', 40, 'admin', 500),
  ];

  it('misma seed + mismos comandos ⇒ mismo hash', () => {
    expect(run(1, 2000, cmds()).hash()).toBe(run(1, 2000, cmds()).hash());
  });

  it('seeds distintas ⇒ hash distinto', () => {
    expect(run(1, 100).hash()).not.toBe(run(2, 100).hash());
  });

  it('comandos distintos ⇒ hash distinto', () => {
    expect(run(1, 1000, cmds()).hash()).not.toBe(run(1, 1000).hash());
  });

  it('snapshot + restore + continuar == ejecución continua', () => {
    const full = run(5, 1500, cmds());

    const half = run(5, 300, cmds());
    const snap = JSON.parse(JSON.stringify(half.snapshot()));
    // El comando del tick 500 aún está pendiente: viaja dentro del snapshot.
    expect(snap.pendingCommands).toHaveLength(1);
    const resumed = Simulation.restore(half.manifest, snap, half.commandLog());
    resumed.step(1200);

    expect(resumed.tick).toBe(1500);
    expect(resumed.hash()).toBe(full.hash());
  });

  it('replay desde el tick 0 con el log reproduce el estado', () => {
    const original = run(9, 800, cmds());
    const replay = Simulation.restore(original.manifest, run(9, 0).snapshot(), original.commandLog());
    replay.step(800);
    expect(replay.hash()).toBe(original.hash());
  });

  it('restore rechaza un snapshot manipulado', () => {
    const snap = run(3, 10).snapshot();
    snap.criteria['economy.foodAbundance'] = 0.01;
    expect(() => Simulation.restore(run(3, 0).manifest, snap)).toThrow(/hash/);
  });

  it('restore no duplica comandos que están a la vez en el snapshot y en el log', () => {
    // Mismos sobres (mismos ids) en ambas ejecuciones, como en un mundo real.
    const commands = cmds();
    const full = run(4, 1000, commands);
    const early = run(4, 200, commands);
    const snap = early.snapshot();
    // Un host que guarda el log completo al final lo pasará entero junto al snapshot antiguo.
    const resumed = Simulation.restore(early.manifest, snap, full.commandLog());
    resumed.step(800);
    expect(resumed.commandLog()).toHaveLength(2);
    expect(resumed.hash()).toBe(full.hash());
  });
});
