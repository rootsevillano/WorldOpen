import { removeAgent, spawnAgent } from '../agents/population';
import type { CommandDefinition } from './registry';

interface SpawnPayload {
  count: number;
  /** Índice de edificio resuelto en la validación (el payload trae el id opaco). */
  home: number;
}

/** `agent.spawn` v1: Dios crea habitantes (G1). */
export const agentSpawnV1: CommandDefinition<SpawnPayload> = {
  type: 'agent.spawn',
  version: 1,
  status: 'active',
  authority: ['admin'],
  description: 'Crea habitantes ficticios en una vivienda (o repartidos al azar).',
  validate(payload, world) {
    const p = (payload ?? {}) as Record<string, unknown>;
    const count = p.count ?? 1;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 500) {
      return { ok: false, message: 'count debe ser un entero entre 1 y 500' };
    }
    if (world.agents.count + count > world.agents.capacity) {
      return { ok: false, message: `Se superaría la capacidad de ${world.agents.capacity} agentes` };
    }
    let home = -1;
    if (p.homeBuildingId !== undefined) {
      home = world.map.buildings.findIndex((b) => b.id === p.homeBuildingId);
      if (home < 0 || !world.map.homes.includes(home)) return { ok: false, message: 'homeBuildingId no es una vivienda' };
    }
    return { ok: true, payload: { count, home } };
  },
  apply(world, { count, home }) {
    // La capacidad se revalida al aplicar: pudo llenarse entre la aceptación y el tick.
    const n = Math.min(count, world.agents.capacity - world.agents.count);
    for (let k = 0; k < n; k++) spawnAgent(world, home);
  },
};

/** `agent.remove` v1: Dios elimina a un habitante (G1). */
export const agentRemoveV1: CommandDefinition<{ agentId: number }> = {
  type: 'agent.remove',
  version: 1,
  status: 'active',
  authority: ['admin'],
  description: 'Elimina a un habitante.',
  validate(payload) {
    const id = (payload as Record<string, unknown> | null)?.agentId;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return { ok: false, message: 'agentId inválido' };
    return { ok: true, payload: { agentId: id } };
  },
  apply(world, { agentId }) {
    if (!removeAgent(world, agentId)) world.emit('command.failed', { type: 'agent.remove', message: `No existe el agente ${agentId}` });
  },
};
