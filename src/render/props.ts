import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collects the boxes of the static decoration and merges them into one mesh per material, so a map
 * full of lamps, cones and antennas costs a dozen draw calls instead of hundreds.
 */
export class PropBuilder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly m = new THREE.Matrix4();
  private readonly frame = new THREE.Matrix4();
  /** the boxes of the prop being built, when it stands against a wall (see `at`) */
  private prop: { geos: THREE.BufferGeometry[]; x: number; z: number; yaw: number; back: number } | null = null;

  /**
   * Where the following boxes go: their local offsets are turned by `yaw` and moved to (x, y, z). With `back`,
   * the prop stands against a wall behind it (local -z): once it is complete it is pushed forward until nothing
   * reaches further back than `back`, so no corner of it disappears into the wall.
   */
  at(x: number, y: number, z: number, yaw = 0, back?: number): this {
    this.settle();
    this.frame.makeRotationY(yaw).setPosition(x, y, z);
    if (back !== undefined) this.prop = { geos: [], x, z, yaw, back };
    return this;
  }

  private settle(): void {
    const p = this.prop;
    this.prop = null;
    if (!p || p.geos.length === 0) return;
    // how far the prop reaches back, along its own z axis
    const ax = Math.sin(p.yaw), az = Math.cos(p.yaw);
    let min = Infinity;
    for (const g of p.geos) {
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) min = Math.min(min, (pos.getX(i) - p.x) * ax + (pos.getZ(i) - p.z) * az);
    }
    if (min >= p.back) return;
    const push = p.back - min;
    for (const g of p.geos) g.translate(ax * push, 0, az * push);
  }

  /** a box of `w` × `h` × `d` with its centre at the local offset (ox, oy, oz), optionally turned around its own y axis */
  box(w: number, h: number, d: number, mat: THREE.Material, ox = 0, oy = 0, oz = 0, yaw = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    if (yaw) g.rotateY(yaw);
    this.m.makeTranslation(ox, oy, oz).premultiply(this.frame);
    g.applyMatrix4(this.m);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
    this.prop?.geos.push(g);
    return this;
  }

  /** one mesh per material, added to `group`; the source boxes are freed */
  build(group: THREE.Object3D, shadows = true): THREE.Mesh[] {
    this.settle();
    const meshes: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

/**
 * Flat coloured patches painted a hair above the floor: lane markings, sprinkles, glowing strips.
 * One geometry with vertex colours, drawn unlit so the paint reads the same in day and night.
 */
export class DecalBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private readonly c = new THREE.Color();

  /** a `w` × `d` rectangle centred on (x, z), turned by `yaw` */
  rect(x: number, z: number, w: number, d: number, color: number, yaw = 0, y = 0.012): this {
    const b = this.pos.length / 3;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    this.c.setHex(color);
    for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const lx = u * w, lz = v * d;
      this.pos.push(x + lx * cs - lz * sn, y, z + lx * sn + lz * cs);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    this.idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    return this;
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  build(material: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** deterministic 0..1 per tile, for small visual variation */
export function hash(tx: number, tz: number): number {
  const n = Math.sin(tx * 127.1 + tz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
