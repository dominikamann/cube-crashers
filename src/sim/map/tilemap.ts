import type { Vec2 } from '../types';

export const Tile = { Floor: 0, Wall: 1, LowWall: 2, Hazard: 3, Boost: 4, Ramp: 5, ConveyorN: 6, ConveyorE: 7, ConveyorS: 8, ConveyorW: 9 } as const;

/** push direction of a conveyor tile, or null */
export function conveyorDir(t: Tile): { x: number; z: number } | null {
  switch (t) {
    case Tile.ConveyorN:
      return { x: 0, z: -1 };
    case Tile.ConveyorE:
      return { x: 1, z: 0 };
    case Tile.ConveyorS:
      return { x: 0, z: 1 };
    case Tile.ConveyorW:
      return { x: -1, z: 0 };
    default:
      return null;
  }
}
export type Tile = (typeof Tile)[keyof typeof Tile];

export interface NestSpot {
  id: number;
  pos: Vec2;
  /** where rush hordes appear while this nest is being held */
  entries: Vec2[];
  padIds: number[];
}

export interface FloorMap {
  id: string;
  w: number;
  h: number;
  /** row-major: tz * w + tx */
  tiles: Tile[];
  spawn: Vec2;
  elevator: Vec2;
  pads: { id: number; pos: Vec2 }[];
  nestSpots: NestSpot[];
  vehicleSpots: Vec2[];
  powerSpots: Vec2[];
  crateSpots: Vec2[];
  waypoints: Vec2[];
  /** tall grass (the jungle): plain floor to walk on, but monsters in it are hard to see; tile centres */
  grass?: Vec2[];
  /**
   * solid outlines that run across the tiles (the Town's real houses, whose fronts are slanted): one closed
   * boundary each, as lines [x0, z0, x1, z1, ...] in tiles. Walkers stop at these lines and never stand inside;
   * a tile whose middle lies inside one is no way for a flow field. Without them a map is tiles only.
   */
  solids?: number[][];
}

/** the solids of a map sorted by tile, worked out once per map */
interface SolidIndex {
  /** the lines: x0, z0, x1, z1 per line */
  segs: Float64Array;
  /** per tile, the lines that touch it */
  linesAt: (number[] | undefined)[];
  /** per tile, the solids whose outline box covers it */
  solidsAt: (number[] | undefined)[];
  /** per tile, 1 if the tile's middle lies inside a solid */
  inside: Uint8Array;
}
const INDEX = new WeakMap<FloorMap, SolidIndex>();
const insideSolid = (outline: number[], x: number, z: number): boolean => {
  let c = false;
  for (let i = 0; i < outline.length; i += 4) {
    const ax = outline[i], az = outline[i + 1], bx = outline[i + 2], bz = outline[i + 3];
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) c = !c;
  }
  return c;
};
function solidIndex(m: FloorMap): SolidIndex | null {
  if (!m.solids) return null;
  let idx = INDEX.get(m);
  if (idx) return idx;
  const segs: number[] = [];
  const linesAt: (number[] | undefined)[] = new Array(m.w * m.h), solidsAt: (number[] | undefined)[] = new Array(m.w * m.h);
  const inside = new Uint8Array(m.w * m.h);
  const clampX = (v: number) => Math.max(0, Math.min(m.w - 1, v)), clampZ = (v: number) => Math.max(0, Math.min(m.h - 1, v));
  m.solids.forEach((outline, s) => {
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (let i = 0; i < outline.length; i += 4) {
      const x0 = outline[i], z0 = outline[i + 1], x1 = outline[i + 2], z1 = outline[i + 3];
      bx0 = Math.min(bx0, x0, x1);
      bx1 = Math.max(bx1, x0, x1);
      bz0 = Math.min(bz0, z0, z1);
      bz1 = Math.max(bz1, z0, z1);
      const li = segs.length / 4;
      segs.push(x0, z0, x1, z1);
      // (the tiles the line runs through: of the tiles its box covers, those it comes within a hair of)
      for (let tz = clampZ(Math.floor(Math.min(z0, z1))); tz <= clampZ(Math.floor(Math.max(z0, z1))); tz++)
        for (let tx = clampX(Math.floor(Math.min(x0, x1))); tx <= clampX(Math.floor(Math.max(x0, x1))); tx++) {
          if (!segmentTouchesBox(x0, z0, x1, z1, tx, tz, tx + 1, tz + 1)) continue;
          (linesAt[tz * m.w + tx] ??= []).push(li);
        }
    }
    if (bx1 < 0 || bz1 < 0 || bx0 >= m.w || bz0 >= m.h) return;
    for (let tz = clampZ(Math.floor(bz0)); tz <= clampZ(Math.floor(bz1)); tz++)
      for (let tx = clampX(Math.floor(bx0)); tx <= clampX(Math.floor(bx1)); tx++) {
        (solidsAt[tz * m.w + tx] ??= []).push(s);
        if (insideSolid(outline, tx + 0.5, tz + 0.5)) inside[tz * m.w + tx] = 1;
      }
  });
  INDEX.set(m, (idx = { segs: Float64Array.from(segs), linesAt, solidsAt, inside }));
  return idx;
}
/** whether a line touches an axis-aligned box (the box a hair wider): the part of the line inside both slabs */
function segmentTouchesBox(x0: number, z0: number, x1: number, z1: number, bx0: number, bz0: number, bx1: number, bz1: number): boolean {
  let t0 = 0, t1 = 1;
  const slab = (p0: number, p1: number, lo: number, hi: number): boolean => {
    const d = p1 - p0;
    if (Math.abs(d) < 1e-12) return p0 >= lo - 1e-6 && p0 <= hi + 1e-6;
    let a = (lo - 1e-6 - p0) / d, b = (hi + 1e-6 - p0) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  return slab(x0, x1, bx0, bx1) && slab(z0, z1, bz0, bz1);
}
/** distance from a point to a line */
const segmentDistance = (px: number, pz: number, x0: number, z0: number, x1: number, z1: number): number => {
  const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
  const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2));
  return Math.hypot(px - x0 - dx * u, pz - z0 - dz * u);
};
/** whether a circle touches a solid outline, or its middle lies inside one */
function hitsSolid(m: FloorMap, x: number, z: number, r: number): boolean {
  const idx = solidIndex(m);
  if (!idx) return false;
  const tx0 = Math.max(0, Math.floor(x - r)), tx1 = Math.min(m.w - 1, Math.floor(x + r));
  const tz0 = Math.max(0, Math.floor(z - r)), tz1 = Math.min(m.h - 1, Math.floor(z + r));
  for (let tz = tz0; tz <= tz1; tz++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const lines = idx.linesAt[tz * m.w + tx];
      if (!lines) continue;
      for (const li of lines) if (segmentDistance(x, z, idx.segs[li * 4], idx.segs[li * 4 + 1], idx.segs[li * 4 + 2], idx.segs[li * 4 + 3]) < r - 1e-9) return true;
    }
  return insideSolidAt(m, idx, x, z);
}
function insideSolidAt(m: FloorMap, idx: SolidIndex, x: number, z: number): boolean {
  const tx = Math.floor(x), tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h) return false;
  const solids = idx.solidsAt[tz * m.w + tx];
  if (!solids) return false;
  for (const s of solids) if (insideSolid(m.solids![s], x, z)) return true;
  return false;
}
/** True if a point lies inside one of the map's solids (the real houses of the Town). */
export function inSolid(m: FloorMap, x: number, z: number): boolean {
  const idx = solidIndex(m);
  return idx !== null && insideSolidAt(m, idx, x, z);
}
/** Per tile, 1 where the tile's middle lies inside a solid (no way for flow fields); null for a map without solids. */
export function solidTiles(m: FloorMap): Uint8Array | null {
  return solidIndex(m)?.inside ?? null;
}

const TILE_CHARS: Record<string, Tile> = {
  '#': Tile.Wall,
  '=': Tile.LowWall,
  '~': Tile.Hazard,
  '>': Tile.Boost,
  '^': Tile.Ramp,
  U: Tile.ConveyorN,
  R: Tile.ConveyorE,
  D: Tile.ConveyorS,
  L: Tile.ConveyorW,
};

/** pads further than this from every nest spot belong to no nest */
const PAD_NEST_RANGE = 9;

/**
 * Text legend: '#' wall, '.' floor, '=' low wall, '~' hazard, '>' boost, '^' ramp, 'S' spawn, 'E' elevator,
 * 'U' 'R' 'D' 'L' conveyor belts (pushing north, east, south, west),
 * 'N' nest spot, 'r' rush entry, 'p' pad, 'V' vehicle, '*' power-up, 'c' crate, 'w' waypoint, 'g' tall grass.
 * Markers sit on floor; positions are tile centres.
 */
export function parseMap(id: string, rows: string[]): FloorMap {
  const h = rows.length;
  const w = rows[0].length;
  const tiles: Tile[] = [];
  const marks: Record<string, Vec2[]> = { S: [], E: [], N: [], r: [], p: [], V: [], '*': [], c: [], w: [], g: [] };
  rows.forEach((row, tz) => {
    if (row.length !== w) throw new Error(`map ${id}: row ${tz} has ${row.length} tiles, expected ${w}`);
    [...row].forEach((ch, tx) => {
      const border = tx === 0 || tz === 0 || tx === w - 1 || tz === h - 1;
      if (border && ch !== '#') throw new Error(`map ${id}: border open at ${tx},${tz}`);
      if (ch in TILE_CHARS) tiles.push(TILE_CHARS[ch]);
      else if (ch === '.') tiles.push(Tile.Floor);
      else if (ch in marks) {
        tiles.push(Tile.Floor);
        marks[ch].push({ x: tx + 0.5, z: tz + 0.5 });
      } else throw new Error(`map ${id}: unknown tile '${ch}' at ${tx},${tz}`);
    });
  });
  if (marks.S.length !== 1 || marks.E.length !== 1) throw new Error(`map ${id}: needs exactly one S and one E`);

  const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
  const nestSpots: NestSpot[] = marks.N.map((pos, i) => ({ id: i, pos, entries: [], padIds: [] }));
  const nearestNest = (p: Vec2) => nestSpots.reduce<NestSpot | null>((best, n) => (!best || d(p, n.pos) < d(p, best.pos) ? n : best), null);
  const pads = marks.p.map((pos, i) => ({ id: i, pos }));
  for (const pad of pads) {
    const n = nearestNest(pad.pos);
    if (n && d(pad.pos, n.pos) <= PAD_NEST_RANGE) n.padIds.push(pad.id);
  }
  for (const e of marks.r) nearestNest(e)?.entries.push(e);

  return {
    id,
    w,
    h,
    tiles,
    spawn: marks.S[0],
    elevator: marks.E[0],
    pads,
    nestSpots,
    vehicleSpots: marks.V,
    powerSpots: marks['*'],
    crateSpots: marks.c,
    waypoints: marks.w,
    ...(marks.g.length > 0 ? { grass: marks.g } : {}),
  };
}

/** Tile at a world position; everything outside the map is wall. */
export function tileAt(m: FloorMap, x: number, z: number): Tile {
  const tx = Math.floor(x), tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h) return Tile.Wall;
  return m.tiles[tz * m.w + tx];
}

export type Blocks = (t: Tile) => boolean;
export const BLOCKS_WALKER: Blocks = t => t === Tile.Wall || t === Tile.LowWall;
export const BLOCKS_ENEMY: Blocks = t => t === Tile.Wall || t === Tile.LowWall || t === Tile.Hazard;
export const BLOCKS_KART: Blocks = BLOCKS_WALKER;
export const BLOCKS_AIR: Blocks = t => t === Tile.Wall;

function overlaps(m: FloorMap, x: number, z: number, r: number, blocks: Blocks): boolean {
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (!blocks(tileAt(m, tx + 0.5, tz + 0.5))) continue;
      const cx = Math.max(tx, Math.min(x, tx + 1)), cz = Math.max(tz, Math.min(z, tz + 1));
      if (Math.hypot(x - cx, z - cz) < r - 1e-9) return true;
    }
  }
  return m.solids !== undefined && hitsSolid(m, x, z, r);
}

/** True if a circle at `pos` does not touch a blocking tile. */
export function isFree(m: FloorMap, pos: Vec2, r: number, blocks: Blocks): boolean {
  return !overlaps(m, pos.x, pos.z, r, blocks);
}

const MAX_SUBSTEP = 0.25;

/** Moves a circle by (dx, dz), stopping at blocking tiles per axis so it slides along walls. Mutates `pos`. */
export function moveCircle(m: FloorMap, pos: Vec2, dx: number, dz: number, r: number, blocks: Blocks): { hitX: boolean; hitZ: boolean } {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MAX_SUBSTEP));
  const sx = dx / n, sz = dz / n;
  let hitX = false, hitZ = false;
  for (let i = 0; i < n; i++) {
    let bx = false, bz = false;
    if (sx !== 0) {
      if (overlaps(m, pos.x + sx, pos.z, r, blocks)) hitX = bx = true;
      else pos.x += sx;
    }
    if (sz !== 0) {
      if (overlaps(m, pos.x, pos.z + sz, r, blocks)) hitZ = bz = true;
      else pos.z += sz;
    }
    // (a slanted wall of a solid may stop both ways at once: what it stopped slides along the wall instead)
    if ((bx || bz) && m.solids) slideAlongSolid(m, pos, bx ? sx : 0, bz ? sz : 0, r, blocks);
  }
  return { hitX, hitZ };
}

/** Moves `pos` by the part of (dx, dz) that runs along the nearest solid wall, if that way is open. */
function slideAlongSolid(m: FloorMap, pos: Vec2, dx: number, dz: number, r: number, blocks: Blocks): void {
  const idx = solidIndex(m);
  if (!idx) return;
  let best = -1, bestD = r + 0.3;
  const reach = r + 0.3;
  for (let tz = Math.max(0, Math.floor(pos.z - reach)); tz <= Math.min(m.h - 1, Math.floor(pos.z + reach)); tz++)
    for (let tx = Math.max(0, Math.floor(pos.x - reach)); tx <= Math.min(m.w - 1, Math.floor(pos.x + reach)); tx++) {
      const lines = idx.linesAt[tz * m.w + tx];
      if (!lines) continue;
      for (const li of lines) {
        const d = segmentDistance(pos.x, pos.z, idx.segs[li * 4], idx.segs[li * 4 + 1], idx.segs[li * 4 + 2], idx.segs[li * 4 + 3]);
        if (d < bestD) ((bestD = d), (best = li));
      }
    }
  if (best < 0) return;
  const ex = idx.segs[best * 4 + 2] - idx.segs[best * 4], ez = idx.segs[best * 4 + 3] - idx.segs[best * 4 + 1], L = Math.hypot(ex, ez);
  if (L === 0) return;
  const along = (dx * ex + dz * ez) / L;
  const mx = (ex / L) * along, mz = (ez / L) * along;
  if (Math.hypot(mx, mz) < 1e-9 || overlaps(m, pos.x + mx, pos.z + mz, r, blocks)) return;
  pos.x += mx;
  pos.z += mz;
}

/** Line of sight: only walls (and the solids, where a map has them) block sight and shots. */
export function hasLos(m: FloorMap, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
  const idx = solidIndex(m);
  for (let i = 1; i < n; i++) {
    const x = a.x + (dx * i) / n, z = a.z + (dz * i) / n;
    if (tileAt(m, x, z) === Tile.Wall) return false;
    if (idx && insideSolidAt(m, idx, x, z)) return false;
  }
  return true;
}

/** Flood fill from `from`; returns a mask (1 = reachable) over the tiles. */
export function reachable(m: FloorMap, from: Vec2, blocks: Blocks): Uint8Array {
  const mask = new Uint8Array(m.w * m.h);
  const start = Math.floor(from.z) * m.w + Math.floor(from.x);
  const queue = [start];
  mask[start] = 1;
  while (queue.length > 0) {
    const i = queue.pop()!;
    const tx = i % m.w, tz = Math.floor(i / m.w);
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= m.w || nz >= m.h) continue;
      const j = nz * m.w + nx;
      if (mask[j] || blocks(m.tiles[j])) continue;
      mask[j] = 1;
      queue.push(j);
    }
  }
  return mask;
}

/** The free spot closest to `pos` for a circle of radius `r` (searches outward in rings). */
export function nearestFree(m: FloorMap, pos: Vec2, r: number, blocks: Blocks, minDist = 0): Vec2 {
  if (minDist === 0 && isFree(m, pos, r, blocks)) return { ...pos };
  for (let ring = Math.max(minDist, 0.5); ring <= 6; ring += 0.5) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const c = { x: pos.x + Math.cos(a) * ring, z: pos.z + Math.sin(a) * ring };
      if (isFree(m, c, r, blocks) && hasLos(m, pos, c)) return c;
    }
  }
  return { ...pos };
}
