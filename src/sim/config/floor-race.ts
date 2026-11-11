import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * Kart Rally: a closed circuit driven clockwise. Top straight with a jump over a barrier (or the narrow way
 * round it), boost pads down the right side, an S-bend round a block on the bottom straight, and a narrow
 * walled canyon ("the tunnel") up the left side with glitch puddles to dodge.
 */
const W = 60;
const H = 40;
const b = new GridBuilder(W, H);
// everything is wall, then the track is carved out
b.fill(1, W - 2, 1, H - 2, '#');
// the ring: 8 tiles wide
b.fill(2, W - 3, 2, 9, '.');
b.fill(2, W - 3, H - 10, H - 3, '.');
b.fill(2, 9, 2, H - 3, '.');
b.fill(W - 10, W - 3, 2, H - 3, '.');
// top straight: ramps, a barrier to jump, a narrow way round it at the infield side
b.fill(26, 27, 2, 7, '^');
b.fill(30, 31, 2, 7, '=');
// right straight: boost pads
b.fill(W - 8, W - 5, 14, 18, '>');
b.fill(W - 8, W - 5, 24, 26, '>');
// bottom straight: a block in the middle of the road makes an S-bend
b.fill(26, 33, H - 10, H - 7, '#');
b.fill(18, 20, H - 6, H - 3, '#');
// left side: the canyon, walled in to 4 tiles, with glitch puddles
b.fill(2, 3, 13, H - 14, '#');
b.fill(8, 9, 13, H - 14, '#');
b.fill(5, 6, 18, 19, '~');
b.fill(4, 5, 26, 27, '~');
// start grid and the (unused) elevator spot behind it
b.put('S', [12, 5]);
b.put('E', [4, 4]);
// monsters appear along the track
b.put('w', [20, 5], [40, 4], [54, 10], [55, 30], [44, 34], [12, 34], [6, 22]);

export const floorRace = parseMap('race', b.rows());

/** checkpoints in driving order; 0 is the start/finish line. Inclusive tile rectangles across the track. */
export const RACE_CHECKPOINTS: { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: 14, x1: 15, z0: 2, z1: 9 },
  { x0: W - 10, x1: W - 3, z0: 20, z1: 21 },
  { x0: 40, x1: 41, z0: H - 10, z1: H - 3 },
  { x0: 4, x1: 7, z0: 20, z1: 21 },
];

/** starting places on the grid, one per player, behind the line */
export const RACE_GRID = [
  { x: 11.5, z: 3.5 },
  { x: 11.5, z: 6.5 },
  { x: 9.5, z: 5 },
  { x: 7.5, z: 3.5 },
  { x: 7.5, z: 6.5 },
  { x: 5.5, z: 5 },
];
