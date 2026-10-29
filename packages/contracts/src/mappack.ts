/**
 * ADR-0007. Esquema v1 de la parte lógica de un map-pack (lo que consume el motor).
 * Lo produce el pipeline de `almensilla-3d`. Sin nombres reales: ids opacos y nombres ficticios.
 */
export const MAP_PACK_SCHEMA_VERSION = 1;

export interface MapPackManifest {
  schemaVersion: number;
  id: string;
  version: string;
  /** Nombre ficticio por defecto de la región. */
  displayName: string;
  crs: { epsg: number; origin: { e: number; n: number }; axes: 'X=East,Y=Up,Z=-North'; units: 'm' };
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  /** Rutas relativas dentro del map-pack. */
  logic: { buildings: string; streets: string; navGrid: string };
  render: { buildings?: string; roads?: string; terrain?: string; trees?: string; ortho?: string };
  attribution: string[];
}

export type BuildingUse =
  | 'residential'
  | 'agriculture'
  | 'industrial'
  | 'office'
  | 'retail'
  | 'publicServices'
  | 'unknown';

export interface BuildingRecord {
  /** Id opaco (`b000123`); el render lo usa para localizar la malla del edificio. */
  id: string;
  use: BuildingUse;
  dwellings: number;
  floorsAboveGround: number;
  grossFloorAreaM2: number;
  footprintAreaM2: number;
  centroid: { x: number; z: number };
  /** Puntos de acceso a pie desde la calle. */
  entrances: { x: number; z: number; streetNodeId: number | null }[];
  /** Overrides manuales (E3): función concreta del edificio, p. ej. `bakery`. */
  role?: string;
}

export interface StreetGraph {
  nodes: { id: number; x: number; z: number; y: number }[];
  edges: {
    id: number;
    from: number;
    to: number;
    lengthM: number;
    kind: 'carriageway' | 'track' | 'pedestrian';
    oneway: boolean;
    /** Nombre ficticio generado. */
    name: string | null;
  }[];
}

export const NavCell = { Blocked: 0, Open: 1, Street: 2, Building: 3, Water: 4 } as const;
export type NavCell = (typeof NavCell)[keyof typeof NavCell];

/** Rejilla de navegación; `cells` codificado en base64 (Uint8Array de `cols × rows`, fila 0 = minZ). */
export interface NavGrid {
  cellSizeM: number;
  origin: { x: number; z: number };
  cols: number;
  rows: number;
  cells: string;
}
