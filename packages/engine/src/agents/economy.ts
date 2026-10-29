import { AgentActivity, BuildingState } from '@worldopen/contracts';
import { ticksPerDay } from '../time/clock';
import { Action, Memory, Occupation, Resource } from '../world/agents';
import type { World } from '../world/world';
import { harvestFactor, minuteOfDay, shopsOpen, temperature } from './environment';
import { recalls, remember } from './social';

/**
 * Economía de recursos sin dinero (E1, E2): existencias por edificio, despensas por hogar, producción por trabajo,
 * importaciones del "Exterior" (E5) y colas en los puntos de suministro. Tasas por minuto de juego.
 */

/** Consumo y necesidades. */
export const EAT_BELOW = 0.55;
export const DRINK_BELOW = 0.6;
const MEAL = 0.6;
const DRINK = 0.5;
const MEAL_MINUTES = 20;

/** Producción por trabajador presente. */
const FARM_FOOD = 0.12;
const SAWMILL_WOOD = 0.1;
/** Importaciones diarias de comida por tienda a las 06:00, × `economy.foodAbundance`. */
const IMPORT_FOOD = 12;
/** Manantial de cada fuente pública y su capacidad. */
const FOUNTAIN_REFILL = 0.5;
const FOUNTAIN_CAP = 300;
/** Agua corriente por hogar, × `economy.waterSupply`. */
const TAP_WATER = 0.06;
/** Leña que gasta un hogar ocupado por debajo de 14 °C. */
const HEATING_WOOD = 0.004;

/** Objetivo de despensa por residente. */
export const PANTRY_TARGET: Record<number, number> = { [Resource.Food]: 4, [Resource.Water]: 6, [Resource.Wood]: 3 };
/** Lo que puede cargar un agente de una vez. */
const CARRY_MAX = 12;
/** Minutos de servicio por cliente en el punto de suministro. */
export const SERVICE_MINUTES = 5;
/** Un recuerdo de "vacío" o "incendio" disuade durante un día. */
export const AVOID_TICKS_DAYS = 1;

export function stockOf(world: World, b: number, r: number): number {
  const bs = world.buildings;
  return r === Resource.Food ? bs.food[b]! : r === Resource.Water ? bs.water[b]! : bs.wood[b]!;
}

function addStock(world: World, b: number, r: number, delta: number): void {
  const bs = world.buildings;
  if (r === Resource.Food) bs.food[b] = Math.max(0, bs.food[b]! + delta);
  else if (r === Resource.Water) bs.water[b] = Math.max(0, bs.water[b]! + delta);
  else bs.wood[b] = Math.max(0, bs.wood[b]! + delta);
}

/** Puntos de suministro de cada recurso. */
export function sourcesOf(world: World, r: number): number[] {
  const u = world.map.byUse;
  return r === Resource.Food ? u.retail : r === Resource.Water ? u.publicServices : u.industrial;
}

export function usable(world: World, b: number): boolean {
  return world.buildings.state[b] === BuildingState.Normal;
}

export function sourceOpen(world: World, r: number): boolean {
  if (r === Resource.Water) return true;
  if (r === Resource.Food) return shopsOpen(world);
  const m = minuteOfDay(world);
  return m >= 480 && m < 1200;
}

const EMPTY_MEMORY: Record<number, number> = { [Resource.Food]: Memory.FoodEmpty, [Resource.Water]: Memory.WaterEmpty, [Resource.Wood]: Memory.WoodEmpty };

/** Punto de suministro más cercano que el agente no recuerde vacío ni en llamas (desempate por índice). */
export function chooseSource(world: World, i: number, r: number): number {
  const a = world.agents;
  const x = a.positions[i * 3]!;
  const z = a.positions[i * 3 + 2]!;
  const avoid = AVOID_TICKS_DAYS * ticksPerDay(world.time);
  let best = -1;
  let bestD = Infinity;
  for (const b of sourcesOf(world, r)) {
    if (!usable(world, b)) continue;
    if (recalls(world, i, EMPTY_MEMORY[r]!, b, avoid) || recalls(world, i, Memory.Fire, b, avoid)) continue;
    const c = world.map.buildings[b]!.centroid;
    const d = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Recalcula ocupantes y trabajadores presentes (transitorio). */
function countPresence(world: World): void {
  const a = world.agents;
  const bs = world.buildings;
  bs.occupants.fill(0);
  bs.workers.fill(0);
  bs.queue.fill(0);
  bs.served.fill(0);
  for (let i = 0; i < a.count; i++) {
    const loc = a.location[i]!;
    if (loc < 0) continue;
    bs.occupants[loc]!++;
    if (a.action[i] === Action.Work && loc === a.workplace[i]) bs.workers[loc]!++;
  }
}

/** Producción, suministros, calefacción y consumo doméstico. Se ejecuta al inicio de cada tick. */
export function economySystem(world: World): void {
  countPresence(world);
  const bs = world.buildings;
  const map = world.map;
  const dt = world.time.minutesPerTick;
  const foodAbundance = world.num('economy.foodAbundance');
  const waterSupply = world.num('economy.waterSupply');
  const harvest = harvestFactor(world);

  for (const f of map.byUse.agriculture) if (usable(world, f)) bs.food[f]! += dt * FARM_FOOD * bs.workers[f]! * foodAbundance * harvest;
  for (const s of map.byUse.industrial) if (usable(world, s)) bs.wood[s]! += dt * SAWMILL_WOOD * bs.workers[s]!;
  for (const p of map.byUse.publicServices) if (usable(world, p)) bs.water[p] = Math.min(FOUNTAIN_CAP, bs.water[p]! + dt * FOUNTAIN_REFILL);
  for (const h of map.homes) {
    const cap = bs.residents[h]! * PANTRY_TARGET[Resource.Water]!;
    if (bs.water[h]! < cap && usable(world, h)) bs.water[h] = Math.min(cap, bs.water[h]! + dt * TAP_WATER * waterSupply);
  }

  // 06:00: reparto de cosechas e importaciones a las tiendas abiertas.
  const m = minuteOfDay(world);
  if (m <= 360 && 360 < m + dt) {
    const shops = map.byUse.retail.filter((s) => usable(world, s));
    if (shops.length > 0) {
      let harvested = 0;
      for (const f of map.byUse.agriculture) {
        harvested += bs.food[f]!;
        bs.food[f] = 0;
      }
      for (const s of shops) bs.food[s]! += harvested / shops.length + IMPORT_FOOD * foodAbundance;
    }
  }

  // Calefacción: con frío, cada hogar ocupado quema leña.
  if (temperature(world) < 14) {
    for (const h of map.homes) if (bs.occupants[h]! > 0) bs.wood[h] = Math.max(0, bs.wood[h]! - dt * HEATING_WOOD);
  }

  // Comer y beber en casa (automático si hay existencias y el agente está despierto).
  const a = world.agents;
  for (let i = 0; i < a.count; i++) {
    const loc = a.location[i]!;
    if (a.busyLeft[i]! > 0 && loc === a.home[i] && a.action[i] !== Action.Provision) {
      a.busyLeft[i] = Math.max(0, a.busyLeft[i]! - dt);
      if (a.busyLeft[i] === 0 && a.activities[i] === AgentActivity.Eating) a.activities[i] = AgentActivity.Idle;
      continue;
    }
    if (loc !== a.home[i] || a.action[i] === Action.Sleep || !usable(world, loc)) continue;
    if (a.thirst[i]! < DRINK_BELOW && bs.water[loc]! >= 1) {
      bs.water[loc]! -= 1;
      a.thirst[i] = Math.min(1, a.thirst[i]! + DRINK);
    }
    if (a.hunger[i]! < EAT_BELOW && bs.food[loc]! >= 1) {
      bs.food[loc]! -= 1;
      a.hunger[i] = Math.min(1, a.hunger[i]! + MEAL);
      a.busyLeft[i] = MEAL_MINUTES;
      a.activities[i] = AgentActivity.Eating;
    }
  }
}

/** ¿El hogar tiene calefacción si hace frío? */
export function homeWarm(world: World, h: number): boolean {
  return world.buildings.wood[h]! > 0 || temperature(world) >= 14;
}

/**
 * Atención en los puntos de suministro (V4 (3)): cada uno atiende a un número limitado de clientes a la vez
 * (más con trabajadores); el resto espera → colas. Se ejecuta tras el movimiento.
 */
export function serviceSystem(world: World): void {
  const a = world.agents;
  const bs = world.buildings;
  const dt = world.time.minutesPerTick;
  for (let i = 0; i < a.count; i++) {
    if (a.action[i] !== Action.Provision) continue;
    const loc = a.location[i]!;
    if (loc < 0 || loc === a.home[i] || a.busyLeft[i] === 0) continue;
    const capacity = 2 + 2 * bs.workers[loc]!;
    if (bs.served[loc]! >= capacity) {
      bs.queue[loc]!++;
      a.activities[i] = AgentActivity.Queueing;
      continue;
    }
    bs.served[loc]!++;
    a.activities[i] = AgentActivity.Queueing;
    a.busyLeft[i] = Math.max(0, a.busyLeft[i]! - dt);
    if (a.busyLeft[i] === 0) collect(world, i, loc);
  }
}

/** Fin del servicio: el agente se lleva lo que necesita su casa (o recuerda que estaba vacío). */
function collect(world: World, i: number, b: number): void {
  const a = world.agents;
  const r = a.seeking[i]!;
  const home = a.home[i]!;
  const want = Math.max(1, world.buildings.residents[home]! * PANTRY_TARGET[r]! - stockOf(world, home, r));
  const take = Math.min(stockOf(world, b, r), want, CARRY_MAX);
  if (take < 1) {
    remember(world, i, EMPTY_MEMORY[r]!, b);
    world.emit('source.empty', { agentId: a.ids[i], name: a.names[i], building: world.map.buildings[b]!.id, resource: r });
    // Sigue en Provision sin objetivo: decide de inmediato y buscará otra fuente (desplazamiento a otra zona).
    a.seeking[i] = Resource.None;
    return;
  }
  addStock(world, b, r, -take);
  a.carryKind[i] = r;
  a.carryAmount[i] = take;
  a.seeking[i] = Resource.None;
}

/** Al llegar a casa con carga, se descarga en la despensa. */
export function unload(world: World, i: number): void {
  const a = world.agents;
  if (a.carryKind[i] === Resource.None) return;
  addStock(world, a.home[i]!, a.carryKind[i]!, a.carryAmount[i]!);
  a.carryKind[i] = Resource.None;
  a.carryAmount[i] = 0;
}

/** ¿Trabaja en un puesto utilizable? */
export function employed(world: World, i: number): boolean {
  const a = world.agents;
  const occ = a.occupation[i]!;
  return occ !== Occupation.Unemployed && occ !== Occupation.Retired && a.workplace[i]! >= 0 && usable(world, a.workplace[i]!);
}

/** Existencias iniciales de los puntos de suministro al crear el mundo. */
export function seedStocks(world: World): void {
  const bs = world.buildings;
  for (const p of world.map.byUse.publicServices) bs.water[p] = FOUNTAIN_CAP;
  for (const s of world.map.byUse.industrial) bs.wood[s] = 60;
  for (const s of world.map.byUse.retail) bs.food[s] = 150;
}
