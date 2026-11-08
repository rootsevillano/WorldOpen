import { AgentFlag } from '@worldopen/contracts';
import { Action, Occupation } from '../world/agents';
import type { World } from '../world/world';
import { harvestFactor, minuteOfDay } from './environment';

/**
 * Huertos de las casas de campo (ADR-0054). Cada casa de campo tiene su huerto al lado. Por la mañana (08:00–12:00) y
 * al caer la tarde (18:00–20:30), quien vive en ella y tiene 14 años o más puede salir a cuidarlo (`Action.Tend`), si
 * no tiene nada más urgente. Mientras lo cuida, el huerto da comida que va directa a la despensa de la casa, según la
 * estación, hasta llenarla; con la despensa llena se cuida menos.
 */

/** Franjas del huerto (minuto del día): mañana y tarde. */
const GARDEN_WINDOWS: [number, number][] = [[480, 720], [1080, 1230]];
/** Comida por persona y minuto cuidando el huerto (× estación): unas 1,5 raciones por hora. */
const GARDEN_FOOD = 0.025;
/** Despensa que llena el huerto, por residente: el doble del objetivo de compra (6). */
const GARDEN_PANTRY = 12;
/** Edad mínima para cuidar el huerto. */
const GARDEN_AGE = 14;

/** ¿Tiene huerto el edificio? */
export function hasGarden(world: World, b: number): boolean {
  return b >= 0 && world.map.buildings[b]?.garden !== undefined;
}

/** ¿Es hora de huerto? */
export function gardenHours(world: World): boolean {
  const m = minuteOfDay(world);
  return GARDEN_WINDOWS.some(([from, to]) => m >= from && m < to);
}

/** Despensa que puede llenar el huerto de la casa `b`. */
function gardenCap(world: World, b: number): number {
  return Math.max(1, world.buildings.residents[b]!) * GARDEN_PANTRY;
}

/**
 * Ganas de cuidar el huerto de `i` (0 si no procede): más en primavera y verano, menos con mal tiempo o con la
 * despensa llena; quien ya está en ello sigue.
 */
export function tendScore(world: World, i: number, outdoorAppeal: number): number {
  const a = world.agents;
  const home = a.home[i]!;
  if (!hasGarden(world, home) || a.age[i]! < GARDEN_AGE || a.occupation[i] === Occupation.Visitor) return 0;
  const full = world.buildings.food[home]! >= gardenCap(world, home);
  return (0.25 + 0.3 * harvestFactor(world)) * outdoorAppeal * (full ? 0.5 : 1) + (a.action[i] === Action.Tend ? 0.25 : 0);
}

/** Cosecha del tick: cada persona en su huerto añade comida a la despensa de su casa. */
export function gardenSystem(world: World): void {
  const a = world.agents;
  const bs = world.buildings;
  const yieldPerTick = world.time.minutesPerTick * GARDEN_FOOD * harvestFactor(world);
  for (let i = 0; i < a.count; i++) {
    if (a.action[i] !== Action.Tend) continue;
    const home = a.home[i]!;
    if (a.location[i] !== home || !hasGarden(world, home)) continue;
    bs.food[home] = Math.max(bs.food[home]!, Math.min(gardenCap(world, home), bs.food[home]! + yieldPerTick));
  }
}

/** Quien cuida el huerto, en un punto fijo del huerto (hash del id), fuera de casa. Se deriva: no cambia el estado. */
export function gardenFrame(world: World, flags: Uint8Array, positions: Float32Array): void {
  const a = world.agents;
  for (let i = 0; i < flags.length; i++) {
    if (a.action[i] !== Action.Tend) continue;
    const home = a.home[i]!;
    const g = a.location[i] === home ? world.map.buildings[home]?.garden : undefined;
    if (!g) continue;
    const h = Math.imul(a.ids[i]! ^ 0x6c8e9cf5, 0x2c1b3c6d) >>> 0;
    const along = (((h & 0xffff) / 0x10000) - 0.5) * g.length * 0.85;
    const across = (((h >>> 16) / 0x10000) - 0.5) * g.width * 0.85;
    positions[i * 3] = g.x + g.dirX * along - g.dirZ * across;
    positions[i * 3 + 2] = g.z + g.dirZ * along + g.dirX * across;
    flags[i] = flags[i]! & ~AgentFlag.Indoors;
  }
}

/** Despensa media por residente en las casas con huerto (para las métricas). */
export function gardenPantry(world: World): number {
  let food = 0;
  let residents = 0;
  world.map.buildings.forEach((b, k) => {
    if (b.garden === undefined) return;
    food += world.buildings.food[k]!;
    residents += world.buildings.residents[k]!;
  });
  return residents === 0 ? 0 : food / residents;
}
