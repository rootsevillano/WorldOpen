import type { CriteriaValues, SimEvent, TimeConfig } from '@worldopen/contracts';
import type { CriteriaRegistry } from '../criteria/registry';
import type { NavMap } from '../map/navigation';
import type { Rng } from '../math/rng';
import { AgentStore } from './agents';
import { BuildingStore } from './buildings';

/** Estado mutable del mundo. Solo lo tocan los sistemas y los comandos, dentro de un tick. */
export class World {
  tick = 0;
  criteria: CriteriaValues;
  readonly agents: AgentStore;
  readonly buildings: BuildingStore;
  private pendingEvents: SimEvent[] = [];
  /** Hogares con el coche fuera; transitorio, se recalcula al empezar cada decisión (ADR-0025). */
  carsBusy = new Set<number>();

  constructor(
    readonly time: TimeConfig,
    public rng: Rng,
    readonly criteriaRegistry: CriteriaRegistry,
    criteria: CriteriaValues,
    agentCapacity: number,
    /** Mapa estático (no forma parte del snapshot: se reconstruye del manifiesto). */
    readonly map: NavMap,
  ) {
    this.criteria = criteria;
    this.agents = new AgentStore(agentCapacity);
    this.buildings = new BuildingStore(map.buildings.length);
  }

  num(key: string): number {
    const v = this.criteria[key];
    if (typeof v !== 'number') throw new Error(`El criterio ${key} no es numérico`);
    return v;
  }

  emit(type: string, data: Record<string, unknown>): void {
    this.pendingEvents.push({ tick: this.tick, type, data });
  }

  /** Devuelve y vacía los eventos acumulados. */
  drainEvents(): SimEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }
}
