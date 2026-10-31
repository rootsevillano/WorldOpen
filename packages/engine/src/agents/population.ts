import { AgentActivity, AgentFlag, type BuildingUse } from '@worldopen/contracts';
import { personName } from '../content/names';
import { Action, Occupation, RelationKind } from '../world/agents';
import type { World } from '../world/world';
import { fertilityAt } from './fertility';
import { seedLandlords } from './housing';
import { SCHOOL_SCALE_M, WORK_SCALE_M, pickNearby } from './nearby';
import { bond, pair, partnerId } from './social';

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

/**
 * Ocupación según la edad: 0–5 en casa, 6–17 a la escuela más cercana (un servicio público), 67+ jubilados; los
 * adultos, un puesto proporcional a los disponibles y cercano a su casa, o paro (15 %).
 */
export function pickOccupation(world: World, age: number, home: number): [number, number] {
  const c = world.map.buildings[home]!.centroid;
  if (age < 6) return [Occupation.Child, -1];
  if (age < 18) {
    const school = pickNearby(world, c.x, c.z, world.map.byUse.publicServices, SCHOOL_SCALE_M);
    return school >= 0 ? [Occupation.Student, school] : [Occupation.Child, -1];
  }
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
    if (r < list.length) return [occ, pickNearby(world, c.x, c.z, list, WORK_SCALE_M)];
    r -= list.length;
  }
  return [Occupation.Unemployed, -1];
}

/** Edad de un adulto según una pirámide aproximada de un municipio español (18–39 / 40–64 / 65+). */
function adultAge(world: World): number {
  const r = world.rng.nextFloat();
  if (r < 0.36) return world.rng.int(18, 39);
  if (r < 0.8) return world.rng.int(40, 64);
  return world.rng.int(65, 90);
}

/** Cronotipo: hora preferida de acostarse (minuto del día). Niños 21:00–22:00; jóvenes y adultos 22:30–00:30. */
export function bedtimeFor(world: World, age: number): number {
  if (age < 12) return world.rng.int(1260, 1320);
  if (age < 18) return world.rng.int(1350, 1410);
  return world.rng.int(1350, 1470) % 1440;
}

/**
 * Crea un habitante ficticio dentro de su casa. Devuelve su id. `age` fija la edad (si no, un adulto al azar);
 * `household` el hogar (0 = uno nuevo); `sex` el sexo (si no, al azar).
 */
export function spawnAgent(world: World, home = -1, age?: number, household = 0, sex?: number): number {
  const rng = world.rng;
  const h = home >= 0 ? home : pickHome(world);
  const b = world.map.buildings[h]!;
  const a = world.agents;
  const i = a.add(b.centroid.x, 0, b.centroid.z);
  a.sex[i] = sex ?? rng.int(0, 1);
  a.household[i] = household > 0 ? household : a.nextHousehold++;
  a.age[i] = age ?? adultAge(world);
  a.sociability[i] = rng.nextFloat();
  a.bravery[i] = rng.nextFloat();
  const [occupation, workplace] = pickOccupation(world, a.age[i]!, h);
  a.occupation[i] = occupation;
  a.workplace[i] = workplace;
  a.bedtime[i] = bedtimeFor(world, a.age[i]!);
  a.birthDay[i] = rng.int(0, 359);
  // Ahorros iniciales de los adultos (ADR-0022).
  a.money[i] = a.age[i]! >= 18 ? rng.int(300, 3000) : 0;
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

  // Quien comparte hogar es familia (S7, ADR-0020; en un bloque de pisos, solo su vivienda). Comparte su vivienda
  // en propiedad o de alquiler (ADR-0024).
  const id = a.ids[i]!;
  for (let j = 0; j < a.count; j++) {
    if (j !== i && a.household[j] === a.household[i]) {
      a.renting[i] = a.renting[j]!;
      a.arrears[i] = a.arrears[j]!;
      a.landlord[i] = a.landlord[j]!;
      a.mortgage[i] = a.mortgage[j]!;
      a.spare[i] = a.spare[j]!;
      bond(world, i, a.ids[j]!, 0.6, RelationKind.Family);
      bond(world, j, id, 0.6, RelationKind.Family);
    }
  }
  world.emit('agent.spawned', { agentId: id, name: a.names[i], home: b.id });
  return id;
}

/** Tamaño de hogar (España, aprox.): 1 → 26 %, 2 → 30 %, 3 → 21 %, 4 → 17 %, 5 → 6 %. */
const HOUSEHOLD_SIZES: [number, number][] = [[1, 0.26], [2, 0.3], [3, 0.21], [4, 0.17], [5, 0.06]];

export function householdSize(world: World): number {
  let r = world.rng.nextFloat();
  let size = 1;
  for (const [sz, p] of HOUSEHOLD_SIZES) {
    size = sz;
    if ((r -= p) < 0) break;
  }
  return size;
}

/** Hogares de alquiler en la población inicial (≈ España, ADR-0024). */
const RENTER_SHARE = 0.25;

/** Proporción de parejas del mismo sexo. */
const SAME_SEX_COUPLES = 0.05;

/**
 * Crea un hogar de hasta `size` miembros en `home`: con 2+, los dos primeros suelen ser pareja (ADR-0020). Devuelve el
 * número de habitantes creados (se detiene si el almacén está lleno).
 */
export function spawnHousehold(world: World, home: number, size: number, renterShare = RENTER_SHARE): number {
  const a = world.agents;
  const household = a.nextHousehold++;
  // Del id del hogar (hash entero), sin consumir el PRNG: añadir la tenencia no cambia la población generada.
  const renting = (Math.imul(household, 0x9e3779b1) >>> 0) / 0x100000000 < renterShare ? 1 : 0;
  let first = -1;
  let created = 0;
  const [ages, couple] = householdAges(world, size);
  for (const age of ages) {
    if (a.count >= a.capacity) break;
    const partner = couple && created === 1;
    const sex = partner ? (world.rng.nextFloat() < SAME_SEX_COUPLES ? a.sex[first]! : 1 - a.sex[first]!) : undefined;
    spawnAgent(world, home, age, household, sex);
    a.renting[a.count - 1] = renting;
    if (created === 0) first = a.count - 1;
    else if (partner) pair(world, first, a.count - 1);
    created++;
  }
  return created;
}

/** Hogares de 2 y de 3+ miembros sin pareja (monoparentales, o un mayor con un hijo adulto). */
const NO_COUPLE: [number, number] = [0.3, 0.12];

/**
 * Edades de un hogar y si los dos primeros son pareja: adultos solos o en pareja; con 3+ miembros, normalmente dos
 * adultos e hijos (D4, ADR-0020).
 */
function householdAges(world: World, size: number): [number[], boolean] {
  const rng = world.rng;
  // Los mayores viven sobre todo solos o en pareja: en estos hogares, más peso de 65+.
  const smallAge = () => (rng.nextFloat() < 0.38 ? rng.int(65, 90) : adultAge(world));
  if (size === 1) return [[smallAge()], false];
  const first = size === 2 ? smallAge() : rng.int(28, 55);
  const couple = rng.nextFloat() >= NO_COUPLE[size === 2 ? 0 : 1]!;
  const second = couple
    ? Math.max(18, Math.min(90, first + rng.int(-5, 5)))
    : rng.int(Math.max(0, first - 45), Math.max(0, Math.min(60, first - 18)));
  const ages = [first, second];
  // A veces un hijo mayor o un abuelo en lugar de un niño.
  const extraAdults = size >= 3 && rng.nextFloat() < 0.3 ? 1 : 0;
  for (let k = 2; k < size; k++) {
    if (k - 2 < extraAdults) ages.push(rng.nextFloat() < 0.5 ? rng.int(18, 30) : rng.int(70, 90));
    else ages.push(rng.int(0, Math.min(17, Math.max(0, first - 18))));
  }
  return [ages, couple];
}

/**
 * Población inicial por hogares (D4): reparte `n` habitantes en las viviendas catastrales (en orden aleatorio
 * determinista), con tamaños y edades de hogar realistas. Si hay más gente que viviendas, se comparten.
 */
export function populate(world: World, n: number): void {
  populateHouseholds(world, n);
  seedPregnancies(world);
  seedLandlords(world);
}

/**
 * Estado estacionario de embarazos (ADR-0019): una población real ya tiene embarazos en curso. Cada mujer en edad
 * fértil con pareja lo está con probabilidad fecundidad × 270/360, en un día al azar del embarazo.
 */
function seedPregnancies(world: World): void {
  const a = world.agents;
  const rng = world.rng;
  const fertility = world.num('society.fertility');
  for (let i = 0; i < a.count; i++) {
    if (a.sex[i] !== 0) continue;
    const p = fertilityAt(a.age[i]!) * fertility * 0.75;
    if (p <= 0 || rng.nextFloat() >= p) continue;
    if (hasFather(world, i)) a.pregnantDays[i] = rng.int(1, 269);
  }
}

/** ¿Convive con una pareja masculina adulta? (condición de embarazo, ADR-0019/0020.) */
export function hasFather(world: World, i: number): boolean {
  const a = world.agents;
  const pid = partnerId(world, i);
  if (pid === 0) return false;
  const j = a.indexOf(pid);
  return j >= 0 && a.household[j] === a.household[i] && a.sex[j] === 1 && a.age[j]! >= 18;
}

function populateHouseholds(world: World, n: number): void {
  const rng = world.rng;
  const slots: number[] = [];
  for (const h of world.map.homes) for (let d = 0; d < Math.max(1, world.map.buildings[h]!.dwellings); d++) slots.push(h);
  for (let k = slots.length - 1; k > 0; k--) {
    const j = rng.int(0, k);
    [slots[k], slots[j]] = [slots[j]!, slots[k]!];
  }
  let created = 0;
  for (let s = 0; created < n && slots.length > 0; s++) {
    const home = slots[s % slots.length]!;
    const size = Math.min(householdSize(world), n - created);
    const made = spawnHousehold(world, home, size);
    created += made;
    if (made < size) return;
  }
}

export function removeAgent(world: World, id: number, event = 'agent.removed', extra: Record<string, unknown> = {}): boolean {
  const i = world.agents.indexOf(id);
  if (i < 0) return false;
  const home = world.agents.home[i]!;
  if (home >= 0 && world.buildings.residents[home]! > 0) world.buildings.residents[home]!--;
  world.emit(event, { agentId: id, name: world.agents.names[i], ...extra });
  world.agents.removeAt(i);
  return true;
}
