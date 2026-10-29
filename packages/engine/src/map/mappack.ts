import {
  MAP_PACK_SCHEMA_VERSION,
  type BuildingRecord,
  type BuildingUse,
  type MapLogic,
  type MapPackManifest,
  type RegionRef,
  type StreetGraph,
} from '@worldopen/contracts';

/**
 * Lector de map-packs (ADR-0007, ADR-0017). Puro: recibe el texto de los ficheros (el host decide si vienen de
 * `fetch` o del disco), valida el esquema y la línea roja de anonimización y devuelve el `MapLogic` de la región.
 */

const USES: BuildingUse[] = ['residential', 'agriculture', 'industrial', 'office', 'retail', 'publicServices', 'unknown'];
/** Rastros de datos reales que nunca pueden llegar al motor (segunda barrera tras la auditoría del pipeline). */
const FORBIDDEN = [/\d{7}[A-Z]{2}\d{4}[A-Z]/, /\b41010\b/, /epsg/i, /almensilla/i];

export function packKey(ref: { id: string; version: string }): string {
  return `${ref.id}-${ref.version}`;
}

export function parseManifest(text: string): MapPackManifest {
  const m = JSON.parse(text) as MapPackManifest;
  if (m.schemaVersion !== MAP_PACK_SCHEMA_VERSION) {
    throw new Error(`Map-pack con esquema ${m.schemaVersion}; el motor lee el ${MAP_PACK_SCHEMA_VERSION}`);
  }
  if (!m.id || !m.version || !m.logic?.buildings || !m.logic?.streets) throw new Error('Manifiesto de map-pack incompleto');
  if ('origin' in (m.crs ?? {})) throw new Error('El map-pack publica un origen absoluto: no se admite (ADR-0017)');
  return m;
}

function assertAnonymous(label: string, text: string): void {
  for (const re of FORBIDDEN) {
    if (re.test(text)) throw new Error(`El map-pack (${label}) contiene datos reales identificables: no se carga (ADR-0007)`);
  }
}

/** Construye el `MapLogic` de una región desde los textos del map-pack, desplazado por `region.offset`. */
export function parseMapPack(
  region: RegionRef,
  files: { manifest: string; buildings: string; streets: string },
): MapLogic {
  assertAnonymous('manifest', files.manifest);
  assertAnonymous('buildings', files.buildings);
  assertAnonymous('streets', files.streets);
  const manifest = parseManifest(files.manifest);
  if (region.mapPack && packKey(region.mapPack) !== packKey(manifest)) {
    throw new Error(`Se esperaba el map-pack ${packKey(region.mapPack)} y llegó ${packKey(manifest)}`);
  }
  const { x: ox, z: oz } = region.offset;
  const buildings = JSON.parse(files.buildings) as BuildingRecord[];
  const streets = JSON.parse(files.streets) as StreetGraph;
  const ids = new Set<string>();
  for (const b of buildings) {
    if (!b.id.startsWith(`${region.id}-`)) throw new Error(`Edificio ${b.id} sin el prefijo de la región ${region.id}`);
    if (ids.has(b.id)) throw new Error(`Edificio duplicado: ${b.id}`);
    ids.add(b.id);
    if (!USES.includes(b.use)) throw new Error(`Uso de edificio desconocido: ${b.use}`);
    if (!b.entrances?.length) throw new Error(`Edificio ${b.id} sin portal`);
    if (ox !== 0 || oz !== 0) {
      b.centroid = { x: b.centroid.x + ox, z: b.centroid.z + oz };
      b.entrances = b.entrances.map((e) => ({ ...e, x: e.x + ox, z: e.z + oz }));
      b.footprint = b.footprint?.map((p) => p.map((v, k) => v + (k % 2 === 0 ? ox : oz)));
    }
  }
  // Los ids de nodo se desplazan para que no choquen entre regiones (prefijo numérico por región).
  const nodeBase = regionNodeBase(region.id);
  const remap = (id: number) => nodeBase + id;
  for (const b of buildings) for (const e of b.entrances) if (e.streetNodeId !== null) e.streetNodeId = remap(e.streetNodeId);
  return {
    regionId: region.id,
    bounds: {
      minX: manifest.bounds.minX + ox, minZ: manifest.bounds.minZ + oz,
      maxX: manifest.bounds.maxX + ox, maxZ: manifest.bounds.maxZ + oz,
    },
    buildings,
    streets: {
      nodes: streets.nodes.map((n) => ({ ...n, id: remap(n.id), x: n.x + ox, z: n.z + oz })),
      edges: streets.edges.map((e) => ({ ...e, from: remap(e.from), to: remap(e.to) })),
    },
  };
}

/** `r1` → 0, `r2` → 1 000 000…: espacio de ids de nodo por región. */
function regionNodeBase(regionId: string): number {
  const n = Number(/(\d+)$/.exec(regionId)?.[1] ?? 1);
  return (n - 1) * 1_000_000;
}
