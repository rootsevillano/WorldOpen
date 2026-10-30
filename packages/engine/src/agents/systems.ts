import { AgentActivity, AgentFlag, BuildingState } from '@worldopen/contracts';
import { headingOf } from '../math/angles';
import { ACTION_COUNT, Action, Memory, Occupation, Resource } from '../world/agents';
import type { World } from '../world/world';
import {
  DRINK_BELOW,
  EAT_BELOW,
  PANTRY_TARGET,
  DELIVERY_MAX,
  DELIVERY_MIN,
  SERVICE_MINUTES,
  chooseSource,
  nearestShop,
  employed,
  homeWarm,
  sourceOpen,
  stockOf,
  unload,
  usable,
} from './economy';
import { inShift, inSchool, inSleepWindow, minuteOfDay, minutesToBed, nightFactor, thermalDiscomfort } from './environment';
import { LEISURE_SCALE_M, pickNearby } from './nearby';
import { remember } from './social';

/**
 * Sistemas de los agentes (ADR-0008): necesidades → decisión (Utility AI) → movimiento.
 * Todas las tasas son "por minuto de juego" y se escalan con `minutesPerTick` (ADR-0009).
 */

const ENERGY_DRAIN = 1 / (16 * 60);
const ENERGY_SLEEP = 1 / (7 * 60);
const SHELTER_INDOORS = 1 / 60;
const SHELTER_OUTDOORS = 1 / (5 * 60);
const SOCIAL_AT_HOME = 1 / (5 * 60);
const SOCIAL_AT_VENUE = 1 / 40;
const HUNGER_DRAIN = 1 / (7 * 60);
const THIRST_DRAIN = 1 / (5 * 60);
const WORK_MISSED = 1 / (4 * 60);
const WORK_DONE = 1 / (2 * 60);
const HEALTH_LOSS = 1 / (48 * 60);
const HEALTH_GAIN = 1 / (24 * 60);
/** Velocidad a pie (m por minuto de juego). */
const WALK = 75;
/** Cada agente reevalúa su acción cada 15 minutos de juego (escalonado por id). */
const DECISION_MINUTES = 15;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Casa utilizable o, si ardió, el servicio público más cercano como refugio (G3). */
export function effectiveHome(world: World, i: number): number {
  const home = world.agents.home[i]!;
  if (usable(world, home)) return home;
  const c = world.map.buildings[home]!.centroid;
  let best = -1;
  let bestD = Infinity;
  for (const p of world.map.byUse.publicServices) {
    if (!usable(world, p)) continue;
    const q = world.map.buildings[p]!.centroid;
    const d = (q.x - c.x) * (q.x - c.x) + (q.z - c.z) * (q.z - c.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best >= 0 ? best : home;
}

export function needsSystem(world: World): void {
  const a = world.agents;
  const dt = world.time.minutesPerTick;
  const night = nightFactor(world);
  const discomfort = thermalDiscomfort(world);
  const exposure = 1 + night + 1.5 * discomfort;
  const shift = inShift(world);
  const school = inSchool(world);
  const map = world.map;
  for (let i = 0; i < a.count; i++) {
    const loc = a.location[i]!;
    const home = a.home[i]!;
    const sleeping = a.action[i] === Action.Sleep && loc >= 0;
    a.energy[i] = clamp01(a.energy[i]! + dt * (sleeping ? ENERGY_SLEEP : -ENERGY_DRAIN));
    const slow = sleeping ? 0.25 : 1;
    a.hunger[i] = clamp01(a.hunger[i]! - dt * HUNGER_DRAIN * slow);
    a.thirst[i] = clamp01(a.thirst[i]! - dt * THIRST_DRAIN * slow);

    // Bajo techo se recupera el cobijo, salvo en una casa fría sin leña.
    let shelterRate = -SHELTER_OUTDOORS * exposure;
    if (loc >= 0) shelterRate = loc === home && !homeWarm(world, home) ? -SHELTER_OUTDOORS * 0.5 * (1 + discomfort) : SHELTER_INDOORS;
    a.shelter[i] = clamp01(a.shelter[i]! + dt * shelterRate);

    if (loc >= 0 && loc !== home && map.buildings[loc]!.use !== 'residential') {
      a.social[i] = clamp01(a.social[i]! + dt * SOCIAL_AT_VENUE);
    } else if (loc === home && !sleeping) {
      a.social[i] = clamp01(a.social[i]! - dt * SOCIAL_AT_HOME);
    }

    if ((a.occupation[i] === Occupation.Student ? school : shift) && employed(world, i)) {
      a.work[i] = clamp01(a.work[i]! + dt * (loc === a.workplace[i] ? WORK_DONE : -WORK_MISSED));
    }

    const starving = a.hunger[i] === 0 || a.thirst[i] === 0;
    a.health[i] = clamp01(a.health[i]! + dt * (starving ? -HEALTH_LOSS : HEALTH_GAIN));
  }
}

/** Puntuación de abastecerse de cada recurso para el hogar del agente (0 si no procede). */
function provisionScore(world: World, i: number, r: number, night: number, outdoorAppeal: number, busyHouseholds: Uint8Array): number {
  const a = world.agents;
  const home = a.home[i]!;
  const residents = Math.max(1, world.buildings.residents[home]!);
  const pantry = stockOf(world, home, r);
  const shortage = 1 - clamp01(pantry / (residents * PANTRY_TARGET[r]!));
  let urgency = 0;
  if (r === Resource.Food) urgency = pantry < 1 ? (1 - a.hunger[i]!) * 1.2 : 0;
  else if (r === Resource.Water) urgency = pantry < 1 ? (1 - a.thirst[i]!) * 1.4 : 0;
  else urgency = homeWarm(world, home) ? 0 : 0.6;
  // Reponer sin urgencia se aplaza si fuera hace un tiempo hostil; la urgencia no.
  let s = shortage * (r === Resource.Wood ? 0.35 : 0.55) * outdoorAppeal + urgency - night * 0.5;
  // Si otro miembro del hogar ya va a por ello, casi nadie más va.
  if (busyHouseholds[home]! & (1 << r)) s *= 0.15;
  return s;
}

export function decisionSystem(world: World): void {
  const a = world.agents;
  const rng = world.rng;
  const every = Math.max(1, Math.round(DECISION_MINUTES / world.time.minutesPerTick));
  const night = nightFactor(world);
  const discomfort = thermalDiscomfort(world);
  const outdoorAppeal = 1 - (discomfort > 1 ? 1 : discomfort);
  const shift = inShift(world);
  const school = inSchool(world);
  const minute = minuteOfDay(world);
  const map = world.map;

  // Hogares que ya tienen a alguien abasteciéndose de cada recurso (máscara de bits por edificio).
  const busyHouseholds = new Uint8Array(map.buildings.length);
  for (let i = 0; i < a.count; i++) {
    const r = a.action[i] === Action.Provision ? a.seeking[i]! || a.carryKind[i]! : a.carryKind[i]!;
    if (r !== Resource.None) busyHouseholds[a.home[i]!]! |= 1 << r;
  }

  for (let i = 0; i < a.count; i++) {
    // Abasteciéndose (cola o servicio en curso) o comiendo: no se interrumpe.
    if (a.busyLeft[i]! > 0) continue;
    const moving = a.paths[i] !== null;
    const due = (world.tick + a.ids[i]!) % every === 0;
    const stranded =
      (a.action[i] === Action.Provision && a.seeking[i] === Resource.None && a.carryKind[i] === Resource.None && !moving) ||
      (a.action[i] === Action.Deliver && a.carryKind[i] === Resource.None && !moving);
    if (!due && !stranded) continue;
    // Huir o llevar la cosecha no se interrumpe a mitad de camino.
    if (moving && (a.action[i] === Action.SeekShelter || a.action[i] === Action.Deliver)) continue;

    const loc = a.location[i]!;
    const home = effectiveHome(world, i);
    const atHome = loc === home;
    const atVenue = loc >= 0 && !atHome;
    const energy = a.energy[i]!;
    const shelter = a.shelter[i]!;
    const social = a.social[i]!;
    const current = a.action[i]!;
    const base = i * ACTION_COUNT;
    a.scores.fill(0, base, base + ACTION_COUNT);

    // De camino, la opción por defecto es seguir (nunca quedarse parado en la calle).
    let best: Action = moving ? (current as Action) : Action.Stay;
    let bestScore = (moving ? 0.6 : 0.25 + (loc >= 0 && shelter > 0.8 ? 0.15 : 0)) + rng.nextFloat() * 0.05;
    a.scores[base + best] = bestScore;
    const consider = (action: Action, score: number) => {
      const s = score + rng.nextFloat() * 0.05;
      a.scores[base + action] = s;
      if (s > bestScore) {
        best = action;
        bestScore = s;
      }
    };

    // Llevar la carga a casa es prioritario.
    const carrying = a.carryKind[i] !== Resource.None;

    const age = a.age[i]!;
    const bedtime = a.bedtime[i]!;
    const sleepTime = inSleepWindow(minute, bedtime, age);
    // Antes de acostarse se vuelve a casa (en la última hora, cada vez con más ganas).
    const toBed = minutesToBed(minute, bedtime);
    const bedPull = sleepTime ? 1.2 : toBed <= 60 ? 0.9 * (1 - toBed / 60) : 0;
    if (atHome) {
      const tired = 1 - energy;
      // Se duerme en la ventana del cronotipo; fuera de ella, solo con agotamiento.
      consider(Action.Sleep, (sleepTime ? 1.2 + 0.5 * tired : tired > 0.9 ? tired : 0) + (current === Action.Sleep && sleepTime ? 0.3 : 0));
    } else {
      const pantryFood = stockOf(world, home, Resource.Food) >= 1 && a.hunger[i]! < EAT_BELOW ? (1 - a.hunger[i]!) * 0.6 : 0;
      const pantryWater = stockOf(world, home, Resource.Water) >= 1 && a.thirst[i]! < DRINK_BELOW ? (1 - a.thirst[i]!) * 0.6 : 0;
      consider(
        Action.GoHome,
        0.3 * (1 - shelter) + Math.max(night * 0.9, bedPull) + (1 - energy) * 0.6 + pantryFood + pantryWater + (carrying ? 1 : 0) +
          (atVenue && social > 0.95 && current !== Action.Work ? 0.5 : 0) + (current === Action.GoHome ? 0.2 : 0),
      );
    }
    const occupation = a.occupation[i]!;
    // Los menores de 14 ni salen solos ni hacen recados; los de 0–5 se quedan en casa.
    const minor = age < 14;
    if (!carrying && occupation !== Occupation.Child) {
      if ((occupation === Occupation.Student ? school : shift) && employed(world, i)) {
        consider(Action.Work, 0.55 + (1 - a.work[i]!) * 0.8 + (current === Action.Work ? 0.2 : 0));
      }
      // Logística (ADR-0018): un agricultor en su huerta lleva la cosecha acumulada a la tienda más cercana.
      if (occupation === Occupation.Farmer && loc >= 0 && loc === a.workplace[i] && world.buildings.food[loc]! >= DELIVERY_MIN && sourceOpen(world, Resource.Food)) {
        consider(Action.Deliver, 0.95);
      }
    }
    if (!carrying && !minor) {
      if (night < 0.5 && map.venues.length > 0 && !sleepTime) {
        consider(Action.GoOut, (1 - social) * (0.4 + 0.8 * a.sociability[i]!) * (1 - night) * outdoorAppeal - (atVenue ? 0.2 : 0));
      }
      let bestR: number = Resource.None;
      let bestP = -Infinity;
      for (const r of [Resource.Food, Resource.Water, Resource.Wood]) {
        if (!sourceOpen(world, r)) continue;
        const p = provisionScore(world, i, r, night, outdoorAppeal, busyHouseholds);
        if (p > bestP) {
          bestP = p;
          bestR = r;
        }
      }
      if (bestR !== Resource.None) {
        consider(Action.Provision, bestP);
        if (best === Action.Provision) a.seeking[i] = bestR;
      }
    }
    if (loc < 0) {
      const lack = 1 - shelter;
      consider(Action.SeekShelter, lack * lack * 1.6 * (1.2 - 0.4 * a.bravery[i]!));
    }

    if (best === current && moving && best !== Action.Provision) continue;
    startAction(world, i, best, home);
  }
}

export function startAction(world: World, i: number, action: Action, home: number): void {
  const a = world.agents;
  const map = world.map;
  a.action[i] = action;
  let target = -1;
  if (action === Action.GoHome || action === Action.Sleep) target = action === Action.GoHome ? home : -1;
  else if (action === Action.Work) target = a.workplace[i]!;
  else if (action === Action.GoOut) {
    // Un local cercano (y distinto del actual), con preferencia por la cercanía.
    target = pickNearby(world, a.positions[i * 3]!, a.positions[i * 3 + 2]!, map.venues, LEISURE_SCALE_M, (v) => usable(world, v) && v !== a.location[i]);
  } else if (action === Action.Provision) {
    target = chooseSource(world, i, a.seeking[i]!);
    if (target < 0) {
      // No queda ninguna fuente que el agente crea útil: se rinde por ahora.
      a.action[i] = Action.Stay;
      a.seeking[i] = Resource.None;
    }
  } else if (action === Action.Deliver) {
    const farm = a.location[i]!;
    target = nearestShop(world, a.positions[i * 3]!, a.positions[i * 3 + 2]!);
    if (target < 0 || farm < 0) {
      a.action[i] = Action.Stay;
      target = -1;
    } else {
      const amount = Math.min(world.buildings.food[farm]!, DELIVERY_MAX);
      world.buildings.food[farm]! -= amount;
      a.carryKind[i] = Resource.Food;
      a.carryAmount[i] = amount;
    }
  } else if (action === Action.SeekShelter) {
    target = nearestShelter(world, i, home);
    world.emit('agent.seekingShelter', { agentId: a.ids[i], name: a.names[i], building: map.buildings[target]!.id });
  }

  if (target < 0 || target === a.location[i]) {
    a.paths[i] = null;
    a.target[i] = -1;
    if (target >= 0) arrive(world, i, target);
    else a.activities[i] = activityAt(world, i);
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

/** Casa (o refugio) o local más cercano en línea recta (desempate por índice). */
function nearestShelter(world: World, i: number, home: number): number {
  const a = world.agents;
  const x = a.positions[i * 3]!;
  const z = a.positions[i * 3 + 2]!;
  let best = home;
  const d2 = (b: number) => {
    const c = world.map.buildings[b]!.centroid;
    return (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
  };
  let bestD = d2(best);
  for (const v of world.map.venues) {
    if (!usable(world, v)) continue;
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
  if (a.action[i] === Action.Sleep) return AgentActivity.Sleeping;
  if (a.action[i] === Action.Work && loc === a.workplace[i]) return AgentActivity.Working;
  if (loc === a.home[i]) return AgentActivity.Idle;
  return AgentActivity.Socializing;
}

/** Entrada en un edificio. */
function arrive(world: World, i: number, target: number): void {
  const a = world.agents;
  a.location[i] = target;
  a.flags[i] = AgentFlag.Indoors;
  const action = a.action[i]!;
  if (action === Action.Deliver && a.carryKind[i] === Resource.Food) {
    world.buildings.food[target]! += a.carryAmount[i]!;
    world.emit('harvest.delivered', { agentId: a.ids[i], name: a.names[i], building: world.map.buildings[target]!.id, amount: Math.round(a.carryAmount[i]!) });
    a.carryKind[i] = Resource.None;
    a.carryAmount[i] = 0;
    // Sigue en Deliver sin carga: decide en el siguiente tick (volver a la huerta o a casa).
    a.activities[i] = activityAt(world, i);
    return;
  }
  if (action === Action.Provision && target !== a.home[i] && a.seeking[i] !== Resource.None) {
    a.busyLeft[i] = SERVICE_MINUTES;
  } else if (action !== Action.Sleep && action !== Action.Work) {
    a.action[i] = Action.Stay;
  }
  if (target === effectiveHome(world, i)) unload(world, i);
  a.activities[i] = activityAt(world, i);
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
      const target = a.target[i]!;
      a.paths[i] = null;
      a.target[i] = -1;
      if (world.buildings.state[target] === BuildingState.Burning) {
        // Llega y está ardiendo: lo recuerda y decidirá otra cosa en el siguiente tick.
        remember(world, i, Memory.Fire, target);
        a.action[i] = Action.SeekShelter;
        a.location[i] = -1;
        startAction(world, i, Action.SeekShelter, effectiveHome(world, i));
        continue;
      }
      arrive(world, i, target);
    }
  }
}
