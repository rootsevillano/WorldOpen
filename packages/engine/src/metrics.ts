import type { BuildingUse, CriterionValue } from '@worldopen/contracts';
import { storageCap } from './agents/economy';
import { MONEY_AGE, isBusiness, marketPrice, priceOf, rentIndex, wageIndex } from './agents/money';
import { nightFactor, temperature } from './agents/environment';
import { householdHasCar } from './agents/vehicles';
import { partnerId } from './agents/social';
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
  const ratio = (pred: (i: number) => boolean) => {
    if (a.count === 0) return 0;
    let c = 0;
    for (let i = 0; i < a.count; i++) if (pred(i)) c++;
    return c / a.count;
  };
  const mean = (col: Float32Array) => {
    if (a.count === 0) return 0;
    let s = 0;
    for (let i = 0; i < a.count; i++) s += col[i]!;
    return s / a.count;
  };

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
    case 'agents.count': return a.count;
    case 'agents.childrenRatio': return ratio((i) => a.age[i]! < 18);
    case 'agents.elderlyRatio': return ratio((i) => a.age[i]! >= 65);
    // Adultos con pareja / adultos (ADR-0020).
    case 'agents.partneredRatio': {
      let adults = 0;
      let partnered = 0;
      for (let i = 0; i < a.count; i++) {
        if (a.age[i]! < 18) continue;
        adults++;
        if (partnerId(sim.world, i) !== 0) partnered++;
      }
      return adults === 0 ? 0 : partnered / adults;
    }
    case 'households.count': return new Set(a.household.subarray(0, a.count)).size;
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
      const households = new Set(a.household.subarray(0, a.count));
      let cars = 0;
      for (const hh of households) if (householdHasCar(sim.world, hh)) cars++;
      return households.size === 0 ? 0 : cars / households.size;
    }
    case 'agents.outdoorsRatio': return ratio((i) => a.location[i]! < 0);
    case 'agents.sleepingRatio': return ratio((i) => a.action[i] === Action.Sleep && a.location[i]! >= 0);
    case 'agents.workingRatio': return ratio((i) => a.action[i] === Action.Work && a.location[i] === a.workplace[i]);
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
      for (let i = 0; i < a.count; i++) if (a.age[i]! >= 18) { n++; total += a.money[i]!; }
      return n === 0 ? 0 : total / n;
    }
    // Quien compra (14+) y no puede pagar ni una ración.
    case 'economy.brokeRatio': {
      const price = marketPrice(sim.world, Resource.Food);
      let n = 0;
      let broke = 0;
      for (let i = 0; i < a.count; i++) if (a.age[i]! >= MONEY_AGE) { n++; if (a.money[i]! < price) broke++; }
      return n === 0 ? 0 : broke / n;
    }
    // Precio medio de la comida y de la leña relativo al base (1 = normal; ADR-0023).
    case 'economy.foodPriceIndex': return marketPrice(sim.world, Resource.Food) / priceOf(sim.world, Resource.Food);
    case 'economy.woodPriceIndex': return marketPrice(sim.world, Resource.Wood) / priceOf(sim.world, Resource.Wood);
    // Alquiler y salarios relativos al base (ADR-0024); salarios ponderados por plantilla.
    case 'economy.rentIndex': return rentIndex(sim.world);
    case 'economy.wageIndex': return wageIndex(sim.world);
    case 'households.renterRatio': return ratio((i) => a.renting[i] === 1);
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

export const REPORT_METRICS = [
  'agents.count', 'agents.atHomeRatio', 'agents.atVenueRatio', 'agents.outdoorsRatio', 'agents.sleepingRatio',
  'agents.workingRatio', 'agents.leisureRatio', 'agents.queueingRatio', 'agents.avgShelter', 'agents.avgEnergy', 'agents.avgSocial',
  'agents.avgHunger', 'agents.avgThirst', 'agents.avgHealth', 'economy.shopFood', 'economy.fountainWater',
  'economy.pantryFood', 'economy.pantryWater', 'env.temperatureC',
];
