import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Pixel Jungle": clumps of giant trees, a swamp running across the middle, fallen logs with ramps over them,
 * and fields of tall grass where monsters lurk unseen until they are close.
 */
const b = new GridBuilder(70, 70);
// clumps of tree trunks (2x2 to 4x3)
const trees: [number, number, number, number][] = [
  [8, 8, 4, 3], [24, 6, 3, 3], [44, 7, 3, 4], [58, 10, 4, 3], [6, 26, 3, 4], [20, 22, 3, 3], [47, 24, 3, 3], [61, 28, 3, 4],
  [12, 44, 4, 3], [28, 47, 3, 3], [42, 45, 3, 3], [57, 46, 4, 3], [16, 58, 3, 3], [52, 58, 3, 3], [34, 14, 2, 2], [33, 40, 2, 2],
];
for (const [x, z, w, h] of trees) b.fill(x, x + w - 1, z, z + h - 1, '#');
// the swamp across the middle, with dry crossings
b.fill(2, 67, 33, 36, '~');
for (const x of [9, 24, 34, 35, 46, 60]) b.fill(x, x + 1, 33, 36, '.');
// fallen logs: low walls with a ramp on each side
for (const [x, z] of [[18, 14], [48, 16], [22, 54], [44, 53]]) b.fill(x, x + 4, z, z, '^').fill(x, x + 4, z + 1, z + 1, '=').fill(x, x + 4, z + 2, z + 2, '^');
// tall grass
const grass: [number, number, number, number][] = [
  [14, 4, 7, 3], [50, 2, 7, 4], [2, 14, 5, 7], [27, 20, 6, 5], [38, 27, 6, 4], [62, 18, 5, 6], [3, 40, 6, 5], [20, 39, 6, 4],
  [50, 38, 7, 4], [62, 52, 5, 6], [8, 52, 5, 4], [36, 56, 6, 5], [26, 62, 5, 4], [45, 63, 6, 3],
];
for (const [x, z, w, h] of grass) for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) if (b.at(xx, zz) === '.') b.put('g', [xx, zz]);
// the spawn clearing and the elevator
b.fill(31, 38, 60, 68, '.');
b.put('S', [35, 63]).put('E', [35, 67]);

b.put('N', [11, 16], [56, 18], [16, 28], [54, 30], [12, 50], [58, 41]);
b.autoNestSurroundings();

b.put('V', [32, 58], [4, 60], [65, 60]);
b.put('*', [25, 3], [45, 3], [26, 44], [44, 42], [5, 31], [64, 37]);
b.put('c', [10, 6], [60, 6], [4, 46], [64, 48], [35, 24], [35, 50]);
b.put('w', [4, 4], [35, 4], [65, 4], [4, 22], [35, 22], [65, 22], [4, 44], [35, 44], [65, 44], [4, 64], [20, 64], [50, 64], [65, 64]);

export const floorJungleRows = b.rows();
export const floorJungle = parseMap('jungle', floorJungleRows);
