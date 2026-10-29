import type { EngineToHost } from '@worldopen/contracts';
import { createManifest, Simulation } from '@worldopen/engine';
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../src/codec';

describe('Códec del protocolo (WebSocket)', () => {
  it('conserva los arrays tipados de un RenderFrame bit a bit', () => {
    const sim = new Simulation(createManifest({ worldId: 'c', createdAt: 'x', seed: 3, criteria: { 'society.initialPopulation': 40 } }));
    sim.step(500);
    const frame = sim.frame();
    const back = decode<EngineToHost>(encode({ type: 'frame', frame }));
    expect(back.type).toBe('frame');
    if (back.type !== 'frame') return;
    expect(back.frame.agentPositions).toBeInstanceOf(Float32Array);
    expect(Array.from(back.frame.agentPositions)).toEqual(Array.from(frame.agentPositions));
    expect(Array.from(back.frame.agentIds)).toEqual(Array.from(frame.agentIds));
    expect(Array.from(back.frame.buildingStates)).toEqual(Array.from(frame.buildingStates));
    expect(back.frame.date).toEqual(frame.date);
  });

  it('subarrays y arrays grandes', () => {
    const big = new Float32Array(100_000).map((_, i) => i * 0.5);
    const sub = new Uint32Array([1, 2, 3, 4, 5]).subarray(1, 4);
    const back = decode<{ big: Float32Array; sub: Uint32Array }>(encode({ big, sub }));
    expect(back.big[99_999]).toBe(49_999.5);
    expect(Array.from(back.sub)).toEqual([2, 3, 4]);
  });

  it('rechaza tipos desconocidos', () => {
    expect(() => decode('{"x":{"$typed":"BigInt64Array","b64":""}}')).toThrow();
  });
});
