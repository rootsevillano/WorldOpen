import type { CriterionValue } from '@worldopen/contracts';
import { Action, nightFactor, temperature, ticksPerDay, type Simulation } from '@worldopen/engine';

/**
 * Métricas observables del mundo (O1). Son la base de los Behavior Gates y del informe headless.
 * Las proporciones de agentes valen 0 si no hay población.
 */
export function metric(sim: Simulation, name: string): CriterionValue | undefined {
  if (name.startsWith('criteria.')) return sim.world.criteria[name.slice('criteria.'.length)];
  const a = sim.world.agents;
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
  const uses = sim.world.map.buildings;
  switch (name) {
    case 'clock.elapsedDays': return Math.floor(sim.tick / ticksPerDay(sim.manifest.time));
    case 'env.night': return nightFactor(sim.world);
    case 'env.temperatureC': return temperature(sim.world);
    case 'agents.count': return a.count;
    case 'agents.atHomeRatio': return ratio((i) => a.location[i] === a.home[i]);
    case 'agents.awayFromHomeRatio': return ratio((i) => a.location[i] !== a.home[i]);
    case 'agents.atVenueRatio': return ratio((i) => a.location[i]! >= 0 && a.location[i] !== a.home[i] && uses[a.location[i]!]!.use !== 'residential');
    case 'agents.outdoorsRatio': return ratio((i) => a.location[i]! < 0);
    case 'agents.sleepingRatio': return ratio((i) => a.action[i] === Action.Sleep && a.location[i] === a.home[i]);
    case 'agents.seekingShelterRatio': return ratio((i) => a.action[i] === Action.SeekShelter);
    case 'agents.avgShelter': return mean(a.shelter);
    case 'agents.avgEnergy': return mean(a.energy);
    case 'agents.avgSocial': return mean(a.social);
    default: return undefined;
  }
}

export const REPORT_METRICS = [
  'agents.count', 'agents.atHomeRatio', 'agents.atVenueRatio', 'agents.outdoorsRatio', 'agents.sleepingRatio',
  'agents.avgShelter', 'agents.avgEnergy', 'agents.avgSocial', 'env.temperatureC',
];
