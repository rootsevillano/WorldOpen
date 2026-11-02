import { describe, expect, it } from 'vitest';
import { Action, Simulation, SYNTHETIC_REGION, countDwellings, createManifest, neighbourTowns, syntheticBounds, syntheticMap, type TownSide } from '../../src';
import { festivalVenues } from '../../src/agents/festival';
import { startAction } from '../../src/agents/systems';
import { housePrice, housingDaily } from '../../src/agents/housing';
import { dailyWageAt, hireAt, openings, positionsOf, rentIndex, rentNow, townRentIndices, townSizeShares, townWageIndices } from '../../src/agents/money';
import { hostal } from '../../src/agents/transit';
import { metric } from '../../src/metrics';
import { JAMMED_BELOW, jamFactor, linkTraffic } from '../../src/agents/vehicles';
import { busStops } from '../../src/agents/transit';

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
    const staff = openings(world).staff;
    const target = businesses.find((b) => map.townOfBuilding[b] === 1 && staff[b]! + 1 < positionsOf(world, b))!;
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

  it('salarios por pueblo: los negocios de los pueblos grandes pagan más y se elige el trabajo por jornal neto (ADR-0042)', () => {
    // Un solo pueblo: todos los negocios empiezan en 1.
    const one = new Simulation(createManifest({ worldId: 'w', createdAt: 'x', seed: 3, criteria: { 'society.initialPopulation': 300 } }));
    const ob = one.world.map.byUse;
    expect([...ob.retail, ...ob.agriculture, ...ob.industrial].every((b) => one.world.buildings.wage[b] === 1)).toBe(true);

    // Con vecinos mayores que el primero, el primero empieza pagando menos (0,8× … 1× según su tamaño).
    const regions = neighbours('east', 4 * countDwellings(syntheticMap(3, SYNTHETIC_REGION)));
    const sim = new Simulation(createManifest({ worldId: 'w', createdAt: 'x', seed: 3, regions: [SYNTHETIC_REGION, ...regions], criteria: { 'society.initialPopulation': 900 } }));
    const world = sim.world;
    const map = world.map;
    const size = townSizeShares(world);
    expect(Math.max(...size)).toBe(1);
    for (const b of [...map.byUse.retail, ...map.byUse.agriculture, ...map.byUse.industrial]) {
      expect(world.buildings.wage[b]).toBeCloseTo(0.8 + 0.2 * size[map.townOfBuilding[b]!]!, 5);
    }
    const wages = townWageIndices(world);
    expect(wages[0]!).toBeLessThan(Math.max(...wages));

    // Dos puestos libres: uno cerca y otro lejos que paga mucho más. Se va al que deja más jornal neto.
    const a = world.agents;
    const bs = world.buildings;
    const businesses = [...map.byUse.retail, ...map.byUse.agriculture, ...map.byUse.industrial];
    for (const b of businesses) bs.cash[b] = 0;
    const i = Array.from({ length: a.count }, (_, k) => k).find((k) => a.age[k]! >= 20 && a.age[k]! < 60 && map.townOfBuilding[a.home[k]!] === 0 && a.location[k] === a.home[k])!;
    const h = map.buildings[a.home[i]!]!.centroid;
    const dist = (b: number) => Math.hypot(map.buildings[b]!.centroid.x - h.x, map.buildings[b]!.centroid.z - h.z);
    const near = businesses.filter((b) => map.townOfBuilding[b] === 0).sort((x, y) => dist(x) - dist(y))[0]!;
    const far = businesses.filter((b) => map.townOfBuilding[b] === 2)[0]!;
    bs.cash[near] = 1e7;
    bs.cash[far] = 1e7;
    a.occupation[i] = 0;
    a.workplace[i] = -1;
    bs.wage[near] = 0.7;
    bs.wage[far] = 1.5;
    sim.step(1);
    expect(dailyWageAt(world, far) - (2 * dist(far) * 2) / 1000).toBeGreaterThan(dailyWageAt(world, near) - (2 * dist(near) * 2) / 1000);
    startAction(world, i, Action.SeekJob, a.home[i]!);
    expect(a.target[i]).toBe(far);
    // Con el mismo jornal, el cercano.
    bs.wage[far] = 0.7;
    a.searchedDay[i] = 0;
    startAction(world, i, Action.SeekJob, a.home[i]!);
    expect(a.target[i]).toBe(near);
  });

  it('cambiar a mejor trabajo: quien trabaja va a pedir un puesto con más jornal neto y deja el suyo (ADR-0043)', () => {
    const sim = threeTowns();
    const world = sim.world;
    const map = world.map;
    const a = world.agents;
    const bs = world.buildings;
    const businesses = [...map.byUse.retail, ...map.byUse.agriculture, ...map.byUse.industrial];
    for (const b of businesses) bs.cash[b] = 0;
    const i = Array.from({ length: a.count }, (_, k) => k).find((k) => a.workplace[k]! >= 0 && a.occupation[k] !== 6 && businesses.includes(a.workplace[k]!))!;
    const from = a.workplace[i]!;
    const staff = openings(world).staff;
    const better = businesses.find((b) => b !== from && staff[b]! + 1 < positionsOf(world, b))!;
    bs.cash[better] = 1e7;
    bs.wage[better] = 1.5;
    bs.wage[from] = 0.7;
    sim.step(1);
    startAction(world, i, Action.SeekJob, a.home[i]!);
    expect(a.target[i]).toBe(better);
    expect(hireAt(world, i, better)).toBe(true);
    expect(a.workplace[i]).toBe(better);
    const e = sim.drainEvents().find((x) => x.type === 'job.changed' && (x.data as { agentId: number }).agentId === a.ids[i]);
    expect((e?.data as { from: string }).from).toBe(map.buildings[from]!.id);
    expect(['ownTown', 'otherTown']).toContain((e?.data as { search: string }).search);
  });

  it('procesión del día grande y fuegos de la última noche, en cada pueblo; deterministas al restaurar (ADR-0044)', () => {
    const m = createManifest({
      worldId: 'w', createdAt: 'x', seed: 3,
      regions: [SYNTHETIC_REGION, ...neighbours().slice(0, 1)],
      time: { minutesPerTick: 5, start: { year: 1, month: 8, day: 16, hour: 10, minute: 0 } },
      criteria: { 'society.initialPopulation': 400 },
    });
    const sim = new Simulation(m);
    const a = sim.world.agents;
    sim.step(12 * 2 + 2); // 12:10
    const marching = () => Array.from({ length: a.count }, (_, k) => k).filter((k) => a.action[k] === Action.Procession && a.location[k]! < 0 && a.paths[k] === null);
    const now = marching();
    expect(now.length).toBeGreaterThan(20);
    const f = sim.frame();
    expect(f.pasoCount).toBe(2);
    // Desfilan por la calle (fuera de casa, sin trayecto propio), en filas cerca del paso de su pueblo.
    for (const i of now) expect(a.flags[i]).toBe(0);
    // Restaurar en mitad de la procesión da el mismo mundo.
    const half = Simulation.restore(m, JSON.parse(JSON.stringify(sim.snapshot())), sim.commandLog());
    sim.step(24);
    half.step(24);
    expect(half.hash()).toBe(sim.hash());
    expect(marching()).toHaveLength(0);
    expect(sim.frame().pasoCount).toBe(0);
    // Fuegos: la noche del 18 al 19, de 00:00 a 00:30, en las dos plazas.
    while (!(sim.frame().date.day === 19 && sim.frame().date.hour === 0 && sim.frame().date.minute === 10)) sim.step(1);
    expect(sim.frame().fireworkCount).toBe(2);
    sim.step(6);
    expect(sim.frame().fireworkCount).toBe(0);
  });

  it('atascos en la carretera comarcal: muchos coches en un tramo van más despacio y se marcan (ADR-0045)', () => {
    expect(jamFactor(0, 1500)).toBe(1);
    expect(jamFactor(9, 1500)).toBeGreaterThan(0.8);
    expect(jamFactor(20, 1500)).toBeLessThan(JAMMED_BELOW);
    expect(jamFactor(500, 1500)).toBeCloseTo(0.15, 6);
    const sim = threeTowns(300);
    const world = sim.world;
    const map = world.map;
    const a = world.agents;
    const [p, q] = map.links[0]!;
    const px = map.nodeX[p]!;
    const pz = map.nodeZ[p]!;
    const dx = map.nodeX[q]! - px;
    const dz = map.nodeZ[q]! - pz;
    // 30 coches repartidos por el primer tramo, hacia el otro pueblo.
    const drivers = Array.from({ length: a.count }, (_, k) => k).filter((k) => a.age[k]! >= 18).slice(0, 30);
    drivers.forEach((i, n) => {
      const t = 0.1 + (0.8 * n) / drivers.length;
      a.positions[i * 3] = px + dx * t;
      a.positions[i * 3 + 2] = pz + dz * t;
      a.driving[i] = 1;
      a.location[i] = -1;
      a.flags[i] = 2;
      a.paths[i] = Float64Array.from([map.nodeX[q]!, map.nodeZ[q]!]);
      a.pathPos[i] = 0;
      a.target[i] = map.towns[1]!.homes[0]!;
    });
    const traffic = linkTraffic(world);
    expect(traffic.cars[0]).toBe(30);
    expect(traffic.factor[0]!).toBeLessThan(JAMMED_BELOW);
    const before = drivers.map((i) => a.positions[i * 3]!);
    sim.step(1);
    expect(drivers.filter((i) => a.flags[i]! & 4).length).toBeGreaterThan(20);
    expect(sim.drainEvents().some((e) => e.type === 'traffic.jam')).toBe(true);
    // Avanzan menos de lo normal (400 m/min × 10 min sin atasco).
    const moved = drivers.map((i, k) => Math.abs(a.positions[i * 3]! - before[k]!));
    expect(Math.max(...moved)).toBeLessThan(400 * 10 * JAMMED_BELOW);
    // Una marquesina por pueblo, junto al final de su carretera.
    const stops = busStops(world);
    expect(stops.headings).toHaveLength(3);
  });
});

