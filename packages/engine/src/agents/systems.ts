import { AgentActivity, AgentFlag } from '@worldopen/contracts';
import { headingOf } from '../math/angles';
import { Action } from '../world/agents';
import type { World } from '../world/world';
import { nightFactor, thermalDiscomfort } from './environment';

/**
 * Sistemas de supervivencia de la Fase 2 (ADR-0008): necesidades → decisión (Utility AI) → movimiento.
 * Todas las tasas son "por minuto de juego" y se escalan con `minutesPerTick` (ADR-0009).
 */

const ENERGY_DRAIN = 1 / (16 * 60);
const ENERGY_SLEEP = 1 / (7 * 60);
const SHELTER_INDOORS = 1 / 60;
const SHELTER_OUTDOORS = 1 / (5 * 60);
const SOCIAL_AT_HOME = 1 / (5 * 60);
const SOCIAL_AT_VENUE = 1 / 40;
/** Velocidad a pie (m por minuto de juego). */
const WALK = 75;
/** Cada agente reevalúa su acción cada 15 minutos de juego (escalonado por id). */
const DECISION_MINUTES = 15;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function needsSystem(world: World): void {
  const a = world.agents;
  const dt = world.time.minutesPerTick;
  const night = nightFactor(world);
  const exposure = 1 + night + 1.5 * thermalDiscomfort(world);
  const map = world.map;
  for (let i = 0; i < a.count; i++) {
    const loc = a.location[i]!;
    const sleeping = a.action[i] === Action.Sleep && loc === a.home[i];
    a.energy[i] = clamp01(a.energy[i]! + dt * (sleeping ? ENERGY_SLEEP : -ENERGY_DRAIN));
    a.shelter[i] = clamp01(a.shelter[i]! + dt * (loc >= 0 ? SHELTER_INDOORS : -SHELTER_OUTDOORS * exposure));
    if (loc >= 0 && loc !== a.home[i] && map.buildings[loc]!.use !== 'residential') {
      a.social[i] = clamp01(a.social[i]! + dt * SOCIAL_AT_VENUE);
    } else if (loc === a.home[i] && !sleeping) {
      a.social[i] = clamp01(a.social[i]! - dt * SOCIAL_AT_HOME);
    }
  }
}

export function decisionSystem(world: World): void {
  const a = world.agents;
  const rng = world.rng;
  const every = Math.max(1, Math.round(DECISION_MINUTES / world.time.minutesPerTick));
  const night = nightFactor(world);
  const discomfort = thermalDiscomfort(world);
  const outdoorAppeal = 1 - (discomfort > 1 ? 1 : discomfort);
  const map = world.map;

  for (let i = 0; i < a.count; i++) {
    // Los que van de camino no deciden, salvo para buscar cobijo si el exterior se vuelve hostil.
    const moving = a.paths[i] !== null;
    if ((world.tick + a.ids[i]!) % every !== 0) continue;
    if (moving && a.action[i] === Action.SeekShelter) continue;

    const loc = a.location[i]!;
    const home = a.home[i]!;
    const atHome = loc === home;
    const atVenue = loc >= 0 && !atHome;
    const energy = a.energy[i]!;
    const shelter = a.shelter[i]!;
    const social = a.social[i]!;
    const current = a.action[i]!;

    // De camino, la opción por defecto es seguir (nunca quedarse parado en la calle).
    let best: Action = moving ? (current as Action) : Action.Stay;
    let bestScore = (moving ? 0.6 : 0.25 + (loc >= 0 && shelter > 0.8 ? 0.15 : 0)) + rng.nextFloat() * 0.05;
    const consider = (action: Action, score: number) => {
      const s = score + rng.nextFloat() * 0.05;
      if (s > bestScore) {
        best = action;
        bestScore = s;
      }
    };

    if (atHome) {
      const tired = 1 - energy;
      consider(Action.Sleep, night * (0.6 + tired) + tired * tired * 0.8 + (current === Action.Sleep && night > 0 ? 0.3 : 0));
    } else {
      consider(
        Action.GoHome,
        0.3 * (1 - shelter) + night * 0.9 + (1 - energy) * 0.6 + (atVenue && social > 0.95 ? 0.5 : 0) + (current === Action.GoHome ? 0.2 : 0),
      );
    }
    if (night < 0.5 && map.venues.length > 0) {
      consider(Action.GoOut, (1 - social) * (0.4 + 0.8 * a.sociability[i]!) * (1 - night) * outdoorAppeal - (atVenue ? 0.2 : 0));
    }
    if (loc < 0) {
      const lack = 1 - shelter;
      consider(Action.SeekShelter, lack * lack * 1.6 * (1.2 - 0.4 * a.bravery[i]!));
    }

    if (best === current && moving) continue;
    apply(world, i, best);
  }
}

function apply(world: World, i: number, action: Action): void {
  const a = world.agents;
  const map = world.map;
  a.action[i] = action;
  let target = -1;
  if (action === Action.GoHome) target = a.home[i]!;
  else if (action === Action.GoOut) {
    target = map.venues[world.rng.int(0, map.venues.length - 1)]!;
    if (target === a.location[i]) target = -1;
  } else if (action === Action.SeekShelter) {
    target = nearestShelter(world, i);
    world.emit('agent.seekingShelter', { agentId: a.ids[i], name: a.names[i], building: map.buildings[target]!.id });
  }

  if (target < 0 || target === a.location[i]) {
    a.paths[i] = null;
    a.target[i] = -1;
    a.activities[i] = activityAt(world, i);
    return;
  }
  const x = a.positions[i * 3]!;
  const z = a.positions[i * 3 + 2]!;
  const path = map.route(x, z, a.location[i]!, target);
  if (!path) {
    a.action[i] = Action.Stay;
    return;
  }
  a.paths[i] = path;
  a.pathPos[i] = 0;
  a.target[i] = target;
  a.location[i] = -1;
  a.flags[i] = 0;
  a.activities[i] = action === Action.SeekShelter ? AgentActivity.Fleeing : AgentActivity.Moving;
}

/** Casa o local más cercano en línea recta (desempate por índice). */
function nearestShelter(world: World, i: number): number {
  const a = world.agents;
  const x = a.positions[i * 3]!;
  const z = a.positions[i * 3 + 2]!;
  let best = a.home[i]!;
  const d2 = (b: number) => {
    const c = world.map.buildings[b]!.centroid;
    return (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
  };
  let bestD = d2(best);
  for (const v of world.map.venues) {
    const d = d2(v);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

function activityAt(world: World, i: number): AgentActivity {
  const a = world.agents;
  const loc = a.location[i]!;
  if (loc < 0) return AgentActivity.Idle;
  if (loc === a.home[i]) return a.action[i] === Action.Sleep ? AgentActivity.Sleeping : AgentActivity.Idle;
  return AgentActivity.Socializing;
}

export function movementSystem(world: World): void {
  const a = world.agents;
  const speed = WALK * world.time.minutesPerTick;
  for (let i = 0; i < a.count; i++) {
    const path = a.paths[i];
    if (!path) continue;
    let budget = a.action[i] === Action.SeekShelter ? speed * 1.3 : speed;
    let x = a.positions[i * 3]!;
    let z = a.positions[i * 3 + 2]!;
    let k = a.pathPos[i]!;
    while (budget > 0 && k * 2 < path.length) {
      const tx = path[k * 2]!;
      const tz = path[k * 2 + 1]!;
      const dx = tx - x;
      const dz = tz - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 1e-9) a.headings[i] = headingOf(dx, dz);
      if (dist <= budget) {
        x = tx;
        z = tz;
        budget -= dist;
        k++;
      } else {
        x += (dx / dist) * budget;
        z += (dz / dist) * budget;
        budget = 0;
      }
    }
    a.positions[i * 3] = x;
    a.positions[i * 3 + 2] = z;
    a.pathPos[i] = k;
    if (k * 2 >= path.length) {
      // Llegada: entra en el edificio.
      const target = a.target[i]!;
      a.paths[i] = null;
      a.location[i] = target;
      a.target[i] = -1;
      a.flags[i] = AgentFlag.Indoors;
      if (a.action[i] !== Action.Sleep) a.action[i] = Action.Stay;
      a.activities[i] = activityAt(world, i);
    }
  }
}
