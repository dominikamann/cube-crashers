import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * Lane Defense: one long straight lane, the arcade cabinet at the bottom, monsters marching down from the top.
 * Barriers give cover halfway up, build pads line both sides, and coins and power-ups appear far up the lane
 * so pushing forward pays off.
 */
const W = 19;
const H = 66;
const b = new GridBuilder(W, H);
// side walls with a few bays for the build pads
b.fill(1, 2, 1, H - 2, '#');
b.fill(W - 3, W - 2, 1, H - 2, '#');
for (const z of [12, 24, 36, 48]) {
  b.fill(1, 2, z, z + 3, '.');
  b.fill(W - 3, W - 2, z, z + 3, '.');
  b.put('p', [2, z + 1], [W - 3, z + 1]);
}
// cover halfway: barriers with gaps
b.fill(4, 7, 30, 30, '=');
b.fill(11, 14, 30, 30, '=');
b.fill(7, 11, 44, 44, '=');
// glitch puddles to dodge near the top
b.fill(4, 5, 16, 17, '~');
b.fill(13, 14, 20, 21, '~');
// the cabinet's corner at the bottom, players start in front of it
b.put('E', [9, H - 4]);
b.put('S', [9, H - 8]);
// coins and power-ups far up the lane, monsters come from the top
b.put('*', [5, 10], [13, 10], [9, 22]);
b.put('w', [5, 3], [9, 3], [13, 3]);

export const floorLane = parseMap('lane', b.rows());

/** the arcade cabinet the players defend */
export const LANE_CORE = { x: 9.5, z: H - 3.5 };
