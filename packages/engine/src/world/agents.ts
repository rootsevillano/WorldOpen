/**
 * Almacén de agentes en estructura de arrays (ECS sobre TypedArrays, ADR-0001). Capacidad fija; borrado por
 * intercambio con el último (los índices no son estables, los `ids` sí).
 */
export class AgentStore {
  readonly capacity: number;
  count = 0;
  nextId = 1;
  readonly ids: Uint32Array;
  readonly positions: Float32Array;
  readonly headings: Float32Array;
  readonly activities: Uint8Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.ids = new Uint32Array(capacity);
    this.positions = new Float32Array(capacity * 3);
    this.headings = new Float32Array(capacity);
    this.activities = new Uint8Array(capacity);
  }

  /** Añade un agente y devuelve su id. */
  add(x: number, y: number, z: number): number {
    if (this.count >= this.capacity) throw new Error(`AgentStore lleno (${this.capacity})`);
    const i = this.count++;
    const id = this.nextId++;
    this.ids[i] = id;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.headings[i] = 0;
    this.activities[i] = 0;
    return id;
  }

  /** Índice actual del agente o −1. Lineal: para uso puntual (comandos), no en el bucle de ticks. */
  indexOf(id: number): number {
    for (let i = 0; i < this.count; i++) if (this.ids[i] === id) return i;
    return -1;
  }

  removeAt(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.ids[i] = this.ids[last]!;
      this.positions.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.headings[i] = this.headings[last]!;
      this.activities[i] = this.activities[last]!;
    }
  }
}
