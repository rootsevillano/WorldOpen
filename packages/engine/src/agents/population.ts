import { AgentActivity, AgentFlag, type BuildingUse } from '@worldopen/contracts';
import { personName } from '../content/names';
import { Action, Occupation, RelationKind } from '../world/agents';
import type { World } from '../world/world';
import { bond } from './social';

/** Existencias iniciales que trae cada habitante a su casa. */
const PANTRY_PER_RESIDENT = { food: 4, water: 6, wood: 3 };

/** Puesto de trabajo por ocupación. */
export const WORKPLACE_USE: Partial<Record<number, BuildingUse>> = {
  [Occupation.Shopkeeper]: 'retail',
  [Occupation.Farmer]: 'agriculture',
  [Occupation.Sawyer]: 'industrial',
  [Occupation.CivilServant]: 'publicServices',
};

/** Vivienda al azar ponderada por número de viviendas (D4). */
function pickHome(world: World): number {
  const { homes, buildings } = world.map;
  let total = 0;
  for (const h of homes) total += buildings[h]!.dwellings;
  let r = world.rng.nextFloat() * total;
  for (const h of homes) {
    r -= buildings[h]!.dwellings;
    if (r < 0) return h;
  }
  return homes[homes.length - 1]!;
}

/** Ocupación de un adulto en edad de trabajar: proporcional a los puestos disponibles; 15 % en paro. */
function pickOccupation(world: World, age: number): [number, number] {
  if (age >= 67) return [Occupation.Retired, -1];
  const rng = world.rng;
  if (rng.nextFloat() < 0.15) return [Occupation.Unemployed, -1];
  const options: [number, number[]][] = [
    [Occupation.Shopkeeper, world.map.byUse.retail],
    [Occupation.Farmer, world.map.byUse.agriculture],
    [Occupation.Sawyer, world.map.byUse.industrial],
    [Occupation.CivilServant, world.map.byUse.publicServices],
  ];
  let total = 0;
  for (const [, list] of options) total += list.length;
  if (total === 0) return [Occupation.Unemployed, -1];
  let r = rng.int(0, total - 1);
  for (const [occ, list] of options) {
    if (r < list.length) return [occ, list[r]!];
    r -= list.length;
  }
  return [Occupation.Unemployed, -1];
}

/** Crea un habitante ficticio dentro de su casa. Devuelve su id. */
export function spawnAgent(world: World, home = -1): number {
  const rng = world.rng;
  const h = home >= 0 ? home : pickHome(world);
  const b = world.map.buildings[h]!;
  const a = world.agents;
  const i = a.add(b.centroid.x, 0, b.centroid.z);
  a.sex[i] = rng.int(0, 1);
  a.age[i] = rng.int(18, 85);
  a.sociability[i] = rng.nextFloat();
  a.bravery[i] = rng.nextFloat();
  const [occupation, workplace] = pickOccupation(world, a.age[i]!);
  a.occupation[i] = occupation;
  a.workplace[i] = workplace;
  a.home[i] = h;
  a.location[i] = h;
  a.flags[i] = AgentFlag.Indoors;
  a.activities[i] = AgentActivity.Idle;
  a.action[i] = Action.Stay;
  a.energy[i] = 0.7 + 0.3 * rng.nextFloat();
  a.social[i] = 0.5 + 0.5 * rng.nextFloat();
  a.hunger[i] = 0.6 + 0.4 * rng.nextFloat();
  a.thirst[i] = 0.6 + 0.4 * rng.nextFloat();
  a.names[i] = personName(rng, a.sex[i]!);

  const bs = world.buildings;
  bs.residents[h]!++;
  bs.food[h]! += PANTRY_PER_RESIDENT.food;
  bs.water[h]! += PANTRY_PER_RESIDENT.water;
  bs.wood[h]! += PANTRY_PER_RESIDENT.wood;

  // Quien comparte casa es familia (S7: hogares).
  const id = a.ids[i]!;
  for (let j = 0; j < a.count; j++) {
    if (j !== i && a.home[j] === h) {
      bond(world, i, a.ids[j]!, 0.6, RelationKind.Family);
      bond(world, j, id, 0.6, RelationKind.Family);
    }
  }
  world.emit('agent.spawned', { agentId: id, name: a.names[i], home: b.id });
  return id;
}

export function removeAgent(world: World, id: number): boolean {
  const i = world.agents.indexOf(id);
  if (i < 0) return false;
  const home = world.agents.home[i]!;
  if (home >= 0 && world.buildings.residents[home]! > 0) world.buildings.residents[home]!--;
  world.emit('agent.removed', { agentId: id, name: world.agents.names[i] });
  world.agents.removeAt(i);
  return true;
}
