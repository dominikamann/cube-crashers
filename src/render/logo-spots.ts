import { Tile, type FloorMap } from '../sim/map/tilemap';
import type { Vec2 } from '../sim/types';

/**
 * Where an AmannLabs logo goes, in tiles. 'floor': painted on a w x h patch of floor.
 * 'wall': on the side of a straight run of w wall blocks starting at (tx, tz), going along x or z,
 * on the face that looks toward `facing`.
 */
export type LogoSpot =
  | { kind: 'floor'; tx: number; tz: number; w: number; h: number }
  | { kind: 'wall'; tx: number; tz: number; w: number; along: 'x' | 'z'; facing: Vec2 };

const SIZE = { w: 4, h: 1 };
const FACINGS: Vec2[] = [{ x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }];

/**
 * Two quiet logos per map, both small: one somewhere on plain floor (one tile clear of anything the game
 * puts there: pads, nests, karts, crates, spawn, elevator) and one on a wall, away from the first.
 * The wall one prefers a face toward the bottom of the map. Picked by a hash of the map id, so each map looks different but always the same.
 */
export function logoSpots(map: FloorMap): LogoSpot[] {
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= map.w || z >= map.h ? Tile.Wall : map.tiles[z * map.w + x]);
  const points = [map.spawn, map.elevator, ...map.pads.map(p => p.pos), ...map.nestSpots.map(n => n.pos), ...map.vehicleSpots, ...map.powerSpots, ...map.crateSpots];
  let seed = 0;
  for (const ch of map.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = <T>(list: T[], salt: number): T | undefined => list[(Math.imul(seed ^ salt, 0x9e3779b1) >>> 0) % list.length];

  const floors: LogoSpot[] = [];
  for (let tz = 0; tz + SIZE.h <= map.h; tz++)
    for (let tx = 0; tx + SIZE.w <= map.w; tx++) {
      let ok = true;
      for (let z = tz; z < tz + SIZE.h && ok; z++) for (let x = tx; x < tx + SIZE.w && ok; x++) ok = at(x, z) === Tile.Floor;
      if (ok && !points.some(p => p.x >= tx - 1 && p.x <= tx + SIZE.w + 1 && p.z >= tz - 1 && p.z <= tz + SIZE.h + 1)) floors.push({ kind: 'floor', tx, tz, ...SIZE });
    }
  const floor = pick(floors, 0x51ed);
  if (!floor) return [];

  const walls: LogoSpot[] = [];
  for (let tz = 0; tz < map.h; tz++)
    for (let tx = 0; tx < map.w; tx++)
      for (const facing of FACINGS) {
        const along = facing.x === 0 ? 'x' : 'z';
        let ok = true;
        for (let i = 0; i < SIZE.w && ok; i++) {
          const x = tx + (along === 'x' ? i : 0), z = tz + (along === 'z' ? i : 0);
          ok = at(x, z) === Tile.Wall && at(x + facing.x, z + facing.z) === Tile.Floor;
        }
        if (ok && Math.hypot(tx - floor.tx, tz - floor.tz) > 8) walls.push({ kind: 'wall', tx, tz, w: SIZE.w, along, facing });
      }
  // a face toward the bottom of the map is seen from above too, not only in first person
  const south = walls.filter(w => w.kind === 'wall' && w.facing.z === 1);
  const wall = pick(south.length ? south : walls, 0xa11);
  return wall ? [floor, wall] : [floor];
}
