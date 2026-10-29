import type { BuildingUse, CriterionValue } from '@worldopen/contracts';
import { Action, nightFactor, temperature, ticksPerDay, type Simulation } from '@worldopen/engine';

/**
 * Referencia a un edificio en escenarios: `@<uso>[n]` = n-ésimo edificio de ese uso en el mapa
 * (`@homes[n]` = n-ésima vivienda). Los ids concretos dependen de la semilla; las referencias no.
 */
export function resolveBuilding(sim: Simulation, ref: string): number {
  const m = /^@(\w+)\[(\d+)\]$/.exec(ref);
  if (!m) throw new Error(`Referencia de edificio inválida: ${ref}`);
  const map = sim.world.map;
  const list = m[1] === 'homes' ? map.homes : map.byUse[m[1] as BuildingUse];
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
    case 'agents.atHomeRatio': return ratio((i) => a.location[i] === a.home[i]);
    case 'agents.awayFromHomeRatio': return ratio((i) => a.location[i] !== a.home[i]);
    case 'agents.atVenueRatio': return ratio((i) => a.location[i]! >= 0 && a.location[i] !== a.home[i] && uses[a.location[i]!]!.use !== 'residential');
    case 'agents.leisureRatio':
      return ratio((i) => {
        const loc = a.location[i]!;
        return loc >= 0 && loc !== a.home[i] && loc !== a.workplace[i] && a.action[i] !== Action.Provision && uses[loc]!.use !== 'residential';
      });
    case 'agents.outdoorsRatio': return ratio((i) => a.location[i]! < 0);
    case 'agents.sleepingRatio': return ratio((i) => a.action[i] === Action.Sleep && a.location[i]! >= 0);
    case 'agents.workingRatio': return ratio((i) => a.action[i] === Action.Work && a.location[i] === a.workplace[i]);
    case 'agents.queueingRatio': return ratio((i) => a.busyLeft[i]! > 0 && a.location[i] !== a.home[i]);
    case 'agents.seekingShelterRatio': return ratio((i) => a.action[i] === Action.SeekShelter);
    case 'agents.avgShelter': return mean(a.shelter);
    case 'agents.avgEnergy': return mean(a.energy);
    case 'agents.avgSocial': return mean(a.social);
    case 'agents.avgHunger': return mean(a.hunger);
    case 'agents.avgThirst': return mean(a.thirst);
    case 'agents.avgWork': return mean(a.work);
    case 'agents.avgHealth': return mean(a.health);
    case 'economy.shopFood': return e!.shopFood;
    case 'economy.fountainWater': return e!.fountainWater;
    case 'economy.sawmillWood': return e!.sawmillWood;
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
