import type { BuildingRecord, BuildingUse, HeightGrid } from '@worldopen/contracts';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Cotas del terreno dibujado (bilineal sobre la rejilla del map-pack). */
export class Heights {
  private readonly h: Float32Array;

  constructor(private readonly g: HeightGrid) {
    const bin = atob(g.heights);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    this.h = new Float32Array(bytes.buffer);
  }

  at(x: number, z: number): number {
    const { cellSizeM: c, origin, cols, rows } = this.g;
    const fx = Math.min(Math.max((x - origin.x) / c, 0), cols - 1.0001);
    const fz = Math.min(Math.max((z - origin.z) / c, 0), rows - 1.0001);
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fz);
    const tx = fx - c0;
    const tz = fz - r0;
    const v = (r: number, k: number) => this.h[r * cols + k]!;
    const top = v(r0, c0) * (1 - tx) + v(r0, c0 + 1) * tx;
    const bottom = v(r0 + 1, c0) * (1 - tx) + v(r0 + 1, c0 + 1) * tx;
    return top * (1 - tz) + bottom * tz;
  }
}

export interface FootprintMesh {
  mesh: THREE.Mesh;
  /** Edificio de cada triángulo (selección). */
  triangleBuilding: Uint32Array;
  /** Primer vértice y número de vértices de cada edificio (recolorear por estado). */
  ranges: Uint32Array;
}

/**
 * Edificios del mapa real como volúmenes extruidos desde su huella catastral, sobre su cota, en una sola malla
 * (pocas llamadas de dibujo) con color por vértice.
 */
export function buildFootprints(buildings: BuildingRecord[], colors: Record<BuildingUse, number>): FootprintMesh {
  const geoms: THREE.BufferGeometry[] = [];
  const owner: number[] = [];
  const color = new THREE.Color();
  buildings.forEach((b, i) => {
    const height = Math.max(2.5, b.heightM ?? (b.floorsAboveGround || 1) * 3);
    for (const flat of b.footprint ?? []) {
      // Forma en el plano XY con y = −z; se extruye hacia +Z y se gira para que la altura quede en +Y.
      const shape = new THREE.Shape();
      for (let k = 0; k < flat.length; k += 2) {
        if (k === 0) shape.moveTo(flat[0]!, -flat[1]!);
        else shape.lineTo(flat[k]!, -flat[k + 1]!);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, b.baseY ?? 0, 0);
      g.deleteAttribute('uv');
      const n = g.getAttribute('position').count;
      const cols = new Float32Array(n * 3);
      color.setHex(colors[b.use]);
      for (let v = 0; v < n; v++) color.toArray(cols, v * 3);
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geoms.push(g.index ? g.toNonIndexed() : g);
      owner.push(i);
    }
  });
  const merged = mergeGeometries(geoms, false)!;
  const ranges = new Uint32Array(buildings.length * 2);
  const triangleBuilding = new Uint32Array(merged.getAttribute('position').count / 3);
  let v = 0;
  geoms.forEach((g, k) => {
    const n = g.getAttribute('position').count;
    const b = owner[k]!;
    if (ranges[b * 2 + 1] === 0) ranges[b * 2] = v;
    ranges[b * 2 + 1]! += n;
    triangleBuilding.fill(b, v / 3, (v + n) / 3);
    v += n;
    g.dispose();
  });
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.name = 'BUILDINGS';
  return { mesh, triangleBuilding, ranges };
}

/** GLB del map-pack (terreno, viales) — ya limpios de metadatos por el pipeline. */
export async function loadGlb(url: string): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.scene;
}

/** Árboles del map-pack como dos mallas instanciadas (copas y troncos). */
export function buildTrees(data: { fields: string[]; trees: number[][] }): THREE.Group {
  const f = Object.fromEntries(data.fields.map((n, i) => [n, i]));
  const n = data.trees.length;
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x4f6f37, roughness: 1, flatShading: true }), n);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }), n);
  const o = new THREE.Object3D();
  data.trees.forEach((t, i) => {
    const x = t[f.x!]!;
    const z = t[f.z!]!;
    const y = t[f.y!]!;
    const s = t[f.scale!]!;
    const w = t[f.width!] ?? 1;
    o.position.set(x, y + 2.2 * s, z);
    o.rotation.set(0, 0, 0);
    o.scale.set(1.6 * w * s, 1.4 * s, 1.6 * w * s);
    o.updateMatrix();
    crowns.setMatrixAt(i, o.matrix);
    o.position.set(x, y, z);
    o.scale.set(s, 2 * s, s);
    o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix);
  });
  const g = new THREE.Group();
  g.name = 'TREES';
  g.add(crowns, trunks);
  return g;
}
