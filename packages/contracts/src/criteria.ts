/** ADR-0010. Parámetros del mundo que fijan su evolución. */
export type CriterionValue = number | boolean | string;

export interface CriterionDefinition {
  /** `dominio.nombre`, p. ej. `climate.baseTemperatureC`. */
  key: string;
  type: 'number' | 'boolean' | 'enum';
  default: CriterionValue;
  min?: number;
  max?: number;
  /** Valores permitidos para `enum`. */
  options?: string[];
  description: string;
  /** Quién puede cambiarlo durante la simulación. */
  mutableBy: 'admin' | 'system' | 'both';
}

export type CriteriaValues = Record<string, CriterionValue>;
