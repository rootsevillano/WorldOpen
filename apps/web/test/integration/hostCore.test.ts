import { PROTOCOL_VERSION, type EngineToHost } from '@worldopen/contracts';
import { createManifest } from '@worldopen/engine';
import { MemoryWorldStore } from '@worldopen/store';
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
    expect(of('events').flatMap((m) => m.events).find((e) => e.type === 'criteria.changed')).toMatchObject({ type: 'criteria.changed', data: { value: 1 } });
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

describe('Persistencia en el host (ADR-0004)', () => {
  const godCmd = (id: string, value: number) => ({
    type: 'command' as const,
    envelope: { id, type: 'criteria.set', version: 1, issuer: { userId: 'god', role: 'admin' as const }, payload: { key: 'society.sociability', value } },
  });

  it('guarda cada día y al pausar; reabrir el mundo reproduce el mismo estado', async () => {
    const store = new MemoryWorldStore();
    const out: EngineToHost[] = [];
    let clock = 0;
    const core = new EngineHostCore((m) => out.push(m), () => clock, store);
    const m = createManifest({ worldId: 'w-saved', createdAt: '2026-01-01T00:00:00Z', seed: 3 });
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest: m });
    core.handle(godCmd('c1', 0.9));
    core.handle({ type: 'control', action: 'setSpeed', ticksPerSecond: 600 });
    core.handle({ type: 'control', action: 'play' });
    for (let k = 0; k < 400; k++) {
      clock += 10;
      core.pump(clock); // 4 s × 600 ticks/s ≈ 2400 ticks: cruza un día
    }
    core.handle({ type: 'control', action: 'pause' });
    await core.flush();
    const status = out.filter((x) => x.type === 'status').at(-1)!;
    const tick = status.type === 'status' ? status.status.tick : -1;
    expect((await store.listWorlds())[0]).toMatchObject({ worldId: 'w-saved', status: 'paused', lastTick: tick });
    expect(await store.readCommands('w-saved')).toHaveLength(1);

    core.handle({ type: 'query', requestId: 'h', query: { kind: 'snapshot' } });
    const original = out.filter((x) => x.type === 'queryResult').at(-1)!;

    const out2: EngineToHost[] = [];
    const reopened = new EngineHostCore((x) => out2.push(x), () => 0, store);
    reopened.handle({ type: 'load', protocol: PROTOCOL_VERSION, worldId: 'w-saved' });
    await reopened.flush();
    expect(out2.find((x) => x.type === 'ready')).toMatchObject({ worldId: 'w-saved', tick });
    reopened.handle({ type: 'query', requestId: 'h2', query: { kind: 'snapshot' } });
    const restored = out2.filter((x) => x.type === 'queryResult').at(-1)!;
    expect(restored.type === 'queryResult' && (restored.result as { hash: number }).hash).toBe(
      original.type === 'queryResult' && (original.result as { hash: number }).hash,
    );
  });

  it('terminar el mundo lo deja en solo lectura', async () => {
    const store = new MemoryWorldStore();
    const out: EngineToHost[] = [];
    const core = new EngineHostCore((m) => out.push(m), () => 0, store);
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest: createManifest({ worldId: 'w-end', createdAt: '2026-01-01T00:00:00Z', seed: 1 }) });
    core.handle({ type: 'step', ticks: 30 });
    core.handle({ type: 'end' });
    await core.flush();
    core.handle(godCmd('late', 0.1));
    expect(out.find((m) => m.type === 'commandRejected')).toMatchObject({ reason: 'read_only' });
    expect((await store.listWorlds())[0]).toMatchObject({ status: 'ended', lastTick: 30 });

    const out2: EngineToHost[] = [];
    const viewer = new EngineHostCore((x) => out2.push(x), () => 0, store);
    viewer.handle({ type: 'load', protocol: PROTOCOL_VERSION, worldId: 'w-end' });
    await viewer.flush();
    const st = out2.filter((m) => m.type === 'status').at(-1);
    expect(st?.type === 'status' && st.status).toMatchObject({ readOnly: true, worldStatus: 'ended', tick: 30 });
  });
});
