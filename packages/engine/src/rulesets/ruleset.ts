import type { CriterionDefinition } from '@worldopen/contracts';
import type { CommandDefinition } from '../commands/registry';
import type { World } from '../world/world';

/** ADR-0010: módulo de contenido (época, fantasía…) que extiende el núcleo sin tocarlo. */
export interface Ruleset {
  id: string;
  criteria: CriterionDefinition[];
  commands: CommandDefinition<any>[];
  /** Sistemas que se ejecutan cada tick, en este orden, tras aplicar los comandos. */
  systems: { name: string; run(world: World): void }[];
}
