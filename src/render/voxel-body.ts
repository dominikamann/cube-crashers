import * as THREE from 'three';
import type { EnemyKind } from '../sim/types';
import { BODY } from './dominik-body';
import { DOMINIK, DOMINIK_NECK } from './dominik-limbs';
import { HEAD_BACK, HEAD_FRONT, HEAD_LEFT, HEAD_RIGHT, type Portrait } from './dominik-face';
import { solidVoxels } from './voxel-mesh';

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
  /** no gaps between the cubes, and only the faces one can see: for a body that is a picture (Angry Dominik) */
  solid?: boolean;
  /** solid: how many like faces above one another may become one */
  merge?: number;
}

/** a rounded box: p = 2 is a ball, higher values are boxier */
const round = (u: number, v: number, w: number, p: number, limit = 1.1) => Math.abs(u) ** p + Math.abs(v) ** p + Math.abs(w) ** p <= limit;
const BELLY: [number, number, number] = [1.45, 1.4, 1.2];

/** a body that is not a monster kind of its own: the Rhino is a rammer in the game's rules */
export type BodyKind = EnemyKind | 'rhino' | 'dominik' | 'dominikHead';

/**
 * Angry Dominik is made from photos. His head: four pixel portraits (front, both sides, back, see
 * dominik-face.ts), one pixel a voxel; their outlines are its shape. His body from the neck to the knees: what
 * he looks like from the front and from behind, and how deep he is in every row (dominik-body.ts). Both are
 * bodies of their own, drawn with the same pose, and both are solid: no gaps between their voxels, so that
 * they read as a picture of him and not as a grid. (The neck between them, the arms, the lower legs with the
 * shoes and the hammer: dominik-limbs.ts.)
 * The material is white: the tones are the colours themselves. His left is at +x (he looks along +z).
 */
type Rgb = [number, number, number];
const rgb = (hex: number): Rgb => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const DOM_SKIN = rgb(parseInt(BODY.skin, 16)), DOM_SHIRT = rgb(0x1b1c21), DOM_SHORTS = rgb(0x20295c);
const pixel = (row: string, x: number): Rgb | null => {
  const c = row.slice(x * 6, x * 6 + 6);
  return c === '' || c === '......' ? null : rgb(parseInt(c, 16));
};
/** the stretch of pixels in each row of a picture: [first, last], or null for an empty row */
const runsOf = (rows: string[], w: number): ([number, number] | null)[] =>
  rows.map(row => {
    let a = -1, b = -1;
    for (let c = 0; c < w; c++)
      if (pixel(row, c)) {
        if (a < 0) a = c;
        b = c;
      }
    return a < 0 ? null : [a, b];
  });
/** a line of numbers without its narrow bumps (those shorter than 2 * `r` + 1 entries): a profile without its nose */
const withoutBumps = (line: number[], r: number): number[] => {
  const pass = (src: number[], pick: (...v: number[]) => number) => src.map((_, i) => pick(...src.slice(Math.max(0, i - r), i + r + 1)));
  return pass(pass(line, Math.min), Math.max);
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** 0 at `lo`, 1 at `hi` (either may be the larger) */
const step = (lo: number, hi: number, v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

/** a body cell: its row from the top, its column as the camera in front of him saw it, its depth from his middle */
const bodyCell = (u: number, v: number, w: number) => ({
  row: BODY.rows - 1 - Math.floor(((v + 1) / 2) * BODY.rows),
  // (his left is on the right of a photo taken from the front)
  col: Math.floor(((u + 1) / 2) * BODY.cols),
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

/**
 * The head's shape, row by row from the top: as wide as the front portrait and as deep as the side one, round in
 * between. Nose and ears are narrow bumps on those outlines; they stay narrow on the head too (a nose in the
 * middle of the face, ears where the side portrait has them) instead of widening the whole row.
 */
const HEAD = (() => {
  const W = HEAD_FRONT.w, D = HEAD_LEFT.w, H = HEAD_FRONT.h;
  const front = runsOf(HEAD_FRONT.rows, W), side = runsOf(HEAD_LEFT.rows, D);
  // (the left portrait has his nose on its left: depth is counted from the back of the head)
  const rows = front.map((f, r) => (f && side[r] ? { x0: f[0], x1: f[1] + 1, z0: D - 1 - side[r]![1], z1: D - side[r]![0] } : null));
  const line = (get: (r: NonNullable<(typeof rows)[number]>) => number, r: number) => {
    const smooth = withoutBumps(rows.map(q => (q ? get(q) : -1e3)), r);
    return rows.map((q, i) => (q ? Math.min(get(q), smooth[i]) : 0));
  };
  // without the ears (bumps of the width) and without the nose (a bump of the profile)
  const right = line(q => -q.x0, 5).map(v => -v), left = line(q => q.x1, 5), face = line(q => q.z1, 7);
  return { W, D, H, rows, right, left, face };
})();
/** how far to each side of the middle the nose is, and where along the head (0 at the back, 1 at the nose) the ears are */
const NOSE_HALF = 3.4, EARS: [number, number] = [0.39, 0.52];
/**
 * The neck where it enters the head from below (see DOMINIK_NECK): half its width, its middle front to back and
 * half its depth, in voxels of the head from the head's middle. Under the ears the head draws in toward it.
 */
const NECK = (() => {
  const head = DOMINIK.head.h / HEAD_FRONT.h, chin = DOMINIK.head.y + DOMINIK.height / 2 - DOMINIK.head.h / 2;
  return { rx: DOMINIK_NECK.w / 2 / head, cz: (DOMINIK_NECK.z + DOMINIK_NECK.lean * (chin - DOMINIK_NECK.foot) - DOMINIK.head.z) / head, rz: DOMINIK_NECK.d / 2 / head };
})();
/** the rows (from the top) down to which the head is hair all round except in front, and down to which it is hair behind */
const CROWN: [number, number] = [Math.round(HEAD_FRONT.h * 0.2), Math.round(HEAD_FRONT.h * 0.36)];
/** how many rows above the chin the head starts to draw in toward the neck */
const JAW_ROWS = 9;
/** a head cell: its row from the top, and where it is across and along that row (in voxels and as -1..1 of the row's oval) */
const headCell = (u: number, v: number, w: number) => {
  const row = HEAD.H - 1 - Math.floor(((v + 1) / 2) * HEAD.H);
  const q = HEAD.rows[row];
  if (!q) return null;
  const x = ((u + 1) / 2) * HEAD.W, z = ((w + 1) / 2) * HEAD.D;
  // under the ears the head draws in toward the neck: the jaw rises from the chin to it, and the back of the
  // head runs down into the nape instead of ending as a ledge over it
  const under = Math.max(0, (row + 1 - (HEAD.H - JAW_ROWS)) / JAW_ROWS);
  const cx = (HEAD.right[row] + HEAD.left[row]) / 2, rx = ((HEAD.left[row] - HEAD.right[row]) / 2) * (1 - under) + Math.min((HEAD.left[row] - HEAD.right[row]) / 2, NECK.rx * 0.94) * under;
  const back = q.z0 + (HEAD.D / 2 + NECK.cz - NECK.rz * 0.4 - q.z0) * under ** 1.6;
  const cz = (back + HEAD.face[row]) / 2, rz = (HEAD.face[row] - back) / 2;
  return { row, q, x, z, cx, nx: (x - cx) / Math.max(0.5, rx), nz: (z - cz) / Math.max(0.5, rz) };
};
/** the pixel of a portrait in `row` (from the top) at `t` along that row's stretch (0 to 1) */
const portraitAt = (p: Portrait, runs: ([number, number] | null)[], row: number, t: number): Rgb | null => {
  const run = runs[row];
  if (!run) return null;
  return pixel(p.rows[row], Math.max(run[0], Math.min(run[1], Math.floor(run[0] + t * (run[1] - run[0] + 1)))));
};
const HEAD_RUNS = { front: runsOf(HEAD_FRONT.rows, HEAD_FRONT.w), left: runsOf(HEAD_LEFT.rows, HEAD_LEFT.w), back: runsOf(HEAD_BACK.rows, HEAD_BACK.w), right: runsOf(HEAD_RIGHT.rows, HEAD_RIGHT.w) };

const SHAPES: Partial<Record<BodyKind, Shape>> = {
  dominik: {
    n: [BODY.cols, BODY.rows, BODY.deep],
    solid: true,
    // (cloth in even tones: much of it merges)
    merge: 3,
    inside: (u, v, w) => {
      const { row, col, z } = bodyCell(u, v, w);
      const run = bodyRuns[row]?.find(r => col >= r[0] && col <= r[1]);
      if (!run) return false;
      // round in cross-section: as wide as the photo from the front shows, as deep as its row says; the trunk
      // is flat in front and behind over the middle of its width, and round only toward the sides
      const [back, front, flat] = BODY.depth[row];
      const x = Math.abs(col + 0.5 - (run[0] + run[1] + 1) / 2) / ((run[1] - run[0] + 1) / 2);
      const d = (z - (back + front) / 2) / Math.max(1, (front - back) / 2);
      return (Math.max(0, x - flat) / (1 - flat)) ** 2.6 + Math.abs(d) ** 2.6 <= 1;
    },
    tone: (u, v, w) => {
      const { row, col, z } = bodyCell(u, v, w);
      const [back, front] = BODY.depth[row];
      const fromFront = z >= (back + front) / 2;
      // (from behind his left is on the left)
      return pixel(fromFront ? BODY.front[row] : BODY.back[row], fromFront ? col : BODY.cols - 1 - col) ?? pixel(BODY.front[row], col) ?? (row > BODY.rows * 0.58 ? DOM_SHORTS : DOM_SHIRT);
    },
  },
  dominikHead: {
    n: [HEAD.W, HEAD.H, HEAD.D],
    solid: true,
    inside: (u, v, w) => {
      const c = headCell(u, v, w);
      if (!c) return false;
      if (Math.abs(c.nx) ** 2.5 + Math.abs(c.nz) ** 2.5 <= 1) return true;
      // the nose (and the lips): what the profile has in front of the face, rounded off to the sides
      const out = c.z - HEAD.face[c.row], reach = c.q.z1 - HEAD.face[c.row];
      if (out > 0 && out < reach && Math.abs(c.x - c.cx) <= NOSE_HALF * Math.sqrt(1 - (out / (reach + 0.5)) ** 2)) return true;
      if (out > -3 && out <= 0 && reach > 0 && Math.abs(c.x - c.cx) <= NOSE_HALF) return true;
      // the ears: what the front portrait has beside the head
      const along = (c.z - c.q.z0) / (c.q.z1 - c.q.z0);
      return along >= EARS[0] && along <= EARS[1] && c.x >= c.q.x0 && c.x <= c.q.x1 && Math.abs(c.nx) > 0.8 && Math.abs(c.nx) < 1.6;
    },
    // each side of the head shows the portrait taken from there, fading into the next one where they meet
    tone: (u, v, w) => {
      const c = headCell(u, v, w);
      if (!c) return DOM_SKIN;
      const along = (c.z - c.q.z0) / (c.q.z1 - c.q.z0), across = (c.x - c.q.x0) / (c.q.x1 - c.q.x0);
      const side = (c.nx > 0 ? portraitAt(HEAD_LEFT, HEAD_RUNS.left, c.row, 1 - along) : portraitAt(HEAD_RIGHT, HEAD_RUNS.right, c.row, along)) ?? DOM_SKIN;
      const facing = c.nz >= 0 ? portraitAt(HEAD_FRONT, HEAD_RUNS.front, c.row, across) : portraitAt(HEAD_BACK, HEAD_RUNS.back, c.row, 1 - across);
      // (at the corners behind, hair meets hair)
      const seen = facing ? mix(facing, side, c.nz >= 0 ? step(0.74, 0.92, Math.abs(c.nx)) : step(0.78, 0.97, Math.abs(c.nx))) : side;
      // the crown and the upper back of the skull are hair and nothing else: the light from above made the hair
      // there as pale as skin in the photos. Hair from the back of his head covers it (the forehead and the
      // hairline in front stay as they are)
      const crown = Math.max(step(CROWN[0] + 2, CROWN[0] - 2, c.row) * step(0.9, 0.55, c.nz), step(CROWN[1] + 3, CROWN[1] - 3, c.row) * step(0.25, -0.1, c.nz));
      if (crown <= 0) return seen;
      const pick = Math.abs(Math.floor(c.x) * 7 + Math.floor(c.z) * 13 + c.row * 5);
      const hair = portraitAt(HEAD_BACK, HEAD_RUNS.back, Math.round(HEAD.H * 0.3) + (pick % Math.round(HEAD.H * 0.25)), 0.25 + ((pick * 31) % 50) / 100) ?? seen;
      return mix(seen, hair, crown);
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

const solids = new Map<BodyKind, VoxelBody>();

/** share of a cell a cube fills: the rest is the gap between the pixels */
const FILL = 0.9;
const hash = (i: number, j: number, k: number) => {
  const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/** The body of `kind` in a box of w x h x d tiles (a plain box for kinds without a shape). */
export function voxelBody(kind: BodyKind, w: number, h: number, d: number): VoxelBody {
  const shape = SHAPES[kind];
  // (a solid one takes a moment to build: it is built once and kept)
  const kept = solids.get(kind);
  if (kept) return kept;
  if (!shape) return { geometry: new THREE.BoxGeometry(w, h, d), frontAt: () => d / 2 };
  const [nx, ny, nz] = shape.n;
  const cx = w / nx, cy = h / ny, cz = d / nz;
  const at = (i: number, j: number, k: number) => {
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return false;
    return shape.inside(((i + 0.5) / nx) * 2 - 1, ((j + 0.5) / ny) * 2 - 1, ((k + 0.5) / nz) * 2 - 1);
  };
  const frontAt = (fill: number) => (x: number, y: number) => {
    const i = Math.max(0, Math.min(nx - 1, Math.floor((x + w / 2) / cx)));
    const j = Math.max(0, Math.min(ny - 1, Math.floor((y + h / 2) / cy)));
    for (let k = nz - 1; k >= 0; k--) if (at(i, j, k)) return (k + 0.5 + fill / 2) * cz - d / 2;
    return d / 2;
  };
  if (shape.solid) {
    const geometry = solidVoxels([nx, ny, nz], [cx, cy, cz], [-w / 2, -h / 2, -d / 2], (i, j, k) => {
      if (!at(i, j, k)) return null;
      const tone = shape.tone?.(((i + 0.5) / nx) * 2 - 1, ((j + 0.5) / ny) * 2 - 1, ((k + 0.5) / nz) * 2 - 1) ?? 1;
      return typeof tone === 'number' ? [tone, tone, tone] : tone;
    }, shape.merge ? 0 : 0.06, 0.85, shape.merge ?? 1);
    const body = { geometry, frontAt: frontAt(1) };
    solids.set(kind, body);
    return body;
  }
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
  return { geometry, frontAt: frontAt(FILL) };
}
