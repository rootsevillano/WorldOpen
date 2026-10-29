import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MapLogic, MapPackManifest, RegionRef, WorldManifest } from '@worldopen/contracts';
import { packKey, parseManifest, parseMapPack } from '@worldopen/engine';

/** Carpeta de map-packs instalados (ignorada por Git; D7: se distribuyen como Releases). */
export const DEFAULT_MAPPACKS_DIR = fileURLToPath(new URL('../../../data/map-packs', import.meta.url));

export function listMapPacks(dir = DEFAULT_MAPPACKS_DIR): MapPackManifest[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'manifest.json')))
    .sort()
    .map((d) => parseManifest(readFileSync(join(dir, d, 'manifest.json'), 'utf8')));
}

/** Copia un map-pack generado (p. ej. `almensilla-3d/data/export/mappack/<id>-<ver>`) a la carpeta de instalados. */
export function installMapPack(src: string, dir = DEFAULT_MAPPACKS_DIR): MapPackManifest {
  const manifest = parseManifest(readFileSync(join(src, 'manifest.json'), 'utf8'));
  const dest = join(dir, packKey(manifest));
  cpSync(resolve(src), dest, { recursive: true });
  // Se valida al instalar: si no pasa la anonimización ni el esquema, falla aquí y no al usarlo.
  loadRegion(dir, { id: 'r1', displayName: manifest.displayName, mapPack: { id: manifest.id, version: manifest.version }, offset: { x: 0, z: 0 } });
  return manifest;
}

/** Lee y valida la región de un map-pack instalado (síncrono: CLI). */
export function loadRegion(dir: string, region: RegionRef): MapLogic {
  if (!region.mapPack) throw new Error(`La región ${region.id} no tiene map-pack`);
  const base = join(dir, packKey(region.mapPack));
  if (!existsSync(base)) throw new Error(`Map-pack ${packKey(region.mapPack)} no instalado en ${dir} (worldopen mappack install)`);
  const manifestText = readFileSync(join(base, 'manifest.json'), 'utf8');
  const m = parseManifest(manifestText);
  return parseMapPack(region, {
    manifest: manifestText,
    buildings: readFileSync(join(base, m.logic.buildings), 'utf8'),
    streets: readFileSync(join(base, m.logic.streets), 'utf8'),
  });
}

/** Resolvedor de mapas para `EngineHostCore` a partir de una carpeta (servidor). Cachea por map-pack y región. */
export function fileMapResolver(dir = DEFAULT_MAPPACKS_DIR): (manifest: WorldManifest) => Promise<Record<string, MapLogic>> {
  const cache = new Map<string, MapLogic>();
  return async (manifest) => {
    const out: Record<string, MapLogic> = {};
    for (const r of manifest.regions) {
      if (!r.mapPack) continue;
      const key = `${r.id}|${packKey(r.mapPack)}|${r.offset.x},${r.offset.z}`;
      if (!cache.has(key)) cache.set(key, loadRegion(dir, r));
      // Copia: el motor no debe compartir objetos entre simulaciones.
      out[r.id] = structuredClone(cache.get(key)!);
    }
    return out;
  };
}

/** Región principal de un mundo sobre un map-pack instalado. */
export function regionFor(dir: string, key: string): RegionRef {
  const m = parseManifest(readFileSync(join(dir, key, 'manifest.json'), 'utf8'));
  return { id: 'r1', displayName: m.displayName, mapPack: { id: m.id, version: m.version }, offset: { x: 0, z: 0 } };
}
