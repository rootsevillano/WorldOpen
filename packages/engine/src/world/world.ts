import type { CriteriaValues, SimEvent, TimeConfig } from '@worldopen/contracts';
import type { CriteriaRegistry } from '../criteria/registry';
import type { Rng } from '../math/rng';
import { AgentStore } from './agents';

/** Estado mutable del mundo. Solo lo tocan los sistemas y los comandos, dentro de un tick. */
export class World {
  tick = 0;
  criteria: CriteriaValues;
  readonly agents: AgentStore;
  private pendingEvents: SimEvent[] = [];

  constructor(
    readonly time: TimeConfig,
    public rng: Rng,
    readonly criteriaRegistry: CriteriaRegistry,
    criteria: CriteriaValues,
    agentCapacity: number,
  ) {
    this.criteria = criteria;
    this.agents = new AgentStore(agentCapacity);
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
