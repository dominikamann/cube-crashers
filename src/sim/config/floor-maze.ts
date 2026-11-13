import { GridBuilder } from '../map/builder';
import { parseMap, Tile } from '../map/tilemap';
import type { Vec2 } from '../types';

/**
 * Glitch Maze: a lattice of two-tile corridors with some segments walled off, a ghost cage in the middle and
 * a power cube in every corner. A single line of pixels runs down the middle of every corridor.
 */
const W = 33;
const H = 28;
const b = new GridBuilder(W, H);
b.fill(1, W - 2, 1, H - 2, '#');
const LINES_X = [2, 7, 12, 17, 22, 27];
const LINES_Z = [2, 7, 12, 17, 22];
for (const z of LINES_Z) b.fill(2, 28, z, z + 1, '.');
for (const x of LINES_X) b.fill(x, x + 1, 2, 23, '.');
// close some segments so it is a maze, not a grid (mirrored left/right so both halves play the same)
const closed: [number, number, number, number][] = [
  [9, 11, 2, 3], [7, 8, 9, 11], [2, 3, 14, 16], [9, 11, 17, 18], [4, 6, 22, 23],
];
for (const [x0, x1, z0, z1] of closed) {
  b.fill(x0, x1, z0, z1, '#');
  // the corridors span x 2..28: mirror around their middle
  b.fill(30 - x1, 30 - x0, z0, z1, '#');
}
// the ghost cage in the middle: an open room across the middle corridor
b.fill(14, 16, 10, 15, '.');
// start at the bottom middle, the (unused) elevator next to it
b.put('S', [15, 22]);
b.put('E', [16, 23]);

export const floorMaze = parseMap('maze', b.rows());

/** power cubes, one in each corner */
export const MAZE_CUBES = [
  { x: 3, z: 3 },
  { x: 28, z: 3 },
  { x: 3, z: 23 },
  { x: 28, z: 23 },
];
/** where the ghosts start and come back to */
export const MAZE_CAGE = { x: 15.5, z: 13 };

/**
 * The pixels to collect: one line down the middle of every corridor, a pixel per tile of its length (so one
 * wherever four open tiles meet). None in the ghost cage, right at the start or under a power cube.
 */
export const MAZE_DOTS: Vec2[] = [];
for (let z = 1; z < floorMaze.h; z++) {
  for (let x = 1; x < floorMaze.w; x++) {
    const open = (tx: number, tz: number) => floorMaze.tiles[tz * floorMaze.w + tx] === Tile.Floor;
    if (!open(x - 1, z - 1) || !open(x, z - 1) || !open(x - 1, z) || !open(x, z)) continue;
    const far = (p: Vec2, d: number) => Math.hypot(p.x - x, p.z - z) >= d;
    if (!far(MAZE_CAGE, 4) || !far(floorMaze.spawn, 1.5) || MAZE_CUBES.some(c => !far(c, 0.5))) continue;
    MAZE_DOTS.push({ x, z });
  }
}
