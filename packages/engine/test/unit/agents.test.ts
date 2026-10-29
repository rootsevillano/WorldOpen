import { AgentActivity, AgentFlag, type CommandEnvelope } from '@worldopen/contracts';
import { describe, expect, it } from 'vitest';
import { Action, Simulation, nightFactor, temperature } from '../../src';
import { manifest } from '../helpers';

const admin = { userId: 'god', role: 'admin' as const };
let n = 0;
const cmd = (type: string, payload: unknown): CommandEnvelope => ({ id: `a${n++}`, type, version: 1, issuer: admin, payload });

describe('Población', () => {
  it('crea la población inicial dentro de sus casas, con nombres ficticios', () => {
    const sim = new Simulation(manifest(3));
    const a = sim.world.agents;
    expect(a.count).toBe(5);
    for (let i = 0; i < a.count; i++) {
      expect(a.location[i]).toBe(a.home[i]);
      expect(a.flags[i]).toBe(AgentFlag.Indoors);
      expect(sim.world.map.buildings[a.home[i]!]!.use).toBe('residential');
      expect(a.names[i]).toMatch(/^[A-Z]\S+ [A-Z]\S+$/);
    }
  });

  it('agent.spawn y agent.remove', () => {
    const sim = new Simulation(manifest(3));
    const home = sim.world.map.buildings[sim.world.map.homes[0]!]!.id;
    expect(sim.submit(cmd('agent.spawn', { count: 3, homeBuildingId: home }))).toMatchObject({ ok: true });
    expect(sim.submit(cmd('agent.spawn', { count: 0 }))).toMatchObject({ ok: false, reason: 'invalid_payload' });
    expect(sim.submit(cmd('agent.spawn', { homeBuildingId: 'nope' }))).toMatchObject({ ok: false });
    sim.step();
    expect(sim.world.agents.count).toBe(8);
    const id = sim.world.agents.ids[7]!;
    sim.submit(cmd('agent.remove', { agentId: id }));
    sim.step();
    expect(sim.world.agents.count).toBe(7);
    expect(sim.world.agents.indexOf(id)).toBe(-1);
    expect(sim.drainEvents().map((e) => e.type)).toEqual(expect.arrayContaining(['agent.spawned', 'agent.removed']));
  });

  it('respeta la capacidad', () => {
    const sim = new Simulation(manifest(1), { agentCapacity: 6 });
    expect(sim.submit(cmd('agent.spawn', { count: 2 }))).toMatchObject({ ok: false });
  });
});

describe('Entorno', () => {
  it('noche y temperatura siguen la hora del día', () => {
    const sim = new Simulation(manifest(1, { criteria: { 'society.initialPopulation': 0 } }));
    // El mundo empieza a las 06:00.
    expect(nightFactor(sim.world)).toBe(1);
    expect(temperature(sim.world)).toBe(12);
    sim.step(9 * 60); // 15:00
    expect(nightFactor(sim.world)).toBe(0);
    expect(temperature(sim.world)).toBe(24);
    sim.step(8 * 60); // 23:00
    expect(nightFactor(sim.world)).toBe(1);
  });
});

describe('Agentes en marcha', () => {
  it('salen, recorren calles (posición continua) y vuelven a entrar en edificios', () => {
    const sim = new Simulation(manifest(7, { criteria: { 'society.initialPopulation': 20 } }));
    const a = sim.world.agents;
    let sawMoving = false;
    let maxJump = 0;
    const prev = new Map<number, [number, number]>();
    for (let t = 0; t < 1440; t++) {
      sim.step();
      for (let i = 0; i < a.count; i++) {
        const id = a.ids[i]!;
        const p: [number, number] = [a.positions[i * 3]!, a.positions[i * 3 + 2]!];
        const q = prev.get(id);
        if (q && a.paths[i]) maxJump = Math.max(maxJump, Math.hypot(p[0] - q[0], p[1] - q[1]));
        prev.set(id, p);
        if (a.activities[i] === AgentActivity.Moving) {
          sawMoving = true;
          expect(a.location[i]).toBe(-1);
          expect(a.flags[i]! & AgentFlag.Indoors).toBe(0);
        }
      }
    }
    expect(sawMoving).toBe(true);
    // Andando a 75 m/min (×1.3 si huye) nadie se teletransporta.
    expect(maxJump).toBeLessThanOrEqual(75 * 1.3 + 1e-3);
  });

  it('de noche duermen en casa', () => {
    const sim = new Simulation(manifest(11, { criteria: { 'society.initialPopulation': 30 } }));
    sim.step(19 * 60); // 01:00 del día siguiente
    const a = sim.world.agents;
    let sleeping = 0;
    for (let i = 0; i < a.count; i++) if (a.action[i] === Action.Sleep && a.location[i] === a.home[i]) sleeping++;
    expect(sleeping / a.count).toBeGreaterThan(0.8);
  });
});
