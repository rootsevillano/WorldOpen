import { PROTOCOL_VERSION, type EngineToHost } from '@worldopen/contracts';
import { createManifest } from '@worldopen/engine';
import { describe, expect, it } from 'vitest';
import { EngineHostCore } from '../../src/engine-host/hostCore';

const manifest = createManifest({ worldId: 'w-test', createdAt: '2026-01-01T00:00:00Z', seed: 1 });

function setup() {
  const out: EngineToHost[] = [];
  let clock = 0;
  const core = new EngineHostCore((m) => out.push(m), () => clock);
  const of = <T extends EngineToHost['type']>(t: T) => out.filter((m): m is Extract<EngineToHost, { type: T }> => m.type === t);
  return { core, out, of, advance: (ms: number) => { clock += ms; core.pump(clock); } };
}

describe('Simulation Protocol — EngineHostCore', () => {
  it('init ⇒ ready + frame + status, en pausa', () => {
    const { core, of } = setup();
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
    expect(of('ready')[0]).toMatchObject({ worldId: 'w-test', tick: 0 });
    expect(of('frame')).toHaveLength(1);
    expect(of('status')[0]!.status).toMatchObject({ running: false, tick: 0 });
  });

  it('rechaza un protocolo incompatible y mensajes antes de init', () => {
    const { core, of } = setup();
    core.handle({ type: 'step', ticks: 1 });
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION + 1, manifest });
    expect(of('error')).toHaveLength(2);
    expect(of('ready')).toHaveLength(0);
  });

  it('a 1× avanza ~1 tick por segundo real; a 20× ~20', () => {
    const { core, of, advance } = setup();
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
    core.handle({ type: 'control', action: 'play' });
    advance(0);
    for (let i = 0; i < 100; i++) advance(30); // 3 s
    expect(of('frame').at(-1)!.frame.tick).toBe(3);

    core.handle({ type: 'control', action: 'setSpeed', ticksPerSecond: 20 });
    for (let i = 0; i < 100; i++) advance(10); // 1 s
    expect(of('frame').at(-1)!.frame.tick).toBeGreaterThanOrEqual(22);
    expect(of('frame').at(-1)!.frame.tick).toBeLessThanOrEqual(23);
  });

  it('pausa detiene el tiempo; step avanza en pausa', () => {
    const { core, of, advance } = setup();
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
    for (let i = 0; i < 50; i++) advance(100);
    expect(of('status').at(-1)!.status.tick).toBe(0);
    core.handle({ type: 'step', ticks: 60 });
    expect(of('frame').at(-1)!.frame).toMatchObject({ tick: 60, date: { hour: 7, minute: 0 } });
  });

  it('comandos: aceptado con su tick, rechazado para observadores, eventos publicados', () => {
    const { core, of } = setup();
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
    core.handle({ type: 'command', envelope: { id: 'a', type: 'criteria.set', version: 1, issuer: { userId: 'god', role: 'admin' }, payload: { key: 'society.sociability', value: 1 } } });
    core.handle({ type: 'command', envelope: { id: 'b', type: 'criteria.set', version: 1, issuer: { userId: 'guest', role: 'observer' }, payload: { key: 'society.sociability', value: 0 } } });
    core.handle({ type: 'step', ticks: 1 });
    expect(of('commandAccepted')).toEqual([{ type: 'commandAccepted', commandId: 'a', appliedAtTick: 0 }]);
    expect(of('commandRejected')[0]).toMatchObject({ commandId: 'b', reason: 'unauthorized' });
    expect(of('events')[0]!.events[0]).toMatchObject({ type: 'criteria.changed', data: { value: 1 } });
  });

  it('queries: catálogo, snapshot y log', () => {
    const { core, of } = setup();
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
    core.handle({ type: 'query', requestId: 'q1', query: { kind: 'catalog' } });
    core.handle({ type: 'query', requestId: 'q2', query: { kind: 'snapshot' } });
    const [cat, snap] = of('queryResult');
    expect(cat).toMatchObject({ requestId: 'q1', kind: 'catalog' });
    expect(snap).toMatchObject({ requestId: 'q2', kind: 'snapshot', result: { tick: 0 } });
  });

  it('modo max respeta el presupuesto por porción', () => {
    let clock = 0;
    const out: EngineToHost[] = [];
    // Cada lectura del reloj avanza 1 ms: la porción debe cortarse a los ~12 ms.
    const core = new EngineHostCore((m) => out.push(m), () => clock++);
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
    core.handle({ type: 'control', action: 'setSpeed', ticksPerSecond: 'max' });
    core.handle({ type: 'control', action: 'play' });
    core.pump(clock);
    core.handle({ type: 'step', ticks: 0 });
    const last = out.filter((m) => m.type === 'frame').at(-1);
    expect(last && last.type === 'frame' && last.frame.tick).toBeGreaterThan(0);
    expect(last && last.type === 'frame' && last.frame.tick).toBeLessThan(200);
  });
});
