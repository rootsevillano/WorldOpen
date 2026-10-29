import { BuildingState } from '@worldopen/contracts';
import { igniteBuilding } from '../agents/disasters';
import type { CommandDefinition } from './registry';

/** `disaster.fire` v1: Dios prende fuego a un edificio (G1). */
export const disasterFireV1: CommandDefinition<{ building: number }> = {
  type: 'disaster.fire',
  version: 1,
  status: 'active',
  authority: ['admin'],
  description: 'Provoca un incendio en un edificio: sus ocupantes huyen, pierde sus existencias y queda inservible dos días.',
  validate(payload, world) {
    const id = (payload as Record<string, unknown> | null)?.buildingId;
    if (typeof id !== 'string') return { ok: false, message: 'falta buildingId' };
    const building = world.map.buildings.findIndex((b) => b.id === id);
    if (building < 0) return { ok: false, message: `No existe el edificio ${id}` };
    return { ok: true, payload: { building } };
  },
  apply(world, { building }) {
    if (world.buildings.state[building] === BuildingState.Burning) return;
    igniteBuilding(world, building);
  },
};
