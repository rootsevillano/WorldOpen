import { BuildingState } from '@worldopen/contracts';
import { Action, Memory, Occupation, RELATION_SLOTS, RelationKind } from '../world/agents';
import type { World } from '../world/world';
import { minuteOfDay } from './environment';
import { forgetAgent } from './lifecycle';
import { buyHome, sellHome } from './estate';
import { assignLandlord, buyBuffer, downPaymentShare, housePrice } from './housing';
import { residents } from './transit';
import { EVICTION_DAYS, rentIndex, rentNow, townRentIndices } from './money';
import { pickNearby } from './nearby';
import { householdSize, pickOccupation, removeAgent, spawnHousehold } from './population';
import { bond, pair, partnerId, remember } from './social';

/**
 * Hogares (ADR-0020): parejas, convivencia, emancipación y migración. Se evalúa una vez al día, a medianoche, tras
 * el ciclo de vida. Una vivienda catastral alberga un hogar; un edificio tiene `dwellings` viviendas.
 */

const DAYS_PER_YEAR = 360;
/** Amistad mínima para empezar una relación de pareja y probabilidad diaria de que ocurra. */
const PARTNER_AFFINITY = 0.6;
const COURTSHIP_DAILY = 1 / 120;
const PARTNER_AGE: [number, number] = [18, 60];
const PARTNER_AGE_GAP = 12;
/** Parejas del mismo sexo: aceptación relativa (el resto de amistades del mismo sexo no derivan en pareja). */
const SAME_SEX_SHARE = 0.05;
/** Adultos de 25+ que viven con sus padres: probabilidad anual de independizarse si hay vivienda libre. */
const EMANCIPATION_YEARLY = 0.25;
const EMANCIPATION_AGE = 25;
/** Solteros de 18–40: probabilidad anual de irse del pueblo (× `society.emigration`); ×3 si no hay vivienda. */
const EMIGRATION_YEARLY = 0.08;
const EMIGRATION_AGE: [number, number] = [18, 40];
const HOUSING_PRESSURE = 3;
/** Llegadas: hogares por año = población × tasa / tamaño medio del hogar (× `society.immigration`). */
const IMMIGRATION_YEARLY = 0.02;
const MEAN_HOUSEHOLD = 2.4;
/** Los hogares que llegan suelen alquilar; para independizarse hacen falta ahorros para 3 meses de alquiler. */
const IMMIGRANT_RENTERS = 0.6;
const EMANCIPATION_RENT_DAYS = 90;
/** Escala de distancia al buscar vivienda (m): se prefiere cerca de la casa actual. */
const MOVE_SCALE_M = 800;
/**
 * Mudanzas entre pueblos (ADR-0038), × `society.townMigration`: de quienes se irían del mundo, esta parte se queda
 * en otro pueblo si allí hay casa; y probabilidad anual de que un hogar de alquiler cuyos adultos trabajan todos en
 * otro pueblo se mude a él.
 */
const RELOCATE_SHARE = 0.5;
const WORK_MOVE_YEARLY = 0.5;
/** Los propietarios se mudan menos: venden su casa y compran otra en el destino (ADR-0039). */
const OWNER_MOVE_FACTOR = 0.4;

interface HouseholdStats {
  home: number;
  adults: number;
  minors: number;
  oldest: number;
}

/** Estado del día: índices por id, hogares y viviendas ocupadas por edificio. */
class Census {
  readonly index = new Map<number, number>();
  readonly households = new Map<number, HouseholdStats>();
  readonly used: Uint16Array;

  constructor(readonly world: World) {
    const a = world.agents;
    this.used = new Uint16Array(world.map.buildings.length);
    for (let i = 0; i < a.count; i++) {
      // Los visitantes (alojados en el hostal) no son hogares del pueblo (ADR-0033).
      if (a.occupation[i] === Occupation.Visitor) continue;
      this.index.set(a.ids[i]!, i);
      const hh = a.household[i]!;
      let s = this.households.get(hh);
      if (!s) {
        s = { home: a.home[i]!, adults: 0, minors: 0, oldest: 0 };
        this.households.set(hh, s);
        if (s.home >= 0) this.used[s.home]!++;
      }
      if (a.age[i]! >= 18) s.adults++;
      else s.minors++;
      s.oldest = Math.max(s.oldest, a.age[i]!);
    }
  }

  capacity(b: number): number {
    return Math.max(1, this.world.map.buildings[b]!.dwellings);
  }

  vacant(b: number): boolean {
    return this.used[b]! < this.capacity(b) && this.world.buildings.state[b] === BuildingState.Normal;
  }

  /** Vivienda libre cerca de `near` (−1 si no hay ninguna). */
  findHome(near: number): number {
    const c = this.world.map.buildings[near]!.centroid;
    return pickNearby(this.world, c.x, c.z, this.world.map.homes, MOVE_SCALE_M, (b) => this.vacant(b));
  }

  /** Vivienda libre en el pueblo `town`, cerca de `near` (−1 si no hay ninguna). */
  findHomeIn(town: number, near: number): number {
    const c = this.world.map.buildings[near]!.centroid;
    return pickNearby(this.world, c.x, c.z, this.world.map.towns[town]!.homes, MOVE_SCALE_M, (b) => this.vacant(b));
  }

  anyVacancy(): boolean {
    for (const h of this.world.map.homes) if (this.vacant(h)) return true;
    return false;
  }

  /** Muda a `i` al hogar `household` en `home`; si era el único adulto, los menores de su hogar van con él. */
  move(i: number, home: number, household: number): void {
    const a = this.world.agents;
    const old = this.households.get(a.household[i]!)!;
    const oldHousehold = a.household[i]!;
    const alone = a.age[i]! >= 18 && old.adults === 1 && old.minors > 0;
    this.moveOne(i, home, household);
    if (!alone) return;
    for (let j = 0; j < a.count; j++) if (a.household[j] === oldHousehold && a.age[j]! < 18) this.moveOne(j, home, household);
  }

  private moveOne(i: number, home: number, household: number): void {
    const world = this.world;
    const a = world.agents;
    const bs = world.buildings;
    const from = a.home[i]!;
    const old = this.households.get(a.household[i]!)!;
    if (a.age[i]! >= 18) old.adults--;
    else old.minors--;
    if (old.adults + old.minors === 0) {
      this.households.delete(a.household[i]!);
      if (from >= 0) this.used[from]!--;
    }
    let s = this.households.get(household);
    if (!s) {
      s = { home, adults: 0, minors: 0, oldest: 0 };
      this.households.set(household, s);
      this.used[home]!++;
    }
    if (a.age[i]! >= 18) s.adults++;
    else s.minors++;
    s.oldest = Math.max(s.oldest, a.age[i]!);

    // Se lleva su parte de la despensa.
    if (from >= 0) {
      const share = 1 / Math.max(1, bs.residents[from]!);
      for (const col of [bs.food, bs.water, bs.wood]) {
        const take = col[from]! * share;
        col[from]! -= take;
        col[home]! += take;
      }
      if (bs.residents[from]! > 0) bs.residents[from]!--;
    }
    bs.residents[home]!++;
    a.home[i] = home;
    a.household[i] = household;
    // Entra en la vivienda de su nuevo hogar (propiedad o alquiler) o alquila una nueva (ADR-0024).
    a.renting[i] = 1;
    a.arrears[i] = 0;
    a.landlord[i] = 0;
    a.mortgage[i] = 0;
    a.spare[i] = 0;
    for (let j = 0; j < a.count; j++) {
      if (j !== i && a.household[j] === household) {
        a.renting[i] = a.renting[j]!;
        a.arrears[i] = a.arrears[j]!;
        a.landlord[i] = a.landlord[j]!;
        a.mortgage[i] = a.mortgage[j]!;
        a.spare[i] = a.spare[j]!;
        break;
      }
    }
    // A medianoche casi todos están en casa: se trasladan ya; quien está fuera irá a la nueva al volver.
    if (a.location[i] === from) {
      const c = world.map.buildings[home]!.centroid;
      a.positions[i * 3] = c.x;
      a.positions[i * 3 + 2] = c.z;
      a.location[i] = home;
      a.target[i] = -1;
      a.paths[i] = null;
      a.action[i] = Action.Stay;
    } else if (a.target[i] === from) {
      a.target[i] = -1;
      a.paths[i] = null;
      a.action[i] = Action.Stay;
    }
    // Los convivientes son familia.
    const id = a.ids[i]!;
    for (let j = 0; j < a.count; j++) {
      if (j === i || a.household[j] !== household) continue;
      bond(world, i, a.ids[j]!, 0.6, RelationKind.Family);
      bond(world, j, id, 0.6, RelationKind.Family);
    }
    remember(world, i, Memory.Moved, home);
    world.emit('household.moved', { agentId: id, name: a.names[i], home: world.map.buildings[home]!.id });
  }
}


const single = (world: World, i: number) => partnerId(world, i) === 0;

/** Amigos solteros con afinidad alta pueden empezar una relación. */
function formCouples(world: World, census: Census): void {
  const a = world.agents;
  const rng = world.rng;
  for (let i = 0; i < a.count; i++) {
    const age = a.age[i]!;
    if (a.occupation[i] === Occupation.Visitor || age < PARTNER_AGE[0] || age > PARTNER_AGE[1] || !single(world, i)) continue;
    for (let s = 0; s < RELATION_SLOTS; s++) {
      const k = i * RELATION_SLOTS + s;
      if (a.relKind[k] !== RelationKind.Friend || a.relAffinity[k]! < PARTNER_AFFINITY) continue;
      const j = census.index.get(a.relId[k]!);
      if (j === undefined || a.household[j] === a.household[i]) continue;
      const other = a.age[j]!;
      if (other < PARTNER_AGE[0] || other > PARTNER_AGE[1] || Math.abs(other - age) > PARTNER_AGE_GAP || !single(world, j)) continue;
      if (rng.nextFloat() >= COURTSHIP_DAILY) continue;
      if (a.sex[i] === a.sex[j] && rng.nextFloat() >= SAME_SEX_SHARE) continue;
      pair(world, i, j);
      remember(world, i, Memory.Partner, a.home[i]!);
      remember(world, j, Memory.Partner, a.home[j]!);
      world.emit('couple.formed', { agentId: a.ids[i], name: a.names[i], partnerId: a.ids[j], partner: a.names[j] });
      break;
    }
  }
}

/** Las parejas que no conviven buscan casa: la de quien vive solo (sin otros adultos) o una libre cerca. */
function cohabit(world: World, census: Census): void {
  const a = world.agents;
  for (let i = 0; i < a.count; i++) {
    const pid = partnerId(world, i);
    if (pid === 0 || pid < a.ids[i]!) continue;
    const j = census.index.get(pid);
    if (j === undefined || a.household[j] === a.household[i]) continue;
    const si = census.households.get(a.household[i]!)!;
    const sj = census.households.get(a.household[j]!)!;
    if (si.adults === 1) census.move(j, a.home[i]!, a.household[i]!);
    else if (sj.adults === 1) census.move(i, a.home[j]!, a.household[j]!);
    else {
      const home = census.findHome(a.home[i]!);
      if (home < 0) continue;
      const household = a.nextHousehold++;
      census.move(i, home, household);
      census.move(j, home, household);
      assignLandlord(world, household);
    }
  }
}

/** Adultos solteros que viven con sus padres: se independizan (si hay casa) o, a veces, se van del pueblo. */
function leaveHome(world: World, census: Census, emigrants: number[], evictions: number[]): void {
  const a = world.agents;
  const rng = world.rng;
  const emigration = world.num('society.emigration');
  const housing = census.anyVacancy();
  // Alquiler del pueblo de cada cual (ADR-0040).
  const rents = townRentIndices(world).map((x) => rentNow(world, x));
  for (let i = 0; i < a.count; i++) {
    const age = a.age[i]!;
    const rent = rents.length > 1 && a.home[i]! >= 0 ? rents[world.map.townOfBuilding[a.home[i]!]!]! : rents[0]!;
    if (a.occupation[i] === Occupation.Visitor || age < EMIGRATION_AGE[0] || !single(world, i)) continue;
    const s = census.households.get(a.household[i]!)!;
    const withParents = s.oldest >= age + 16;
    // Solo se independiza quien tiene ahorros para unos meses de alquiler (ADR-0024).
    if (withParents && age >= EMANCIPATION_AGE && rng.nextFloat() < EMANCIPATION_YEARLY / DAYS_PER_YEAR && a.money[i]! >= EMANCIPATION_RENT_DAYS * rent) {
      const home = census.findHome(a.home[i]!);
      if (home >= 0) {
        const household = a.nextHousehold++;
        census.move(i, home, household);
        assignLandlord(world, household);
        continue;
      }
    }
    if (age > EMIGRATION_AGE[1] || (s.adults === 1 && s.minors > 0)) continue;
    const pressure = (withParents && !housing ? HOUSING_PRESSURE : 1) * (a.occupation[i] === Occupation.Unemployed ? 2 : 1);
    if (rng.nextFloat() < (EMIGRATION_YEARLY / DAYS_PER_YEAR) * emigration * pressure && !relocate(world, census, i)) emigrants.push(a.ids[i]!);
  }
  // Desahucio: el hogar con un mes de alquiler impagado se va del pueblo (ADR-0024).
  const evicted = new Set<number>();
  for (let i = 0; i < a.count; i++) {
    if ((a.renting[i] || a.mortgage[i]! > 0) && a.arrears[i]! >= EVICTION_DAYS && !evicted.has(a.household[i]!)) {
      evicted.add(a.household[i]!);
      const s = census.households.get(a.household[i]!)!;
      // Alquiler impagado: desahucio; hipoteca impagada: ejecución hipotecaria (ADR-0026).
      world.emit('household.evicted', { home: world.map.buildings[a.home[i]!]!.id, size: s.adults + s.minors, cause: a.renting[i] ? 'rent' : 'mortgage' });
    }
  }
  for (let i = 0; i < a.count; i++) if (evicted.has(a.household[i]!) && !emigrants.includes(a.ids[i]!)) evictions.push(a.ids[i]!);
  // Menores sin ningún adulto en su hogar: los acoge familia de fuera.
  for (let i = 0; i < a.count; i++) {
    const s = census.households.get(a.household[i]!);
    if (!s) continue; // visitantes alojados (ADR-0033)
    if (s.adults === 0 && !evictions.includes(a.ids[i]!)) emigrants.push(a.ids[i]!);
  }
}

/**
 * En vez de irse del mundo, a veces se muda a otro pueblo con casa libre: al de su trabajo si trabaja fuera y, si no,
 * al que tenga más viviendas libres (ADR-0038).
 */
function relocate(world: World, census: Census, i: number): boolean {
  const map = world.map;
  const a = world.agents;
  if (map.towns.length < 2 || world.rng.nextFloat() >= RELOCATE_SHARE * world.num('society.townMigration')) return false;
  const from = map.townOfBuilding[a.home[i]!]!;
  const w = a.workplace[i]!;
  let to = w >= 0 && a.occupation[i] !== Occupation.Student ? map.townOfBuilding[w]! : from;
  if (to === from) {
    // El pueblo con más viviendas libres, a igualdad, el más barato (ADR-0040).
    const index = townRentIndices(world);
    let most = 0;
    map.towns.forEach((t, k) => {
      if (k === from) return;
      let free = 0;
      for (const h of t.homes) if (census.vacant(h)) free++;
      if (free / index[k]! > most) {
        most = free / index[k]!;
        to = k;
      }
    });
  }
  if (to === from) return false;
  const home = census.findHomeIn(to, to === map.townOfBuilding[w] ? w : map.towns[to]!.homes[0]!);
  if (home < 0) return false;
  const household = a.nextHousehold++;
  census.move(i, home, household);
  assignLandlord(world, household);
  emitRelocated(world, home, 1, from, to, 'emigration');
  return true;
}

/**
 * Hogares cuyos adultos que trabajan lo hacen todos en otro pueblo: se mudan a él (ADR-0038). Los de alquiler dejan el
 * piso; los propietarios venden su vivienda y compran (o, si no les llega, alquilan) en el destino (ADR-0039).
 */
function moveToWork(world: World, census: Census): void {
  const map = world.map;
  const a = world.agents;
  const p = (WORK_MOVE_YEARLY / DAYS_PER_YEAR) * world.num('society.townMigration');
  if (map.towns.length < 2 || p <= 0) return;
  const index = townRentIndices(world);
  const members = new Map<number, number[]>();
  for (const i of census.index.values()) {
    const list = members.get(a.household[i]!);
    if (list) list.push(i);
    else members.set(a.household[i]!, [i]);
  }
  for (const [hh, list] of members) {
    const first = list[0]!;
    if (a.arrears[first]! > 0 || a.home[first]! < 0) continue;
    const owner = a.renting[first] === 0;
    const from = map.townOfBuilding[a.home[first]!]!;
    let to = -1;
    let job = -1;
    let stay = false;
    for (const i of list) {
      const w = a.workplace[i]!;
      if (a.age[i]! < 18 || w < 0 || a.occupation[i] === Occupation.Student) continue;
      const t = map.townOfBuilding[w]!;
      if (t === from || (to >= 0 && t !== to)) stay = true;
      to = t;
      job = w;
    }
    if (stay || to < 0 || world.rng.nextFloat() >= p * (owner ? OWNER_MOVE_FACTOR : 1)) continue;
    const home = census.findHomeIn(to, job);
    if (home < 0) continue;
    // Vende al precio de su pueblo y compra al del destino (ADR-0040).
    const price = housePrice(world, index[to]);
    if (owner && !sellHome(world, hh, housePrice(world, index[from]))) continue;
    // Las viviendas de sobra y los inquilinos siguen siendo del hogar, que cambia de id al mudarse.
    const spare = a.spare[first]!;
    const household = a.nextHousehold++;
    for (const i of list) if (a.household[i] === hh) census.move(i, home, household);
    for (const i of list) a.spare[i] = spare;
    for (let j = 0; j < a.count; j++) if (a.renting[j] && a.landlord[j] === hh) a.landlord[j] = household;
    if (!owner || !buyHome(world, household, home, price, price * downPaymentShare(world), buyBuffer(world, index[to]))) assignLandlord(world, household);
    // Los niños cambian al colegio del pueblo nuevo.
    for (const i of list) {
      if (a.occupation[i] !== Occupation.Student) continue;
      const [occupation, school] = pickOccupation(world, a.age[i]!, home);
      a.occupation[i] = occupation;
      a.workplace[i] = school;
    }
    emitRelocated(world, home, list.length, from, to, owner ? 'work-owner' : 'work');
  }
}

function emitRelocated(world: World, home: number, size: number, from: number, to: number, reason: 'emigration' | 'work' | 'work-owner'): void {
  world.emit('household.relocated', { home: world.map.buildings[home]!.id, size, from: world.townNames[from] ?? '', to: world.townNames[to] ?? '', reason });
}

/** Llegan hogares nuevos a viviendas libres. */
function immigrate(world: World, census: Census): void {
  const a = world.agents;
  const rng = world.rng;
  // Un alquiler caro disuade de venir (y uno barato atrae, hasta ×1.5) (ADR-0024).
  const appeal = Math.min(1.5, 1 / (rentIndex(world) * world.num('economy.rentLevel')));
  let expected = (residents(world) * IMMIGRATION_YEARLY * world.num('society.immigration') * appeal) / (DAYS_PER_YEAR * MEAN_HOUSEHOLD);
  const free: number[] = [];
  for (const h of world.map.homes) if (census.vacant(h)) free.push(h);
  for (; expected > 0 && free.length > 0; expected--) {
    if (rng.nextFloat() >= Math.min(1, expected) || a.count >= a.capacity) continue;
    const k = rng.int(0, free.length - 1);
    const home = free[k]!;
    const size = spawnHousehold(world, home, householdSize(world), IMMIGRANT_RENTERS);
    if (size > 0 && a.renting[a.count - 1]) assignLandlord(world, a.household[a.count - 1]!);
    if (size === 0) return;
    census.used[home]!++;
    if (!census.vacant(home)) free.splice(k, 1);
    world.emit('household.arrived', { home: world.map.buildings[home]!.id, size });
  }
}

export function householdsSystem(world: World): void {
  if (!(minuteOfDay(world) < world.time.minutesPerTick)) return;
  const census = new Census(world);
  formCouples(world, census);
  cohabit(world, census);
  moveToWork(world, census);
  const emigrants: number[] = [];
  const evictions: number[] = [];
  leaveHome(world, census, emigrants, evictions);
  const evicted = new Set(evictions);
  for (const id of [...emigrants, ...evictions]) {
    const i = world.agents.indexOf(id);
    if (i < 0) continue;
    const reason = evicted.has(id) ? 'eviction' : world.agents.age[i]! < 18 ? 'orphan' : 'emigration';
    forgetAgent(world, id, false);
    removeAgent(world, id, 'agent.emigrated', { age: world.agents.age[i], reason });
  }
  immigrate(world, new Census(world));
}
