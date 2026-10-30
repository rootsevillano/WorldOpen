/**
 * Almacén de agentes en estructura de arrays (ECS sobre TypedArrays, ADR-0001). Capacidad fija; borrado por
 * intercambio con el último (los índices no son estables, los `ids` sí).
 */
type Column = Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array;

/** Acción en curso decidida por la Utility AI (ADR-0008). El orden define las columnas de `scores`. */
export const Action = {
  Stay: 0,
  GoHome: 1,
  GoOut: 2,
  SeekShelter: 3,
  Sleep: 4,
  Provision: 5,
  Work: 6,
  /** Llevar la cosecha de la huerta a una tienda (logística con agentes, ADR-0018). */
  Deliver: 7,
} as const;
export type Action = (typeof Action)[keyof typeof Action];
export const ACTION_NAMES = ['stay', 'goHome', 'goOut', 'seekShelter', 'sleep', 'provision', 'work', 'deliver'] as const;
export const ACTION_COUNT = ACTION_NAMES.length;

export const Occupation = {
  Unemployed: 0,
  Retired: 1,
  Shopkeeper: 2,
  Farmer: 3,
  Sawyer: 4,
  CivilServant: 5,
  /** 6–17 años: va a la escuela (un servicio público) en horario escolar. */
  Student: 6,
  /** 0–5 años: se queda en casa. */
  Child: 7,
} as const;
export type Occupation = (typeof Occupation)[keyof typeof Occupation];
export const OCCUPATION_NAMES = ['unemployed', 'retired', 'shopkeeper', 'farmer', 'sawyer', 'civilServant', 'student', 'child'] as const;

/** Recurso: 0 = ninguno. */
export const Resource = { None: 0, Food: 1, Water: 2, Wood: 3 } as const;
export type Resource = (typeof Resource)[keyof typeof Resource];
export const RESOURCE_NAMES = ['none', 'food', 'water', 'wood'] as const;

/** Tipos de recuerdo (S6). */
export const Memory = {
  None: 0,
  FoodEmpty: 1,
  WaterEmpty: 2,
  WoodEmpty: 3,
  Fire: 4,
  NewFriend: 5,
  LostHome: 6,
  /** Murió alguien de su familia o un amigo (S5). */
  Grief: 7,
  /** Nació un hijo (S5). */
  NewChild: 8,
} as const;
export const MEMORY_NAMES = ['none', 'foodEmpty', 'waterEmpty', 'woodEmpty', 'fire', 'newFriend', 'lostHome', 'grief', 'newChild'] as const;

export const RelationKind = { None: 0, Family: 1, Acquaintance: 2, Friend: 3 } as const;
export const RELATION_NAMES = ['none', 'family', 'acquaintance', 'friend'] as const;

export const MEMORY_SLOTS = 8;
export const RELATION_SLOTS = 8;

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
  readonly occupation: Uint8Array;
  readonly workplace: Int32Array;

  // — Necesidades, 0 = crítica, 1 = satisfecha (S3) —
  readonly energy: Float32Array;
  readonly shelter: Float32Array;
  readonly social: Float32Array;
  readonly hunger: Float32Array;
  readonly thirst: Float32Array;
  readonly work: Float32Array;
  readonly health: Float32Array;

  // — Estado de la acción —
  /** Edificio en el que está (−1 = en la calle). */
  readonly location: Int32Array;
  /** Edificio de destino (−1 = ninguno). */
  readonly target: Int32Array;
  readonly action: Uint8Array;
  /** Índice del siguiente waypoint de `paths`. */
  readonly pathPos: Uint16Array;
  /** Recurso que busca (acción Provision). */
  readonly seeking: Uint8Array;
  readonly carryKind: Uint8Array;
  readonly carryAmount: Float32Array;
  /** Minutos de servicio pendientes en una tienda/fuente, o de comida en casa. */
  readonly busyLeft: Uint16Array;
  /** Hora preferida de acostarse (minuto del día; cronotipo, ADR-0018). */
  readonly bedtime: Uint16Array;
  /** Día del año del cumpleaños (0–359) y días de embarazo (0 = no) (S5, ADR-0019). */
  readonly birthDay: Uint16Array;
  readonly pregnantDays: Uint16Array;
  /** Puntuaciones de la última decisión (stride `ACTION_COUNT`). */
  readonly scores: Float32Array;

  // — Memoria (anillo) y relaciones (huecos fijos) —
  readonly memTick: Uint32Array;
  readonly memKind: Uint8Array;
  readonly memBuilding: Int32Array;
  readonly memHead: Uint8Array;
  readonly relId: Uint32Array;
  readonly relAffinity: Float32Array;
  readonly relKind: Uint8Array;

  /** Ruta en curso (pares x, z) o `null`. */
  readonly paths: (Float64Array | null)[] = [];
  readonly names: string[] = [];

  private readonly columns: [string, Column, number][];

  constructor(capacity: number) {
    this.capacity = capacity;
    const c = capacity;
    this.ids = new Uint32Array(c);
    this.positions = new Float32Array(c * 3);
    this.headings = new Float32Array(c);
    this.activities = new Uint8Array(c);
    this.flags = new Uint8Array(c);
    this.sex = new Uint8Array(c);
    this.age = new Uint8Array(c);
    this.sociability = new Float32Array(c);
    this.bravery = new Float32Array(c);
    this.home = new Int32Array(c);
    this.occupation = new Uint8Array(c);
    this.workplace = new Int32Array(c);
    this.energy = new Float32Array(c);
    this.shelter = new Float32Array(c);
    this.social = new Float32Array(c);
    this.hunger = new Float32Array(c);
    this.thirst = new Float32Array(c);
    this.work = new Float32Array(c);
    this.health = new Float32Array(c);
    this.location = new Int32Array(c);
    this.target = new Int32Array(c);
    this.action = new Uint8Array(c);
    this.pathPos = new Uint16Array(c);
    this.seeking = new Uint8Array(c);
    this.carryKind = new Uint8Array(c);
    this.carryAmount = new Float32Array(c);
    this.busyLeft = new Uint16Array(c);
    this.bedtime = new Uint16Array(c);
    this.birthDay = new Uint16Array(c);
    this.pregnantDays = new Uint16Array(c);
    this.scores = new Float32Array(c * ACTION_COUNT);
    this.memTick = new Uint32Array(c * MEMORY_SLOTS);
    this.memKind = new Uint8Array(c * MEMORY_SLOTS);
    this.memBuilding = new Int32Array(c * MEMORY_SLOTS);
    this.memHead = new Uint8Array(c);
    this.relId = new Uint32Array(c * RELATION_SLOTS);
    this.relAffinity = new Float32Array(c * RELATION_SLOTS);
    this.relKind = new Uint8Array(c * RELATION_SLOTS);
    // Orden fijo: define la serialización y el hash.
    this.columns = [
      ['ids', this.ids, 1], ['positions', this.positions, 3], ['headings', this.headings, 1],
      ['activities', this.activities, 1], ['flags', this.flags, 1], ['sex', this.sex, 1], ['age', this.age, 1],
      ['sociability', this.sociability, 1], ['bravery', this.bravery, 1], ['home', this.home, 1],
      ['occupation', this.occupation, 1], ['workplace', this.workplace, 1],
      ['energy', this.energy, 1], ['shelter', this.shelter, 1], ['social', this.social, 1],
      ['hunger', this.hunger, 1], ['thirst', this.thirst, 1], ['work', this.work, 1], ['health', this.health, 1],
      ['location', this.location, 1], ['target', this.target, 1], ['action', this.action, 1],
      ['pathPos', this.pathPos, 1], ['seeking', this.seeking, 1], ['carryKind', this.carryKind, 1],
      ['carryAmount', this.carryAmount, 1], ['busyLeft', this.busyLeft, 1], ['bedtime', this.bedtime, 1], ['birthDay', this.birthDay, 1], ['pregnantDays', this.pregnantDays, 1], ['scores', this.scores, ACTION_COUNT],
      ['memTick', this.memTick, MEMORY_SLOTS], ['memKind', this.memKind, MEMORY_SLOTS],
      ['memBuilding', this.memBuilding, MEMORY_SLOTS], ['memHead', this.memHead, 1],
      ['relId', this.relId, RELATION_SLOTS], ['relAffinity', this.relAffinity, RELATION_SLOTS],
      ['relKind', this.relKind, RELATION_SLOTS],
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
    this.workplace[i] = -1;
    this.location[i] = -1;
    this.target[i] = -1;
    this.energy[i] = 1;
    this.shelter[i] = 1;
    this.social[i] = 1;
    this.hunger[i] = 1;
    this.thirst[i] = 1;
    this.work[i] = 1;
    this.health[i] = 1;
    this.memBuilding.fill(-1, i * MEMORY_SLOTS, (i + 1) * MEMORY_SLOTS);
    this.paths[i] = null;
    this.names[i] = '';
    return i;
  }

  /** Índice actual del agente o −1. Lineal: para uso puntual (comandos, inspector), no en el bucle de ticks. */
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
