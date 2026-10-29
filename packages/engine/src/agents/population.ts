import { AgentActivity, AgentFlag } from '@worldopen/contracts';
import { personName } from '../content/names';
import { Action } from '../world/agents';
import type { World } from '../world/world';

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
  a.home[i] = h;
  a.location[i] = h;
  a.flags[i] = AgentFlag.Indoors;
  a.activities[i] = AgentActivity.Idle;
  a.action[i] = Action.Stay;
  a.energy[i] = 0.7 + 0.3 * rng.nextFloat();
  a.social[i] = 0.5 + 0.5 * rng.nextFloat();
  a.names[i] = personName(rng, a.sex[i]!);
  world.emit('agent.spawned', { agentId: a.ids[i], name: a.names[i], home: b.id });
  return a.ids[i]!;
}

export function removeAgent(world: World, id: number): boolean {
  const i = world.agents.indexOf(id);
  if (i < 0) return false;
  world.emit('agent.removed', { agentId: id, name: world.agents.names[i] });
  world.agents.removeAt(i);
  return true;
}
