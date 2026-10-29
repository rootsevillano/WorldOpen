/**
 * Almacén de agentes en estructura de arrays (ECS sobre TypedArrays, ADR-0001). Capacidad fija; borrado por
 * intercambio con el último (los índices no son estables, los `ids` sí).
 */
type Column = Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array;

/** Acción en curso decidida por la Utility AI (ADR-0008). */
export const Action = {
  Stay: 0,
  GoHome: 1,
  GoOut: 2,
  SeekShelter: 3,
  Sleep: 4,
} as const;
export type Action = (typeof Action)[keyof typeof Action];

export class AgentStore {
  readonly capacity: number;
  count = 0;
  nextId = 1;

  // — Contrato de render —
  readonly ids: Uint32Array;
  readonly positions: Float32Array;
  readonly headings: Float32Array;
  readonly activities: Uint8Array;
  readonly flags: Uint8Array;

  // — Identidad y rasgos (S4) —
  readonly sex: Uint8Array;
  readonly age: Uint8Array;
  readonly sociability: Float32Array;
  readonly bravery: Float32Array;
  readonly home: Int32Array;

  // — Necesidades, 0 = crítica, 1 = satisfecha (S3) —
  readonly energy: Float32Array;
  readonly shelter: Float32Array;
  readonly social: Float32Array;

  // — Estado de la acción —
  /** Edificio en el que está (−1 = en la calle). */
  readonly location: Int32Array;
  /** Edificio de destino (−1 = ninguno). */
  readonly target: Int32Array;
  readonly action: Uint8Array;
  /** Índice del siguiente waypoint de `paths`. */
  readonly pathPos: Uint16Array;

  /** Ruta en curso (pares x, z) o `null`. */
  readonly paths: (Float64Array | null)[] = [];
  readonly names: string[] = [];

  private readonly columns: [string, Column, number][];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.ids = new Uint32Array(capacity);
    this.positions = new Float32Array(capacity * 3);
    this.headings = new Float32Array(capacity);
    this.activities = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.sex = new Uint8Array(capacity);
    this.age = new Uint8Array(capacity);
    this.sociability = new Float32Array(capacity);
    this.bravery = new Float32Array(capacity);
    this.home = new Int32Array(capacity);
    this.energy = new Float32Array(capacity);
    this.shelter = new Float32Array(capacity);
    this.social = new Float32Array(capacity);
    this.location = new Int32Array(capacity);
    this.target = new Int32Array(capacity);
    this.action = new Uint8Array(capacity);
    this.pathPos = new Uint16Array(capacity);
    // Orden fijo: define la serialización y el hash.
    this.columns = [
      ['ids', this.ids, 1], ['positions', this.positions, 3], ['headings', this.headings, 1],
      ['activities', this.activities, 1], ['flags', this.flags, 1], ['sex', this.sex, 1], ['age', this.age, 1],
      ['sociability', this.sociability, 1], ['bravery', this.bravery, 1], ['home', this.home, 1],
      ['energy', this.energy, 1], ['shelter', this.shelter, 1], ['social', this.social, 1],
      ['location', this.location, 1], ['target', this.target, 1], ['action', this.action, 1],
      ['pathPos', this.pathPos, 1],
    ];
  }

  /** Reserva un agente con valores neutros y devuelve su índice. */
  add(x: number, y: number, z: number): number {
    if (this.count >= this.capacity) throw new Error(`AgentStore lleno (${this.capacity})`);
    const i = this.count++;
    for (const [, col, stride] of this.columns) col.fill(0, i * stride, i * stride + stride);
    this.ids[i] = this.nextId++;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.home[i] = -1;
    this.location[i] = -1;
    this.target[i] = -1;
    this.energy[i] = 1;
    this.shelter[i] = 1;
    this.social[i] = 1;
    this.paths[i] = null;
    this.names[i] = '';
    return i;
  }

  /** Índice actual del agente o −1. Lineal: para uso puntual (comandos), no en el bucle de ticks. */
  indexOf(id: number): number {
    for (let i = 0; i < this.count; i++) if (this.ids[i] === id) return i;
    return -1;
  }

  removeAt(i: number): void {
    const last = --this.count;
    if (i !== last) {
      for (const [, col, stride] of this.columns) col.copyWithin(i * stride, last * stride, last * stride + stride);
      this.paths[i] = this.paths[last]!;
      this.names[i] = this.names[last]!;
    }
    this.paths.length = this.count;
    this.names.length = this.count;
  }

  /** Columnas numéricas (nombre, array, stride) en orden fijo. */
  eachColumn(): readonly [string, Column, number][] {
    return this.columns;
  }

  serialize(): { nextId: number; count: number; columns: Record<string, number[]>; names: string[]; paths: (number[] | null)[] } {
    const columns: Record<string, number[]> = {};
    for (const [name, col, stride] of this.columns) columns[name] = Array.from(col.subarray(0, this.count * stride));
    return {
      nextId: this.nextId,
      count: this.count,
      columns,
      names: this.names.slice(0, this.count),
      paths: this.paths.slice(0, this.count).map((p) => (p ? Array.from(p) : null)),
    };
  }

  restore(data: ReturnType<AgentStore['serialize']>): void {
    if (data.count > this.capacity) throw new Error(`El snapshot tiene ${data.count} agentes; capacidad ${this.capacity}`);
    this.count = data.count;
    this.nextId = data.nextId;
    for (const [name, col] of this.columns) {
      const values = data.columns[name];
      if (!values) throw new Error(`Falta la columna ${name} en el snapshot`);
      col.set(values);
    }
    this.names.length = 0;
    this.names.push(...data.names);
    this.paths.length = 0;
    this.paths.push(...data.paths.map((p) => (p ? Float64Array.from(p) : null)));
  }
}
