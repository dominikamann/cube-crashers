import { Tile, type FloorMap } from './tilemap';
import type { Vec2 } from '../types';

/**
 * Where an AmannLabs logo goes, in tiles. 'floor': painted on a w x h patch of floor.
 * 'wall': on the side of a straight run of w wall blocks starting at (tx, tz), going along x or z,
 * on the face that looks toward `facing`.
 */
export type LogoSpot =
  | { kind: 'floor'; tx: number; tz: number; w: number; h: number }
  | { kind: 'wall'; tx: number; tz: number; w: number; along: 'x' | 'z'; facing: Vec2 };

const SIZE = { w: 4, h: 1 };
/** wall blocks come in a few heights, the same for every patch of this many tiles (see wallHeight in world.ts) */
const HEIGHT_PATCH = 4;
const FACINGS: Vec2[] = [{ x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }];

/**
 * Two quiet logos per map, both small: one somewhere on plain floor (one tile clear of anything the game
 * puts there: pads, nests, karts, crates, spawn, elevator) and one on a wall, away from the first.
 * The wall one prefers a face toward the bottom of the map. Picked by a hash of the map id, so each map looks different but always the same.
 */
export function logoSpots(map: FloorMap): LogoSpot[] {
  // (a map never changes, and this is asked for every tick and every frame: worked out once per map)
  let spots = spotCache.get(map);
  if (!spots) spotCache.set(map, (spots = findLogoSpots(map)));
  return spots;
}
const spotCache = new WeakMap<FloorMap, LogoSpot[]>();

function findLogoSpots(map: FloorMap): LogoSpot[] {
  // (none in the Town: there AmannLabs has a shop with its name over the door)
  if (map.id === 'waldsee') return [];
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= map.w || z >= map.h ? Tile.Wall : map.tiles[z * map.w + x]);
  const points = [map.spawn, map.elevator, ...map.pads.map(p => p.pos), ...map.nestSpots.map(n => n.pos), ...map.vehicleSpots, ...map.powerSpots, ...map.crateSpots];
  let seed = 0;
  for (const ch of map.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = <T>(list: T[], salt: number): T | undefined => list[(Math.imul(seed ^ salt, 0x9e3779b1) >>> 0) % list.length];

  const grass = new Set((map.grass ?? []).map(g => Math.floor(g.z) * map.w + Math.floor(g.x)));
  const floors: LogoSpot[] = [];
  // best: plain floor all round it too, so no tree crown or wall-side prop reaches over it, and no tall grass
  const open: LogoSpot[] = [];
  for (let tz = 0; tz + SIZE.h <= map.h; tz++)
    for (let tx = 0; tx + SIZE.w <= map.w; tx++) {
      let ok = true;
      for (let z = tz; z < tz + SIZE.h && ok; z++) for (let x = tx; x < tx + SIZE.w && ok; x++) ok = at(x, z) === Tile.Floor && !grass.has(z * map.w + x);
      if (!ok || points.some(p => p.x >= tx - 1 && p.x <= tx + SIZE.w + 1 && p.z >= tz - 1 && p.z <= tz + SIZE.h + 1)) continue;
      floors.push({ kind: 'floor', tx, tz, ...SIZE });
      let ring = true;
      for (let z = tz - 1; z <= tz + SIZE.h && ring; z++) for (let x = tx - 1; x <= tx + SIZE.w && ring; x++) ring = at(x, z) === Tile.Floor;
      if (ring) open.push({ kind: 'floor', tx, tz, ...SIZE });
    }
  const floor = pick(open.length ? open : floors, 0x51ed);
  if (!floor) return [];

  // (a wall logo wants one flat face: the wall goes on straight for a block more at each end, so no corner is
  // at the logo's edge, and its blocks are of one height; block heights change every HEIGHT_PATCH tiles)
  const walls: LogoSpot[] = [], flat: LogoSpot[] = [], level: LogoSpot[] = [], best: LogoSpot[] = [];
  for (let tz = 0; tz < map.h; tz++)
    for (let tx = 0; tx < map.w; tx++)
      for (const facing of FACINGS) {
        const along = facing.x === 0 ? 'x' : 'z';
        let ok = true;
        for (let i = 0; i < SIZE.w && ok; i++) {
          const x = tx + (along === 'x' ? i : 0), z = tz + (along === 'z' ? i : 0);
          ok = at(x, z) === Tile.Wall && at(x + facing.x, z + facing.z) === Tile.Floor;
        }
        if (!ok) continue;
        const spot: LogoSpot = { kind: 'wall', tx, tz, w: SIZE.w, along, facing };
        walls.push(spot);
        const goesOn = [-1, SIZE.w].every(i => {
          const x = tx + (along === 'x' ? i : 0), z = tz + (along === 'z' ? i : 0);
          return at(x, z) === Tile.Wall && at(x + facing.x, z + facing.z) === Tile.Floor;
        });
        const oneHeight = (along === 'x' ? tx : tz) % HEIGHT_PATCH === 0;
        if (goesOn) flat.push(spot);
        if (oneHeight) level.push(spot);
        if (goesOn && oneHeight) best.push(spot);
      }
  // the two are spread over the map: the wall logo at least a third of the map's diagonal from the floor one
  // (where no wall is that far, the furthest there is)
  const apart = (w: LogoSpot) => Math.hypot(w.tx - floor.tx, w.tz - floor.tz);
  const farOf = (list: LogoSpot[]) => list.filter(w => apart(w) >= Math.hypot(map.w, map.h) / 3);
  // (the best kind of wall that is far enough away; with none that far, the furthest there is)
  const far = [best, flat, level, walls].map(farOf).find(l => l.length) ?? [];
  const pool = far.length ? far : walls.slice().sort((a, b) => apart(b) - apart(a)).slice(0, 1);
  // a face toward the bottom of the map is seen from above too, not only in first person
  const south = pool.filter(w => w.kind === 'wall' && w.facing.z === 1);
  // (not in the Town: its walls are the fronts of houses, with windows and shutters)
  const wall = map.id === 'waldsee' ? undefined : pick(south.length ? south : pool, 0xa11);
  return wall ? [floor, wall] : [floor];
}

/**
 * The tiles to leave free around the logos (as tz * w + tx): the floor stamp and the tiles round it, and the
 * wall run with the floor in front of it, a tile wider on each side. No decoration or ladder goes there.
 */
const clearCache = new WeakMap<FloorMap, Set<number>>();
export function logoClear(map: FloorMap): Set<number> {
  let out = clearCache.get(map);
  if (out) return out;
  out = new Set<number>();
  const add = (x: number, z: number) => {
    if (x >= 0 && z >= 0 && x < map.w && z < map.h) out!.add(z * map.w + x);
  };
  for (const s of logoSpots(map)) {
    if (s.kind === 'floor') {
      for (let z = s.tz - 1; z <= s.tz + s.h; z++) for (let x = s.tx - 1; x <= s.tx + s.w; x++) add(x, z);
    } else {
      for (let i = -1; i <= s.w; i++) {
        const x = s.tx + (s.along === 'x' ? i : 0), z = s.tz + (s.along === 'z' ? i : 0);
        // the wall itself (nothing on its top edge either) and two tiles of floor in front
        for (let d = 0; d <= 2; d++) add(x + s.facing.x * d, z + s.facing.z * d);
      }
    }
  }
  clearCache.set(map, out);
  return out;
}
