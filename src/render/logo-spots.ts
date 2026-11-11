import { Tile, type FloorMap } from '../sim/map/tilemap';

/** a patch of floor (in tiles) that gets an AmannLabs logo painted on */
export interface LogoSpot {
  tx: number;
  tz: number;
  w: number;
  h: number;
  /** 'wordmark' = the A plus "AmannLabs" (big, mid-map), 'small' = the same, smaller (near the spawn) */
  kind: 'wordmark' | 'small';
}

const SIZES = { wordmark: { w: 6, h: 2 }, small: { w: 4, h: 1 } };

/**
 * One or two quiet places per map for the logo: plain floor only, one tile clear of anything the game
 * puts there (pads, nests, karts, crates, spawn, elevator). The big one goes first; a smaller one, if there
 * is room, sits near the spawn and well away from it. Always the same spots for the same map.
 */
export function logoSpots(map: FloorMap): LogoSpot[] {
  const points = [map.spawn, map.elevator, ...map.pads.map(p => p.pos), ...map.nestSpots.map(n => n.pos), ...map.vehicleSpots, ...map.powerSpots, ...map.crateSpots];
  const fits = (tx: number, tz: number, w: number, h: number) => {
    if (tx < 0 || tz < 0 || tx + w > map.w || tz + h > map.h) return false;
    for (let z = tz; z < tz + h; z++) for (let x = tx; x < tx + w; x++) if (map.tiles[z * map.w + x] !== Tile.Floor) return false;
    return !points.some(p => p.x >= tx - 1 && p.x <= tx + w + 1 && p.z >= tz - 1 && p.z <= tz + h + 1);
  };
  const candidates = (kind: LogoSpot['kind']) => {
    const { w, h } = SIZES[kind];
    const out: LogoSpot[] = [];
    for (let tz = 0; tz < map.h; tz++) for (let tx = 0; tx < map.w; tx++) if (fits(tx, tz, w, h)) out.push({ tx, tz, w, h, kind });
    return out;
  };
  // the most central spot reads best from the camera; a hash of the map id breaks ties between maps
  const cx = map.w / 2, cz = map.h / 2;
  let seed = 0;
  for (const ch of map.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const score = (s: LogoSpot) => Math.hypot(s.tx + s.w / 2 - cx, s.tz + s.h / 2 - cz) + ((s.tx * 7 + s.tz * 13 + seed) % 5);
  const words = candidates('wordmark').sort((a, b) => score(a) - score(b));
  const first = words[0] ?? candidates('small').sort((a, b) => score(a) - score(b))[0];
  if (!first) return [];
  const spots = [first];
  if (first.kind === 'wordmark') {
    const far = candidates('small').filter(m => Math.hypot(m.tx - first.tx, m.tz - first.tz) > 10 && (m.tx + m.w < first.tx || m.tx > first.tx + first.w || m.tz + m.h < first.tz || m.tz > first.tz + first.h));
    // the small one greets the players: the free spot nearest the spawn (but a few steps off it)
    const fromSpawn = (m: LogoSpot) => Math.abs(Math.hypot(m.tx + m.w / 2 - map.spawn.x, m.tz + m.h / 2 - map.spawn.z) - 5);
    const second = far.sort((a, b) => fromSpawn(a) - fromSpawn(b) || score(a) - score(b))[0];
    if (second) spots.push(second);
  }
  return spots;
}
