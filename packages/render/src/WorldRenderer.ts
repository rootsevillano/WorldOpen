import { AgentActivity, AgentFlag, BuildingState, type BuildingUse, type MapLogic, type RenderFrame } from '@worldopen/contracts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Heights, buildFootprints, buildTrees, loadGlb, type FootprintMesh } from './realMap';

/** Latitud del mapa base, solo para la altura del sol (no se muestra en ningún sitio). */
const LATITUDE_DEG = 37.3;
const MAX_AGENTS = 10_000;

/** Colores de coche (por id del conductor: estable entre frames). */
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

export type Pick = { kind: 'agent'; id: number } | { kind: 'building'; id: string } | null;

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
  private readonly agents: THREE.InstancedMesh;
  /** Coches en marcha (agentes con `AgentFlag.Driving`), ADR-0025. */
  private readonly cars: THREE.InstancedMesh;
  private carAtInstance: number[] = [];
  private readonly mapGroup = new THREE.Group();
  private buildingMesh: THREE.InstancedMesh | null = null;
  private footprints: FootprintMesh | null = null;
  private heights: Heights | null = null;
  private ground: THREE.Mesh;
  private mapSeq = 0;
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

    this.agents = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(0.3, 1.1, 4, 8).translate(0, 0.85, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
      MAX_AGENTS,
    );
    this.agents.count = 0;
    this.agents.frustumCulled = false;
    this.agents.name = 'AGENTS';
    this.scene.add(this.agents);

    // Rumbo 0 = +X: el coche es largo en X. Carrocería y cabina en una sola malla.
    const body = new THREE.BoxGeometry(4.2, 0.9, 1.8).translate(0, 0.65, 0);
    const cabin = new THREE.BoxGeometry(2.2, 0.7, 1.6).translate(-0.2, 1.45, 0);
    this.cars = new THREE.InstancedMesh(mergeBoxes(body, cabin), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.2 }), MAX_AGENTS);
    this.cars.count = 0;
    this.cars.frustumCulled = false;
    this.cars.name = 'CARS';
    this.scene.add(this.cars);

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.6, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffeb3b, side: THREE.DoubleSide, depthTest: false }),
    );
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    this.scene.add(this.marker);

    window.addEventListener('resize', this.onResize);
    this.resize();
    this.loop();
  }

  /** Qué hay bajo el puntero (coordenadas de cliente). Agentes antes que edificios. */
  pick(clientX: number, clientY: number): Pick {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Los agentes se mueven: la esfera envolvente de las instancias se recalcula en cada selección.
    this.agents.computeBoundingSphere();
    const agentHit = this.raycaster.intersectObject(this.agents, false)[0];
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
      this.frameCamera(buildings, true);
      return;
    }
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.9 }), buildings.length);
    mesh.name = 'BUILDINGS';
    this.buildingMesh = mesh;
    this.buildingIds = buildings.map((b) => b.id);
    this.buildingBase = buildings.map((b) => new THREE.Color(USE_COLORS[b.use]));
    this.buildingStates = new Uint8Array(buildings.length);
    const color = new THREE.Color();
    buildings.forEach((b, i) => {
      const side = Math.sqrt(b.footprintAreaM2);
      this.tmp.position.set(b.centroid.x, 0, b.centroid.z);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.set(side, Math.max(1, b.floorsAboveGround) * FLOOR_HEIGHT, side);
      this.tmp.updateMatrix();
      mesh.setMatrixAt(i, this.tmp.matrix);
      mesh.setColorAt(i, color.setHex(USE_COLORS[b.use]));
    });
    this.mapGroup.add(mesh);

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
        g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
        g.translate((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2);
        geoms.push(g);
      }
    }
    for (const g of geoms) this.mapGroup.add(new THREE.Mesh(g, streetMat));

    const bounds = maps.reduce(
      (acc, m) => ({
        minX: Math.min(acc.minX, m.bounds.minX), minZ: Math.min(acc.minZ, m.bounds.minZ),
        maxX: Math.max(acc.maxX, m.bounds.maxX), maxZ: Math.max(acc.maxZ, m.bounds.maxZ),
      }),
      { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
    );
    if (Number.isFinite(bounds.minX)) this.controls.target.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
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
    if (this.footprints) {
      this.updateFootprintStates(states);
      return;
    }
    const mesh = this.buildingMesh;
    if (!mesh || states.length !== this.buildingStates.length) return;
    let changed = false;
    for (let b = 0; b < states.length; b++) {
      if (states[b] === this.buildingStates[b]) continue;
      const s = states[b]!;
      mesh.setColorAt(b, s === BuildingState.Burning ? BURNING : s === BuildingState.Damaged ? DAMAGED : this.buildingBase[b]!);
      this.buildingStates[b] = s;
      changed = true;
    }
    if (changed && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

  private updateAgents(now: number): void {
    const f = this.frame;
    if (!f) return;
    // Los monigotes crecen con la distancia para que se vean desde la vista aérea.
    const scale = Math.max(1, this.camera.position.distanceTo(this.controls.target) / 70);
    let n = 0;
    let c = 0;
    this.marker.visible = false;
    for (let i = 0; i < f.agentCount && n < MAX_AGENTS; i++) {
      const id = f.agentIds[i]!;
      const indoors = (f.agentFlags[i]! & AgentFlag.Indoors) !== 0;
      if (id === this.following || (this.selected?.kind === 'agent' && this.selected.id === id)) {
        const [px, , pz] = this.interpolated(f, i, now);
        if (id === this.following) this.moveTarget(px, pz);
        if (this.selected?.kind === 'agent' && this.selected.id === id) {
          this.marker.position.set(px, (this.heights?.at(px, pz) ?? 0) + 0.2, pz);
          this.marker.scale.setScalar(scale);
          this.marker.visible = true;
        }
      }
      if (indoors) continue;
      const [x, y, z] = this.interpolated(f, i, now);
      if (f.agentFlags[i]! & AgentFlag.Driving) {
        this.carAtInstance[c] = id;
        this.tmp.position.set(x, this.heights ? this.heights.at(x, z) : y, z);
        this.tmp.rotation.set(0, f.agentHeadings[i]!, 0);
        this.tmp.scale.setScalar(Math.max(1, scale / 2));
        this.tmp.updateMatrix();
        this.cars.setMatrixAt(c, this.tmp.matrix);
        this.cars.setColorAt(c, CAR_COLORS[id % CAR_COLORS.length]!);
        c++;
        continue;
      }
      this.agentAtInstance[n] = id;
      this.tmp.position.set(x, this.heights ? this.heights.at(x, z) : y, z);
      this.tmp.rotation.set(0, f.agentHeadings[i]!, 0);
      this.tmp.scale.setScalar(scale);
      this.tmp.updateMatrix();
      this.agents.setMatrixAt(n, this.tmp.matrix);
      this.agents.setColorAt(n, ACTIVITY_COLORS[f.agentActivities[i]!] ?? ACTIVITY_COLORS[AgentActivity.Idle]!);
      n++;
    }
    this.agents.count = n;
    this.agents.instanceMatrix.needsUpdate = true;
    if (this.agents.instanceColor) this.agents.instanceColor.needsUpdate = true;
    this.cars.count = c;
    this.cars.instanceMatrix.needsUpdate = true;
    if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;
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
    this.controls.update();
    this.updateAgents(performance.now());
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
