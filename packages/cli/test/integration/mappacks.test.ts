import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION, type EngineToHost, type MapLogic } from '@worldopen/contracts';
import { SYNTHETIC_REGION, Simulation, createManifest, parseMapPack, syntheticMap } from '@worldopen/engine';
import { EngineHostCore } from '@worldopen/host';
import { MemoryWorldStore } from '@worldopen/store';
import { describe, expect, it } from 'vitest';
import { fileMapResolver, installMapPack, listMapPacks, loadRegion, regionFor } from '../../src/mappacks';
import { createSimulation } from '../../src/simulate';

/** Map-pack de prueba con el formato real, hecho a partir del mapa sintético (la CI no tiene el pack real). */
function writeFixturePack(root: string, version = '0.0.1'): string {
  const logic: MapLogic = syntheticMap(9, SYNTHETIC_REGION);
  const dir = join(root, `prueba-${version}`);
  mkdirSync(join(dir, 'logic'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, id: 'prueba', version, displayName: 'Villaprueba',
    crs: { frame: 'local', axes: 'X=East,Y=Up,Z=-North', units: 'm' }, bounds: logic.bounds,
    logic: { buildings: 'logic/buildings.json', streets: 'logic/streets.json' }, render: {}, attribution: [],
  }));
  writeFileSync(join(dir, 'logic/buildings.json'), JSON.stringify(logic.buildings));
  writeFileSync(join(dir, 'logic/streets.json'), JSON.stringify(logic.streets));
  return dir;
}

const texts = (dir: string) => ({
  manifest: readFileSync(join(dir, 'manifest.json'), 'utf8'),
  buildings: readFileSync(join(dir, 'logic/buildings.json'), 'utf8'),
  streets: readFileSync(join(dir, 'logic/streets.json'), 'utf8'),
});

describe('Map-packs (ADR-0007, ADR-0017)', () => {
  const region = { id: 'r1', displayName: 'Villaprueba', mapPack: { id: 'prueba', version: '0.0.1' }, offset: { x: 0, z: 0 } };

  it('lee un map-pack válido y lo desplaza por el offset de la región', () => {
    const dir = writeFixturePack(mkdtempSync(join(tmpdir(), 'wo-mp-')));
    const logic = parseMapPack(region, texts(dir));
    expect(logic.buildings).toHaveLength(100);
    const moved = parseMapPack({ ...region, id: 'r2', offset: { x: 5000, z: 0 } }, {
      ...texts(dir), buildings: texts(dir).buildings.replaceAll('"r1-', '"r2-'),
    });
    expect(moved.buildings[0]!.centroid.x - logic.buildings[0]!.centroid.x).toBe(5000);
    expect(moved.streets.nodes[0]!.id).toBe(1_000_000);
  });

  it('rechaza origen absoluto, rastros reales, prefijos ajenos y esquemas desconocidos', () => {
    const t = texts(writeFixturePack(mkdtempSync(join(tmpdir(), 'wo-mp-'))));
    const m = JSON.parse(t.manifest);
    expect(() => parseMapPack(region, { ...t, manifest: JSON.stringify({ ...m, crs: { ...m.crs, origin: { e: 1, n: 2 } } }) })).toThrow(/origen/);
    expect(() => parseMapPack(region, { ...t, manifest: JSON.stringify({ ...m, schemaVersion: 9 }) })).toThrow(/esquema/);
    expect(() => parseMapPack(region, { ...t, buildings: t.buildings.replace('"use":"residential"', '"use":"residential","ref":"5932833QB5353S"') })).toThrow(/reales/);
    expect(() => parseMapPack(region, { ...t, streets: t.streets.replace('"name":"', '"name":"Calle de Almensilla ') })).toThrow(/reales/);
    expect(() => parseMapPack({ ...region, id: 'r7' }, t)).toThrow(/prefijo/);
    expect(() => parseMapPack({ ...region, mapPack: { id: 'otro', version: '1' } }, t)).toThrow(/Se esperaba/);
  });

  it('install valida y list enumera; simulate y el resolvedor del host usan el pack instalado', async () => {
    const src = writeFixturePack(mkdtempSync(join(tmpdir(), 'wo-src-')));
    const installed = mkdtempSync(join(tmpdir(), 'wo-inst-'));
    installMapPack(src, installed);
    expect(listMapPacks(installed).map((m) => `${m.id}-${m.version}`)).toEqual(['prueba-0.0.1']);
    expect(regionFor(installed, 'prueba-0.0.1')).toMatchObject({ displayName: 'Villaprueba', mapPack: { id: 'prueba' } });

    const a = createSimulation({ seed: 2, agents: 30, mapPack: 'prueba-0.0.1', mapPacksDir: installed });
    const b = createSimulation({ seed: 2, agents: 30, mapPack: 'prueba-0.0.1', mapPacksDir: installed });
    a.step(1500);
    b.step(1500);
    expect(a.hash()).toBe(b.hash());
    expect(a.manifest.regions[0]!.mapPack).toEqual({ id: 'prueba', version: '0.0.1' });

    // Host con resolvedor: init asíncrono, guardado y replay con el mismo mapa.
    const store = new MemoryWorldStore();
    const out: EngineToHost[] = [];
    const core = new EngineHostCore((m) => out.push(m), () => 0, store, { resolveMaps: fileMapResolver(installed) });
    const manifest = createManifest({ worldId: 'w-mp', createdAt: '2026-01-01T00:00:00Z', seed: 2, regions: [regionFor(installed, 'prueba-0.0.1')], criteria: { 'society.initialPopulation': 30 } });
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
    await core.flush();
    expect(out.find((m) => m.type === 'ready')).toMatchObject({ worldId: 'w-mp' });
    core.handle({ type: 'step', ticks: 1500 });
    core.handle({ type: 'end' });
    await core.flush();
    const ref = new Simulation(manifest, { maps: { r1: loadRegion(installed, manifest.regions[0]!) } });
    ref.step(1500);
    expect((await store.getSnapshot('w-mp'))!.hash).toBe(ref.hash());
  });

  it('un host sin resolvedor rechaza mundos con map-pack', async () => {
    const out: EngineToHost[] = [];
    const core = new EngineHostCore((m) => out.push(m), () => 0);
    core.handle({ type: 'init', protocol: PROTOCOL_VERSION, manifest: createManifest({ worldId: 'x', createdAt: 'x', seed: 1, regions: [region] }) });
    await core.flush();
    expect(out.find((m) => m.type === 'error')).toMatchObject({ message: expect.stringMatching(/map-packs/) });
  });
});
