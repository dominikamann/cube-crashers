import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/** "Rooftop": the top of the tower. Air vents as cover, a glitchy edge, room for a long worm. */
const W = 56;
const H = 50;
const b = new GridBuilder(W, H);
// glitchy edge all around
b.fill(1, W - 2, 1, 2, '~').fill(1, W - 2, H - 3, H - 2, '~').fill(1, 2, 1, H - 2, '~').fill(W - 3, W - 2, 1, H - 2, '~');
// air vents and a water tank
for (const [x, z] of [[10, 10], [43, 10], [10, 34], [43, 34], [26, 18], [26, 28]]) b.fill(x, x + 2, z, z + 2, '#');
b.fill(18, 20, 22, 26, '=').fill(35, 37, 22, 26, '=');
b.fill(27, 28, 40, 47, '.');
b.put('S', [28, 42]).put('E', [28, 45]);
b.put('p', [16, 16], [40, 16], [16, 32], [40, 32], [28, 9], [8, 24], [48, 24]);
b.put('V', [20, 42]);
b.put('*', [22, 24], [34, 24], [28, 14], [28, 36]);
b.put('c', [6, 6], [49, 6]);
b.put('w', [14, 24], [42, 24], [28, 6], [28, 38], [8, 8], [47, 8], [8, 40], [47, 40]);

export const floorRooftop = parseMap('rooftop', b.rows());
