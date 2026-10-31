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
  /** Dinero propio (ADR-0022). */
  money: number;
  /** Vivienda en propiedad o de alquiler y días de alquiler impagado (ADR-0024). */
  housing: {
    tenure: 'owner' | 'mortgaged' | 'renter';
    arrears: number;
    /** Quien cobra el alquiler (un vecino del hogar casero) o `null` si es un fondo de fuera (ADR-0026). */
    landlord: string | null;
    mortgage: number;
    /** Viviendas del hogar además de la suya y hogares que le pagan alquiler (ADR-0028). */
    spare: number;
    tenants: number;
  };
  /** Coche del hogar y si lo lleva ahora (ADR-0025). */
  car: { household: boolean; driving: boolean };
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
  /** Negocios (ADR-0022): caja, plantilla y puestos; `null` en viviendas y servicios públicos. */
  business: { cash: number; staff: number; positions: number; /** Precio de venta por unidad (tiendas y aserraderos; ADR-0023). */ price: number | null; /** Jornal que paga (ADR-0024). */ wage: number } | null;
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
  /** Dinero de los habitantes y caja de los negocios; paro sobre la población activa (ADR-0022). */
  householdMoney: number;
  businessCash: number;
  unemploymentRate: number;
  /** Precio medio de mercado por unidad (ADR-0023). */
  foodPrice: number;
  woodPrice: number;
  /** Alquiler diario actual e índice medio de salarios (ADR-0024). */
  rent: number;
  wageIndex: number;
  /** Precio de una vivienda (ADR-0026). */
  housePrice: number;
  /** Animales (ADR-0027). */
  animals: { dogs: number; sheep: number; hens: number };
}
