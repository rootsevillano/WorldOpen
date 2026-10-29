import type { CriteriaValues, CriterionDefinition, CriterionValue, Role } from '@worldopen/contracts';

/** ADR-0010: catálogo de criterios declarados por el núcleo y el ruleset. */
export class CriteriaRegistry {
  private readonly defs = new Map<string, CriterionDefinition>();

  define(def: CriterionDefinition): void {
    if (this.defs.has(def.key)) throw new Error(`Criterio duplicado: ${def.key}`);
    const problem = this.checkValue(def, def.default);
    if (problem) throw new Error(`Valor por defecto inválido en ${def.key}: ${problem}`);
    this.defs.set(def.key, def);
  }

  get(key: string): CriterionDefinition | undefined {
    return this.defs.get(key);
  }

  /** Definiciones ordenadas por clave (orden estable para UI y hash). */
  list(): CriterionDefinition[] {
    return [...this.defs.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  /** Valores por defecto sobrescritos con `initial`. Lanza si `initial` trae claves o valores inválidos. */
  resolve(initial: CriteriaValues): CriteriaValues {
    const values: CriteriaValues = {};
    for (const def of this.list()) values[def.key] = def.default;
    for (const key of Object.keys(initial).sort()) {
      const def = this.defs.get(key);
      if (!def) throw new Error(`Criterio desconocido en el manifiesto: ${key}`);
      const value = initial[key] as CriterionValue;
      const problem = this.checkValue(def, value);
      if (problem) throw new Error(`Criterio ${key}: ${problem}`);
      values[key] = value;
    }
    return values;
  }

  /** `null` si el cambio es válido para ese rol; si no, el motivo. */
  checkChange(key: string, value: unknown, role: Role): string | null {
    const def = this.defs.get(key);
    if (!def) return `criterio desconocido: ${key}`;
    if (def.mutableBy === 'system') return `${key} solo lo cambia el sistema`;
    if (role !== 'admin') return `${key} solo lo cambia el administrador`;
    return this.checkValue(def, value);
  }

  private checkValue(def: CriterionDefinition, value: unknown): string | null {
    switch (def.type) {
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'se esperaba un número finito';
        if (def.min !== undefined && value < def.min) return `mínimo ${def.min}`;
        if (def.max !== undefined && value > def.max) return `máximo ${def.max}`;
        return null;
      case 'boolean':
        return typeof value === 'boolean' ? null : 'se esperaba un booleano';
      case 'enum':
        return typeof value === 'string' && (def.options ?? []).includes(value)
          ? null
          : `valores permitidos: ${(def.options ?? []).join(', ')}`;
    }
  }
}
