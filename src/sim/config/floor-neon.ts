import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Neon City": city blocks with streets in between. Some blocks are open plazas with a nest each.
 * A long avenue with boost strips and two ramps over low barriers, neon puddles on the corners.
 */
const b = new GridBuilder(70, 70);
const blocks = [6, 21, 39, 54];
for (const x of blocks) for (const z of blocks) b.fill(x, x + 9, z, z + 9, '#');
// plazas: these blocks are open squares
for (const [x, z] of [[6, 6], [54, 6], [6, 39], [54, 39], [21, 21], [39, 21]]) {
  b.fill(x, x + 9, z, z + 9, '.');
  b.put('#', [x + 1, z + 1], [x + 8, z + 1], [x + 1, z + 8], [x + 8, z + 8]);
}
// the spawn street and the elevator
b.fill(31, 38, 54, 68, '.');
b.put('S', [35, 63]).put('E', [35, 67]);
// boost avenue and ramps over low barriers
b.fill(2, 4, 18, 50, '>');
b.fill(65, 67, 18, 50, '>');
b.fill(16, 20, 34, 34, '^').fill(16, 20, 36, 37, '=').fill(16, 20, 39, 39, '^');
b.fill(49, 53, 34, 34, '^').fill(49, 53, 36, 37, '=').fill(49, 53, 39, 39, '^');
// neon puddles
b.fill(17, 19, 23, 25, '~').fill(50, 52, 44, 46, '~').fill(32, 37, 34, 35, '~');

b.put('N', [11, 11], [59, 11], [11, 44], [59, 44], [26, 26], [44, 26]);
b.autoNestSurroundings();

b.put('V', [33, 58], [3, 60], [66, 60]);
b.put('*', [26, 3], [44, 3], [26, 66], [44, 66], [33, 18], [33, 50]);
b.put('c', [8, 8], [61, 8], [8, 47], [61, 47], [33, 3], [36, 31]);
b.put(
  'w',
  [3, 3], [18, 3], [35, 3], [51, 3], [66, 3], [3, 18], [18, 18], [35, 18], [51, 18], [66, 18],
  [3, 35], [35, 35], [66, 35], [3, 51], [18, 51], [35, 51], [51, 51], [66, 51],
);

export const floorNeonRows = b.rows();
export const floorNeon = parseMap('neon', floorNeonRows);
