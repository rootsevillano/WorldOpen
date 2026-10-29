import type { RenderFrame } from '@worldopen/contracts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Latitud del mapa base, solo para la altura del sol (no se muestra en ningún sitio). */
const LATITUDE_DEG = 37.3;
const MAX_AGENTS = 10_000;

/**
 * Render 3D (Render API). Solo consume `RenderFrame`; no conoce el motor. En la Fase 1 dibuja un suelo
 * sintético; los GLB del map-pack llegan en la Fase 2.
 */
export class WorldRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private readonly hemi = new THREE.HemisphereLight(0xbcd6ec, 0x5b5a3c, 1.0);
  private readonly agents: THREE.InstancedMesh;
  private readonly skyDay = new THREE.Color(0xbcd6ec);
  private readonly skyNight = new THREE.Color(0x0b1424);
  private readonly tmp = new THREE.Object3D();
  private frame: RenderFrame | null = null;
  private raf = 0;
  private readonly onResize = () => this.resize();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
    this.camera.position.set(600, 700, 900);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(this.skyDay.getHex(), 1500, 4000);
    this.scene.add(this.hemi, this.sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 4000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8a8a5c, roughness: 1 }),
    );
    ground.name = 'SYNTHETIC_GROUND';
    const grid = new THREE.GridHelper(6000, 60, 0x6d6d48, 0x7b7b52);
    grid.position.y = 0.05;
    this.scene.add(ground, grid);

    this.agents = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(0.3, 1.1, 4, 8).translate(0, 0.85, 0),
      new THREE.MeshStandardMaterial({ color: 0xd0583c }),
      MAX_AGENTS,
    );
    this.agents.count = 0;
    this.agents.frustumCulled = false;
    this.scene.add(this.agents);

    window.addEventListener('resize', this.onResize);
    this.resize();
    this.loop();
  }

  /** Recibe un frame del motor. */
  applyFrame(frame: RenderFrame): void {
    this.frame = frame;
    const n = Math.min(frame.agentCount, MAX_AGENTS);
    for (let i = 0; i < n; i++) {
      this.tmp.position.set(frame.agentPositions[i * 3]!, frame.agentPositions[i * 3 + 1]!, frame.agentPositions[i * 3 + 2]!);
      this.tmp.rotation.set(0, frame.agentHeadings[i]!, 0);
      this.tmp.updateMatrix();
      this.agents.setMatrixAt(i, this.tmp.matrix);
    }
    this.agents.count = n;
    this.agents.instanceMatrix.needsUpdate = true;
    this.updateSun(frame);
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
    this.hemi.intensity = 0.15 + 0.85 * daylight;
    const sky = this.skyNight.clone().lerp(this.skyDay, daylight);
    (this.scene.background as THREE.Color).copy(sky);
    this.scene.fog!.color.copy(sky);
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
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
