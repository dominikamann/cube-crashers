import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Candy Factory": nine halls in a 3×3 grid with doors between them. Conveyor belts run around the
 * middle hall and along two halls, melted-candy puddles (glitch floor) and low candy walls make cover.
 */
const b = new GridBuilder(70, 70);
for (const a of [23, 45]) {
  b.fill(a, a + 1, 1, 68, '#');
  b.fill(1, 68, a, a + 1, '#');
}
for (const a of [23, 45]) {
  for (const [d0, d1] of [[10, 13], [33, 36], [56, 59]]) {
    b.fill(a, a + 1, d0, d1, '.');
    b.fill(d0, d1, a, a + 1, '.');
  }
}

// the middle hall: a conveyor loop
b.fill(27, 42, 29, 29, 'R');
b.fill(42, 42, 29, 40, 'D');
b.fill(27, 42, 40, 40, 'L');
b.fill(27, 27, 29, 40, 'U');
b.fill(32, 37, 33, 36, '=');
// belts through two halls
b.fill(27, 42, 15, 15, 'R');
b.fill(3, 20, 52, 52, 'L');
// candy puddles and low candy walls
b.fill(8, 10, 30, 32, '~').fill(59, 61, 37, 39, '~').fill(56, 58, 8, 9, '~');
b.fill(15, 18, 14, 14, '=').fill(51, 54, 55, 55, '=').fill(39, 42, 4, 4, '=').fill(60, 63, 28, 28, '=');

// candy machines: 3×3 blocks in the corners of the outer halls, cover in the big open floors (the middle hall
// with its conveyor loop and the hall you start in stay open). Each sits inside one 4×4 patch of the grid, so
// the whole block has the same height (walls come in a few heights by 4×4 patch)
const MACHINE_AT: Record<number, number[]> = { 1: [5, 17], 25: [28, 41], 47: [49, 61] };
for (const [x0, z0] of [[1, 1], [25, 1], [47, 1], [1, 25], [47, 25], [1, 47], [47, 47]]) {
  for (const x of MACHINE_AT[x0])
    for (const z of MACHINE_AT[z0]) {
      // the crate in the lower right hall's corner stays reachable
      if (x === 49 && z === 49) continue;
      b.fill(x, x + 2, z, z + 2, '#');
    }
}

b.put('S', [35, 61]).put('E', [35, 66]);
b.put('N', [11, 11], [35, 11], [58, 11], [11, 35], [58, 35], [11, 58], [58, 58]);
b.autoNestSurroundings();

b.put('V', [30, 52], [40, 52], [20, 35]);
b.put('*', [30, 33], [39, 33], [30, 37], [39, 37], [35, 19], [35, 27]);
b.put('c', [3, 3], [66, 3], [3, 66], [66, 66], [20, 20], [49, 49], [49, 20]);
b.put(
  'w',
  [11, 18], [31, 19], [58, 18], [18, 35], [50, 35], [11, 50], [58, 50], [35, 50],
  [24, 12], [24, 35], [24, 57], [46, 12], [46, 35], [46, 57], [12, 24], [35, 24], [57, 24], [12, 46], [57, 46],
);

export const floorCandyRows = b.rows();
export const floorCandy = parseMap('candy', floorCandyRows);
