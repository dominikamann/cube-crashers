import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * Kart Rally: a winding circuit driven clockwise.
 * - the start straight along the top, with a jump over a barrier (or a squeeze past it on the inside)
 * - the boost run down the right side
 * - back along the bottom, weaving between glitch puddles
 * - a conveyor belt that pushes you up the left side
 * - the infield: east through the long bend, a hairpin, back west round a glitch puddle
 * - the tunnel: a narrow climb back onto the start straight
 */
const W = 72;
const H = 48;
const b = new GridBuilder(W, H);
// everything is wall, then the track is carved out (roads are 6 tiles wide)
b.fill(1, W - 2, 1, H - 2, '#');
b.fill(2, W - 3, 2, 7, '.'); // start straight
b.fill(W - 8, W - 3, 2, H - 3, '.'); // right side
b.fill(2, W - 3, H - 8, H - 3, '.'); // bottom
b.fill(2, 7, 28, H - 3, '.'); // left side, up to the infield
b.fill(2, 50, 28, 33, '.'); // infield, heading east
b.fill(45, 50, 18, 33, '.'); // the hairpin
b.fill(14, 50, 18, 23, '.'); // infield, heading west
b.fill(14, 19, 8, 23, '.'); // the tunnel up to the start straight

// start straight: a ramp and a barrier to jump, or the narrow way round it on the inside
b.fill(32, 33, 2, 4, '^');
b.fill(36, 37, 2, 4, '=');
b.fill(32, 37, 5, 5, '#');
// right side: boost pads all the way down
b.fill(W - 7, W - 4, 12, 15, '>');
b.fill(W - 7, W - 4, 24, 27, '>');
// bottom: glitch puddles left and right, a boost in the middle
b.fill(54, 56, H - 8, H - 6, '~');
b.fill(44, 46, H - 5, H - 3, '~');
b.fill(34, 35, H - 7, H - 4, '>');
b.fill(22, 24, H - 8, H - 6, '~');
b.fill(12, 14, H - 5, H - 3, '~');
// left side: the belt pushes north
b.fill(3, 6, 35, 38, 'U');
// infield east: a boost in the long bend
b.fill(26, 27, 29, 32, '>');
// infield west: a glitch puddle in the middle, another in the tunnel
b.fill(30, 33, 20, 21, '~');
b.fill(16, 17, 12, 13, '~');

// the grid sits in the pit at the top left, the (unused) elevator spot behind it
b.put('S', [12, 4]);
b.put('E', [2, 2]);
// monsters appear along the track
b.put('w', [26, 4], [48, 5], [66, 10], [67, 34], [50, 44], [34, 44], [8, 44], [4, 31], [36, 30], [48, 26], [24, 21], [16, 16]);

export const floorRace = parseMap('race', b.rows());

/** checkpoints in driving order; 0 is the start/finish line. Inclusive tile rectangles across the track. */
export const RACE_CHECKPOINTS: { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: 22, x1: 23, z0: 2, z1: 7 },
  { x0: W - 8, x1: W - 3, z0: 20, z1: 21 },
  { x0: 34, x1: 35, z0: H - 8, z1: H - 3 },
  { x0: 2, x1: 7, z0: 40, z1: 41 },
  { x0: 45, x1: 50, z0: 26, z1: 27 },
  { x0: 22, x1: 23, z0: 18, z1: 23 },
  { x0: 14, x1: 19, z0: 10, z1: 11 },
];

/** starting places on the grid, one per player, behind the line: rows of two, the front row first */
export const RACE_GRID = [
  { x: 11.5, z: 3.5 },
  { x: 11.5, z: 6.5 },
  { x: 9.5, z: 3.5 },
  { x: 9.5, z: 6.5 },
  { x: 7.5, z: 3.5 },
  { x: 7.5, z: 6.5 },
  { x: 5.5, z: 3.5 },
  { x: 5.5, z: 6.5 },
  { x: 3.5, z: 3.5 },
  { x: 3.5, z: 6.5 },
];
