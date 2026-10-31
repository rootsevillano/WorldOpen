/** Tipos de animal (ADR-0027). Coincide con `AnimalKind` del contrato de render. */
export const Animal = { Dog: 0, Sheep: 1, Hen: 2 } as const;
export const ANIMAL_NAMES = ['dog', 'sheep', 'hen'] as const;

type Column = Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array;

/**
 * Almacén de animales (ECS sobre TypedArrays, como `AgentStore`). Los perros pertenecen a un hogar; el ganado, a una
 * huerta. Sin nombres ni rutas: siguen a su dueño o deambulan cerca de su nave.
 */
export class AnimalStore {
  readonly capacity: number;
  count = 0;
  nextId = 1;

  readonly ids: Uint32Array;
  readonly kind: Uint8Array;
  readonly positions: Float32Array;
  readonly headings: Float32Array;
  /** `AgentFlag.Indoors` = dentro (en casa, en el corral): no se dibuja. */
  readonly flags: Uint8Array;
  /** Perros: hogar dueño. */
  readonly household: Uint32Array;
  /** Ganado: huerta (índice de edificio); −1 en perros. */
  readonly farm: Int32Array;
  /** Día de nacimiento (días desde el inicio del mundo, puede ser negativo). */
  readonly born: Int32Array;
  /** Perros: id del agente que lo pasea (0 = nadie), minutos de paseo hoy y ayer. */
  readonly walker: Uint32Array;
  readonly walkedToday: Uint16Array;
  readonly walkedYesterday: Uint16Array;
  /** Perros: posición previa del paseante (le sigue un paso por detrás). Ganado: punto hacia el que deambula. */
  readonly aim: Float32Array;

  private readonly columns: [string, Column, number][];

  constructor(capacity: number) {
    this.capacity = capacity;
    const c = capacity;
    this.ids = new Uint32Array(c);
    this.kind = new Uint8Array(c);
    this.positions = new Float32Array(c * 3);
    this.headings = new Float32Array(c);
    this.flags = new Uint8Array(c);
    this.household = new Uint32Array(c);
    this.farm = new Int32Array(c);
    this.born = new Int32Array(c);
    this.walker = new Uint32Array(c);
    this.walkedToday = new Uint16Array(c);
    this.walkedYesterday = new Uint16Array(c);
    this.aim = new Float32Array(c * 2);
    this.columns = [
      ['ids', this.ids, 1], ['kind', this.kind, 1], ['positions', this.positions, 3], ['headings', this.headings, 1],
      ['flags', this.flags, 1], ['household', this.household, 1], ['farm', this.farm, 1], ['born', this.born, 1],
      ['walker', this.walker, 1], ['walkedToday', this.walkedToday, 1], ['walkedYesterday', this.walkedYesterday, 1],
      ['aim', this.aim, 2],
    ];
  }

  /** Añade un animal en (x, z); devuelve su índice, o −1 si el almacén está lleno. */
  add(kind: number, x: number, z: number): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    for (const [, col, stride] of this.columns) col.fill(0, i * stride, i * stride + stride);
    this.ids[i] = this.nextId++;
    this.kind[i] = kind;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 2] = z;
    this.farm[i] = -1;
    this.aim[i * 2] = x;
    this.aim[i * 2 + 1] = z;
    return i;
  }

  removeAt(i: number): void {
    const last = --this.count;
    if (i !== last) for (const [, col, stride] of this.columns) col.copyWithin(i * stride, last * stride, last * stride + stride);
  }

  eachColumn(): readonly [string, Column, number][] {
    return this.columns;
  }

  serialize(): { nextId: number; count: number; columns: Record<string, number[]> } {
    const columns: Record<string, number[]> = {};
    for (const [name, col, stride] of this.columns) columns[name] = Array.from(col.subarray(0, this.count * stride));
    return { nextId: this.nextId, count: this.count, columns };
  }

  restore(data: ReturnType<AnimalStore['serialize']>): void {
    if (data.count > this.capacity) throw new Error(`El snapshot tiene ${data.count} animales; capacidad ${this.capacity}`);
    this.count = data.count;
    this.nextId = data.nextId;
    for (const [name, col] of this.columns) {
      const values = data.columns[name];
      if (!values) throw new Error(`Falta la columna de animales ${name} en el snapshot`);
      col.set(values);
    }
  }
}
