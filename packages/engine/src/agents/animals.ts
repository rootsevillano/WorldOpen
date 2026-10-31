import { AgentFlag } from '@worldopen/contracts';
import { headingOf } from '../math/angles';
import { ticksPerDay } from '../time/clock';
import { Action } from '../world/agents';
import { Animal } from '../world/animals';
import type { World } from '../world/world';
import { storageCap } from './economy';
import { minuteOfDay, nightFactor } from './environment';

/**
 * Animales (ADR-0027). Perros de los hogares (`society.petOwnership`) que salen con quien vaya a pie por la calle, y
 * ganado de las huertas (`economy.livestock`): gallinas y ovejas que deambulan junto a la nave, se recogen de noche y
 * dan huevos y leche los días en que se trabaja la huerta. Sin PRNG: los sorteos son hashes (id, día o tick).
 */

/** Gallinas y ovejas por m² construido de la huerta (× `economy.livestock`). */
const HENS_PER_M2 = 1 / 20;
const SHEEP_PER_M2 = 1 / 100;
/** Comida diaria por animal los días con cuidado (huevos, leche). */
const DAILY_FOOD: Record<number, number> = { [Animal.Hen]: 0.5, [Animal.Sheep]: 1 };
/** Velocidad al deambular (m por minuto) y radio alrededor de la nave (m, además de su tamaño). */
const WANDER_SPEED: Record<number, number> = { [Animal.Hen]: 4, [Animal.Sheep]: 6 };
const WANDER_MARGIN = 12;
/** Perros: paseo mínimo diario (min), edad desde la que puede morir (años), adopción diaria y comida diaria. */
export const DOG_WALK_MINUTES = 20;
const DOG_OLD_AGE = 10;
const DOG_ADOPTION_DAILY = 1 / 60;
export const DOG_FOOD_COST = 2;
/** Edad mínima para sacar al perro; necesidad social que da pasearlo (por minuto) y que quita no sacarlo. */
const WALKER_AGE = 10;
const WALK_SOCIAL = 0.002;
const UNWALKED_SOCIAL = 0.05;

const hash = (a: number, b: number) => (Math.imul(Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b), 0xc2b2ae35) >>> 0) / 0x100000000;

/** ¿Es un hogar con perro? (por hash: cambiar el criterio cambia quién adopta, no quita perros.) */
export function dogHousehold(world: World, household: number): boolean {
  return hash(household, 77) < world.num('society.petOwnership');
}

function today(world: World): number {
  return Math.floor(world.tick / ticksPerDay(world.time));
}

function addDog(world: World, household: number, home: number, born: number): void {
  const c = world.map.buildings[home]!.centroid;
  const i = world.animals.add(Animal.Dog, c.x, c.z);
  if (i < 0) return;
  world.animals.household[i] = household;
  world.animals.born[i] = born;
  world.animals.flags[i] = AgentFlag.Indoors;
}

/** Ganado de cada huerta según su superficie y el criterio: añade o retira hasta la cifra objetivo. */
function balanceLivestock(world: World): void {
  const an = world.animals;
  const level = world.num('economy.livestock');
  const have = new Map<string, number[]>();
  for (let i = 0; i < an.count; i++) {
    if (an.kind[i] === Animal.Dog) continue;
    const key = `${an.farm[i]}:${an.kind[i]}`;
    const list = have.get(key) ?? [];
    list.push(i);
    have.set(key, list);
  }
  const remove: number[] = [];
  for (const f of world.map.byUse.agriculture) {
    const area = world.map.buildings[f]!.grossFloorAreaM2;
    const c = world.map.buildings[f]!.centroid;
    for (const [kind, perM2] of [[Animal.Hen, HENS_PER_M2], [Animal.Sheep, SHEEP_PER_M2]] as const) {
      const target = Math.floor(area * perM2 * level);
      const list = have.get(`${f}:${kind}`) ?? [];
      for (let k = list.length; k < target; k++) {
        const i = an.add(kind, c.x, c.z);
        if (i < 0) break;
        an.farm[i] = f;
        an.born[i] = today(world);
        an.flags[i] = AgentFlag.Indoors;
      }
      for (let k = target; k < list.length; k++) remove.push(list[k]!);
    }
  }
  for (const i of remove.sort((x, y) => y - x)) an.removeAt(i);
}

/** Al crear el mundo: perros de varias edades en los hogares que suelen tener, y el ganado de cada huerta. */
export function seedAnimals(world: World): void {
  const a = world.agents;
  const seen = new Set<number>();
  for (let i = 0; i < a.count; i++) {
    const hh = a.household[i]!;
    if (seen.has(hh)) continue;
    seen.add(hh);
    if (dogHousehold(world, hh)) addDog(world, hh, a.home[i]!, -Math.floor(hash(hh, 78) * 12 * 360));
  }
  balanceLivestock(world);
}

/** Medianoche: producción del ganado, cuentas del paseo, muertes de perros viejos y adopciones. */
function daily(world: World): void {
  const a = world.agents;
  const an = world.animals;
  const bs = world.buildings;
  const day = today(world);
  // ¿Se trabajó hoy en cada huerta? (los minutos se reinician después, al pagar el jornal)
  const cared = new Set<number>();
  for (let i = 0; i < a.count; i++) if (a.workedToday[i]! > 0 && a.workplace[i]! >= 0) cared.add(a.workplace[i]!);
  const homes = new Map<number, number>();
  for (let i = 0; i < a.count; i++) if (!homes.has(a.household[i]!)) homes.set(a.household[i]!, a.home[i]!);
  const dogs = new Set<number>();
  const gone: number[] = [];
  for (let i = 0; i < an.count; i++) {
    if (an.kind[i] !== Animal.Dog) {
      const f = an.farm[i]!;
      if (cared.has(f)) bs.food[f] = Math.min(storageCap(world, f), bs.food[f]! + DAILY_FOOD[an.kind[i]!]!);
      continue;
    }
    const hh = an.household[i]!;
    const age = (day - an.born[i]!) / 360;
    // El perro se va con su hogar si este deja el pueblo; los viejos mueren con probabilidad creciente.
    if (!homes.has(hh) || (age >= DOG_OLD_AGE && hash(an.ids[i]!, day) < ((age - DOG_OLD_AGE + 1) * 0.1) / 360)) {
      gone.push(i);
      if (homes.has(hh)) world.emit('dog.died', { household: hh, age: Math.floor(age) });
      continue;
    }
    dogs.add(hh);
    an.walkedYesterday[i] = an.walkedToday[i]!;
    // Sin paseo, el hogar lo nota.
    if (an.walkedToday[i]! < DOG_WALK_MINUTES) {
      for (let j = 0; j < a.count; j++) if (a.household[j] === hh) a.social[j] = Math.max(0, a.social[j]! - UNWALKED_SOCIAL);
    }
    an.walkedToday[i] = 0;
  }
  for (const i of gone.sort((x, y) => y - x)) an.removeAt(i);
  for (const [hh, home] of homes) {
    if (!dogs.has(hh) && dogHousehold(world, hh) && hash(hh, day) < DOG_ADOPTION_DAILY) {
      addDog(world, hh, home, day);
      world.emit('dog.adopted', { household: hh, home: world.map.buildings[home]!.id });
    }
  }
  balanceLivestock(world);
}

/** Hogares con perro sin pasear hoy (para animar a salir en la decisión). */
export function dogsToWalk(world: World): Set<number> {
  const an = world.animals;
  const out = new Set<number>();
  for (let i = 0; i < an.count; i++) if (an.kind[i] === Animal.Dog && an.walkedToday[i]! < DOG_WALK_MINUTES) out.add(an.household[i]!);
  return out;
}

/** Hogares con perro (para su comida diaria). */
export function dogOwners(world: World): Set<number> {
  const an = world.animals;
  const out = new Set<number>();
  for (let i = 0; i < an.count; i++) if (an.kind[i] === Animal.Dog) out.add(an.household[i]!);
  return out;
}

export function animalSystem(world: World): void {
  const dt = world.time.minutesPerTick;
  if (minuteOfDay(world) < dt) daily(world);
  const a = world.agents;
  const an = world.animals;
  // Por hogar: quien sale a pie por ocio (saca al perro) y dónde vive. Con ticks largos un paseo corto empieza y
  // acaba en el mismo tick: cuenta toda la salida, también el rato en el local (el perro espera fuera, sin dibujarse).
  // Solo interesan los hogares con perro (el recorrido de agentes es lo más caro de este sistema).
  const dogOf = new Map<number, number>();
  for (let i = 0; i < an.count; i++) if (an.kind[i] === Animal.Dog) dogOf.set(an.household[i]!, i);
  const onFoot = new Map<number, number>();
  const walking = new Map<number, number>();
  const homes = new Map<number, number>();
  for (let i = 0; i < a.count; i++) {
    const hh = a.household[i]!;
    const d = dogOf.get(hh);
    if (d === undefined) continue;
    if (a.ids[i] === an.walker[d]) walking.set(d, i);
    if (!homes.has(hh)) homes.set(hh, a.home[i]!);
    const loc = a.location[i]!;
    const outing = a.action[i] === Action.GoOut || (a.action[i] === Action.Stay && loc >= 0 && loc !== a.home[i] && loc !== a.workplace[i]);
    if (outing && !a.driving[i] && a.age[i]! >= WALKER_AGE && loc !== a.home[i] && !onFoot.has(hh)) onFoot.set(hh, i);
  }
  const night = nightFactor(world) > 0.5;
  for (let i = 0; i < an.count; i++) {
    if (an.kind[i] === Animal.Dog) {
      const hh = an.household[i]!;
      let w = walking.get(i);
      // El paseante lo lleva hasta volver a casa (o hasta coger el coche).
      if (w === undefined || a.location[w] === a.home[w] || a.driving[w]) w = onFoot.get(hh);
      if (w === undefined) {
        // En casa con su hogar.
        an.walker[i] = 0;
        an.flags[i] = AgentFlag.Indoors;
        const home = homes.get(hh);
        if (home !== undefined) {
          const c = world.map.buildings[home]!.centroid;
          an.positions[i * 3] = c.x;
          an.positions[i * 3 + 2] = c.z;
          an.aim[i * 2] = c.x;
          an.aim[i * 2 + 1] = c.z;
        }
        continue;
      }
      // Sigue al paseante un paso por detrás: ocupa la posición que él tenía en el tick anterior.
      if (an.walker[i] !== a.ids[w]) {
        an.aim[i * 2] = an.positions[i * 3]!;
        an.aim[i * 2 + 1] = an.positions[i * 3 + 2]!;
      }
      an.walker[i] = a.ids[w]!;
      an.walkedToday[i] = Math.min(1440, an.walkedToday[i]! + dt);
      a.social[w] = Math.min(1, a.social[w]! + WALK_SOCIAL * dt);
      if (a.location[w]! >= 0) {
        // Dentro de un local: el perro espera fuera, sin dibujarse.
        an.flags[i] = AgentFlag.Indoors;
        continue;
      }
      an.flags[i] = 0;
      const x = an.aim[i * 2]!;
      const z = an.aim[i * 2 + 1]!;
      const ox = a.positions[w * 3]!;
      const oz = a.positions[w * 3 + 2]!;
      if (ox !== x || oz !== z) an.headings[i] = headingOf(ox - x, oz - z);
      an.positions[i * 3] = x;
      an.positions[i * 3 + 2] = z;
      an.aim[i * 2] = ox;
      an.aim[i * 2 + 1] = oz;
      continue;
    }
    // Ganado: de noche, recogido; de día, deambula hacia un punto al azar (por hash) cerca de su nave.
    const f = an.farm[i]!;
    const b = world.map.buildings[f]!;
    if (night || world.buildings.state[f] !== 0) {
      an.flags[i] = AgentFlag.Indoors;
      an.positions[i * 3] = b.centroid.x;
      an.positions[i * 3 + 2] = b.centroid.z;
      continue;
    }
    an.flags[i] = 0;
    const x = an.positions[i * 3]!;
    const z = an.positions[i * 3 + 2]!;
    let tx = an.aim[i * 2]!;
    let tz = an.aim[i * 2 + 1]!;
    const dx = tx - x;
    const dz = tz - z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const step = WANDER_SPEED[an.kind[i]!]! * dt;
    if (dist <= step) {
      an.positions[i * 3] = tx;
      an.positions[i * 3 + 2] = tz;
      const r = Math.sqrt(b.grossFloorAreaM2) / 2 + WANDER_MARGIN;
      tx = b.centroid.x + (hash(an.ids[i]!, world.tick) * 2 - 1) * r;
      tz = b.centroid.z + (hash(an.ids[i]!, world.tick + 7919) * 2 - 1) * r;
      an.aim[i * 2] = tx;
      an.aim[i * 2 + 1] = tz;
    } else {
      an.positions[i * 3] = x + (dx / dist) * step;
      an.positions[i * 3 + 2] = z + (dz / dist) * step;
      an.headings[i] = headingOf(dx, dz);
    }
  }
}
