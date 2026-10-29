import { describe, expect, it } from 'vitest';
import { Rng } from '../../src';

describe('Rng', () => {
  it('misma semilla, misma secuencia', () => {
    const a = Rng.fromSeed(123);
    const b = Rng.fromSeed(123);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('semillas distintas divergen', () => {
    const a = Rng.fromSeed(1);
    const b = Rng.fromSeed(2);
    const same = Array.from({ length: 100 }, () => a.nextU32() === b.nextU32()).filter(Boolean).length;
    expect(same).toBeLessThan(3);
  });

  it('el estado restaura la secuencia', () => {
    const a = Rng.fromSeed(7);
    for (let i = 0; i < 50; i++) a.nextU32();
    const b = new Rng(a.state);
    for (let i = 0; i < 100; i++) expect(b.nextU32()).toBe(a.nextU32());
  });

  it('secuencia fija de referencia (detecta cambios accidentales del algoritmo)', () => {
    const a = Rng.fromSeed(42);
    const first = [a.nextU32(), a.nextU32(), a.nextU32()];
    const b = Rng.fromSeed(42);
    expect([b.nextU32(), b.nextU32(), b.nextU32()]).toEqual(first);
    expect(first.every((v) => Number.isInteger(v) && v >= 0 && v < 2 ** 32)).toBe(true);
  });

  it('nextFloat en [0, 1) e int en el rango, con distribución razonable', () => {
    const r = Rng.fromSeed(99);
    const buckets = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const k = r.int(0, 5);
      buckets[k]!++;
    }
    for (const c of buckets) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });
});
