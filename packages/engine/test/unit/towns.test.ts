import { describe, expect, it } from 'vitest';
import { Action, Simulation, SYNTHETIC_REGION, countDwellings, createManifest, neighbourTowns, syntheticBounds, syntheticMap, type TownSide } from '../../src';
import { festivalVenues } from '../../src/agents/festival';
import { startAction } from '../../src/agents/systems';
import { housePrice, housingDaily } from '../../src/agents/housing';
import { hireAt, openings, rentIndex, rentNow, townRentIndices } from '../../src/agents/money';
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

  it('mudanzas entre pueblos: el hogar entero cambia de pueblo y los niños, de colegio (ADR-0038)', () => {
    const sim = threeTowns(800, { 'society.townMigration': 10 });
    const map = sim.world.map;
    const a = sim.world.agents;
    const moved: { home: string; to: string; reason: string }[] = [];
    for (let d = 0; d < 30; d++) {
      sim.step(144);
      for (const e of sim.drainEvents()) if (e.type === 'household.relocated') moved.push(e.data as { home: string; to: string; reason: string });
    }
    expect(moved.length).toBeGreaterThan(0);
    for (const m of moved) {
      const b = map.buildings.findIndex((x) => x.id === m.home);
      const town = map.townOfBuilding[b]!;
      expect(sim.world.townNames[town]).toBe(m.to);
      for (let i = 0; i < a.count; i++) {
        if (a.home[i] !== b || a.occupation[i] !== 6) continue;
        expect(map.townOfBuilding[a.workplace[i]!]).toBe(town);
      }
    }
    // Un solo pueblo: nadie se muda entre pueblos.
    const one = new Simulation(createManifest({ worldId: 'w', createdAt: 'x', seed: 3, criteria: { 'society.initialPopulation': 300, 'society.townMigration': 10 } }));
    one.step(144 * 5);
    expect(one.drainEvents().some((e) => e.type === 'household.relocated')).toBe(false);
  });

  it('precios por pueblo: el alquiler y la vivienda se pagan al precio del pueblo (ADR-0040)', () => {
    // Un solo pueblo: el índice de siempre.
    const one = new Simulation(createManifest({ worldId: 'w', createdAt: 'x', seed: 3, criteria: { 'society.initialPopulation': 300 } }));
    expect(townRentIndices(one.world)).toEqual([rentIndex(one.world)]);
    expect(rentIndex(one.world, 0)).toBe(rentIndex(one.world));

    const sim = threeTowns();
    const world = sim.world;
    const map = world.map;
    const a = world.agents;
    const index = townRentIndices(world);
    expect(index).toHaveLength(3);
    // Ocupación de sus viviendas por sus hogares × recargo por tamaño (0,6× … 1× el mayor).
    const dwellings = map.towns.map((t) => t.homes.reduce((n, h) => n + Math.max(1, map.buildings[h]!.dwellings), 0));
    const households = map.towns.map((_, t) => new Set(Array.from({ length: a.count }, (_, k) => k).filter((k) => a.occupation[k] !== 9 && map.townOfBuilding[a.home[k]!] === t).map((k) => a.household[k]!)).size);
    for (let t = 0; t < 3; t++) {
      const occupancy = Math.min(2.5, Math.max(0.6, 1 + 2 * (households[t]! / dwellings[t]! - 0.9)));
      expect(index[t]!).toBeCloseTo(occupancy * (0.6 + (0.4 * dwellings[t]!) / Math.max(...dwellings)), 9);
    }
    expect(Number(metric(sim, `town.${map.towns[1]!.regionId}.housePrice`))).toBeCloseTo(housePrice(world, index[1]), 6);
    // Cada hogar de alquiler paga el alquiler de su pueblo.
    const pool = new Map<number, [number, number]>();
    for (let i = 0; i < a.count; i++) pool.set(a.household[i]!, [1e6, 0]);
    const renter = Array.from({ length: a.count }, (_, k) => k).find((k) => a.renting[k] && a.landlord[k] === 0 && map.townOfBuilding[a.home[k]!] === 2)!;
    housingDaily(world, pool);
    expect(1e6 - pool.get(a.household[renter]!)![0]).toBeCloseTo(rentNow(world, index[2]), 6);
  });

  it('buscar trabajo: si en su pueblo no hay puestos libres, va a pedirlo a otro pueblo y le contratan (ADR-0041)', () => {
    const sim = threeTowns();
    const world = sim.world;
    const map = world.map;
    const a = world.agents;
    const bs = world.buildings;
    // Un lunes laborable a las 09:00, con caja de sobra solo en un negocio del pueblo 1.
    while (!(Math.floor(world.tick / 144) % 7 === 0 && world.tick % 144 === 54)) sim.step(1);
    const businesses = [...map.byUse.retail, ...map.byUse.agriculture, ...map.byUse.industrial];
    for (const b of businesses) bs.cash[b] = 0;
    const target = businesses.find((b) => map.townOfBuilding[b] === 1)!;
    bs.cash[target] = 1e7;
    const i = Array.from({ length: a.count }, (_, k) => k).find((k) => a.age[k]! >= 20 && a.age[k]! < 60 && map.townOfBuilding[a.home[k]!] === 0 && a.location[k] === a.home[k])!;
    a.occupation[i] = 0;
    a.workplace[i] = -1;
    sim.step(1);
    expect(openings(world).open).toEqual([target]);
    startAction(world, i, Action.SeekJob, a.home[i]!);
    expect(a.target[i]).toBe(target);
    expect(a.searchedDay[i]).toBeGreaterThan(0);
    expect(hireAt(world, i, target)).toBe(true);
    expect(a.workplace[i]).toBe(target);
    expect(a.occupation[i]).not.toBe(0);
    expect(sim.drainEvents().some((e) => e.type === 'job.hired' && (e.data as { search?: string }).search === 'otherTown')).toBe(true);
  });
});

