import * as THREE from 'three';
import type { EnemyKind } from '../sim/types';
import { BODY } from './dominik-body';
import { HEAD_BACK, HEAD_FRONT, HEAD_LEFT, HEAD_RIGHT, type Portrait } from './dominik-face';

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

/** a body that is not a monster kind of its own: the Rhino is a rammer in the game's rules */
export type BodyKind = EnemyKind | 'rhino' | 'dominik' | 'dominikHead';

/**
 * Angry Dominik is made from photos. His head: four pixel portraits (front, both sides, back, see
 * dominik-face.ts), one pixel a voxel. His body from the neck to the knees: what he looks like from the front
 * and from behind, and how deep he is in every row (dominik-body.ts); its voxels are twice the size of the
 * head's. Both are bodies of their own, drawn with the same pose. (Arms, lower legs, shoes and the hammer are
 * parts.) The material is white: the tones are the colours themselves.
 */
const rgb = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const DOM_SKIN = rgb(0xd9966e), DOM_HAIR = rgb(0x4a3222), DOM_SHIRT = rgb(0x2b2d33), DOM_SHORTS = rgb(0x2a336a);
const pixel = (row: string, x: number): [number, number, number] | null => {
  const c = row.slice(x * 6, x * 6 + 6);
  return c === '' || c === '......' ? null : rgb(parseInt(c, 16));
};
/** the pixel of a portrait at `x` (-1 at its left edge to 1 at its right) in the head's row `row` from its foot */
const portrait = (p: Portrait, x: number, row: number): [number, number, number] | null => {
  const px = Math.floor(((x + 1) / 2) * p.w), py = p.h - 1 - row;
  return px < 0 || px >= p.w || py < 0 || py >= p.h ? null : pixel(p.rows[py], px);
};
/** a body cell: its row from the top, its column as the camera in front of him saw it, its depth from his middle */
const bodyCell = (u: number, v: number, w: number) => ({
  row: BODY.rows - 1 - Math.floor(((v + 1) / 2) * BODY.rows),
  // (his right is on the left of a photo taken from the front)
  col: BODY.cols - 1 - Math.floor(((u + 1) / 2) * BODY.cols),
  z: w * (BODY.deep / 2),
});
/** the stretches of body in each row of the front view: the trunk is one, the legs are two */
const bodyRuns: [number, number][][] = BODY.front.map(row => {
  const runs: [number, number][] = [];
  for (let c = 0; c < BODY.cols; c++) {
    if (!pixel(row, c)) continue;
    if (runs.length && runs[runs.length - 1][1] === c - 1) runs[runs.length - 1][1] = c;
    else runs.push([c, c]);
  }
  return runs;
});

const SHAPES: Partial<Record<BodyKind, Shape>> = {
  dominik: {
    n: [BODY.cols, BODY.rows, BODY.deep],
    inside: (u, v, w) => {
      const { row, col, z } = bodyCell(u, v, w);
      const run = bodyRuns[row]?.find(r => col >= r[0] && col <= r[1]);
      if (!run) return false;
      // round in cross-section: as wide as the photo from the front shows, as deep as the one from the side
      const [back, front] = BODY.depth[row];
      const x = (col + 0.5 - (run[0] + run[1] + 1) / 2) / ((run[1] - run[0] + 1) / 2);
      const d = (z - (back + front) / 2) / Math.max(1, (front - back) / 2);
      return Math.abs(x) ** 2.6 + Math.abs(d) ** 2.6 <= 1;
    },
    tone: (u, v, w) => {
      const { row, col, z } = bodyCell(u, v, w);
      const [back, front] = BODY.depth[row];
      const fromFront = z >= (back + front) / 2;
      // (from behind his right is on the right)
      return pixel(fromFront ? BODY.front[row] : BODY.back[row], fromFront ? col : BODY.cols - 1 - col) ?? pixel(BODY.front[row], col) ?? (row > BODY.rows * 0.58 ? DOM_SHORTS : DOM_SHIRT);
    },
  },
  dominikHead: {
    n: [HEAD_FRONT.w, HEAD_FRONT.h, HEAD_LEFT.w],
    // round, deeper than it is wide, a little narrower toward the chin
    inside: (u, v, w) => {
      const jaw = v < 0 ? 1 - 0.14 * v * v : 1;
      return Math.abs(u / jaw) ** 2.4 + Math.abs(v) ** 2.4 + Math.abs(w / jaw) ** 2.4 <= 1;
    },
    // each side of the head shows the portrait taken from there (a frontal photo has his right on its left)
    tone: (u, v, w) => {
      const row = Math.floor(((v + 1) / 2) * HEAD_FRONT.h);
      const px = w >= 0 && Math.abs(u) <= 0.84 ? portrait(HEAD_FRONT, -u, row) : w < 0 && Math.abs(u) <= 0.8 ? portrait(HEAD_BACK, u, row) : portrait(u > 0 ? HEAD_RIGHT : HEAD_LEFT, u > 0 ? w : -w, row);
      return px ?? (row / HEAD_FRONT.h > 0.6 || w < -0.2 ? DOM_HAIR : DOM_SKIN);
    },
  },
  // a rhino: a heavy barrel with a hump over the shoulders, and a long head held low that narrows to a square
  // lip; a lighter belly and dark folds where its armour plates meet (legs, horns, ears and tail are parts)
  rhino: {
    n: [10, 10, 18],
    inside: (u, v, w) => {
      if ((u / 0.9) ** 2 + ((v - 0.05) / 0.8) ** 2 + ((w + 0.3) / 0.72) ** 4 <= 1) return true;
      if ((u / 0.62) ** 2 + ((v - 0.55) / 0.45) ** 2 + ((w - 0.02) / 0.36) ** 2 <= 1) return true;
      if (w < 0.25) return false;
      const t = (w - 0.3) / 0.7;
      return Math.abs(u) <= 0.56 - 0.16 * t && v >= -0.72 + 0.1 * t && v <= 0.36 - 0.3 * t;
    },
    tone: (_u, v, w) => (v < -0.5 && w < 0.3 ? [1.2, 1.18, 1.12] : (Math.abs(w + 0.5) < 0.06 || Math.abs(w - 0.3) < 0.06) && v > -0.5 ? 0.72 : w > 0.9 ? 0.85 : v > 0.7 ? 0.9 : 1),
  },
  // a round drop, flat underneath, with a lighter belly
  blob: { n: [9, 9, 9], inside: (u, v, w) => round(u, v < 0 ? v * 0.7 : v, w, 2.6), tone: (_u, v, w) => (w > 0.4 && v < 0.1 ? 1.3 : 1) },
  // a wedge: narrow nose, wide hips, stripes down its back
  hunter: { n: [8, 5, 12], inside: (u, v, w) => Math.abs(u) <= 1 - 0.3 * (w + 1) && v <= 1 - 0.25 * (w + 1), tone: (_u, v, w) => (v > 0 && Math.floor((w + 1) * 4) % 2 === 0 ? 0.7 : 1) },
  // a boulder with armour bands
  tank: { n: [11, 9, 11], inside: (u, v, w) => round(u, v, w, 5), tone: (_u, v) => (Math.abs(v - 0.1) < 0.2 ? 0.7 : 1) },
  // two halves with a gap between them (the glowing core shows through)
  splitter: { n: [9, 8, 8], inside: (u, v, w) => Math.abs(u) > 0.15 && round(u, v, w, 3) },
  splitling: { n: [5, 5, 5], inside: (u, v, w) => round(u, v, w, 3, 1.4) },
  // a thin body under a wide head
  shooter: { n: [6, 11, 6], inside: (u, v, w) => (v > 0.15 ? round(u, (v - 0.55) / 0.45, w, 4) : Math.abs(u) < 0.6 && Math.abs(w) < 0.6), tone: (_u, v) => (v > 0.15 ? 1 : 0.8) },
  // a ball, like a bomb, with a dark band
  bomber: { n: [8, 8, 8], inside: (u, v, w) => round(u, v, w, 2, 1.15), tone: (_u, v) => (Math.abs(v) < 0.25 ? 0.6 : 1) },
  // a heavy wedge with its head down
  rammer: { n: [10, 7, 12], inside: (u, v, w) => round(u, v, w, 6) && v <= 1 - 0.45 * Math.max(0, w), tone: (_u, v, w) => (w > 0.6 ? 1.25 : v > 0.5 ? 0.8 : 1) },
  swarmer: { n: [7, 3, 6], inside: (u, _v, w) => Math.abs(u) + Math.abs(w) <= 1.3 },
  shielder: { n: [8, 9, 6], inside: (u, v, w) => round(u, v, w, 5), tone: (_u, v) => (v > 0.5 ? 0.75 : 1) },
  healer: { n: [7, 9, 7], inside: (u, v, w) => round(u, v, w, 3), tone: (_u, v, w) => (w > 0.3 && v < 0.2 ? BELLY : 1) },
  // a diamond standing on its tip
  teleporter: { n: [7, 10, 7], inside: (u, v, w) => Math.abs(u) + Math.abs(v) + Math.abs(w) <= 1.25, tone: (u, v, w) => (Math.abs(u) + Math.abs(v) + Math.abs(w) < 0.6 ? 1.5 : 1) },
  // a fish: a flat oval with a lighter belly and a stripe
  fish: { n: [3, 6, 9], inside: (_u, v, w) => (v / 1) ** 2 + (w / 1) ** 2 <= 1.15, tone: (_u, v, w) => (v < -0.3 ? BELLY : Math.abs(w + 0.1) < 0.2 ? 0.7 : 1) },
  // a shark: a long torpedo, pointed snout, white belly
  shark: { n: [7, 6, 16], inside: (u, v, w) => u * u + v * v <= 1.2 - 0.9 * Math.max(0, w) ** 2 - 0.5 * Math.max(0, -w - 0.4), tone: (_u, v) => (v < -0.2 ? [1.6, 1.6, 1.6] : 1) },
  // the Kraken: a big round head with spots, lighter round the mouth
  kraken: {
    n: [14, 11, 13],
    inside: (u, v, w) => u * u + ((v - 0.1) / 0.95) ** 2 + w * w <= 1.15,
    tone: (u, v, w) => (w > 0.5 && v < -0.2 ? BELLY : Math.sin(u * 9) * Math.sin(v * 7 + w * 5) > 0.55 ? 0.7 : 1),
  },
  // a dome on straight sides
  ghost: { n: [9, 9, 9], inside: (u, v, w) => (v > 0 ? u * u + v * v + w * w <= 1.15 : u * u + w * w <= 1.15) },
  // the glitch ghost: the same dome, with scan lines through it
  phantom: { n: [9, 10, 9], inside: (u, v, w) => (v > 0 ? u * u + v * v + w * w <= 1.15 : u * u + w * w <= 1.15), tone: (_u, v) => (Math.floor((v + 1) * 3.5) % 2 === 0 ? 1.35 : 0.8) },
  megaBlock: { n: [12, 11, 12], inside: (u, v, w) => round(u, v, w, 8), tone: (u, v, w) => (Math.abs(u) > 0.7 && Math.abs(w) > 0.7 ? 0.7 : Math.abs(v) < 0.12 ? 0.75 : 1) },
  wormSegment: { n: [7, 7, 7], inside: (u, v, w) => round(u, v, w, 3) },
  // long and low: a body, and a flat snout with nostrils; light belly, dark ridges on the back
  // a crocodile: a long low body that tapers into the tail, a flat upper jaw with eye bumps on top
  // (the lower jaw is a separate part, so it can open)
  croc: {
    n: [10, 7, 26],
    inside: (u, v, w) => {
      if (w <= 0.3) {
        const wide = 0.62 + 0.38 * Math.min(1, (w + 1) / 0.9);
        return (u / wide) ** 2 + ((v + 0.15) / (0.8 * wide)) ** 2 <= 1;
      }
      const t = (w - 0.3) / 0.7;
      // the eye bumps sit just behind the snout
      if (w < 0.55 && Math.abs(Math.abs(u) - 0.42) < 0.17 && v > 0.15 && v < 0.75) return true;
      return Math.abs(u) <= 0.62 - 0.22 * t && v >= -0.3 && v <= 0.3 - 0.35 * t;
    },
    tone: (u, v, w) =>
      v < -0.45 ? BELLY : w > 0.3 && v > 0.4 && w < 0.55 ? [1.6, 1.5, 0.5] : v > 0.35 && w < 0.3 && Math.floor((w + 1) * 9) % 2 === 0 && Math.abs(u) < 0.35 ? 0.6 : 1,
  },
  // a round head on a small body; a light face and belly
  monkey: {
    n: [8, 11, 6],
    inside: (u, v, w) => (v > 0 ? u * u + ((v - 0.5) / 0.5) ** 2 + w * w <= 1.2 : (u / 0.85) ** 2 + ((v + 0.5) / 0.55) ** 2 + (w / 0.9) ** 2 <= 1.25),
    tone: (u, v, w) => (w > 0.4 && Math.abs(u) < 0.65 && (v > 0.15 ? v < 0.8 : v < -0.1) ? [1.75, 1.6, 1.35] : 1),
  },
  // a T-Rex: a barrel of a body held level, a thick neck up to a big head with a heavy upper jaw and a brow
  // over the snout, a light belly and dark stripes down the back (the lower jaw, legs, arms and tail are parts)
  trex: {
    n: [10, 16, 18],
    inside: (u, v, w) => {
      // the head: brow and upper jaw, the mouth cut out underneath toward the front
      if (v >= 0.42 && w >= 0.3) {
        if (w > 0.72 && v > 0.78) return false;
        if (Math.abs(u) > (w > 0.72 ? 0.4 : 0.52)) return false;
        return v >= (w > 0.5 ? 0.55 : 0.42);
      }
      // the neck
      if (v >= 0.2 && v < 0.42 && w >= 0.25 && w <= 0.62) return Math.abs(u) <= 0.4;
      // the body: a rounded barrel
      return (u / 0.78) ** 2 + ((v + 0.2) / 0.5) ** 2 + ((w + 0.1) / 0.62) ** 2 <= 1.15;
    },
    tone: (u, v, w) =>
      v < -0.35 && Math.abs(u) < 0.5 ? BELLY : v > 0.95 || (v < 0.4 && v > -0.05 && Math.abs(u) < 0.3 && Math.floor((w + 1) * 6) % 2 === 0) ? 0.72 : w > 0.5 && v < 0.62 && v >= 0.42 ? 0.85 : 1,
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
export function voxelBody(kind: BodyKind, w: number, h: number, d: number): VoxelBody {
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
