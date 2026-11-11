import type { Vec2 } from '../types';

export const Tile = { Floor: 0, Wall: 1, LowWall: 2, Hazard: 3, Boost: 4, Ramp: 5 } as const;
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
}

const TILE_CHARS: Record<string, Tile> = {
  '#': Tile.Wall,
  '=': Tile.LowWall,
  '~': Tile.Hazard,
  '>': Tile.Boost,
  '^': Tile.Ramp,
};

/** pads further than this from every nest spot belong to no nest */
const PAD_NEST_RANGE = 9;

/**
 * Text legend: '#' wall, '.' floor, '=' low wall, '~' hazard, '>' boost, '^' ramp, 'S' spawn, 'E' elevator,
 * 'N' nest spot, 'r' rush entry, 'p' pad, 'V' vehicle, '*' power-up, 'c' crate, 'w' waypoint.
 * Markers sit on floor; positions are tile centres.
 */
export function parseMap(id: string, rows: string[]): FloorMap {
  const h = rows.length;
  const w = rows[0].length;
  const tiles: Tile[] = [];
  const marks: Record<string, Vec2[]> = { S: [], E: [], N: [], r: [], p: [], V: [], '*': [], c: [], w: [] };
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
  return false;
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
    if (sx !== 0) {
      if (overlaps(m, pos.x + sx, pos.z, r, blocks)) hitX = true;
      else pos.x += sx;
    }
    if (sz !== 0) {
      if (overlaps(m, pos.x, pos.z + sz, r, blocks)) hitZ = true;
      else pos.z += sz;
    }
  }
  return { hitX, hitZ };
}

/** Line of sight: only walls block sight and shots. */
export function hasLos(m: FloorMap, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
  for (let i = 1; i < n; i++) {
    if (tileAt(m, a.x + (dx * i) / n, a.z + (dz * i) / n) === Tile.Wall) return false;
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
