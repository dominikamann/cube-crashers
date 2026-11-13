import * as THREE from 'three';

/**
 * Player figures are built from many small boxes, but drawn as a few merged meshes: every moving part
 * (a leg, the head, a tail) is one geometry with the colours in its vertices, plus a second one for the
 * boxes that glow. All figures share the same two materials.
 */
type Vec3 = [number, number, number];

interface Cube {
  size: Vec3;
  at: Vec3;
  color: number;
  /** 0 = lit like everything else; above: how strongly it glows */
  glow: number;
  rot?: Vec3;
}

/** shared by every figure (never disposed: see SHARED in actors.ts) */
export const FIGURE_LIT = new THREE.MeshLambertMaterial({ vertexColors: true });
export const FIGURE_GLOW = (() => {
  // the glow takes its colour from the vertices too, so one material does for every glowing box
  const m = new THREE.MeshStandardMaterial({ color: 0x808080, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.6, vertexColors: true });
  m.userData.baseGlow = 1;
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
  };
  return m;
})();

/** for voxel bodies, which are hollow: both sides of their cubes show */
export const FIGURE_SOLID = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

const FACES: { n: Vec3; u: Vec3; v: Vec3 }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
const tmpColor = new THREE.Color();
const tmpEuler = new THREE.Euler();
const tmpVec = new THREE.Vector3();

/** One geometry for a list of boxes; null if there are none. */
function merge(cubes: Cube[]): THREE.BufferGeometry | null {
  if (cubes.length === 0) return null;
  const pos = new Float32Array(cubes.length * 72), nor = new Float32Array(cubes.length * 72), col = new Float32Array(cubes.length * 72);
  const index: number[] = [];
  let o = 0;
  for (const c of cubes) {
    tmpColor.setHex(c.color);
    const k = c.glow > 0 ? c.glow : 1;
    if (c.rot) tmpEuler.set(c.rot[0], c.rot[1], c.rot[2]);
    for (const f of FACES) {
      const base = o / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        tmpVec.set(
          (f.n[0] + f.u[0] * su + f.v[0] * sv) * c.size[0] * 0.5,
          (f.n[1] + f.u[1] * su + f.v[1] * sv) * c.size[1] * 0.5,
          (f.n[2] + f.u[2] * su + f.v[2] * sv) * c.size[2] * 0.5,
        );
        if (c.rot) tmpVec.applyEuler(tmpEuler);
        pos[o] = tmpVec.x + c.at[0];
        pos[o + 1] = tmpVec.y + c.at[1];
        pos[o + 2] = tmpVec.z + c.at[2];
        tmpVec.set(f.n[0], f.n[1], f.n[2]);
        if (c.rot) tmpVec.applyEuler(tmpEuler);
        nor[o] = tmpVec.x;
        nor[o + 1] = tmpVec.y;
        nor[o + 2] = tmpVec.z;
        col[o] = tmpColor.r * k;
        col[o + 1] = tmpColor.g * k;
        col[o + 2] = tmpColor.b * k;
        o += 3;
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

function meshes(group: THREE.Group, cubes: Cube[]): void {
  const lit = merge(cubes.filter(c => c.glow === 0)), glow = merge(cubes.filter(c => c.glow > 0));
  if (lit) {
    const m = new THREE.Mesh(lit, FIGURE_LIT);
    m.castShadow = true;
    group.add(m);
  }
  if (glow) group.add(new THREE.Mesh(glow, FIGURE_GLOW));
}

/** One moving part of a figure: boxes are placed in the figure's own space, the part turns round its pivot. */
export class Part {
  readonly group = new THREE.Group();
  readonly cubes: Cube[] = [];
  /** ready-made geometries (in the figure's space, colours in the vertices), drawn lit */
  readonly solids: THREE.BufferGeometry[] = [];
  constructor(readonly pivot: Vec3) {}

  box(color: number, w: number, h: number, d: number, x: number, y: number, z: number, rot?: Vec3): this {
    this.cubes.push({ size: [w, h, d], at: [x - this.pivot[0], y - this.pivot[1], z - this.pivot[2]], color, glow: 0, rot });
    return this;
  }

  glow(color: number, intensity: number, w: number, h: number, d: number, x: number, y: number, z: number, rot?: Vec3): this {
    this.cubes.push({ size: [w, h, d], at: [x - this.pivot[0], y - this.pivot[1], z - this.pivot[2]], color, glow: intensity, rot });
    return this;
  }

  /**
   * A geometry made elsewhere (a voxel body), given in the part's own space (its pivot at the origin). One
   * marked `userData.shared` belongs to all figures of its kind and is not disposed with a figure.
   */
  solid(geometry: THREE.BufferGeometry): this {
    this.solids.push(geometry);
    return this;
  }

  /** the same box on both sides (at x and at -x) */
  pair(color: number, w: number, h: number, d: number, x: number, y: number, z: number, glow = 0): this {
    for (const side of [-1, 1]) this.cubes.push({ size: [w, h, d], at: [side * x - this.pivot[0], y - this.pivot[1], z - this.pivot[2]], color, glow });
    return this;
  }
}

/** Builds a figure part by part; finish() turns each part's boxes into its meshes. */
export class Sculpt {
  private parts = new Map<string, Part>();

  /** a part that turns round `pivot` (in the figure's space), hanging on `parent` (or on nothing: the caller places it) */
  part(name: string, pivot: Vec3 = [0, 0, 0], parent?: string): Part {
    const p = new Part(pivot);
    const up = parent ? this.parts.get(parent) : undefined;
    p.group.position.set(pivot[0] - (up?.pivot[0] ?? 0), pivot[1] - (up?.pivot[1] ?? 0), pivot[2] - (up?.pivot[2] ?? 0));
    up?.group.add(p.group);
    this.parts.set(name, p);
    return p;
  }

  get(name: string): Part | undefined {
    return this.parts.get(name);
  }

  finish(): Record<string, THREE.Group> {
    const out: Record<string, THREE.Group> = {};
    for (const [name, p] of this.parts) {
      meshes(p.group, p.cubes);
      for (const g of p.solids) {
        const m = new THREE.Mesh(g, FIGURE_SOLID);
        m.castShadow = true;
        p.group.add(m);
      }
      out[name] = p.group;
    }
    return out;
  }

  /** how many boxes and how many meshes (draw calls) the figure has */
  cost(): { boxes: number; meshes: number } {
    let boxes = 0, count = 0;
    for (const p of this.parts.values()) {
      boxes += p.cubes.length;
      count += (p.cubes.some(c => c.glow === 0) ? 1 : 0) + (p.cubes.some(c => c.glow > 0) ? 1 : 0) + p.solids.length;
    }
    return { boxes, meshes: count };
  }
}

/**
 * Merges a group of box meshes (as box() from pool.ts makes them) into the figure's two meshes. The group
 * keeps its own place and turn; its children are replaced.
 */
export function bake(group: THREE.Group): THREE.Group {
  const cubes: Cube[] = [];
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial | THREE.MeshStandardMaterial>;
    if (!mesh.isMesh || mesh.geometry.type !== 'BoxGeometry') continue;
    const { width, height, depth } = mesh.geometry.parameters;
    const r = mesh.rotation;
    cubes.push({
      size: [width, height, depth],
      at: [mesh.position.x, mesh.position.y, mesh.position.z],
      color: mesh.material.color.getHex(),
      glow: (mesh.material.userData.baseGlow as number | undefined) ?? 0,
      rot: r.x || r.y || r.z ? [r.x, r.y, r.z] : undefined,
    });
    group.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  meshes(group, cubes);
  return group;
}
