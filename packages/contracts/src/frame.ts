import type { GameDate } from './time';

/**
 * Render API. Lo único que el render sabe del mundo. Estructura de arrays (SoA) para enviarse con
 * `postMessage` transfiriendo los buffers. Coordenadas en metros, ejes X = Este, Y = arriba, Z = −Norte.
 */
export interface RenderFrame {
  tick: number;
  date: GameDate;
  agentCount: number;
  /** Id estable de cada agente (para interpolar entre frames aunque cambie el orden). */
  agentIds: Uint32Array;
  /** x, y, z por agente (stride 3). */
  agentPositions: Float32Array;
  /** Rumbo en radianes por agente (0 = +X). */
  agentHeadings: Float32Array;
  /** Código de actividad por agente (ver `AgentActivity`). */
  agentActivities: Uint8Array;
  /** Banderas por agente (ver `AgentFlag`). */
  agentFlags: Uint8Array;
  /** Estado por edificio, en el orden de `MapLogic.buildings` concatenado por región (ver `BuildingState`). */
  buildingStates: Uint8Array;
  /** Animales (ADR-0027): ids, posiciones (stride 3), rumbos, tipo (`AnimalKind`) y banderas (`AgentFlag.Indoors`). */
  animalCount: number;
  animalIds: Uint32Array;
  animalPositions: Float32Array;
  animalHeadings: Float32Array;
  animalKinds: Uint8Array;
  animalFlags: Uint8Array;
}

export const AnimalKind = { Dog: 0, Sheep: 1, Hen: 2 } as const;
export type AnimalKind = (typeof AnimalKind)[keyof typeof AnimalKind];

export const AgentFlag = {
  /** Dentro de un edificio: el render no lo dibuja en la calle. */
  Indoors: 1,
  /** Va en coche: el render dibuja un coche en lugar de una persona (ADR-0025). */
  Driving: 2,
} as const;

export const AgentActivity = {
  Idle: 0,
  Moving: 1,
  Sleeping: 2,
  Eating: 3,
  Working: 4,
  Socializing: 5,
  Fleeing: 6,
  /** Haciendo cola o siendo atendido en una tienda, fuente o aserradero. */
  Queueing: 7,
} as const;
export type AgentActivity = (typeof AgentActivity)[keyof typeof AgentActivity];

/** Buffers de un frame para la lista de transferibles de `postMessage`. */
export function frameTransferables(frame: RenderFrame): ArrayBuffer[] {
  return [
    frame.agentIds.buffer,
    frame.agentPositions.buffer,
    frame.agentHeadings.buffer,
    frame.agentActivities.buffer,
    frame.agentFlags.buffer,
    frame.buildingStates.buffer,
    frame.animalIds.buffer,
    frame.animalPositions.buffer,
    frame.animalHeadings.buffer,
    frame.animalKinds.buffer,
    frame.animalFlags.buffer,
  ] as ArrayBuffer[];
}
