import * as THREE from 'three';

/** a voxel's colour as [r, g, b] (0..1), or null for no voxel */
export type VoxelColor = [number, number, number] | null;

const FACES: { d: [number, number, number]; corners: [number, number, number][] }[] = [
  { d: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { d: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { d: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { d: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { d: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { d: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const hash = (i: number, j: number, k: number) => {
  const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/**
 * A solid made of voxels as one geometry: `n` cells of size `cell` from `origin` on, coloured by `at`. The cells
 * touch (no gaps) and only the faces between a voxel and nothing are built, so a figure costs what its skin
 * costs. `grain` is how much every voxel differs from its colour (0 = flat). `soft` (0 to 1) turns the light on
 * each voxel toward the way the surface around it faces: a round shape is then lit as a round shape, instead of
 * every step on it catching the light as a stripe. `merge`: faces above one another that look the same become
 * one (up to that many), which saves a good part of a big figure's triangles.
 */
export function solidVoxels(n: [number, number, number], cell: [number, number, number], origin: [number, number, number], at: (i: number, j: number, k: number) => VoxelColor, grain = 0.08, soft = 0, merge = 1): THREE.BufferGeometry {
  const [nx, ny, nz] = n;
  const cells: VoxelColor[] = new Array(nx * ny * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) cells[(i * ny + j) * nz + k] = at(i, j, k);
  const filled = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && cells[(i * ny + j) * nz + k] !== null;
  /** which way the surface faces at a voxel: away from the voxels around it */
  const facing = (i: number, j: number, k: number): [number, number, number] => {
    let sx = 0, sy = 0, sz = 0;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++)
        for (let c = -2; c <= 2; c++)
          if (!filled(i + a, j + b, k + c)) {
            sx += a;
            sy += b;
            sz += c;
          }
    const len = Math.hypot(sx, sy, sz) || 1;
    return [sx / len, sy / len, sz / len];
  };
  // (taken over the voxels near by as well: a step of one voxel on a flat side is then no band of light)
  const facings = new Map<number, [number, number, number]>();
  const smooth = (i: number, j: number, k: number): [number, number, number] => {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++)
        for (let c = -2; c <= 2; c++) {
          const key = ((i + a) * ny + j + b) * nz + k + c;
          const f = i + a >= 0 && j + b >= 0 && k + c >= 0 && i + a < nx && j + b < ny && k + c < nz ? facings.get(key) : undefined;
          if (!f) continue;
          n++;
          sx += f[0];
          sy += f[1];
          sz += f[2];
        }
    // (on something thin, a finger, the voxels around face every way and say nothing: the less they agree,
    // the shorter this is, and the more each face is lit as the flat face it is)
    const len = Math.hypot(sx, sy, sz) || 1, sure = Math.min(1, (len / Math.max(1, n)) * 1.6);
    return [(sx / len) * sure, (sy / len) * sure, (sz / len) * sure];
  };
  const skin = (i: number, j: number, k: number) => !(filled(i + 1, j, k) && filled(i - 1, j, k) && filled(i, j + 1, k) && filled(i, j - 1, k) && filled(i, j, k + 1) && filled(i, j, k - 1));
  if (soft > 0) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) if (cells[(i * ny + j) * nz + k] && skin(i, j, k)) facings.set((i * ny + j) * nz + k, facing(i, j, k));
  const same = (a: [number, number, number], b: [number, number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.012;
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      // (the faces a column's voxels have had merged into the one below them, per direction)
      const taken = FACES.map(() => -1);
      for (let j = 0; j < ny; j++) {
        const c = cells[(i * ny + j) * nz + k];
        if (!c) continue;
        if (!skin(i, j, k)) continue;
        const g = 1 - grain / 2 + grain * hash(i, j, k);
        const s = soft > 0 ? smooth(i, j, k) : [0, 0, 0];
        FACES.forEach((f, fi) => {
          if (j <= taken[fi] || filled(i + f.d[0], j + f.d[1], k + f.d[2])) return;
          // how many voxels above this one show the same face in the same colour
          let high = 1;
          if (f.d[1] === 0) while (high < merge && j + high < ny && cells[(i * ny + j + high) * nz + k] && same(cells[(i * ny + j + high) * nz + k]!, c) && !filled(i + f.d[0], j + high, k + f.d[2])) high++;
          taken[fi] = j + high - 1;
          const hard = 1 - soft * Math.hypot(s[0], s[1], s[2]);
          const mx = s[0] * soft + f.d[0] * hard, my = s[1] * soft + f.d[1] * hard, mz = s[2] * soft + f.d[2] * hard;
          const ml = Math.hypot(mx, my, mz) || 1;
          const base = pos.length / 3;
          for (const q of f.corners) {
            pos.push(origin[0] + (i + q[0]) * cell[0], origin[1] + (j + q[1] * high) * cell[1], origin[2] + (k + q[2]) * cell[2]);
            nor.push(mx / ml, my / ml, mz / ml);
            col.push(c[0] * g, c[1] * g, c[2] * g);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        });
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  return geometry;
}

/**
 * A solid sculpted from a rule: every cell of size `cell` in the box from `min` to `max` whose middle `at` gives a
 * colour is a voxel.
 */
export function sculpt(min: [number, number, number], max: [number, number, number], cell: number, at: (x: number, y: number, z: number) => VoxelColor, grain = 0.08, soft = 0): THREE.BufferGeometry {
  const n = min.map((lo, a) => Math.ceil((max[a] - lo) / cell)) as [number, number, number];
  return solidVoxels(n, [cell, cell, cell], min, (i, j, k) => at(min[0] + (i + 0.5) * cell, min[1] + (j + 0.5) * cell, min[2] + (k + 0.5) * cell), grain, soft);
}
