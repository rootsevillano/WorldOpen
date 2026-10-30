/**
 * Estado dinámico de los edificios (E1, G3): existencias de recursos y estado (normal, ardiendo, dañado).
 * Indexado como `NavMap.buildings`. Las columnas `occupants`, `workers` y `queue` son transitorias: se recalculan
 * cada tick y no forman parte del snapshot.
 */
export class BuildingStore {
  readonly count: number;
  readonly food: Float32Array;
  readonly water: Float32Array;
  readonly wood: Float32Array;
  readonly state: Uint8Array;
  /** Tick en que termina el estado actual (0 = indefinido). */
  readonly stateUntil: Uint32Array;
  /** Habitantes empadronados (se mantiene al crear/eliminar agentes). */
  readonly residents: Uint16Array;
  /** Caja de los negocios (ADR-0022). */
  readonly cash: Float64Array;
  /** Existencias objetivo de las tiendas (≈ 3 días de su área de influencia), recalculadas a las 06:00 (ADR-0022). */
  readonly demand: Float32Array;

  // Transitorias.
  readonly occupants: Uint16Array;
  readonly workers: Uint16Array;
  readonly queue: Uint16Array;
  readonly served: Uint16Array;

  private readonly persisted: [string, Float32Array | Float64Array | Uint8Array | Uint32Array | Uint16Array][];

  constructor(count: number) {
    this.count = count;
    this.food = new Float32Array(count);
    this.water = new Float32Array(count);
    this.wood = new Float32Array(count);
    this.state = new Uint8Array(count);
    this.stateUntil = new Uint32Array(count);
    this.residents = new Uint16Array(count);
    this.cash = new Float64Array(count);
    this.demand = new Float32Array(count);
    this.occupants = new Uint16Array(count);
    this.workers = new Uint16Array(count);
    this.queue = new Uint16Array(count);
    this.served = new Uint16Array(count);
    this.persisted = [
      ['food', this.food], ['water', this.water], ['wood', this.wood],
      ['state', this.state], ['stateUntil', this.stateUntil], ['residents', this.residents], ['cash', this.cash], ['demand', this.demand],
    ];
  }

  eachColumn(): readonly [string, Float32Array | Float64Array | Uint8Array | Uint32Array | Uint16Array][] {
    return this.persisted;
  }

  serialize(): { columns: Record<string, number[]> } {
    const columns: Record<string, number[]> = {};
    for (const [name, col] of this.persisted) columns[name] = Array.from(col);
    return { columns };
  }

  restore(data: { columns: Record<string, number[]> }): void {
    for (const [name, col] of this.persisted) {
      const values = data.columns[name];
      if (!values || values.length !== this.count) throw new Error(`Columna de edificios inválida en el snapshot: ${name}`);
      col.set(values);
    }
  }
}
