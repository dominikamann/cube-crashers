import * as THREE from 'three';
import type { EnemyKind } from '../sim/types';

/**
 * Monster bodies built from many small cubes instead of one box: each kind has a shape (which cells of a
 * grid are filled) and a pattern (how bright each cube is). The cubes sit a little apart, so the body reads
 * as a pile of pixels. One merged geometry per kind: a monster is still a single instance to draw.
 *
 * Shapes are given in the body's own box, scaled to -1..1 on each axis: u to its right, v up, w forward.
 */
interface Shape {
  /** cubes along x, y and z */
  n: [number, number, number];
  inside(u: number, v: number, w: number): boolean;
  /** brightness of the cube there (1 = the body colour), or a tint as [r, g, b] factors */
  tone?(u: number, v: number, w: number): number | [number, number, number];
}

/** a rounded box: p = 2 is a ball, higher values are boxier */
const round = (u: number, v: number, w: number, p: number, limit = 1.1) => Math.abs(u) ** p + Math.abs(v) ** p + Math.abs(w) ** p <= limit;
const BELLY: [number, number, number] = [1.45, 1.4, 1.2];

const SHAPES: Partial<Record<EnemyKind, Shape>> = {
  // a round drop, flat underneath, with a lighter belly
  blob: { n: [6, 6, 6], inside: (u, v, w) => round(u, v < 0 ? v * 0.7 : v, w, 2.6), tone: (_u, v, w) => (w > 0.4 && v < 0.1 ? 1.3 : 1) },
  // a wedge: narrow nose, wide hips, stripes down its back
  hunter: { n: [5, 3, 8], inside: (u, v, w) => Math.abs(u) <= 1 - 0.3 * (w + 1) && v <= 1 - 0.25 * (w + 1), tone: (_u, v, w) => (v > 0 && Math.floor((w + 1) * 4) % 2 === 0 ? 0.7 : 1) },
  // a boulder with armour bands
  tank: { n: [7, 6, 7], inside: (u, v, w) => round(u, v, w, 5), tone: (_u, v) => (Math.abs(v - 0.1) < 0.2 ? 0.7 : 1) },
  // two halves with a gap between them (the glowing core shows through)
  splitter: { n: [7, 6, 6], inside: (u, v, w) => Math.abs(u) > 0.15 && round(u, v, w, 3) },
  splitling: { n: [3, 3, 3], inside: (u, v, w) => round(u, v, w, 3, 1.4) },
  // a thin body under a wide head
  shooter: { n: [4, 7, 4], inside: (u, v, w) => (v > 0.15 ? round(u, (v - 0.55) / 0.45, w, 4) : Math.abs(u) < 0.6 && Math.abs(w) < 0.6), tone: (_u, v) => (v > 0.15 ? 1 : 0.8) },
  // a ball, like a bomb, with a dark band
  bomber: { n: [5, 5, 5], inside: (u, v, w) => round(u, v, w, 2, 1.15), tone: (_u, v) => (Math.abs(v) < 0.25 ? 0.6 : 1) },
  // a heavy wedge with its head down
  rammer: { n: [7, 5, 8], inside: (u, v, w) => round(u, v, w, 6) && v <= 1 - 0.45 * Math.max(0, w), tone: (_u, v, w) => (w > 0.6 ? 1.25 : v > 0.5 ? 0.8 : 1) },
  swarmer: { n: [5, 2, 4], inside: (u, _v, w) => Math.abs(u) + Math.abs(w) <= 1.3 },
  shielder: { n: [5, 6, 4], inside: (u, v, w) => round(u, v, w, 5), tone: (_u, v) => (v > 0.5 ? 0.75 : 1) },
  healer: { n: [4, 6, 4], inside: (u, v, w) => round(u, v, w, 3), tone: (_u, v, w) => (w > 0.3 && v < 0.2 ? BELLY : 1) },
  // a diamond standing on its tip
  teleporter: { n: [5, 7, 5], inside: (u, v, w) => Math.abs(u) + Math.abs(v) + Math.abs(w) <= 1.25, tone: (u, v, w) => (Math.abs(u) + Math.abs(v) + Math.abs(w) < 0.6 ? 1.5 : 1) },
  // a dome on straight sides
  ghost: { n: [6, 6, 6], inside: (u, v, w) => (v > 0 ? u * u + v * v + w * w <= 1.15 : u * u + w * w <= 1.15) },
  megaBlock: { n: [10, 9, 10], inside: (u, v, w) => round(u, v, w, 8), tone: (u, v, w) => (Math.abs(u) > 0.7 && Math.abs(w) > 0.7 ? 0.7 : Math.abs(v) < 0.12 ? 0.75 : 1) },
  wormSegment: { n: [5, 5, 5], inside: (u, v, w) => round(u, v, w, 3) },
  // long and low: a body, and a flat snout with nostrils; light belly, dark ridges on the back
  croc: {
    n: [5, 4, 12],
    inside: (u, v, w) => (w <= 0.15 ? Math.abs(u) <= (w < -0.7 ? 0.65 : 1) && (v < 0.5 || Math.abs(u) < 0.7) : Math.abs(u) <= 0.65 && (v <= 0.1 || (w > 0.8 && v <= 0.6))),
    tone: (_u, v, w) => (v < -0.5 ? BELLY : v > 0.5 && Math.floor((w + 1) * 6) % 2 === 0 ? 0.65 : 1),
  },
  // a round head on a small body; a light face and belly
  monkey: {
    n: [5, 7, 4],
    inside: (u, v, w) => (v > 0 ? u * u + ((v - 0.5) / 0.5) ** 2 + w * w <= 1.2 : (u / 0.85) ** 2 + ((v + 0.5) / 0.55) ** 2 + (w / 0.9) ** 2 <= 1.25),
    tone: (u, v, w) => (w > 0.4 && Math.abs(u) < 0.65 && (v > 0.15 ? v < 0.8 : v < -0.1) ? [1.75, 1.6, 1.35] : 1),
  },
  // upright on two legs: a barrel of a body, a big head out in front, a light belly
  trex: {
    n: [5, 9, 9],
    inside: (u, v, w) =>
      v > 0.3
        ? w > -0.05 && Math.abs(u) <= 0.85 && (v < 0.95 || w < 0.7) && (w < 0.5 || v > 0.42)
        : (u / 0.95) ** 2 + ((v + 0.3) / 0.7) ** 2 + ((w + 0.25) / 0.7) ** 2 <= 1.2,
    tone: (_u, v, w) => (v <= 0.3 && w > 0.1 && v < 0 ? BELLY : v > 0.75 || (v <= 0.3 && w < -0.5) ? 0.75 : 1),
  },
};

export interface VoxelBody {
  geometry: THREE.BufferGeometry;
  /** how far in front of the body's centre its surface is at this spot (x and y from the centre, in tiles) */
  frontAt(x: number, y: number): number;
}

/** share of a cell a cube fills: the rest is the gap between the pixels */
const FILL = 0.9;
const hash = (i: number, j: number, k: number) => {
  const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/** The body of `kind` in a box of w x h x d tiles (a plain box for kinds without a shape). */
export function voxelBody(kind: EnemyKind, w: number, h: number, d: number): VoxelBody {
  const shape = SHAPES[kind];
  if (!shape) return { geometry: new THREE.BoxGeometry(w, h, d), frontAt: () => d / 2 };
  const [nx, ny, nz] = shape.n;
  const cx = w / nx, cy = h / ny, cz = d / nz;
  const at = (i: number, j: number, k: number) => {
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return false;
    return shape.inside(((i + 0.5) / nx) * 2 - 1, ((j + 0.5) / ny) * 2 - 1, ((k + 0.5) / nz) * 2 - 1);
  };
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const up = unit.getAttribute('position'), un = unit.getAttribute('normal'), ui = unit.getIndex()!;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nz; k++) {
        if (!at(i, j, k)) continue;
        // only the cubes you can see: those with an empty neighbour
        if (at(i - 1, j, k) && at(i + 1, j, k) && at(i, j - 1, k) && at(i, j + 1, k) && at(i, j, k - 1) && at(i, j, k + 1)) continue;
        const u = ((i + 0.5) / nx) * 2 - 1, v = ((j + 0.5) / ny) * 2 - 1, wv = ((k + 0.5) / nz) * 2 - 1;
        const tone = shape.tone?.(u, v, wv) ?? 1;
        // every pixel a little different, lighter toward the top
        const grain = 0.86 + 0.24 * hash(i, j, k) + 0.08 * v;
        const rgb = typeof tone === 'number' ? [tone * grain, tone * grain, tone * grain] : tone.map(t => t * grain);
        const base = pos.length / 3;
        const ox = (i + 0.5) * cx - w / 2, oy = (j + 0.5) * cy - h / 2, oz = (k + 0.5) * cz - d / 2;
        for (let q = 0; q < up.count; q++) {
          pos.push(ox + up.getX(q) * cx * FILL, oy + up.getY(q) * cy * FILL, oz + up.getZ(q) * cz * FILL);
          nor.push(un.getX(q), un.getY(q), un.getZ(q));
          col.push(rgb[0], rgb[1], rgb[2]);
        }
        for (let q = 0; q < ui.count; q++) idx.push(base + ui.getX(q));
      }
  unit.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  return {
    geometry,
    frontAt(x, y) {
      const i = Math.max(0, Math.min(nx - 1, Math.floor((x + w / 2) / cx)));
      const j = Math.max(0, Math.min(ny - 1, Math.floor((y + h / 2) / cy)));
      for (let k = nz - 1; k >= 0; k--) if (at(i, j, k)) return (k + 0.5 + FILL / 2) * cz - d / 2;
      return d / 2;
    },
  };
}
