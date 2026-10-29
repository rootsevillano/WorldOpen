/** Inspector del Modo Dios (G1). Vistas de solo lectura del estado; no forman parte del snapshot. */

export type ResourceKind = 'food' | 'water' | 'wood';

export const BuildingState = {
  Normal: 0,
  Burning: 1,
  /** Tras un incendio: inservible hasta que se repara (G3: la geometría no cambia en el MVP). */
  Damaged: 2,
} as const;
export type BuildingState = (typeof BuildingState)[keyof typeof BuildingState];

export interface AgentDetail {
  id: number;
  name: string;
  age: number;
  sex: 'female' | 'male';
  traits: { sociability: number; bravery: number };
  occupation: string;
  workplace: string | null;
  home: string;
  /** Edificio en el que está o `null` si va por la calle. */
  location: string | null;
  action: string;
  /** 0 = crítica, 1 = satisfecha. */
  needs: Record<'energy' | 'shelter' | 'social' | 'hunger' | 'thirst' | 'work', number>;
  health: number;
  carrying: { resource: ResourceKind; amount: number } | null;
  /** Puntuaciones de la última decisión (Utility AI explicable, ADR-0008). */
  lastScores: Record<string, number>;
  /** Recuerdos recientes, del más nuevo al más viejo. */
  memory: { tick: number; kind: string; building: string | null }[];
  relations: { agentId: number; name: string; kind: string; affinity: number }[];
  position: { x: number; y: number; z: number };
}

export interface BuildingDetail {
  id: string;
  index: number;
  use: string;
  state: BuildingState;
  floors: number;
  stock: Record<ResourceKind, number>;
  occupants: number;
  residents: number;
  workers: number;
  /** Agentes esperando a ser atendidos (cola). */
  queue: number;
}

/** Resumen económico global para el HUD y las métricas. */
export interface EconomySummary {
  shopFood: number;
  fountainWater: number;
  sawmillWood: number;
  pantryFood: number;
  pantryWater: number;
  pantryWood: number;
  queueing: number;
}
