import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * Glitch Maze: a lattice of two-tile corridors with some segments walled off, a ghost cage in the middle and
 * a power cube in every corner. Every corridor tile holds a pixel to collect.
 */
const W = 43;
const H = 33;
const b = new GridBuilder(W, H);
b.fill(1, W - 2, 1, H - 2, '#');
const LINES_X = [2, 7, 12, 17, 22, 27, 32, 37];
const LINES_Z = [2, 7, 12, 17, 22, 27];
for (const z of LINES_Z) b.fill(2, 38, z, z + 1, '.');
for (const x of LINES_X) b.fill(x, x + 1, 2, 28, '.');
// close some segments so it is a maze, not a grid (mirrored left/right so both halves play the same)
const closed: [number, number, number, number][] = [
  [9, 11, 2, 3], [4, 6, 12, 13], [9, 11, 22, 23], [2, 3, 19, 21], [12, 13, 4, 6], [12, 13, 24, 26],
  [14, 16, 17, 18], [4, 6, 27, 28], [17, 18, 9, 11],
];
for (const [x0, x1, z0, z1] of closed) {
  b.fill(x0, x1, z0, z1, '#');
  // the corridors span x 2..38: mirror around their middle
  b.fill(40 - x1, 40 - x0, z0, z1, '#');
}
// the ghost cage in the middle: an open room
b.fill(18, 23, 13, 16, '.');
// start at the bottom middle, the (unused) elevator next to it
b.put('S', [20, 27]);
b.put('E', [21, 28]);

export const floorMaze = parseMap('maze', b.rows());

/** power cubes, one in each corner */
export const MAZE_CUBES = [
  { x: 3, z: 3 },
  { x: 38, z: 3 },
  { x: 3, z: 28 },
  { x: 38, z: 28 },
];
/** where the ghosts start and come back to */
export const MAZE_CAGE = { x: 20.5, z: 15.5 };
