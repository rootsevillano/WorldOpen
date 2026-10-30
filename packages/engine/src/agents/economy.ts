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
/**
 * Importaciones diarias de comida del Exterior por habitante, × `economy.foodAbundance` (ADR-0019): un pueblo así no
 * se alimenta de sus huertas. Antes eran 12 por tienda y, sin el traslado mágico de cosechas, el fin de semana vaciaba
 * las tiendas y desataba una espiral de hambre.
 */
const IMPORT_PER_PERSON = 7;
// ADR-0021: de 6 a 7; sin el excedente acumulado sin límite, el invierno vaciaba las tiendas del mapa real.
/** Consumo medio medido (≈ 4.3 raciones por persona y día): con `foodAbundance` 0.7 las importaciones cubren casi todo; la cosecha local completa. */
/** Manantial de cada fuente pública y su capacidad. */
const FOUNTAIN_REFILL = 0.5;
const FOUNTAIN_CAP = 300;
/** Agua corriente por hogar, × `economy.waterSupply`. */
/** Agua corriente por residente y minuto (un edificio de pisos recibe más que una casa). */
const TAP_WATER = 0.02;
/**
 * Capacidad de almacén por superficie construida, con un mínimo (ADR-0021): una huerta llena deja de producir, un
 * aserradero lleno también, y una tienda llena no acepta más cosecha (las importaciones ya se limitan a 3 días).
 */
const STORAGE: Record<string, [perM2: number, min: number]> = { retail: [4, 400], agriculture: [4, 200], industrial: [5, 300] };
/** Caducidad diaria de la comida: tiendas, huertas (producto fresco) y despensas (ADR-0021). */
const SPOILAGE: Record<string, number> = { retail: 0.02, agriculture: 0.05, residential: 0.01 };

/** Capacidad de almacén de un edificio productivo o comercial (Infinity en los demás). */
export function storageCap(world: World, b: number): number {
  const building = world.map.buildings[b]!;
  const s = STORAGE[building.use];
  return s ? Math.max(s[1], building.grossFloorAreaM2 * s[0]) : Infinity;
}

/** Leña que gasta un hogar ocupado por debajo de 14 °C. */
const HEATING_WOOD = 0.004;

/** Objetivo de despensa por residente. */
export const PANTRY_TARGET: Record<number, number> = { [Resource.Food]: 6, [Resource.Water]: 6, [Resource.Wood]: 3 };
/** Lo que puede cargar un agente de una vez. */
const CARRY_MAX = 12;
/** Minutos de servicio por cliente en el punto de suministro. */
export const SERVICE_MINUTES = 5;
/** Un recuerdo de "vacío" o "incendio" disuade durante un día. */
export const AVOID_TICKS_DAYS = 0.5;

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
  const avoid = Math.round(AVOID_TICKS_DAYS * ticksPerDay(world.time));
  let best = -1;
  let bestD = Infinity;
  let fallback = -1;
  let fallbackD = Infinity;
  for (const b of sourcesOf(world, r)) {
    if (!usable(world, b)) continue;
    const c = world.map.buildings[b]!.centroid;
    const d = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
    // Si las recuerda todas vacías, vuelve a probar en la más cercana (pudieron reponerla) en vez de rendirse.
    if (d < fallbackD && !recalls(world, i, Memory.Fire, b, avoid)) {
      fallbackD = d;
      fallback = b;
    }
    if (recalls(world, i, EMPTY_MEMORY[r]!, b, avoid) || recalls(world, i, Memory.Fire, b, avoid)) continue;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best >= 0 ? best : fallback;
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
    if (a.action[i] === Action.Work && loc === a.workplace[i] && a.occupation[i] !== Occupation.Student) bs.workers[loc]!++;
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

  for (const f of map.byUse.agriculture) {
    if (usable(world, f)) bs.food[f] = Math.min(storageCap(world, f), bs.food[f]! + dt * FARM_FOOD * bs.workers[f]! * foodAbundance * harvest);
  }
  for (const s of map.byUse.industrial) if (usable(world, s)) bs.wood[s] = Math.min(storageCap(world, s), bs.wood[s]! + dt * SAWMILL_WOOD * bs.workers[s]!);
  for (const p of map.byUse.publicServices) if (usable(world, p)) bs.water[p] = Math.min(FOUNTAIN_CAP, bs.water[p]! + dt * FOUNTAIN_REFILL);
  for (const h of map.homes) {
    const cap = bs.residents[h]! * PANTRY_TARGET[Resource.Water]!;
    if (bs.water[h]! < cap && usable(world, h)) bs.water[h] = Math.min(cap, bs.water[h]! + dt * TAP_WATER * Math.max(1, bs.residents[h]!) * waterSupply);
  }

  // Medianoche: la comida caduca (ADR-0021). Las existencias dejan de crecer sin límite en mundos largos.
  const m = minuteOfDay(world);
  if (m < dt) {
    for (const s of map.byUse.retail) bs.food[s]! *= 1 - SPOILAGE.retail!;
    for (const f of map.byUse.agriculture) bs.food[f]! *= 1 - SPOILAGE.agriculture!;
    for (const h of map.homes) bs.food[h]! *= 1 - SPOILAGE.residential!;
  }

  // 06:00: importaciones del Exterior (E5). Las cosechas ya no se teletransportan: las llevan los agricultores.
  if (m <= 360 && 360 < m + dt) {
    const shops = map.byUse.retail.filter((s) => usable(world, s));
    // Reparto según el área de influencia de cada tienda (residentes cuya tienda más cercana es esa) y tope de unos
    // 3 días de consumo por tienda. Repartir a partes iguales vaciaba las céntricas, y un tope global dejaba sin
    // importaciones a las céntricas cuando las cosechas llenaban las periféricas (ADR-0019).
    const weight = new Float64Array(shops.length).fill(1);
    for (const h of map.homes) {
      const res = bs.residents[h]!;
      if (res === 0) continue;
      const c = map.buildings[h]!.centroid;
      let best = 0;
      let bestD = Infinity;
      shops.forEach((sh, k) => {
        const q = map.buildings[sh]!.centroid;
        const d = (q.x - c.x) * (q.x - c.x) + (q.z - c.z) * (q.z - c.z);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      weight[best]! += res;
    }
    let total = 0;
    for (const w of weight) total += w;
    const daily = world.agents.count * IMPORT_PER_PERSON;
    shops.forEach((sh, k) => {
      const share = weight[k]! / total;
      const room = Math.max(0, 3 * daily * share - bs.food[sh]!);
      bs.food[sh]! += Math.min(room, daily * foodAbundance * share);
    });
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
    // Quien trabaja en una huerta come de su cosecha si tiene hambre.
    if (loc >= 0 && loc === a.workplace[i] && map.buildings[loc]!.use === 'agriculture' && a.hunger[i]! < EAT_BELOW && bs.food[loc]! >= 1) {
      bs.food[loc]! -= 1;
      a.hunger[i] = Math.min(1, a.hunger[i]! + MEAL);
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
    // Al cerrar, quien sigue en la cola se va sin nada (no la recuerda como vacía: estaba cerrada).
    if (!sourceOpen(world, a.seeking[i]!)) {
      a.busyLeft[i] = 0;
      a.seeking[i] = Resource.None;
      a.action[i] = Action.Stay;
      a.activities[i] = AgentActivity.Idle;
      continue;
    }
    // Clientes atendidos por tick: un mostrador atiende dt / SERVICE_MINUTES clientes (no depende del tamaño del tick).
    const capacity = (counters(world, loc) + 2 * bs.workers[loc]!) * Math.max(1, Math.floor(dt / SERVICE_MINUTES));
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

/** Mostradores de un punto de suministro según su tamaño: uno por cada 50 m² de planta, mínimo 2 (ADR-0018). */
function counters(world: World, b: number): number {
  return Math.max(2, Math.floor(world.map.buildings[b]!.grossFloorAreaM2 / 50));
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
  return occ !== Occupation.Unemployed && occ !== Occupation.Retired && occ !== Occupation.Child && a.workplace[i]! >= 0 && usable(world, a.workplace[i]!);
}

/** Cosecha mínima que justifica un viaje de reparto y lo que cabe en un viaje. */
export const DELIVERY_MIN = 20;
export const DELIVERY_MAX = 40;

/** Tienda en uso más cercana a (x, z) con hueco para un reparto (ADR-0021), o −1. */
export function nearestShop(world: World, x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (const s of world.map.byUse.retail) {
    if (!usable(world, s) || storageCap(world, s) - world.buildings.food[s]! < DELIVERY_MIN) continue;
    const c = world.map.buildings[s]!.centroid;
    const d = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Existencias iniciales de los puntos de suministro al crear el mundo (tras crear la población). */
export function seedStocks(world: World): void {
  const bs = world.buildings;
  const u = world.map.byUse;
  for (const p of u.publicServices) bs.water[p] = FOUNTAIN_CAP;
  for (const s of u.industrial) bs.wood[s] = 60;
  // Unos tres días de comida por habitante, repartidos entre las tiendas: no depende de cuántas haya.
  const food = 3 * world.agents.count;
  for (const s of u.retail) bs.food[s] = food / u.retail.length;
}
