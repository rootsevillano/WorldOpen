import { BuildingState } from '@worldopen/contracts';
import { ticksPerDay } from '../time/clock';
import { Action, Memory } from '../world/agents';
import type { World } from '../world/world';
import { remember } from './social';
import { effectiveHome, startAction } from './systems';

/** Duración de un incendio y de los daños posteriores (G3: la geometría no cambia; el edificio queda inservible). */
const BURN_HOURS = 3;
const DAMAGED_DAYS = 2;
/** Quien está a menos de esta distancia ve el fuego y lo recuerda. */
const WITNESS_RADIUS = 150;

export function igniteBuilding(world: World, b: number): void {
  const bs = world.buildings;
  const ticksPerHour = Math.max(1, Math.round(60 / world.time.minutesPerTick));
  bs.state[b] = BuildingState.Burning;
  bs.stateUntil[b] = world.tick + BURN_HOURS * ticksPerHour;
  bs.food[b] = 0;
  bs.wood[b] = 0;
  bs.water[b] = 0;
  const c = world.map.buildings[b]!.centroid;
  const a = world.agents;
  let witnesses = 0;
  for (let i = 0; i < a.count; i++) {
    const dx = a.positions[i * 3]! - c.x;
    const dz = a.positions[i * 3 + 2]! - c.z;
    if (dx * dx + dz * dz <= WITNESS_RADIUS * WITNESS_RADIUS || a.home[i] === b || a.workplace[i] === b) {
      remember(world, i, a.home[i] === b ? Memory.LostHome : Memory.Fire, b);
      witnesses++;
    }
  }
  world.emit('fire.started', { building: world.map.buildings[b]!.id, use: world.map.buildings[b]!.use, witnesses });
}

/** Evacúa los edificios en llamas y hace avanzar los estados (ardiendo → dañado → normal). */
export function disasterSystem(world: World): void {
  const bs = world.buildings;
  const a = world.agents;
  for (let b = 0; b < bs.count; b++) {
    const state = bs.state[b]!;
    if (state === BuildingState.Normal) continue;
    if (state === BuildingState.Burning) {
      // Quien siga dentro sale huyendo hacia el refugio más cercano.
      for (let i = 0; i < a.count; i++) {
        if (a.location[i] !== b) continue;
        a.location[i] = -1;
        a.flags[i] = 0;
        a.busyLeft[i] = 0;
        remember(world, i, Memory.Fire, b);
        startAction(world, i, Action.SeekShelter, effectiveHome(world, i));
      }
    }
    if (bs.stateUntil[b]! > 0 && world.tick >= bs.stateUntil[b]!) {
      if (state === BuildingState.Burning) {
        bs.state[b] = BuildingState.Damaged;
        bs.stateUntil[b] = world.tick + DAMAGED_DAYS * ticksPerDay(world.time);
        world.emit('fire.ended', { building: world.map.buildings[b]!.id });
      } else {
        bs.state[b] = BuildingState.Normal;
        bs.stateUntil[b] = 0;
        world.emit('building.repaired', { building: world.map.buildings[b]!.id });
      }
    }
  }
}
