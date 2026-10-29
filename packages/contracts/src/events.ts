/** Hechos que ocurren en el mundo. Alimentan el log legible, las métricas y (en el futuro) la narración. */
export interface SimEvent {
  tick: number;
  type: string;
  data: Record<string, unknown>;
}
