import type { Vec2 } from '../types';
import { perchable } from './perch';
import { Tile, type FloorMap } from './tilemap';

/** A ladder up a wall: stand on its floor tile and walk into the wall to climb onto the block's top. */
export interface Ladder {
  /** the floor tile it stands on */
  tx: number;
  tz: number;
  /** where you come out on top of the wall */
  top: Vec2;
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** how long a climb up a ladder takes */
export const CLIMB_TICKS = 30;
/** at most this many per map, at least this far apart */
const MAX = 8;
const SPACING = 9;

const hash = (a: number, b: number) => {
  const n = Math.sin(a * 91.7 + b * 37.3) * 43758.5453;
  return n - Math.floor(n);
};

const cache = new WeakMap<FloorMap, Ladder[]>();

/** The ladders of a map, the same every time: against inner walls, spread out, clear of spawn, pads and nests. */
export function ladders(m: FloorMap): Ladder[] {
  let list = cache.get(m);
  if (list) return list;
  list = [];
  if (!['race', 'lane', 'maze', 'shaft'].includes(m.id)) {
    const keepClear = [m.spawn, m.elevator, ...m.pads.map(p => p.pos), ...m.nestSpots.flatMap(n => [n.pos, ...n.entries]), ...m.vehicleSpots, ...m.powerSpots, ...m.crateSpots];
    const tile = (tx: number, tz: number) => (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h ? Tile.Wall : m.tiles[tz * m.w + tx]);
    const candidates: (Ladder & { r: number })[] = [];
    for (let tz = 1; tz < m.h - 1; tz++)
      for (let tx = 1; tx < m.w - 1; tx++) {
        if (tile(tx, tz) !== Tile.Floor) continue;
        if (keepClear.some(p => Math.abs(p.x - (tx + 0.5)) < 2.6 && Math.abs(p.z - (tz + 0.5)) < 2.6)) continue;
        for (const [ox, oz] of DIRS) {
          // the wall behind it is a block you can stand on, and its top is more than one tile deep or wide
          const wx = tx + ox, wz = tz + oz;
          if (!perchable(m, wx + 0.5, wz + 0.5)) continue;
          const top = { x: wx + 0.5 - ox * 0.15, z: wz + 0.5 - oz * 0.15 };
          candidates.push({ tx, tz, top, r: hash(tx, tz) });
          break;
        }
      }
    candidates.sort((a, b) => a.r - b.r);
    for (const c of candidates) {
      if (list.length >= MAX) break;
      if (list.some(l => Math.hypot(l.tx - c.tx, l.tz - c.tz) < SPACING)) continue;
      list.push({ tx: c.tx, tz: c.tz, top: c.top });
    }
  }
  cache.set(m, list);
  return list;
}

/** the ladder on this floor tile, if there is one */
export function ladderAt(m: FloorMap, x: number, z: number): Ladder | undefined {
  const tx = Math.floor(x), tz = Math.floor(z);
  return ladders(m).find(l => l.tx === tx && l.tz === tz);
}
