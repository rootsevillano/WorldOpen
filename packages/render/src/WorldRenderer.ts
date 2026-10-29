import { AgentActivity, AgentFlag, type BuildingUse, type MapLogic, type RenderFrame } from '@worldopen/contracts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Latitud del mapa base, solo para la altura del sol (no se muestra en ningún sitio). */
const LATITUDE_DEG = 37.3;
const MAX_AGENTS = 10_000;
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
};

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
  private readonly mapGroup = new THREE.Group();
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

    window.addEventListener('resize', this.onResize);
    this.resize();
    this.loop();
  }

  /** Dibuja el mapa lógico: edificios como volúmenes por uso y calles como franjas. */
  setMap(maps: MapLogic[]): void {
    this.mapGroup.clear();
    const buildings = maps.flatMap((m) => m.buildings);
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.9 }), buildings.length);
    mesh.name = 'BUILDINGS';
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
    for (let i = 0; i < f.agentCount && n < MAX_AGENTS; i++) {
      if (f.agentFlags[i]! & AgentFlag.Indoors) continue;
      const [x, y, z] = this.interpolated(f, i, now);
      this.tmp.position.set(x, y, z);
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

  /** Agentes visibles en la calle (para el Visual Gate). */
  get visibleAgents(): number {
    return this.agents.count;
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
