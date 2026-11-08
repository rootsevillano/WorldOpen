import * as THREE from 'three';

/**
 * Figuras de estilo vóxel (ADR-0056): personas, coches y animales hechos de cubos con colores planos, a escala real
 * (una persona mide ~1,75 m; un coche, 4,2 m). Rumbo 0 = +X: la cara, el morro o la cabeza miran a +X.
 */

/** Un cubo de la figura: tamaño (x, y, z), centro (x, y, z) y color de vértice. */
export type Voxel = [size: [number, number, number], center: [number, number, number], color: number];

/** Une cubos en una sola geometría con color por vértice (el color de instancia, si lo hay, lo multiplica). */
export function voxels(parts: Voxel[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  let offset = 0;
  for (const [size, center, color] of parts) {
    const g = new THREE.BoxGeometry(...size).translate(...center);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    c.setHex(color);
    for (let k = 0; k < p.count; k++) {
      positions.push(p.getX(k), p.getY(k), p.getZ(k));
      normals.push(n.getX(k), n.getY(k), n.getZ(k));
      colors.push(c.r, c.g, c.b);
    }
    const idx = g.getIndex()!;
    for (let k = 0; k < idx.count; k++) indices.push(idx.getX(k) + offset);
    offset += p.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}

const WHITE = 0xffffff;

/** Persona: medidas (m). Cadera y hombros son los pivotes de piernas y brazos. */
export const PERSON = { hip: 0.82, legGap: 0.11, shoulder: 1.38, armGap: 0.27, height: 1.72 } as const;

/** Geometrías de las partes de una persona. Las partes blancas toman el color de la instancia (ropa, piel, pelo). */
export function personParts(): Record<'torso' | 'head' | 'hair' | 'leg' | 'arm', THREE.BufferGeometry> {
  return {
    // Torso con cinturón oscuro.
    torso: voxels([
      [[0.26, 0.54, 0.42], [0, PERSON.hip + 0.31, 0], WHITE],
      [[0.27, 0.06, 0.43], [0, PERSON.hip + 0.03, 0], 0x3a3026],
    ]),
    // Cabeza (piel) con ojos y boca.
    head: voxels([
      [[0.26, 0.28, 0.26], [0, 1.56, 0], WHITE],
      [[0.02, 0.05, 0.05], [0.13, 1.6, 0.06], 0x1a1a1a],
      [[0.02, 0.05, 0.05], [0.13, 1.6, -0.06], 0x1a1a1a],
      [[0.02, 0.03, 0.1], [0.13, 1.5, 0], 0x7a3b30],
    ]),
    // Pelo: casquete y nuca.
    hair: voxels([
      [[0.28, 0.07, 0.28], [-0.01, PERSON.height - 0.01, 0], WHITE],
      [[0.07, 0.2, 0.28], [-0.11, 1.6, 0], WHITE],
    ]),
    // Pierna (pantalón) con zapato oscuro; el pivote está arriba (cadera).
    leg: voxels([
      [[0.17, 0.72, 0.17], [0, -0.36, 0], WHITE],
      [[0.24, 0.1, 0.18], [0.03, -0.77, 0], 0x2a2420],
    ]),
    // Brazo (manga) con mano clara; el pivote está arriba (hombro).
    arm: voxels([
      [[0.13, 0.5, 0.13], [0, -0.25, 0], WHITE],
      [[0.12, 0.1, 0.12], [0, -0.55, 0], 0xe8c6a0],
    ]),
  };
}

/** Coche: carrocería (toma el color de la instancia) y detalles fijos (ruedas, cristales, faros). */
export function carParts(): { body: THREE.BufferGeometry; details: THREE.BufferGeometry } {
  const glass = 0x26323e;
  const wheel = 0x1b1b1b;
  const wheels: Voxel[] = [];
  for (const x of [1.3, -1.3]) for (const z of [0.82, -0.82]) wheels.push([[0.64, 0.64, 0.26], [x, 0.32, z], wheel]);
  return {
    body: voxels([
      [[4.2, 0.55, 1.76], [0, 0.6, 0], WHITE],
      [[2.3, 0.55, 1.6], [-0.25, 1.15, 0], WHITE],
    ]),
    details: voxels([
      ...wheels,
      [[0.05, 0.42, 1.44], [0.92, 1.15, 0], glass],
      [[0.05, 0.42, 1.44], [-1.42, 1.15, 0], glass],
      [[2.0, 0.4, 0.04], [-0.25, 1.15, 0.81], glass],
      [[2.0, 0.4, 0.04], [-0.25, 1.15, -0.81], glass],
      [[0.05, 0.16, 0.34], [2.11, 0.7, 0.58], 0xfff3c4],
      [[0.05, 0.16, 0.34], [2.11, 0.7, -0.58], 0xfff3c4],
      [[0.05, 0.14, 0.3], [-2.11, 0.72, 0.6], 0xc0281f],
      [[0.05, 0.14, 0.3], [-2.11, 0.72, -0.6], 0xc0281f],
      [[0.08, 0.16, 1.7], [2.12, 0.42, 0], 0x555a60],
      [[0.08, 0.16, 1.7], [-2.12, 0.42, 0], 0x555a60],
    ]),
  };
}

/** Autobús de línea: caja larga verde, ventanas corridas, ruedas y faros. */
export function busParts(): THREE.BufferGeometry {
  const parts: Voxel[] = [
    [[10, 2.5, 2.5], [0, 1.75, 0], 0x2e8b57],
    [[10.02, 0.12, 2.52], [0, 1.05, 0], 0xf2f2f2],
    [[8.6, 0.85, 2.54], [-0.4, 2.2, 0], 0x22303c],
    [[0.06, 1.1, 2.1], [5.0, 2.05, 0], 0x22303c],
    [[0.06, 0.2, 0.5], [5.01, 0.85, 0.85], 0xfff3c4],
    [[0.06, 0.2, 0.5], [5.01, 0.85, -0.85], 0xfff3c4],
  ];
  for (const x of [3.4, -3.2]) for (const z of [1.2, -1.2]) parts.push([[1.0, 1.0, 0.3], [x, 0.5, z], 0x1b1b1b]);
  return voxels(parts);
}

/** Perro, oveja y gallina (`AnimalKind`), con sus colores. */
export function animalParts(): THREE.BufferGeometry[] {
  const leg = (x: number, z: number, w: number, h: number, color: number): Voxel => [[w, h, w], [x, h / 2, z], color];
  const brown = 0x9a6a3c;
  const dark = 0x5a3a20;
  const dog = voxels([
    [[0.62, 0.28, 0.26], [0, 0.46, 0], brown],
    [[0.26, 0.26, 0.24], [0.38, 0.66, 0], brown],
    [[0.14, 0.11, 0.14], [0.56, 0.6, 0], dark],
    [[0.03, 0.04, 0.05], [0.635, 0.63, 0], 0x111111],
    [[0.06, 0.12, 0.06], [0.34, 0.83, 0.08], dark],
    [[0.06, 0.12, 0.06], [0.34, 0.83, -0.08], dark],
    [[0.24, 0.06, 0.06], [-0.4, 0.62, 0], brown],
    leg(0.22, 0.08, 0.08, 0.32, brown), leg(0.22, -0.08, 0.08, 0.32, brown),
    leg(-0.22, 0.08, 0.08, 0.32, brown), leg(-0.22, -0.08, 0.08, 0.32, brown),
  ]);
  const wool = 0xf1ede2;
  const face = 0x3b3633;
  const sheep = voxels([
    [[0.92, 0.52, 0.62], [0, 0.72, 0], wool],
    [[0.2, 0.18, 0.5], [0.42, 0.95, 0], wool],
    [[0.26, 0.3, 0.26], [0.56, 0.88, 0], face],
    [[0.05, 0.08, 0.14], [0.5, 0.98, 0.18], face],
    [[0.05, 0.08, 0.14], [0.5, 0.98, -0.18], face],
    leg(0.3, 0.18, 0.12, 0.46, face), leg(0.3, -0.18, 0.12, 0.46, face),
    leg(-0.3, 0.18, 0.12, 0.46, face), leg(-0.3, -0.18, 0.12, 0.46, face),
  ]);
  const feather = 0xf4efe4;
  const yellow = 0xe8b830;
  const hen = voxels([
    [[0.32, 0.24, 0.24], [0, 0.32, 0], feather],
    [[0.13, 0.16, 0.13], [0.17, 0.5, 0], feather],
    [[0.09, 0.06, 0.03], [0.17, 0.61, 0], 0xd8261c],
    [[0.03, 0.06, 0.03], [0.22, 0.43, 0], 0xd8261c],
    [[0.07, 0.04, 0.05], [0.26, 0.5, 0], yellow],
    [[0.1, 0.18, 0.2], [-0.19, 0.44, 0], feather],
    leg(0.02, 0.06, 0.035, 0.2, yellow), leg(0.02, -0.06, 0.035, 0.2, yellow),
  ]);
  return [dog, sheep, hen];
}

/** Tonos de piel, pelo, ropa y carrocería (por id: estables entre fotogramas). */
export const SKIN = [0xf1d0b0, 0xe0b48e, 0xc89068, 0xa56e4a, 0x7a4e32].map((c) => new THREE.Color(c));
export const HAIR = [0x2a1d14, 0x4a3020, 0x7a5232, 0xb08a52, 0xd9c08a, 0x9a9a9a, 0x1a1a1a].map((c) => new THREE.Color(c));
export const SHIRTS = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf5f5f0, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x34495e, 0x16a085, 0xd98880, 0x5d6d7e].map((c) => new THREE.Color(c));
export const PANTS = [0x2c3e50, 0x1f2a44, 0x4a4a4a, 0x6d5843, 0x384f2e, 0x2b2b2b, 0x5b6f8a].map((c) => new THREE.Color(c));

/** Elige un color de la paleta a partir de un id y una sal (sin `Math.random`: estable entre fotogramas). */
export function pickColor(palette: THREE.Color[], id: number, salt: number): THREE.Color {
  const h = Math.imul((id + 1) ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return palette[(h >>> 7) % palette.length]!;
}

/**
 * Paso visual (ADR-0056): lo que se dibuja recorre, a una velocidad creíble (m/s reales) sea cual sea el ritmo del
 * tiempo, el mismo camino que ha hecho en la simulación (los puntos por los que ha pasado: así no ataja por los campos
 * ni atraviesa edificios). Si le queda más de `snap` metros por recorrer, salta hasta su posición actual.
 */
type Shown = { x: number; z: number; heading: number; phase: number; moving: number; seen: number; trail: number[]; left: number };

export class Pacer {
  private readonly shown = new Map<number, Shown>();
  private generation = 0;

  /** Empieza un fotograma: lo que no se vuelva a pedir se olvida al cerrarlo. */
  begin(): void {
    this.generation++;
  }

  /** Posición dibujada de `key`, que va hacia (tx, tz). Devuelve el estado (también el balanceo de la marcha). */
  step(key: number, tx: number, tz: number, simHeading: number, speed: number, snap: number, dt: number): Shown {
    let s = this.shown.get(key);
    if (!s) {
      s = { x: tx, z: tz, heading: simHeading, phase: 0, moving: 0, seen: this.generation, trail: [], left: 0 };
      this.shown.set(key, s);
      return s;
    }
    s.seen = this.generation;
    // Camino pendiente: los puntos por los que ha pasado en la simulación (cada 0,5 m como mínimo).
    const n = s.trail.length;
    const lx = n > 0 ? s.trail[n - 2]! : s.x;
    const lz = n > 0 ? s.trail[n - 1]! : s.z;
    const seg = Math.hypot(tx - lx, tz - lz);
    if (seg > 0.5) {
      s.trail.push(tx, tz);
      s.left += seg;
    }
    if (s.left > snap) {
      s.x = tx;
      s.z = tz;
      s.heading = simHeading;
      s.moving = 0;
      s.trail.length = 0;
      s.left = 0;
      return s;
    }
    let budget = speed * dt;
    const moved = budget;
    while (budget > 0 && s.trail.length > 0) {
      const px = s.trail[0]!;
      const pz = s.trail[1]!;
      const dx = px - s.x;
      const dz = pz - s.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) s.heading = -Math.atan2(dz, dx);
      if (d <= budget) {
        s.x = px;
        s.z = pz;
        budget -= d;
        s.left = Math.max(0, s.left - d);
        s.trail.splice(0, 2);
      } else {
        s.x += (dx / d) * budget;
        s.z += (dz / d) * budget;
        s.left = Math.max(0, s.left - budget);
        budget = 0;
      }
    }
    const walked = moved - budget;
    if (walked > 0.001) {
      s.phase += (walked / 0.75) * Math.PI;
      s.moving = Math.min(1, s.moving + dt * 6);
    } else {
      s.moving = Math.max(0, s.moving - dt * 4);
    }
    return s;
  }

  /** Olvida lo que no se ha pedido en este fotograma (entró en casa, salió del pueblo…). */
  end(): void {
    for (const [k, s] of this.shown) if (s.seen !== this.generation) this.shown.delete(k);
  }

  get(key: number): Shown | undefined {
    return this.shown.get(key);
  }
}
