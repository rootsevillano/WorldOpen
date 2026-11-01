import { describe, expect, it } from 'vitest';
import { Action, Simulation, SYNTHETIC_REGION, countDwellings, createManifest, neighbourTowns, syntheticBounds, syntheticMap, type TownSide } from '../../src';
import { festivalVenues } from '../../src/agents/festival';
import { startAction } from '../../src/agents/systems';
import { hostal } from '../../src/agents/transit';
import { metric } from '../../src/metrics';

const neighbours = (side?: TownSide, dwellings = countDwellings(syntheticMap(3, SYNTHETIC_REGION))) =>
  neighbourTowns({ seed: 3, count: 2, bounds: syntheticBounds(SYNTHETIC_REGION), dwellings, taken: [SYNTHETIC_REGION.displayName], ...(side ? { side } : {}) });

const threeTowns = (population = 600, extra: Record<string, unknown> = {}) =>
  new Simulation(
    createManifest({
      worldId: 'w', createdAt: 'x', seed: 3,
      regions: [SYNTHETIC_REGION, ...neighbours()],
      time: { minutesPerTick: 10, start: { year: 1, month: 3, day: 21, hour: 6, minute: 0 } },
      criteria: { 'society.initialPopulation': population, ...extra },
    }),
  );

describe('Varios pueblos (ADR-0036)', () => {
  it('los pueblos vecinos son sintéticos, con nombre inventado y separados por la carretera comarcal', () => {
    const regions = neighbours();
    expect(regions.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(regions.every((r) => r.mapPack === null && /^\p{Lu}[\p{L} ]+$/u.test(r.displayName))).toBe(true);
    expect(regions[1]!.offset.x).toBeGreaterThan(regions[0]!.offset.x);
    const sim = threeTowns();
    expect(sim.world.map.towns).toHaveLength(3);
    expect(sim.world.map.links).toHaveLength(2);
    // Se puede ir de una casa del primer pueblo a un local del tercero.
    const map = sim.world.map;
    const home = map.towns[0]!.homes[0]!;
    const venue = map.towns[2]!.venues[0]!;
    expect(map.route(map.buildings[home]!.centroid.x, map.buildings[home]!.centroid.z, home, venue)).not.toBeNull();
    expect(sim.mapLogic().map((m) => m.regionId)).toEqual(['r1', 'r2', 'r3', 'comarcal']);
  });

  it('cada pueblo tiene vecinos, su parada, su hostal y su plaza; la escuela y el ocio son del propio pueblo', () => {
    const sim = threeTowns();
    const map = sim.world.map;
    const a = sim.world.agents;
    for (let t = 0; t < 3; t++) {
      const road = sim.world.busRoads[t]!;
      expect(road.town).toBe(t);
      expect(map.townOfBuilding[road.stopBuilding]).toBe(t);
      expect(map.townOfBuilding[hostal(sim.world, t)]).toBe(t);
      for (const v of festivalVenues(sim.world, t)) expect(map.townOfBuilding[v]).toBe(t);
      expect(Number(metric(sim, `town.r${t + 1}.population`))).toBeGreaterThan(0);
    }
    for (let i = 0; i < a.count; i++) {
      if (a.occupation[i] === 6) expect(map.townOfBuilding[a.workplace[i]!]).toBe(map.townOfBuilding[a.home[i]!]);
    }
    const i = Array.from({ length: a.count }, (_, k) => k).find((k) => a.age[k]! >= 18 && map.townOfBuilding[a.home[k]!] === 2)!;
    a.location[i] = a.home[i]!;
    startAction(sim.world, i, Action.GoOut, a.home[i]!);
    expect(map.townOfBuilding[a.target[i]!]).toBe(2);
  });

  it('hay quien trabaja en el pueblo de al lado; snapshot y restauración con varios pueblos (determinismo)', () => {
    const sim = threeTowns();
    expect(Number(metric(sim, 'agents.workInOtherTownRatio'))).toBeGreaterThan(0);
    const m = sim.manifest;
    const full = new Simulation(m);
    full.step(144);
    const half = new Simulation(m);
    half.step(72);
    const resumed = Simulation.restore(m, JSON.parse(JSON.stringify(half.snapshot())), half.commandLog());
    resumed.step(72);
    expect(resumed.hash()).toBe(full.hash());
  });

  it('los vecinos se dimensionan con las viviendas del primer pueblo y se colocan al lado elegido (ADR-0037)', () => {
    const real = 3000;
    const big = neighbours('east', real);
    for (const r of big) {
      const d = countDwellings(syntheticMap(3, r, { blocks: r.blocks! }));
      expect(d).toBeGreaterThanOrEqual(real * 0.35);
      expect(d).toBeLessThan(real * 0.95);
    }
    const first = syntheticBounds(SYNTHETIC_REGION);
    const [w] = neighbours('west');
    expect(syntheticBounds(w!).maxX).toBeLessThan(first.minX);
    const [n] = neighbours('north');
    expect(syntheticBounds(n!).maxZ).toBeLessThan(first.minZ);
    const [e, o] = neighbours('around');
    expect(e!.offset.x).toBeGreaterThan(first.maxX);
    expect(o!.offset.x).toBeLessThan(first.minX);
    // Alrededor: cada vecino se une al primer pueblo (el más cercano), no al otro vecino a través de él.
    const sim = new Simulation(createManifest({ worldId: 'w', createdAt: 'x', seed: 3, regions: [SYNTHETIC_REGION, e!, o!], criteria: { 'society.initialPopulation': 300 } }));
    const t = sim.world.map.townOfNode;
    expect(sim.world.map.links.map(([a, b]) => [t[a], t[b]])).toEqual([[0, 1], [0, 2]]);
    expect(new Set([SYNTHETIC_REGION.displayName, e!.displayName, o!.displayName]).size).toBe(3);
  });
});
