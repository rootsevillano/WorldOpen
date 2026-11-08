import { AgentFlag, type BuildingUse, type CriterionValue } from '@worldopen/contracts';
import { storageCap } from './agents/economy';
import { activeFiesta, allFestivalVenues, bonfireSites, burialTowns, carnivalTowns, costumed, mourning, festivalDay, festivalHoliday, fireworkSites, processionPasos, romeriaSite, verbena } from './agents/festival';
import { housePrice } from './agents/housing';
import { DOG_WALK_MINUTES } from './agents/animals';
import { Animal } from './world/animals';
import { MONEY_AGE, isBusiness, marketPrice, openings, priceOf, rentIndex, rentNow, townDailyWages, townWageIndices, wageIndex } from './agents/money';
import { nightFactor, temperature } from './agents/environment';
import { householdHasCar, linkTraffic } from './agents/vehicles';
import { Transit, busesNow, hostalGuests, hostalRooms, residents, visitorsNow } from './agents/transit';
import { partnerId } from './agents/social';
import { gardenPantry } from './agents/garden';
import type { Simulation } from './simulation';
import { ticksPerDay } from './time/clock';
import { Action, Occupation, Resource } from './world/agents';

/**
 * Referencia a un edificio en escenarios: `@<uso>[n]` = n-ésimo edificio de ese uso en el mapa
 * (`@homes[n]` = n-ésima vivienda). Los ids concretos dependen de la semilla; las referencias no.
 */
export function resolveBuilding(sim: Simulation, ref: string): number {
  const m = /^@(\w+)\[(\d+)\]$/.exec(ref);
  if (!m) throw new Error(`Referencia de edificio inválida: ${ref}`);
  const map = sim.world.map;
  // `@populatedHome[n]`: la n-ésima vivienda con más residentes (desempate por índice).
  const res = sim.world.buildings.residents;
  const list =
    m[1] === 'homes' ? map.homes
    : m[1] === 'populatedHome' ? [...map.homes].sort((a, b) => res[b]! - res[a]! || a - b)
    : map.byUse[m[1] as BuildingUse];
  const b = list?.[Number(m[2])];
  if (b === undefined) throw new Error(`No existe ${ref} en este mapa`);
  return b;
}

/** Sustituye en un payload las cadenas `@uso[n]` por el id opaco del edificio. */
export function resolvePayload(sim: Simulation, payload: unknown): unknown {
  if (typeof payload === 'string' && payload.startsWith('@')) return sim.world.map.buildings[resolveBuilding(sim, payload)]!.id;
  if (Array.isArray(payload)) return payload.map((p) => resolvePayload(sim, p));
  if (payload && typeof payload === 'object') {
    return Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, resolvePayload(sim, v)]));
  }
  return payload;
}

/**
 * Métricas observables del mundo (O1). Son la base de los Behavior Gates y del informe headless.
 * Las proporciones de agentes valen 0 si no hay población.
 */
export function metric(sim: Simulation, name: string): CriterionValue | undefined {
  if (name.startsWith('criteria.')) return sim.world.criteria[name.slice('criteria.'.length)];
  const a = sim.world.agents;
  const bs = sim.world.buildings;
  // Las métricas de población son de los vecinos: los visitantes de paso no cuentan (ADR-0032).
  const resident = (i: number) => a.occupation[i] !== Occupation.Visitor;
  const ratio = (pred: (i: number) => boolean) => {
    let n = 0;
    let c = 0;
    for (let i = 0; i < a.count; i++) {
      if (!resident(i)) continue;
      n++;
      if (pred(i)) c++;
    }
    return n === 0 ? 0 : c / n;
  };
  const mean = (col: Float32Array) => {
    let n = 0;
    let s = 0;
    for (let i = 0; i < a.count; i++) {
      if (!resident(i)) continue;
      n++;
      s += col[i]!;
    }
    return n === 0 ? 0 : s / n;
  };

  // Por pueblo (ADR-0036, ADR-0040, ADR-0042): `town.<región>.population|rentIndex|rent|housePrice|wage|wageIndex`.
  const town = /^town\.(\w+)\.(population|rentIndex|rent|housePrice|wage|wageIndex)$/.exec(name);
  if (town) {
    const t = sim.world.map.towns.findIndex((x) => x.regionId === town[1]);
    if (t < 0) return undefined;
    if (town[2] === 'population') return residents(sim.world, t);
    if (town[2] === 'wage') return townDailyWages(sim.world)[t];
    if (town[2] === 'wageIndex') return townWageIndices(sim.world)[t];
    const index = rentIndex(sim.world, t);
    return town[2] === 'rentIndex' ? index : town[2] === 'rent' ? rentNow(sim.world, index) : housePrice(sim.world, index);
  }

  const b = /^building\.(@\w+\[\d+\])\.(\w+)$/.exec(name);
  if (b) {
    const idx = resolveBuilding(sim, b[1]!);
    switch (b[2]) {
      case 'occupants': {
        let c = 0;
        for (let i = 0; i < a.count; i++) if (a.location[i] === idx) c++;
        return c;
      }
      case 'state': return bs.state[idx]!;
      case 'food': return bs.food[idx]!;
      case 'water': return bs.water[idx]!;
      case 'residentsAtHome': {
        let c = 0;
        for (let i = 0; i < a.count; i++) if (a.home[i] === idx && a.location[i] === idx) c++;
        return c;
      }
      default: return undefined;
    }
  }

  const uses = sim.world.map.buildings;
  const e = name.startsWith('economy.') ? sim.economy() : null;
  switch (name) {
    case 'clock.elapsedDays': return Math.floor(sim.tick / ticksPerDay(sim.manifest.time));
    case 'env.night': return nightFactor(sim.world);
    case 'env.temperatureC': return temperature(sim.world);
    case 'agents.count': return residents(sim.world);
    case 'agents.visitors': return visitorsNow(sim.world);
    // Pueblos (ADR-0036): cuántos hay y vecinos de cada uno (`town.<región>.population`).
    case 'towns.count': return sim.world.map.towns.length;
    // Carretera comarcal (ADR-0045): coches en ella, el tramo más lento (factor de velocidad) y coches atascados.
    case 'roads.carsOnLinks': return linkTraffic(sim.world).cars.reduce((s, n) => s + n, 0);
    case 'roads.slowestLink': return Math.min(1, ...linkTraffic(sim.world).factor);
    case 'agents.jammed': {
      let n = 0;
      for (let i = 0; i < a.count; i++) if (a.flags[i]! & AgentFlag.Jammed) n++;
      return n;
    }
    // Búsqueda de empleo (ADR-0041): quien va a pedir trabajo ahora y negocios con un puesto libre.
    case 'agents.seekingJob': {
      let n = 0;
      for (let i = 0; i < a.count; i++) if (a.action[i] === Action.SeekJob) n++;
      return n;
    }
    case 'jobs.open': return openings(sim.world).open.length;
    // Quien trabaja en un pueblo distinto del suyo (entre los que tienen puesto en el mundo).
    case 'agents.workInOtherTownRatio': {
      const map = sim.world.map;
      let n = 0;
      let other = 0;
      for (let i = 0; i < a.count; i++) {
        const w = a.workplace[i]!;
        if (w < 0 || a.occupation[i] === Occupation.Student || !resident(i)) continue;
        n++;
        if (map.townOfBuilding[w] !== map.townOfBuilding[a.home[i]!]) other++;
      }
      return n === 0 ? 0 : other / n;
    }
    // Hostal (ADR-0033): huéspedes y ocupación.
    // Fiestas (ADR-0034): día de fiestas, verbena en curso y vecinos en los locales de la verbena.
    case 'festival.day': return festivalDay(sim.world);
    case 'festival.verbena': return verbena(sim.world) ? 1 : 0;
    // Procesión y fuegos (ADR-0044): quien desfila ahora, pasos en la calle y plazas con fuegos.
    case 'festival.marching': {
      let n = 0;
      for (let i = 0; i < a.count; i++) if (a.action[i] === Action.Procession && a.location[i]! < 0 && a.paths[i] === null) n++;
      return n;
    }
    case 'festival.pasos': return processionPasos(sim.world).headings.length;
    // Calendario (ADR-0046): tipo de fiesta del primer pueblo ('none' si no hay), festivo y gente en los merenderos.
    case 'festival.kind': return activeFiesta(sim.world)?.fiesta.kind ?? 'none';
    case 'festival.holiday': return festivalHoliday(sim.world) ? 1 : 0;
    // Carnaval (ADR-0048): vecinos disfrazados.
    case 'festival.costumed': {
      const carnival = carnivalTowns(sim.world);
      let n = 0;
      for (let i = 0; i < a.count; i++) if (costumed(sim.world, i, carnival)) n++;
      return n;
    }
    // Entierro de la sardina (ADR-0052): cortejo de luto y hogueras encendidas.
    case 'festival.mourners': {
      const burial = burialTowns(sim.world);
      let n = 0;
      for (let i = 0; i < a.count; i++) if (mourning(sim.world, i, burial)) n++;
      return n;
    }
    case 'festival.bonfires': return bonfireSites(sim.world).length / 3;
    case 'festival.towns': return sim.world.map.towns.filter((_, t) => activeFiesta(sim.world, t) !== null).length;
    case 'festival.romeria': {
      const sites = new Set(sim.world.map.towns.map((_, t) => romeriaSite(sim.world, t)));
      let n = 0;
      for (let i = 0; i < a.count; i++) if (resident(i) && sites.has(a.location[i]!)) n++;
      return n;
    }
    case 'festival.fireworks': return fireworkSites(sim.world).length / 3;
    case 'agents.atFestivalRatio': {
      const venues = new Set(allFestivalVenues(sim.world));
      return ratio((i) => venues.has(a.location[i]!));
    }
    case 'tourism.guests': return hostalGuests(sim.world);
    // Visitantes de paso en el día (sin los huéspedes del hostal): a medianoche no queda ninguno.
    case 'agents.dayVisitors': return visitorsNow(sim.world) - hostalGuests(sim.world);
    case 'tourism.occupancy': return hostalRooms(sim.world) === 0 ? 0 : hostalGuests(sim.world) / hostalRooms(sim.world);
    case 'agents.childrenRatio': return ratio((i) => a.age[i]! < 18);
    case 'agents.elderlyRatio': return ratio((i) => a.age[i]! >= 65);
    // Adultos con pareja / adultos (ADR-0020).
    case 'agents.partneredRatio': {
      let adults = 0;
      let partnered = 0;
      for (let i = 0; i < a.count; i++) {
        if (a.age[i]! < 18 || !resident(i)) continue;
        adults++;
        if (partnerId(sim.world, i) !== 0) partnered++;
      }
      return adults === 0 ? 0 : partnered / adults;
    }
    case 'households.count': return new Set(Array.from(a.household.subarray(0, a.count)).filter((_, i) => resident(i))).size;
    // Viviendas ocupadas / viviendas del mapa (un edificio sin datos cuenta como una).
    case 'households.occupancy': {
      let total = 0;
      for (const h of sim.world.map.homes) total += Math.max(1, uses[h]!.dwellings);
      return new Set(a.household.subarray(0, a.count)).size / total;
    }
    case 'agents.studentsAtSchoolRatio': {
      let students = 0;
      let atSchool = 0;
      for (let i = 0; i < a.count; i++) {
        if (a.occupation[i] !== Occupation.Student) continue;
        students++;
        // En clase (la escuela también es fuente pública: ir a por agua no cuenta como asistir).
        if (a.location[i] === a.workplace[i] && a.action[i] === Action.Work) atSchool++;
      }
      return students === 0 ? 0 : atSchool / students;
    }
    case 'agents.atHomeRatio': return ratio((i) => a.location[i] === a.home[i]);
    case 'agents.awayFromHomeRatio': return ratio((i) => a.location[i] !== a.home[i]);
    case 'agents.atVenueRatio': return ratio((i) => a.location[i]! >= 0 && a.location[i] !== a.home[i] && uses[a.location[i]!]!.use !== 'residential');
    case 'agents.leisureRatio':
      return ratio((i) => {
        const loc = a.location[i]!;
        return loc >= 0 && loc !== a.home[i] && loc !== a.workplace[i] && a.action[i] !== Action.Provision && a.action[i] !== Action.Deliver && a.action[i] !== Action.SeekShelter && uses[loc]!.use !== 'residential';
      });
    // Quien ha decidido salir por ocio, esté de camino o ya en el local.
    case 'agents.goingOutRatio': return ratio((i) => a.action[i] === Action.GoOut);
    // En coche por la calle / con coche en el hogar (ADR-0025).
    case 'agents.drivingRatio': return ratio((i) => a.driving[i] === 1 && a.location[i]! < 0);
    case 'households.carRatio': {
      const homes = new Map<number, number>();
      for (let i = 0; i < a.count; i++) if (!homes.has(a.household[i]!)) homes.set(a.household[i]!, a.home[i]!);
      let cars = 0;
      for (const [hh, home] of homes) if (householdHasCar(sim.world, hh, home)) cars++;
      return homes.size === 0 ? 0 : cars / homes.size;
    }
    // Casas de campo (ADR-0053): hogares que viven en ellas y cuántos tienen coche.
    case 'households.rural':
    case 'households.ruralCarRatio': {
      const homes = new Map<number, number>();
      for (let i = 0; i < a.count; i++) {
        const h = a.home[i]!;
        if (h >= 0 && a.occupation[i] !== Occupation.Visitor && sim.world.map.buildings[h]!.role === 'farmhouse') homes.set(a.household[i]!, h);
      }
      if (name === 'households.rural') return homes.size;
      let cars = 0;
      for (const [hh, home] of homes) if (householdHasCar(sim.world, hh, home)) cars++;
      return homes.size === 0 ? 0 : cars / homes.size;
    }
    // Huertos (ADR-0054): quien cuida ahora el huerto de su casa de campo y la despensa por residente de esas casas.
    case 'households.gardeners': {
      let n = 0;
      for (let i = 0; i < a.count; i++) if (a.action[i] === Action.Tend && a.location[i] === a.home[i]) n++;
      return n;
    }
    case 'households.gardenPantry': return gardenPantry(sim.world);
    // Salidas del pueblo (ADR-0031): fuera, esperando el autobús, trabajando fuera; autobuses en la carretera.
    case 'agents.awayRatio': return ratio((i) => a.transit[i] === Transit.Away);
    case 'agents.waitingBusRatio': return ratio((i) => a.transit[i] === Transit.Waiting);
    case 'agents.commuterRatio': return ratio((i) => a.occupation[i] === Occupation.Commuter);
    case 'transit.buses': return busesNow(sim.world).headings.length;
    case 'agents.outdoorsRatio': return ratio((i) => a.location[i]! < 0 && a.transit[i] !== Transit.Away);
    case 'agents.sleepingRatio': return ratio((i) => a.action[i] === Action.Sleep && a.location[i]! >= 0);
    // Trabajando en su puesto, o fuera del pueblo por trabajo (ADR-0031).
    case 'agents.workingRatio': return ratio((i) => (a.action[i] === Action.Work && a.location[i] === a.workplace[i]) || (a.transit[i] === Transit.Away && a.awayReason[i] === 0));
    case 'agents.queueingRatio': return ratio((i) => a.busyLeft[i]! > 0 && a.location[i] !== a.home[i]);
    // En la calle buscando refugio (quien ya llegó a un refugio no cuenta).
    case 'agents.seekingShelterRatio': return ratio((i) => a.action[i] === Action.SeekShelter && a.location[i]! < 0);
    case 'agents.avgShelter': return mean(a.shelter);
    case 'agents.avgEnergy': return mean(a.energy);
    case 'agents.avgSocial': return mean(a.social);
    case 'agents.avgHunger': return mean(a.hunger);
    case 'agents.avgThirst': return mean(a.thirst);
    case 'agents.avgWork': return mean(a.work);
    case 'agents.avgHealth': return mean(a.health);
    case 'economy.shopFood': return e!.shopFood;
    case 'economy.fountainWater': return e!.fountainWater;
    // Proporción del agua de las fuentes sobre su capacidad (300 por fuente): comparable entre mapas.
    case 'economy.fountainWaterRatio': return e!.fountainWater / Math.max(1, 300 * sim.world.map.byUse.publicServices.length);
    case 'economy.sawmillWood': return e!.sawmillWood;
    // Paro: en paro / población activa (18–66, sin estudiantes) (ADR-0022).
    case 'economy.unemploymentRate': {
      let active = 0;
      let jobless = 0;
      for (let i = 0; i < a.count; i++) {
        const occ = a.occupation[i]!;
        if (a.age[i]! < 18 || occ === Occupation.Retired || occ === Occupation.Student || occ === Occupation.Child) continue;
        active++;
        if (occ === Occupation.Unemployed) jobless++;
      }
      return active === 0 ? 0 : jobless / active;
    }
    case 'economy.avgMoney': {
      let n = 0;
      let total = 0;
      for (let i = 0; i < a.count; i++) if (a.age[i]! >= 18 && resident(i)) { n++; total += a.money[i]!; }
      return n === 0 ? 0 : total / n;
    }
    // Quien compra (14+) y no puede pagar ni una ración.
    case 'economy.brokeRatio': {
      const price = marketPrice(sim.world, Resource.Food);
      let n = 0;
      let broke = 0;
      for (let i = 0; i < a.count; i++) if (a.age[i]! >= MONEY_AGE && resident(i)) { n++; if (a.money[i]! < price) broke++; }
      return n === 0 ? 0 : broke / n;
    }
    // Precio medio de la comida y de la leña relativo al base (1 = normal; ADR-0023).
    case 'economy.foodPriceIndex': return marketPrice(sim.world, Resource.Food) / priceOf(sim.world, Resource.Food);
    case 'economy.woodPriceIndex': return marketPrice(sim.world, Resource.Wood) / priceOf(sim.world, Resource.Wood);
    // Alquiler y salarios relativos al base (ADR-0024); salarios ponderados por plantilla.
    case 'economy.rentIndex': return rentIndex(sim.world);
    case 'economy.wageIndex': return wageIndex(sim.world);
    case 'households.renterRatio': return ratio((i) => a.renting[i] === 1);
    // Vivienda (ADR-0026): propia y pagada / con hipoteca; alquileres con casero del pueblo; precio de una vivienda.
    case 'households.ownerRatio': return ratio((i) => a.renting[i] === 0 && a.mortgage[i] === 0);
    case 'households.mortgageRatio': return ratio((i) => a.mortgage[i]! > 0);
    case 'households.localLandlordRatio': {
      let renters = 0;
      let local = 0;
      for (let i = 0; i < a.count; i++) {
        if (!a.renting[i]) continue;
        renters++;
        if (a.landlord[i] !== 0) local++;
      }
      return renters === 0 ? 0 : local / renters;
    }
    case 'economy.housePrice': return housePrice(sim.world);
    // Viviendas de sobra de los hogares del pueblo (heredadas o compradas) (ADR-0028).
    case 'households.spareHomes': {
      const seen = new Set<number>();
      let total = 0;
      for (let i = 0; i < a.count; i++) {
        if (seen.has(a.household[i]!)) continue;
        seen.add(a.household[i]!);
        total += a.spare[i]!;
      }
      return total;
    }
    // Animales (ADR-0027): cuántos hay y qué parte de los perros salió ayer al menos 20 min.
    case 'animals.dogs': return countAnimals(sim, Animal.Dog);
    case 'animals.sheep': return countAnimals(sim, Animal.Sheep);
    case 'animals.hens': return countAnimals(sim, Animal.Hen);
    case 'animals.dogsWalkedRatio': {
      const an = sim.world.animals;
      let dogs = 0;
      let walked = 0;
      for (let i = 0; i < an.count; i++) {
        if (an.kind[i] !== Animal.Dog) continue;
        dogs++;
        if (an.walkedYesterday[i]! >= DOG_WALK_MINUTES) walked++;
      }
      return dogs === 0 ? 0 : walked / dogs;
    }
    // Perros en la calle (con su paseante) y ganado fuera del corral.
    case 'animals.outdoorsRatio': {
      const an = sim.world.animals;
      let out = 0;
      for (let i = 0; i < an.count; i++) if (!(an.flags[i]! & 1)) out++;
      return an.count === 0 ? 0 : out / an.count;
    }
    case 'economy.businessCash': {
      let total = 0;
      for (let b = 0; b < uses.length; b++) if (isBusiness(sim.world, b)) total += bs.cash[b]!;
      return total;
    }
    // Mayor ocupación de almacén de huertas y aserraderos (≤ 1: la producción se detiene al llenarse, ADR-0021).
    case 'economy.maxStorageRatio': {
      let max = 0;
      for (const f of sim.world.map.byUse.agriculture) max = Math.max(max, bs.food[f]! / storageCap(sim.world, f));
      for (const s of sim.world.map.byUse.industrial) max = Math.max(max, bs.wood[s]! / storageCap(sim.world, s));
      return max;
    }
    case 'economy.pantryFood': return e!.pantryFood;
    case 'economy.pantryWater': return e!.pantryWater;
    case 'economy.pantryWood': return e!.pantryWood;
    default: return undefined;
  }
}

function countAnimals(sim: Simulation, kind: number): number {
  const an = sim.world.animals;
  let n = 0;
  for (let i = 0; i < an.count; i++) if (an.kind[i] === kind) n++;
  return n;
}

export const REPORT_METRICS = [
  'agents.count', 'agents.atHomeRatio', 'agents.atVenueRatio', 'agents.outdoorsRatio', 'agents.sleepingRatio',
  'agents.workingRatio', 'agents.leisureRatio', 'agents.queueingRatio', 'agents.avgShelter', 'agents.avgEnergy', 'agents.avgSocial',
  'agents.avgHunger', 'agents.avgThirst', 'agents.avgHealth', 'economy.shopFood', 'economy.fountainWater',
  'economy.pantryFood', 'economy.pantryWater', 'env.temperatureC',
];
