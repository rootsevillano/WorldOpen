import type { MapLogic, WorldManifest } from '@worldopen/contracts';
import { packKey, parseManifest, parseMapPack } from '@worldopen/engine';

/**
 * Resolvedor de mapas del Worker (ADR-0017): descarga la parte lógica de cada map-pack de `/map-packs/` y la valida
 * con el lector del motor (anonimización incluida). Cachea los textos por map-pack.
 */
export function fetchMapResolver(base: string): (manifest: WorldManifest) => Promise<Record<string, MapLogic>> {
  const cache = new Map<string, Promise<{ manifest: string; buildings: string; streets: string }>>();
  const text = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar ${url} (${res.status}): ¿está instalado el map-pack?`);
    return res.text();
  };
  return async (manifest) => {
    const out: Record<string, MapLogic> = {};
    for (const region of manifest.regions) {
      if (!region.mapPack) continue;
      const key = packKey(region.mapPack);
      if (!cache.has(key)) {
        cache.set(key, (async () => {
          const m = await text(`${base}/${key}/manifest.json`);
          const parsed = parseManifest(m);
          const [buildings, streets] = await Promise.all([text(`${base}/${key}/${parsed.logic.buildings}`), text(`${base}/${key}/${parsed.logic.streets}`)]);
          return { manifest: m, buildings, streets };
        })());
      }
      try {
        out[region.id] = parseMapPack(region, await cache.get(key)!);
      } catch (err) {
        cache.delete(key);
        throw err;
      }
    }
    return out;
  };
}
