import type { CriteriaValues } from './criteria';
import type { TimeConfig } from './time';

/** ADR-0007. Una región del mundo, normalmente procedente de un map-pack. */
export interface RegionRef {
  /** Id lógico estable, prefijo de los ids de la región (p. ej. `r1`). */
  id: string;
  /** Nombre ficticio que se muestra. Nunca el nombre real (línea roja V5). */
  displayName: string;
  /** `null` = mapa sintético de pruebas (hasta que exista el primer map-pack). */
  mapPack: { id: string; version: string } | null;
  /** Desplazamiento del origen de la región respecto al del mundo, en metros (X = Este, Z = −Norte). */
  offset: { x: number; z: number };
}

/** ADR-0004. Definición inmutable de un mundo. */
export interface WorldManifest {
  worldId: string;
  name: string;
  /** ISO 8601. Lo pone el host; el motor no lo lee. */
  createdAt: string;
  engineVersion: string;
  seed: number;
  time: TimeConfig;
  /** Id del ruleset (ADR-0010), p. ej. `contemporary`. */
  ruleset: string;
  regions: RegionRef[];
  /** Valores iniciales de criterios; lo que falte toma el valor por defecto. */
  criteria: CriteriaValues;
}
