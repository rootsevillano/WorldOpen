import { AgentActivity, AgentFlag, BuildingState, type BuildingUse, type MapLogic, type RenderFrame } from '@worldopen/contracts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Heights, buildFootprints, buildTrees, loadGlb, type FootprintMesh } from './realMap';
import { HAIR, PANTS, PERSON, Pacer, SHIRTS, SKIN, animalParts, busParts, carParts, personParts, pickColor } from './figures';

/** Latitud del mapa base, solo para la altura del sol (no se muestra en ningún sitio). */
const LATITUDE_DEG = 37.3;
const MAX_AGENTS = 10_000;
const MAX_ANIMALS = 20_000;
/**
 * Paso visual (ADR-0056): velocidades creíbles en pantalla (m/s reales), sea cual sea el ritmo del tiempo, y distancia
 * (m) a partir de la cual lo dibujado salta a su posición en la simulación.
 */
const PACE = {
  walk: { speed: 1.4, snap: 20 },
  car: { speed: 13, snap: 120 },
  bus: { speed: 11, snap: 200 },
  paso: { speed: 0.8, snap: 25 },
  animals: [{ speed: 1.6, snap: 20 }, { speed: 0.9, snap: 8 }, { speed: 0.7, snap: 8 }],
} as const;
/** Separación (m) entre quienes comparten punto en la simulación. */
const CROWD_SPREAD = 1.6;
/** Balanceo de piernas y brazos al andar (rad). */
const STRIDE_SWING = 0.55;
/** Teclado (ADR-0056): desplazamiento (× distancia de la cámara por segundo), giro (rad/s) y zoom (por segundo). */
const KEY_PAN = 0.7;
const KEY_TURN = 1.4;
const KEY_ZOOM = 1.3;

/** Colores de coche (por id del conductor: estable entre frames). */
/** Fuegos artificiales (ADR-0044): chispas que el render anima con su propio reloj (no son estado del mundo). */
const MAX_SPARKS = 2000;
const SPARKS_PER_BURST = 80;
const SPARK_LIFE_S = 1.8;
const FIREWORK_COLORS = [0xff4d4d, 0xffd84d, 0x4dd2ff, 0x9dff4d, 0xff7dff, 0xffffff].map((c) => new THREE.Color(c));

const JAMMED_COLOR = new THREE.Color(0xff2a1a);
/** Disfraces de carnaval (ADR-0048): colores vivos, uno por persona. */
/** Luto del entierro de la sardina (ADR-0052): morado de Cuaresma (el negro no se ve de noche en la calle). */
const MOURNING_COLOR = new THREE.Color(0x6a4c93);
const COSTUME_COLORS = [0xe74c3c, 0xf1c40f, 0x9b59b6, 0x2ecc71, 0xff7f50, 0x00bcd4, 0xff4fa3].map((c) => new THREE.Color(c));
const CAR_COLORS = [0xb03a2e, 0x1f618d, 0xd4ac0d, 0xeeeeee, 0x2c3e50, 0x7f8c8d, 0x117a65].map((c) => new THREE.Color(c));

/** Une geometrías indexadas de caja en una sola (sin depender de BufferGeometryUtils). */
function mergeBoxes(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    for (let k = 0; k < p.count; k++) {
      positions.push(p.getX(k), p.getY(k), p.getZ(k));
      normals.push(nrm.getX(k), nrm.getY(k), nrm.getZ(k));
    }
    const idx = g.getIndex()!;
    for (let k = 0; k < idx.count; k++) indices.push(idx.getX(k) + offset);
    offset += p.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}
const FLOOR_HEIGHT = 3;
const STREET_WIDTH = { carriageway: 10, track: 5, pedestrian: 4 } as const;

/** Ermita en el campo (ADR-0049): encalada; casas de campo (ADR-0053): cal con ocre. */
const ROLE_COLORS: Record<string, number> = { hermitage: 0xf7f3ea, farmhouse: 0xf0dfb8 };
/** Huertos (ADR-0054): tierra labrada, surcos verdes y separación entre surcos (m). */
const GARDEN_SOIL = 0x6b4a2e;
const GARDEN_CROP = 0x5e9a3a;
const GARDEN_ROW_SPACING = 1.6;
const GARDEN_DEPTH = 3;
/** Corrales de las casas de campo (ADR-0055): cerca de madera y un cobertizo en un extremo. */
const PEN_FENCE = 0x8a6a45;
const PEN_SHED = 0xa08f78;
const PEN_FENCE_HEIGHT = 1;
const PEN_SHED_SIZE = { length: 3.5, width: 4, height: 2.4 };
const colorOf = (b: { use: BuildingUse; role?: string }): number => (b.role !== undefined ? ROLE_COLORS[b.role] : undefined) ?? USE_COLORS[b.use];

const USE_COLORS: Record<BuildingUse, number> = {
  residential: 0xe9dcc4,
  agriculture: 0xb9a77a,
  industrial: 0x9aa3ad,
  office: 0xa9c0d6,
  retail: 0xe6a35a,
  publicServices: 0x7fb7a4,
  unknown: 0xcccccc,
};

const ACTIVITY_COLORS: Record<number, THREE.Color> = {
  [AgentActivity.Idle]: new THREE.Color(0x3d6fd1),
  [AgentActivity.Moving]: new THREE.Color(0xf08a24),
  [AgentActivity.Sleeping]: new THREE.Color(0x6b5bd6),
  [AgentActivity.Socializing]: new THREE.Color(0x2fb37a),
  [AgentActivity.Fleeing]: new THREE.Color(0xe53935),
  [AgentActivity.Working]: new THREE.Color(0x8d6e63),
  [AgentActivity.Eating]: new THREE.Color(0xfdd835),
  [AgentActivity.Queueing]: new THREE.Color(0xff4fa3),
};

const BURNING = new THREE.Color(0xff5a1f);
const DAMAGED = new THREE.Color(0x3b3b3b);

/** Teclas que mueven la cámara (ADR-0056). */
const CAMERA_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'BracketRight', 'ShiftLeft', 'ShiftRight']);

export type Pick = { kind: 'agent'; id: number } | { kind: 'building'; id: string } | { kind: 'animal'; id: number } | null;

/** Recursos de dibujo de una región con map-pack (rutas ya resueltas a URL). */
export interface RenderPack {
  base: string;
  render: { terrain?: string; roads?: string; trees?: string; heights?: string };
}

/**
 * Render 3D (Render API). Solo consume `RenderFrame` y el mapa lógico; no conoce el motor.
 * Las regiones sin GLB se dibujan con volúmenes simples a partir de `MapLogic`.
 */
export class WorldRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private readonly hemi = new THREE.HemisphereLight(0xbcd6ec, 0x5b5a3c, 1.0);
  /** Torso de las personas (`AGENTS`); `people` son todas sus partes, en el mismo orden de instancias. */
  private readonly agents: THREE.InstancedMesh;
  private readonly people: THREE.InstancedMesh[];
  private readonly carDetails: THREE.InstancedMesh;
  /** Paso visual (ADR-0056) de personas y coches, animales, autobuses y pasos de procesión. */
  private readonly pacer = new Pacer();
  private readonly animalPacer = new Pacer();
  private readonly busPacer = new Pacer();
  private readonly pasoPacer = new Pacer();
  private lastDrawAt = 0;
  /** Camisetas del color de la actividad (como antes) en vez de ropa variada. */
  private activityColors = false;
  /** Teclas pulsadas para mover la cámara (ADR-0056). */
  private readonly keys = new Set<string>();
  private readonly base = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly part = new THREE.Matrix4();
  private readonly candles: THREE.InstancedMesh;
  /** Coches en marcha (agentes con `AgentFlag.Driving`), ADR-0025. */
  private readonly cars: THREE.InstancedMesh;
  private carAtInstance: number[] = [];
  /** Animales por tipo (`AnimalKind`), ADR-0027. */
  private readonly animalMeshes: THREE.InstancedMesh[];
  private readonly prevAnimalPos = new Map<number, [number, number, number]>();
  /** Id del animal dibujado en cada instancia, por tipo (para seleccionarlo). */
  private readonly animalAtInstance: number[][] = [[], [], []];
  /** Autobuses (ADR-0030). */
  private readonly buses: THREE.InstancedMesh;
  /** Marquesinas de las paradas del autobús (ADR-0045). */
  private readonly stops: THREE.InstancedMesh;
  /** Fiestas (ADR-0044): pasos de procesión y chispas de los fuegos artificiales. */
  private readonly pasos: THREE.InstancedMesh;
  private readonly bonfires: THREE.InstancedMesh;
  private readonly sparks: THREE.Points;
  private readonly sparkPos = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkVel = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkCol = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkBase = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkLife = new Float32Array(MAX_SPARKS);
  private prevPasos: Float32Array | null = null;
  private sparkNext = 0;
  private lastSparkAt = 0;
  private nextBurstAt = 0;
  private readonly mapGroup = new THREE.Group();
  private buildingMesh: THREE.InstancedMesh | null = null;
  private footprints: FootprintMesh | null = null;
  private heights: Heights | null = null;
  private ground: THREE.Mesh;
  private mapSeq = 0;
  /** Huertos dibujados (ADR-0054): se recolocan sobre el relieve al cargar las cotas del map-pack. */
  private gardens: { buildings: MapLogic['buildings']; meshes: THREE.Object3D[] } | null = null;
  private buildingIds: string[] = [];
  private buildingBase: THREE.Color[] = [];
  private buildingStates: Uint8Array = new Uint8Array(0);
  /** Id de agente de cada instancia dibujada (para la selección). */
  private agentAtInstance: number[] = [];
  private following: number | null = null;
  private selected: Pick = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly marker: THREE.Mesh;
  private readonly skyDay = new THREE.Color(0xbcd6ec);
  private readonly skyNight = new THREE.Color(0x0b1424);
  private readonly tmp = new THREE.Object3D();
  private readonly onResize = () => this.resize();
  private raf = 0;

  // Interpolación entre los dos últimos ticks recibidos (por id de agente).
  private frame: RenderFrame | null = null;
  private prevPos = new Map<number, [number, number, number]>();
  private tickArrivedAt = 0;
  private tickDuration = 1000;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
    this.camera.position.set(280, 320, 420);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 3000;

    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(this.skyDay.getHex(), 1500, 4000);
    this.scene.add(this.hemi, this.sun, this.mapGroup);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8a8a5c, roughness: 1 }),
    );
    ground.name = 'GROUND';
    this.ground = ground;
    this.scene.add(ground);

    // Personas de estilo vóxel (ADR-0056): torso, cabeza, pelo, dos piernas y dos brazos (estos se balancean al andar).
    const parts = personParts();
    const voxelMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const instanced = (geometry: THREE.BufferGeometry, count: number, name: string) => {
      const m = new THREE.InstancedMesh(geometry, voxelMat(), count);
      m.count = 0;
      m.frustumCulled = false;
      m.name = name;
      this.scene.add(m);
      return m;
    };
    this.agents = instanced(parts.torso, MAX_AGENTS, 'AGENTS');
    this.people = [
      this.agents,
      instanced(parts.head, MAX_AGENTS, 'AGENT_HEADS'),
      instanced(parts.hair, MAX_AGENTS, 'AGENT_HAIR'),
      instanced(parts.leg, MAX_AGENTS, 'AGENT_LEGS_L'),
      instanced(parts.leg, MAX_AGENTS, 'AGENT_LEGS_R'),
      instanced(parts.arm, MAX_AGENTS, 'AGENT_ARMS_L'),
      instanced(parts.arm, MAX_AGENTS, 'AGENT_ARMS_R'),
    ];
    // Velas del cortejo del entierro de la sardina (ADR-0052): llama sin iluminación, para que se vea de noche.
    this.candles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.1, 0.3, 0.1).translate(0.3, 1.0, PERSON.armGap + 0.05),
      new THREE.MeshBasicMaterial({ color: 0xffd36b }),
      MAX_AGENTS,
    );
    this.candles.count = 0;
    this.candles.frustumCulled = false;
    this.candles.name = 'CANDLES';
    this.scene.add(this.candles);

    // Rumbo 0 = +X: el coche es largo en X. Carrocería (color de la instancia) y detalles fijos (ruedas, cristales, faros).
    const car = carParts();
    this.cars = new THREE.InstancedMesh(car.body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }), MAX_AGENTS);
    this.cars.count = 0;
    this.cars.frustumCulled = false;
    this.cars.name = 'CARS';
    this.scene.add(this.cars);
    this.carDetails = instanced(car.details, MAX_AGENTS, 'CAR_DETAILS');

    // Perro, oveja y gallina de estilo vóxel, con la cabeza en +X (rumbo 0).
    this.animalMeshes = animalParts().map((g) => new THREE.InstancedMesh(g, voxelMat(), MAX_ANIMALS));
    // Autobús: caja alargada en X (rumbo 0), ventanas corridas, ruedas y faros.
    this.buses = new THREE.InstancedMesh(busParts(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 64);
    this.buses.count = 0;
    this.buses.frustumCulled = false;
    this.buses.name = 'BUSES';
    this.scene.add(this.buses);
    // Marquesina: tejadillo, panel trasero y poste con el cartel (largo en X, como la carretera).
    this.stops = new THREE.InstancedMesh(
      mergeBoxes(
        new THREE.BoxGeometry(3.4, 0.12, 1.6).translate(0, 2.5, 0),
        new THREE.BoxGeometry(3.4, 2.4, 0.08).translate(0, 1.3, 0.75),
        new THREE.BoxGeometry(0.12, 2.9, 0.12).translate(2.0, 1.45, -0.6),
        new THREE.BoxGeometry(0.7, 0.5, 0.06).translate(2.0, 2.85, -0.6),
      ),
      new THREE.MeshStandardMaterial({ color: 0x2e6fb0, roughness: 0.5, metalness: 0.3 }),
      16,
    );
    this.stops.count = 0;
    this.stops.frustumCulled = false;
    this.stops.name = 'BUS_STOPS';
    this.scene.add(this.stops);
    // Paso de procesión: andas doradas con la imagen encima (rumbo 0 = +X).
    this.pasos = new THREE.InstancedMesh(
      mergeBoxes(
        new THREE.BoxGeometry(2.8, 0.7, 1.9).translate(0, 1.0, 0),
        new THREE.BoxGeometry(0.6, 1.7, 0.6).translate(0, 2.2, 0),
        new THREE.BoxGeometry(1.2, 0.15, 1.2).translate(0, 3.15, 0),
      ),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0x3a2a00, roughness: 0.35, metalness: 0.6 }),
      16,
    );
    this.pasos.count = 0;
    this.pasos.frustumCulled = false;
    this.pasos.name = 'PASOS';
    this.scene.add(this.pasos);
    // Hoguera de la quema de la sardina (ADR-0052): llama emisiva que parpadea (escala al azar: solo render).
    this.bonfires = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.6, 4.5, 7).translate(0, 2.25, 0),
      new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.6, roughness: 0.6 }),
      16,
    );
    this.bonfires.count = 0;
    this.bonfires.frustumCulled = false;
    this.bonfires.name = 'BONFIRES';
    this.scene.add(this.bonfires);
    // Chispas de los fuegos: puntos aditivos (brillan sobre el cielo nocturno).
    const sparkGeometry = new THREE.BufferGeometry();
    for (let k = 0; k < MAX_SPARKS; k++) this.sparkPos[k * 3 + 1] = -1e4;
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({ size: 2.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.sparks.frustumCulled = false;
    this.sparks.name = 'FIREWORKS';
    this.scene.add(this.sparks);
    for (const [k, m] of this.animalMeshes.entries()) {
      m.count = 0;
      m.frustumCulled = false;
      m.name = `ANIMALS_${k}`;
      this.scene.add(m);
    }

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.6, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffeb3b, side: THREE.DoubleSide, depthTest: false }),
    );
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    this.scene.add(this.marker);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.resize();
    this.loop();
  }

  /** Qué hay bajo el puntero (coordenadas de cliente). Agentes antes que edificios. */
  pick(clientX: number, clientY: number): Pick {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Los agentes se mueven: la esfera envolvente de las instancias se recalcula en cada selección. Vale cualquier
    // parte del cuerpo (todas comparten el índice de instancia).
    for (const m of this.people) m.computeBoundingSphere();
    const agentHit = this.raycaster.intersectObjects(this.people, false)[0];
    if (agentHit?.instanceId !== undefined) {
      const id = this.agentAtInstance[agentHit.instanceId];
      if (id !== undefined) return { kind: 'agent', id };
    }
    this.cars.computeBoundingSphere();
    const carHit = this.raycaster.intersectObject(this.cars, false)[0];
    if (carHit?.instanceId !== undefined) {
      const id = this.carAtInstance[carHit.instanceId];
      if (id !== undefined) return { kind: 'agent', id };
    }
    for (const [k, mesh] of this.animalMeshes.entries()) {
      mesh.computeBoundingSphere();
      const hit = this.raycaster.intersectObject(mesh, false)[0];
      const id = hit?.instanceId !== undefined ? this.animalAtInstance[k]![hit.instanceId] : undefined;
      if (id !== undefined) return { kind: 'animal', id };
    }
    if (this.buildingMesh) {
      const hit = this.raycaster.intersectObject(this.buildingMesh, false)[0];
      if (hit?.instanceId !== undefined) return { kind: 'building', id: this.buildingIds[hit.instanceId]! };
    }
    if (this.footprints) {
      const hit = this.raycaster.intersectObject(this.footprints.mesh, false)[0];
      if (hit?.faceIndex != null) return { kind: 'building', id: this.buildingIds[this.footprints.triangleBuilding[hit.faceIndex]!]! };
    }
    return null;
  }

  /** Ropa variada (por defecto) o camisetas del color de la actividad de cada persona. */
  setActivityColors(on: boolean): void {
    this.activityColors = on;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)))) return;
    if (!CAMERA_KEYS.has(e.code)) return;
    this.keys.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => this.keys.clear();

  /** Cámara con el teclado: WASD o flechas para desplazarse, Q/E para girar, R/F o +/− para acercar y alejar. */
  private applyKeys(dt: number): void {
    if (this.keys.size === 0 || dt <= 0) return;
    const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    const fast = k('ShiftLeft', 'ShiftRight') ? 3 : 1;
    const target = this.controls.target;
    const cam = this.camera.position;
    const offset = cam.clone().sub(target);
    const forward = k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown');
    const right = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
    if (forward || right) {
      const f = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const move = f.multiplyScalar(forward).add(r.multiplyScalar(right)).normalize().multiplyScalar(Math.max(10, offset.length()) * KEY_PAN * fast * dt);
      target.add(move);
      cam.add(move);
    }
    const turn = k('KeyE') - k('KeyQ');
    if (turn) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * KEY_TURN * dt);
    const zoom = k('KeyF', 'Minus', 'NumpadSubtract') - k('KeyR', 'Equal', 'NumpadAdd', 'BracketRight');
    if (zoom) {
      const len = THREE.MathUtils.clamp(offset.length() * Math.exp(zoom * KEY_ZOOM * fast * dt), this.controls.minDistance, this.controls.maxDistance);
      offset.setLength(len);
    }
    if (turn || zoom) cam.copy(target).add(offset);
  }

  select(p: Pick): void {
    this.selected = p;
    if (!p || p.kind !== 'agent') this.following = null;
  }

  /** La cámara sigue a un agente (G1) o deja de seguir (`null`). */
  follow(agentId: number | null): void {
    this.following = agentId;
  }

  get followingId(): number | null {
    return this.following;
  }

  /**
   * Dibuja el mapa. Mapa sintético: edificios como cajas y calles como franjas. Mapa real (map-pack): edificios
   * extruidos desde su huella sobre su cota, y terreno, viales, árboles y cotas cargados del propio map-pack.
   */
  setMap(maps: MapLogic[], packs: RenderPack[] = []): void {
    this.mapGroup.clear();
    this.gardens = null;
    this.buildingMesh = null;
    this.footprints = null;
    this.heights = null;
    this.ground.visible = true;
    const seq = ++this.mapSeq;
    const buildings = maps.flatMap((m) => m.buildings);
    this.buildingIds = buildings.map((b) => b.id);
    this.buildingStates = new Uint8Array(buildings.length);
    if (buildings.some((b) => b.footprint?.length)) {
      this.footprints = buildFootprints(buildings, USE_COLORS);
      this.buildingBase = buildings.map((b) => new THREE.Color(USE_COLORS[b.use]));
      this.mapGroup.add(this.footprints.mesh);
      for (const pack of packs) void this.loadPack(pack, seq);
      // Pueblos sintéticos junto al real (ADR-0036): volúmenes y calles a partir del mapa lógico.
      const plain = maps.filter((m) => !m.buildings.some((b) => b.footprint?.length));
      if (plain.length > 0) {
        this.addBoxes(buildings, (b) => !b.footprint?.length);
        this.addStreets(plain);
      }
      this.addGardens(buildings);
      this.frameCamera(buildings, true);
      return;
    }
    this.addBoxes(buildings, () => true);
    this.addStreets(maps);
    this.addGardens(buildings);

    const bounds = maps.reduce(
      (acc, m) => ({
        minX: Math.min(acc.minX, m.bounds.minX), minZ: Math.min(acc.minZ, m.bounds.minZ),
        maxX: Math.max(acc.maxX, m.bounds.maxX), maxZ: Math.max(acc.maxZ, m.bounds.maxZ),
      }),
      { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
    );
    if (Number.isFinite(bounds.minX)) this.controls.target.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  }


  /** Volúmenes simples (lado = √superficie) de los edificios que cumplen `include`; los demás, con escala 0. */
  private addBoxes(buildings: MapLogic['buildings'], include: (b: MapLogic['buildings'][number]) => boolean): void {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.9 }), buildings.length);
    mesh.name = 'BUILDINGS';
    this.buildingMesh = mesh;
    this.buildingIds = buildings.map((b) => b.id);
    this.buildingBase = buildings.map((b) => new THREE.Color(colorOf(b)));
    this.buildingStates = new Uint8Array(buildings.length);
    const color = new THREE.Color();
    buildings.forEach((b, i) => {
      const side = include(b) ? Math.sqrt(b.footprintAreaM2) : 0;
      this.tmp.position.set(b.centroid.x, b.baseY ?? 0, b.centroid.z);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.set(side, Math.max(1, b.floorsAboveGround) * FLOOR_HEIGHT, side);
      this.tmp.updateMatrix();
      mesh.setMatrixAt(i, this.tmp.matrix);
      mesh.setColorAt(i, color.setHex(colorOf(b)));
    });
    this.mapGroup.add(mesh);
  }

  /**
   * Huertos de las casas de campo (ADR-0054): una parcela de tierra labrada con surcos verdes a lo largo, sobre la cota
   * de la casa. Y sus corrales (ADR-0055): una cerca baja de madera y un cobertizo pegado al extremo más lejano del pueblo.
   */
  private addGardens(buildings: MapLogic['buildings']): void {
    if (this.gardens) for (const m of this.gardens.meshes) this.mapGroup.remove(m);
    this.gardens = null;
    const gardens = buildings.filter((b) => b.garden !== undefined);
    if (gardens.length === 0) return;
    /** Con relieve, el punto más alto del rectángulo; si no, la cota de la casa. */
    const topOf = (b: MapLogic['buildings'][number], g: NonNullable<typeof b.garden>) => Math.max(...([[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]] as const).map(([u, v]) => {
      const px = g.x + g.dirX * u * (g.length / 2) - g.dirZ * v * (g.width / 2);
      const pz = g.z + g.dirZ * u * (g.length / 2) + g.dirX * v * (g.width / 2);
      return this.heights?.at(px, pz) ?? b.baseY ?? 0;
    }));
    const rowsOf = (w: number) => Math.max(1, Math.floor(w / GARDEN_ROW_SPACING));
    const rowCount = gardens.reduce((n, b) => n + rowsOf(b.garden!.width), 0);
    const plot = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: GARDEN_SOIL, roughness: 1 }), gardens.length);
    const rows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: GARDEN_CROP, roughness: 0.9 }), rowCount);
    plot.name = 'GARDENS';
    rows.name = 'GARDEN_ROWS';
    let r = 0;
    gardens.forEach((b, k) => {
      const g = b.garden!;
      // Con relieve (map-pack), sobre el punto más alto del huerto; la parcela baja hasta GARDEN_DEPTH m por debajo
      // para no dejar huecos en la parte baja de la pendiente.
      const y = topOf(b, g) + 0.05;
      const yaw = -Math.atan2(g.dirZ, g.dirX);
      this.tmp.rotation.set(0, yaw, 0);
      this.tmp.position.set(g.x, y + 0.12 - GARDEN_DEPTH, g.z);
      this.tmp.scale.set(g.length, GARDEN_DEPTH, g.width);
      this.tmp.updateMatrix();
      plot.setMatrixAt(k, this.tmp.matrix);
      const n = rowsOf(g.width);
      for (let j = 0; j < n; j++) {
        const across = (j + 0.5) * (g.width / n) - g.width / 2;
        this.tmp.position.set(g.x - g.dirZ * across, y + 0.12, g.z + g.dirX * across);
        this.tmp.scale.set(g.length - 1.5, 0.45, 0.6);
        this.tmp.updateMatrix();
        rows.setMatrixAt(r++, this.tmp.matrix);
      }
    });
    // Corrales: cuatro tramos de cerca y el cobertizo. La cerca baja hasta GARDEN_DEPTH para no flotar en la pendiente.
    const pens = buildings.filter((b) => b.pen !== undefined);
    const box = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const fence = new THREE.InstancedMesh(box(), new THREE.MeshStandardMaterial({ color: PEN_FENCE, roughness: 1 }), pens.length * 4);
    const shed = new THREE.InstancedMesh(box(), new THREE.MeshStandardMaterial({ color: PEN_SHED, roughness: 0.9 }), pens.length);
    fence.name = 'PEN_FENCES';
    shed.name = 'PEN_SHEDS';
    pens.forEach((b, k) => {
      const p = b.pen!;
      const y = topOf(b, p) + 0.05;
      const yaw = -Math.atan2(p.dirZ, p.dirX);
      this.tmp.rotation.set(0, yaw, 0);
      const sides: [number, number, number, number][] = [
        [p.length / 2, 0, 0.15, p.width], [-p.length / 2, 0, 0.15, p.width],
        [0, p.width / 2, p.length, 0.15], [0, -p.width / 2, p.length, 0.15],
      ];
      sides.forEach(([along, across, sl, sw], j) => {
        this.tmp.position.set(p.x + p.dirX * along - p.dirZ * across, y - GARDEN_DEPTH, p.z + p.dirZ * along + p.dirX * across);
        this.tmp.scale.set(sl, GARDEN_DEPTH + PEN_FENCE_HEIGHT, sw);
        this.tmp.updateMatrix();
        fence.setMatrixAt(k * 4 + j, this.tmp.matrix);
      });
      // Cobertizo pegado por fuera al extremo más lejano del pueblo (dirección +dir): dentro, los animales andan libres.
      const along = p.length / 2 + PEN_SHED_SIZE.length / 2;
      this.tmp.position.set(p.x + p.dirX * along, y - GARDEN_DEPTH, p.z + p.dirZ * along);
      this.tmp.scale.set(PEN_SHED_SIZE.length, GARDEN_DEPTH + PEN_SHED_SIZE.height, PEN_SHED_SIZE.width);
      this.tmp.updateMatrix();
      shed.setMatrixAt(k, this.tmp.matrix);
    });
    this.mapGroup.add(plot, rows, fence, shed);
    this.gardens = { buildings, meshes: [plot, rows, fence, shed] };
  }

  /** Calles como franjas por tramo. */
  private addStreets(maps: MapLogic[]): void {
    const streetMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 1 });
    const geoms: THREE.BufferGeometry[] = [];
    for (const m of maps) {
      const nodes = new Map(m.streets.nodes.map((n) => [n.id, n]));
      for (const e of m.streets.edges) {
        const a = nodes.get(e.from)!;
        const b = nodes.get(e.to)!;
        const w = STREET_WIDTH[e.kind];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        // Se alarga media anchura por cada extremo para cerrar los cruces.
        const g = new THREE.PlaneGeometry(len + w, w).rotateX(-Math.PI / 2);
        // Con cota (caminos del campo en un map-pack, ADR-0053): la franja sigue la pendiente entre sus extremos.
        if (b.y !== a.y) g.rotateZ(Math.atan2(b.y - a.y, len));
        g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.05, (a.z + b.z) / 2);
        geoms.push(g);
      }
    }
    for (const g of geoms) this.mapGroup.add(new THREE.Mesh(g, streetMat));

  }

  /** Centra la cámara en el núcleo (mediana de los edificios), no en el centro del término. */
  private frameCamera(buildings: MapLogic['buildings'], real: boolean): void {
    if (buildings.length === 0) return;
    const xs = buildings.map((b) => b.centroid.x).sort((a, b) => a - b);
    const zs = buildings.map((b) => b.centroid.z).sort((a, b) => a - b);
    const cx = xs[Math.floor(xs.length / 2)]!;
    const cz = zs[Math.floor(zs.length / 2)]!;
    const cy = this.heights?.at(cx, cz) ?? 0;
    this.controls.target.set(cx, cy, cz);
    if (real) this.camera.position.set(cx + 350, cy + 520, cz + 760);
  }

  private async loadPack(pack: RenderPack, seq: number): Promise<void> {
    const url = (p: string) => `${pack.base}/${p}`;
    const stale = () => seq !== this.mapSeq;
    if (pack.render.heights) {
      const g = await (await fetch(url(pack.render.heights))).json();
      if (stale()) return;
      this.heights = new Heights(g);
      this.ground.visible = false;
      if (this.gardens) this.addGardens(this.gardens.buildings);
    }
    const tasks: Promise<void>[] = [];
    for (const key of ['terrain', 'roads'] as const) {
      const path = pack.render[key];
      if (!path) continue;
      tasks.push(loadGlb(url(path)).then((obj) => {
        if (stale()) return;
        obj.name = key.toUpperCase();
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.receiveShadow = true;
        });
        this.mapGroup.add(obj);
        if (key === 'terrain') this.ground.visible = false;
      }));
    }
    if (pack.render.trees) {
      tasks.push(fetch(url(pack.render.trees)).then((r) => r.json()).then((t) => {
        if (!stale()) this.mapGroup.add(buildTrees(t));
      }));
    }
    await Promise.all(tasks);
  }

  /** Recibe un frame del motor. Las posiciones se interpolan hasta el siguiente tick. */
  applyFrame(frame: RenderFrame): void {
    const now = performance.now();
    const prev = this.frame;
    if (prev && frame.tick !== prev.tick) {
      // La posición de partida es la que se estaba mostrando (sigue suave aunque lleguen ticks a saltos).
      const shown = new Map<number, [number, number, number]>();
      for (let i = 0; i < prev.agentCount; i++) shown.set(prev.agentIds[i]!, this.interpolated(prev, i, now));
      this.prevPos = shown;
      // Animales: se interpola desde su posición del frame anterior (si estaban fuera).
      this.prevAnimalPos.clear();
      for (let i = 0; i < prev.animalCount; i++) {
        if (prev.animalFlags[i]! & AgentFlag.Indoors) continue;
        this.prevAnimalPos.set(prev.animalIds[i]!, [prev.animalPositions[i * 3]!, 0, prev.animalPositions[i * 3 + 2]!]);
      }
      this.prevPasos = prev.pasoCount === frame.pasoCount && prev.pasoCount > 0 ? prev.pasoPositions.slice() : null;
      this.tickDuration = THREE.MathUtils.clamp(now - this.tickArrivedAt, 16, 1000);
      this.tickArrivedAt = now;
    } else if (!prev) {
      this.tickArrivedAt = now;
    }
    this.frame = frame;
    this.updateSun(frame);
    this.updateBuildingStates(frame.buildingStates);
  }

  private updateBuildingStates(states: Uint8Array): void {
    if (states.length !== this.buildingStates.length) return;
    // Volúmenes (mapa sintético, o pueblos sintéticos junto al real): se recolorean antes de anotar el estado.
    const mesh = this.buildingMesh;
    if (mesh) {
      let changed = false;
      for (let b = 0; b < states.length; b++) {
        if (states[b] === this.buildingStates[b]) continue;
        const s = states[b]!;
        mesh.setColorAt(b, s === BuildingState.Burning ? BURNING : s === BuildingState.Damaged ? DAMAGED : this.buildingBase[b]!);
        changed = true;
      }
      if (changed && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (this.footprints) {
      this.updateFootprintStates(states);
      return;
    }
    this.buildingStates.set(states);
  }

  private updateFootprintStates(states: Uint8Array): void {
    const fp = this.footprints!;
    if (states.length !== this.buildingStates.length) return;
    const colors = fp.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    let changed = false;
    for (let b = 0; b < states.length; b++) {
      if (states[b] === this.buildingStates[b]) continue;
      const s = states[b]!;
      const c = s === BuildingState.Burning ? BURNING : s === BuildingState.Damaged ? DAMAGED : this.buildingBase[b]!;
      const start = fp.ranges[b * 2]!;
      const count = fp.ranges[b * 2 + 1]!;
      for (let v = start; v < start + count; v++) colors.setXYZ(v, c.r, c.g, c.b);
      this.buildingStates[b] = s;
      changed = true;
    }
    if (changed) colors.needsUpdate = true;
  }

  private interpolated(frame: RenderFrame, i: number, now: number): [number, number, number] {
    const x = frame.agentPositions[i * 3]!;
    const y = frame.agentPositions[i * 3 + 1]!;
    const z = frame.agentPositions[i * 3 + 2]!;
    const from = this.prevPos.get(frame.agentIds[i]!);
    if (!from || frame.agentFlags[i]! & AgentFlag.Indoors) return [x, y, z];
    const t = THREE.MathUtils.clamp((now - this.tickArrivedAt) / this.tickDuration, 0, 1);
    return [from[0] + (x - from[0]) * t, from[1] + (y - from[1]) * t, from[2] + (z - from[2]) * t];
  }

  private updateAgents(now: number, dt: number): void {
    const f = this.frame;
    if (!f) return;
    let n = 0;
    let c = 0;
    let costumes = 0;
    let mourners = 0;
    this.marker.visible = false;
    this.pacer.begin();
    const [torso, head, hair, legL, legR, armL, armR] = this.people as [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];
    for (let i = 0; i < f.agentCount && n < MAX_AGENTS; i++) {
      const id = f.agentIds[i]!;
      const flags = f.agentFlags[i]!;
      const tracked = id === this.following || (this.selected?.kind === 'agent' && this.selected.id === id);
      if (flags & AgentFlag.Indoors) {
        // Dentro: no se dibuja; si es el seleccionado, el anillo y la cámara van a su posición en la simulación.
        if (tracked) this.track(id, f.agentPositions[i * 3]!, f.agentPositions[i * 3 + 2]!);
        continue;
      }
      let [tx, ty, tz] = this.interpolated(f, i, now);
      const driving = (flags & AgentFlag.Driving) !== 0;
      if (!driving) {
        // Quien comparte punto en la simulación (la cola de la parada, un corro en la plaza) no se dibuja encima de
        // otro: cada persona se aparta un poco, siempre lo mismo (por su id).
        const h = Math.imul(id ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
        tx += ((h & 0xffff) / 0x10000 - 0.5) * CROWD_SPREAD;
        tz += ((h >>> 16) / 0x10000 - 0.5) * CROWD_SPREAD;
      }
      // Paso visual (ADR-0056): a velocidad creíble hacia su posición en la simulación, sea cual sea el ritmo.
      const pace = driving ? PACE.car : PACE.walk;
      const s = this.pacer.step(id, tx, tz, f.agentHeadings[i]!, pace.speed, pace.snap, dt);
      const x = s.x;
      const z = s.z;
      if (tracked) this.track(id, x, z);
      const y = this.heights ? this.heights.at(x, z) : ty;
      this.base.makeRotationY(s.heading).setPosition(x, y, z);
      if (driving) {
        this.carAtInstance[c] = id;
        this.cars.setMatrixAt(c, this.base);
        this.carDetails.setMatrixAt(c, this.base);
        // En un atasco, con las luces de freno encendidas (ADR-0045).
        this.cars.setColorAt(c, flags & AgentFlag.Jammed ? JAMMED_COLOR : CAR_COLORS[id % CAR_COLORS.length]!);
        c++;
        continue;
      }
      this.agentAtInstance[n] = id;
      torso.setMatrixAt(n, this.base);
      head.setMatrixAt(n, this.base);
      hair.setMatrixAt(n, this.base);
      // Marcha: piernas y brazos se balancean al avanzar (en contra unos de otros).
      const swing = Math.sin(s.phase) * STRIDE_SWING * s.moving;
      const limb = (mesh: THREE.InstancedMesh, py: number, pz: number, angle: number) => {
        this.local.makeRotationZ(angle).setPosition(0, py, pz);
        this.part.multiplyMatrices(this.base, this.local);
        mesh.setMatrixAt(n, this.part);
      };
      limb(legL, PERSON.hip, PERSON.legGap, swing);
      limb(legR, PERSON.hip, -PERSON.legGap, -swing);
      limb(armL, PERSON.shoulder, PERSON.armGap, -swing * 0.8);
      limb(armR, PERSON.shoulder, -PERSON.armGap, swing * 0.8);
      let shirt: THREE.Color;
      let pants = pickColor(PANTS, id, 2);
      if (flags & AgentFlag.Costumed) {
        shirt = COSTUME_COLORS[id % COSTUME_COLORS.length]!;
        pants = shirt;
        costumes++;
      } else if (flags & AgentFlag.Mourning) {
        shirt = MOURNING_COLOR;
        pants = MOURNING_COLOR;
        this.candles.setMatrixAt(mourners, this.base);
        mourners++;
      } else if (this.activityColors) shirt = ACTIVITY_COLORS[f.agentActivities[i]!] ?? ACTIVITY_COLORS[AgentActivity.Idle]!;
      else shirt = pickColor(SHIRTS, id, 1);
      torso.setColorAt(n, shirt);
      armL.setColorAt(n, shirt);
      armR.setColorAt(n, shirt);
      legL.setColorAt(n, pants);
      legR.setColorAt(n, pants);
      head.setColorAt(n, pickColor(SKIN, id, 3));
      hair.setColorAt(n, pickColor(HAIR, id, 4));
      n++;
    }
    this.pacer.end();
    for (const m of this.people) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.liveCostumes = costumes;
    this.liveMourners = mourners;
    this.candles.count = mourners;
    this.candles.instanceMatrix.needsUpdate = true;
    this.cars.count = c;
    this.carDetails.count = c;
    this.cars.instanceMatrix.needsUpdate = true;
    this.carDetails.instanceMatrix.needsUpdate = true;
    if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;
    this.updateAnimals(f, now, dt);
    this.updateBuses(f, dt);
    this.updatePasos(f, now, dt);
    this.updateStops(f);
    this.updateFireworks(f, now);
    this.updateBonfires(f);
  }

  /** Anillo de selección y cámara que sigue, sobre la posición dibujada del agente. */
  private track(id: number, x: number, z: number): void {
    if (id === this.following) this.moveTarget(x, z);
    if (this.selected?.kind === 'agent' && this.selected.id === id) {
      this.marker.position.set(x, (this.heights?.at(x, z) ?? 0) + 0.2, z);
      this.marker.scale.setScalar(0.6);
      this.marker.visible = true;
    }
  }

  private updateBonfires(f: RenderFrame): void {
    const n = Math.min(f.bonfireCount ?? 0, 16);
    for (let k = 0; k < n; k++) {
      const x = f.bonfireSites[k * 3]!;
      const z = f.bonfireSites[k * 3 + 2]!;
      this.tmp.position.set(x, this.heights ? this.heights.at(x, z) : 0, z);
      this.tmp.rotation.set(0, Math.random() * Math.PI, 0);
      const flicker = 0.85 + Math.random() * 0.3;
      this.tmp.scale.set(flicker, 0.8 + Math.random() * 0.45, flicker);
      this.tmp.updateMatrix();
      this.bonfires.setMatrixAt(k, this.tmp.matrix);
      // Pavesas: suben despacio desde la llama (usan las chispas de los fuegos).
      if (Math.random() < 0.3) {
        const j = this.sparkNext;
        this.sparkNext = (this.sparkNext + 1) % MAX_SPARKS;
        this.sparkPos.set([x + (Math.random() - 0.5) * 1.5, this.tmp.position.y + 3 + Math.random(), z + (Math.random() - 0.5) * 1.5], j * 3);
        this.sparkVel.set([(Math.random() - 0.5) * 4, 7 + Math.random() * 5, (Math.random() - 0.5) * 4], j * 3);
        this.sparkBase.set([1, 0.45 + Math.random() * 0.25, 0.1], j * 3);
        this.sparkLife[j] = 0.8 + Math.random() * 0.6;
      }
    }
    this.bonfires.count = n;
    this.bonfires.instanceMatrix.needsUpdate = true;
  }

  private updateStops(f: RenderFrame): void {
    const n = Math.min(f.busStopCount ?? 0, 16);
    for (let k = 0; k < n; k++) {
      const x = f.busStopPositions[k * 3]!;
      const z = f.busStopPositions[k * 3 + 2]!;
      this.tmp.position.set(x, this.heights ? this.heights.at(x, z) : 0, z);
      this.tmp.rotation.set(0, f.busStopHeadings[k]!, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.stops.setMatrixAt(k, this.tmp.matrix);
    }
    this.stops.count = n;
    this.stops.instanceMatrix.needsUpdate = true;
  }

  /** Marquesinas dibujadas (para el Visual Gate). */
  get visibleStops(): number {
    return this.stops.count;
  }

  private updatePasos(f: RenderFrame, now: number, dt: number): void {
    const n = Math.min(f.pasoCount ?? 0, 16);
    const t = THREE.MathUtils.clamp((now - this.tickArrivedAt) / this.tickDuration, 0, 1);
    this.pasoPacer.begin();
    for (let k = 0; k < n; k++) {
      let x = f.pasoPositions[k * 3]!;
      let z = f.pasoPositions[k * 3 + 2]!;
      if (this.prevPasos) {
        x = this.prevPasos[k * 3]! + (x - this.prevPasos[k * 3]!) * t;
        z = this.prevPasos[k * 3 + 2]! + (z - this.prevPasos[k * 3 + 2]!) * t;
      }
      const s = this.pasoPacer.step(k, x, z, f.pasoHeadings[k]!, PACE.paso.speed, PACE.paso.snap, dt);
      this.tmp.position.set(s.x, this.heights ? this.heights.at(s.x, s.z) : 0, s.z);
      this.tmp.rotation.set(0, f.pasoHeadings[k]!, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.pasos.setMatrixAt(k, this.tmp.matrix);
    }
    this.pasoPacer.end();
    this.pasos.count = n;
    this.pasos.instanceMatrix.needsUpdate = true;
  }

  /** Lanza ramilletes de chispas sobre cada plaza con fuegos y anima las que están en el aire (gravedad y fundido). */
  private updateFireworks(f: RenderFrame, now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastSparkAt) / 1000));
    this.lastSparkAt = now;
    const sites = f.fireworkCount ?? 0;
    if (sites > 0 && now >= this.nextBurstAt) {
      for (let s = 0; s < sites; s++) {
        const sx = f.fireworkSites[s * 3]! + (Math.random() - 0.5) * 50;
        const sz = f.fireworkSites[s * 3 + 2]! + (Math.random() - 0.5) * 50;
        const sy = (this.heights ? this.heights.at(sx, sz) : 0) + 45 + Math.random() * 35;
        const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]!;
        const speed = 12 + Math.random() * 8;
        for (let k = 0; k < SPARKS_PER_BURST; k++) {
          const j = this.sparkNext;
          this.sparkNext = (this.sparkNext + 1) % MAX_SPARKS;
          const u = Math.random() * 2 - 1;
          const th = Math.random() * Math.PI * 2;
          const r = Math.sqrt(1 - u * u);
          const v = speed * (0.85 + Math.random() * 0.3);
          this.sparkPos.set([sx, sy, sz], j * 3);
          this.sparkVel.set([r * Math.cos(th) * v, u * v, r * Math.sin(th) * v], j * 3);
          this.sparkBase.set([color.r, color.g, color.b], j * 3);
          this.sparkLife[j] = SPARK_LIFE_S * (0.7 + Math.random() * 0.3);
        }
      }
      this.nextBurstAt = now + 400 + Math.random() * 700;
    }
    let alive = 0;
    for (let j = 0; j < MAX_SPARKS; j++) {
      if (this.sparkLife[j]! <= 0) continue;
      this.sparkLife[j]! -= dt;
      if (this.sparkLife[j]! <= 0) {
        this.sparkPos[j * 3 + 1] = -1e4;
        this.sparkCol.fill(0, j * 3, j * 3 + 3);
        continue;
      }
      alive++;
      this.sparkVel[j * 3 + 1]! -= 7 * dt;
      for (let c = 0; c < 3; c++) {
        this.sparkVel[j * 3 + c]! *= 1 - 0.9 * dt;
        this.sparkPos[j * 3 + c]! += this.sparkVel[j * 3 + c]! * dt;
        this.sparkCol[j * 3 + c] = this.sparkBase[j * 3 + c]! * Math.min(1, this.sparkLife[j]! / (SPARK_LIFE_S * 0.6));
      }
    }
    this.liveSparks = alive;
    this.sparks.geometry.getAttribute('position').needsUpdate = true;
    this.sparks.geometry.getAttribute('color').needsUpdate = true;
  }

  private liveSparks = 0;
  private liveCostumes = 0;
  private liveMourners = 0;

  /** Pasos de procesión dibujados y chispas de fuegos en el aire (para el Visual Gate). */
  get visiblePasos(): number {
    return this.pasos.count;
  }

  get visibleSparks(): number {
    return this.liveSparks;
  }

  /** Cortejo de luto dibujado y hogueras encendidas (ADR-0052, para el Visual Gate). */
  get visibleMourners(): number {
    return this.liveMourners;
  }

  get visibleBonfires(): number {
    return this.bonfires.count;
  }

  /** Personas disfrazadas dibujadas en la calle (ADR-0048, para el Visual Gate). */
  get visibleCostumes(): number {
    return this.liveCostumes;
  }

  private updateAnimals(f: RenderFrame, now: number, dt: number): void {
    const counts = this.animalMeshes.map(() => 0);
    const t = THREE.MathUtils.clamp((now - this.tickArrivedAt) / this.tickDuration, 0, 1);
    this.animalPacer.begin();
    for (let i = 0; i < f.animalCount; i++) {
      if (f.animalFlags[i]! & AgentFlag.Indoors) continue;
      const kind = f.animalKinds[i]!;
      const mesh = this.animalMeshes[kind];
      if (!mesh) continue;
      let x = f.animalPositions[i * 3]!;
      let z = f.animalPositions[i * 3 + 2]!;
      const from = this.prevAnimalPos.get(f.animalIds[i]!);
      if (from) {
        x = from[0] + (x - from[0]) * t;
        z = from[2] + (z - from[2]) * t;
      }
      const pace = PACE.animals[kind] ?? PACE.walk;
      const s = this.animalPacer.step(f.animalIds[i]!, x, z, f.animalHeadings[i]!, pace.speed, pace.snap, dt);
      x = s.x;
      z = s.z;
      this.tmp.position.set(x, this.heights ? this.heights.at(x, z) : 0, z);
      this.tmp.rotation.set(0, s.heading, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      const n = counts[kind]!++;
      mesh.setMatrixAt(n, this.tmp.matrix);
      this.animalAtInstance[kind]![n] = f.animalIds[i]!;
      if (this.selected?.kind === 'animal' && this.selected.id === f.animalIds[i]) {
        this.marker.position.set(x, (this.heights?.at(x, z) ?? 0) + 0.2, z);
        this.marker.scale.setScalar(0.5);
        this.marker.visible = true;
      }
    }
    this.animalPacer.end();
    for (const [k, m] of this.animalMeshes.entries()) {
      m.count = counts[k]!;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  private updateBuses(f: RenderFrame, dt: number): void {
    const n = Math.min(f.busCount, 64);
    this.busPacer.begin();
    for (let k = 0; k < n; k++) {
      const s = this.busPacer.step(k, f.busPositions[k * 3]!, f.busPositions[k * 3 + 2]!, f.busHeadings[k]!, PACE.bus.speed, PACE.bus.snap, dt);
      this.tmp.position.set(s.x, this.heights ? this.heights.at(s.x, s.z) : 0, s.z);
      this.tmp.rotation.set(0, s.heading, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.buses.setMatrixAt(k, this.tmp.matrix);
    }
    this.busPacer.end();
    this.buses.count = n;
    this.buses.instanceMatrix.needsUpdate = true;
  }

  /** Autobuses dibujados (para el Visual Gate). */
  get visibleBuses(): number {
    return this.buses.count;
  }

  /** Animales visibles fuera de casa o del corral (para el Visual Gate). */
  get visibleAnimals(): number {
    return this.animalMeshes.reduce((s, m) => s + m.count, 0);
  }

  /** Desplaza el foco de la cámara (y la cámara con él) hacia (x, z) con suavizado. */
  private moveTarget(x: number, z: number): void {
    const t = this.controls.target;
    const dx = (x - t.x) * 0.15;
    const dz = (z - t.z) * 0.15;
    t.x += dx;
    t.z += dz;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
  }

  /** Sol aproximado por hora del día y estación (solo visual; la lógica del motor no lo usa). */
  private updateSun(frame: RenderFrame): void {
    const dayOfYear = (frame.date.month - 1) * 30 + frame.date.day;
    const declination = 23.44 * Math.sin(((2 * Math.PI) / 360) * (dayOfYear - 80));
    const hourAngle = ((frame.date.minuteOfDay / 60 - 12) * 15 * Math.PI) / 180;
    const lat = (LATITUDE_DEG * Math.PI) / 180;
    const dec = (declination * Math.PI) / 180;
    const altitude = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle));
    const azimuth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
    const r = 2000;
    // Azimut medido desde el Sur; X = Este, Z = −Norte.
    this.sun.position.set(-r * Math.cos(altitude) * Math.sin(azimuth), r * Math.sin(altitude), r * Math.cos(altitude) * Math.cos(azimuth));
    const daylight = THREE.MathUtils.clamp((Math.sin(altitude) + 0.1) / 0.35, 0, 1);
    this.sun.intensity = 2.2 * daylight;
    this.hemi.intensity = 0.25 + 0.75 * daylight;
    const sky = this.skyNight.clone().lerp(this.skyDay, daylight);
    (this.scene.background as THREE.Color).copy(sky);
    this.scene.fog!.color.copy(sky);
  }

  /** Agentes visibles en la calle, a pie o en coche (para el Visual Gate). */
  get visibleAgents(): number {
    return this.agents.count + this.cars.count;
  }

  /** Coches en marcha visibles (ADR-0025). */
  get visibleCars(): number {
    return this.cars.count;
  }

  get currentTick(): number {
    return this.frame?.tick ?? -1;
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.lastDrawAt === 0 ? 0 : Math.min(0.1, Math.max(0, (now - this.lastDrawAt) / 1000));
    this.lastDrawAt = now;
    this.applyKeys(dt);
    this.controls.update();
    this.updateAgents(now, dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
