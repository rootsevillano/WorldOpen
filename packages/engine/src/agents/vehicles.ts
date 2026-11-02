import type { World } from '../world/world';

/**
 * Vehículos (ADR-0025): un coche por hogar (con probabilidad `society.carOwnership`; ninguno en la época histórica).
 * Un adulto que sale de casa para un trayecto largo lo coge si está libre y puede pagar la gasolina; el coche va con
 * él hasta que vuelve a casa. Circula por las mismas calles, más rápido, y gasta gasolina por kilómetro.
 */

/** Velocidad en coche por el pueblo (m por minuto de juego, ≈ 24 km/h) y a pie (ver `systems.ts`). */
export const DRIVE_SPEED = 400;
/** Trayecto mínimo para coger el coche (m): para menos se va andando. */
export const DRIVE_MIN_M = 800;
/** Gasolina por kilómetro (× `economy.priceLevel`); se paga al Exterior. */
const FUEL_PER_KM = 0.15;
/** Edad mínima para conducir. */
const DRIVING_AGE = 18;

/** ¿Tiene coche el hogar? Del hash del id del hogar (sin consumir el PRNG): cambiar el criterio se aplica al momento. */
export function householdHasCar(world: World, household: number): boolean {
  if (world.criteria['world.era'] === 'historical') return false;
  const u = (Math.imul(household ^ 0x5bd1e995, 0x85ebca6b) >>> 0) / 0x100000000;
  return u < world.num('society.carOwnership');
}

/** Longitud de una ruta (pares x, z) desde (x, z). */
export function pathLength(x: number, z: number, path: Float64Array): number {
  let total = 0;
  for (let k = 0; k < path.length; k += 2) {
    const dx = path[k]! - x;
    const dz = path[k + 1]! - z;
    total += Math.sqrt(dx * dx + dz * dz);
    x = path[k]!;
    z = path[k + 1]!;
  }
  return total;
}

export function fuelCost(world: World, meters: number): number {
  return (meters / 1000) * FUEL_PER_KM * world.num('economy.priceLevel');
}

/** Hogares cuyo coche está fuera (lo lleva alguien), recalculado al principio de cada decisión. */
export function carsInUse(world: World): Set<number> {
  const a = world.agents;
  const busy = new Set<number>();
  for (let i = 0; i < a.count; i++) if (a.driving[i]) busy.add(a.household[i]!);
  return busy;
}

/** ¿Coge el coche para salir de casa hacia una ruta de `length` metros? */
export function shouldDrive(world: World, i: number, length: number, busy: Set<number>): boolean {
  const a = world.agents;
  const hh = a.household[i]!;
  return (
    length >= DRIVE_MIN_M &&
    a.age[i]! >= DRIVING_AGE &&
    !busy.has(hh) &&
    householdHasCar(world, hh) &&
    a.money[i]! >= fuelCost(world, 2 * length)
  );
}

/**
 * Atascos en la carretera comarcal (ADR-0045): la velocidad de los coches de cada tramo baja con la densidad de coches
 * en él (curva BPR: 1 / (1 + 0,15·r⁴), con r = coches / capacidad del tramo), hasta un 15 % de la normal. Capacidad de
 * 6 coches por km: una carretera estrecha, de un carril por sentido. Por debajo del 60 % se considera atasco.
 */
const LINK_CARS_PER_KM = 6;
const LINK_NEAR_M = 15;
const JAM_FLOOR = 0.15;
export const JAMMED_BELOW = 0.6;

export function jamFactor(cars: number, lengthM: number): number {
  const r = cars / Math.max(1, (LINK_CARS_PER_KM * lengthM) / 1000);
  const r2 = r * r;
  return Math.max(JAM_FLOOR, 1 / (1 + 0.15 * r2 * r2));
}

/** Tramo de la carretera comarcal por el que circula cada coche (−1 si ninguno) y factor de velocidad de cada tramo. */
export function linkTraffic(world: World): { linkOf: Int32Array; factor: number[]; cars: number[] } {
  const a = world.agents;
  const map = world.map;
  const links = map.links;
  const linkOf = new Int32Array(a.count).fill(-1);
  const cars = links.map(() => 0);
  if (links.length > 0) {
    for (let i = 0; i < a.count; i++) {
      if (a.driving[i] !== 1 || !a.paths[i]) continue;
      const x = a.positions[i * 3]!;
      const z = a.positions[i * 3 + 2]!;
      for (let k = 0; k < links.length; k++) {
        const [p, q] = links[k]!;
        const px = map.nodeX[p]!;
        const pz = map.nodeZ[p]!;
        const dx = map.nodeX[q]! - px;
        const dz = map.nodeZ[q]! - pz;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? ((x - px) * dx + (z - pz) * dz) / len2 : -1;
        if (t <= 0 || t >= 1) continue;
        const ex = px + dx * t - x;
        const ez = pz + dz * t - z;
        if (ex * ex + ez * ez > LINK_NEAR_M * LINK_NEAR_M) continue;
        linkOf[i] = k;
        cars[k]!++;
        break;
      }
    }
  }
  const factor = links.map(([p, q], k) => {
    const dx = map.nodeX[q]! - map.nodeX[p]!;
    const dz = map.nodeZ[q]! - map.nodeZ[p]!;
    return jamFactor(cars[k]!, Math.sqrt(dx * dx + dz * dz));
  });
  return { linkOf, factor, cars };
}
