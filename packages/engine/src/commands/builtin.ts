import type { CriterionValue } from '@worldopen/contracts';
import type { CommandDefinition, CommandRegistry } from './registry';

interface CriteriaSetPayload {
  key: string;
  value: CriterionValue;
}

/** `criteria.set` v1: la herramienta de criterios de Dios (ADR-0010). */
export const criteriaSetV1: CommandDefinition<CriteriaSetPayload> = {
  type: 'criteria.set',
  version: 1,
  status: 'active',
  authority: ['admin'],
  description: 'Cambia el valor de un criterio del mundo.',
  validate(payload, world, issuerRole) {
    if (typeof payload !== 'object' || payload === null) return { ok: false, message: 'payload debe ser un objeto' };
    const { key, value } = payload as Record<string, unknown>;
    if (typeof key !== 'string') return { ok: false, message: 'falta key' };
    const problem = world.criteriaRegistry.checkChange(key, value, issuerRole);
    if (problem) return { ok: false, message: problem };
    return { ok: true, payload: { key, value: value as CriterionValue } };
  },
  apply(world, { key, value }) {
    const previous = world.criteria[key];
    world.criteria[key] = value;
    world.emit('criteria.changed', { key, previous, value });
  },
};

export function registerBuiltinCommands(registry: CommandRegistry): void {
  registry.register(criteriaSetV1);
}
