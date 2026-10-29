import { describe, expect, it } from 'vitest';
import { NavMap, SYNTHETIC_REGION, atan2, headingOf, syntheticMap } from '../../src';

describe('atan2 determinista', () => {
  it('aproxima Math.atan2 con error < 1e-4 rad en todos los cuadrantes', () => {
    let worst = 0;
    for (let k = 0; k < 2000; k++) {
      const a = (k / 2000) * 2 * Math.PI;
      const y = Math.sin(a) * (1 + (k % 7));
      const x = Math.cos(a) * (1 + (k % 7));
      worst = Math.max(worst, Math.abs(atan2(y, x) - Math.atan2(y, x)));
    }
    expect(worst).toBeLessThan(1e-4);
    expect(atan2(0, 0)).toBe(0);
  });

  it('rumbo: 0 hacia +X (Este), π/2 hacia −Z (Norte)', () => {
    expect(headingOf(1, 0)).toBeCloseTo(0, 4);
    expect(headingOf(0, -1)).toBeCloseTo(Math.PI / 2, 4);
  });
});

describe('Mapa sintético', () => {
  const map = syntheticMap(42, SYNTHETIC_REGION);

  it('es determinista y depende de la semilla', () => {
    expect(syntheticMap(42, SYNTHETIC_REGION)).toEqual(map);
    expect(syntheticMap(43, SYNTHETIC_REGION).buildings.map((b) => b.use)).not.toEqual(map.buildings.map((b) => b.use));
  });

  it('5×5 manzanas: 100 edificios, 36 cruces, 60 tramos; ids opacos con prefijo de región', () => {
    expect(map.buildings).toHaveLength(100);
    expect(map.streets.nodes).toHaveLength(36);
    expect(map.streets.edges).toHaveLength(60);
    expect(map.buildings.every((b) => /^r1-b\d{4}$/.test(b.id))).toBe(true);
    expect(map.buildings.some((b) => b.use === 'residential' && b.dwellings > 0)).toBe(true);
    expect(map.buildings.some((b) => b.use === 'retail' || b.use === 'publicServices')).toBe(true);
  });

  it('respeta el desplazamiento de la región (multi-localidad)', () => {
    const moved = syntheticMap(42, { ...SYNTHETIC_REGION, id: 'r2', offset: { x: 1000, z: 0 } });
    expect(moved.bounds.minX - map.bounds.minX).toBe(1000);
    expect(moved.buildings[0]!.id.startsWith('r2-')).toBe(true);
  });

  it('nombres de calle ficticios', () => {
    for (const e of map.streets.edges) expect(e.name).toMatch(/^(Calle|Avenida|Paseo|Callejón) [A-Z][a-zñáéíóú]+$/);
  });
});

describe('NavMap', () => {
  const nav = new NavMap([syntheticMap(1, SYNTHETIC_REGION)]);

  it('A* devuelve la ruta Manhattan más corta en la cuadrícula', () => {
    const path = nav.nodePath(0, 35)!;
    expect(path[0]).toBe(0);
    expect(path.at(-1)).toBe(35);
    expect(path).toHaveLength(11); // 5 + 5 tramos
  });

  it('las rutas entre edificios empiezan en la entrada y acaban dentro del destino', () => {
    const from = nav.homes[0]!;
    const to = nav.venues[0]!;
    const r = nav.route(0, 0, from, to)!;
    const src = nav.buildings[from]!.entrances[0]!;
    const dst = nav.buildings[to]!.centroid;
    expect([r[0], r[1]]).toEqual([src.x, src.z]);
    expect([r.at(-2), r.at(-1)]).toEqual([dst.x, dst.z]);
  });

  it('rechaza grafos con nodos inexistentes', () => {
    const bad = syntheticMap(1, SYNTHETIC_REGION);
    bad.streets.edges.push({ id: 999, from: 0, to: 12345, lengthM: 1, kind: 'track', oneway: false, name: null });
    expect(() => new NavMap([bad])).toThrow();
  });
});
