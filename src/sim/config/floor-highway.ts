import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Neon Highway": a wide synthwave highway runs across the middle, held up by rows of overpass pillars,
 * with boost lanes and jumps for the karts. North and south of it lie city blocks; the nests sit in
 * plazas under the overpasses and in the backstreets.
 */
const W = 76;
const H = 56;
const b = new GridBuilder(W, H);
// city blocks north and south of the highway
for (const x of [4, 20, 36, 52]) {
  b.fill(x, x + 11, 3, 13, '#');
  b.fill(x, x + 11, 42, 52, '#');
}
// backstreet plazas cut into some blocks (a nest each)
for (const [x, z] of [[4, 3], [52, 3], [20, 42], [52, 42]]) {
  b.fill(x + 2, x + 9, z + 2, z + 8, '.');
  b.fill(x + 5, x + 6, z, z + 1, '.');
}
// the highway: kerbs with gaps, overpass pillars down the median
b.fill(2, W - 3, 18, 18, '=');
b.fill(2, W - 3, 37, 37, '=');
for (const x of [8, 22, 38, 54, 68]) b.fill(x, x + 3, 18, 18, '.').fill(x, x + 3, 37, 37, '.');
for (const x of [12, 24, 36, 48, 60]) b.fill(x, x + 1, 26, 29, '#');
// boost lanes and a jump on each carriageway
b.fill(4, 10, 21, 23, '>').fill(W - 11, W - 5, 32, 34, '>');
b.fill(30, 30, 20, 24, '^').fill(33, 34, 20, 24, '=').fill(37, 37, 20, 24, '^');
b.fill(44, 44, 31, 35, '^').fill(41, 42, 31, 35, '=').fill(38, 38, 31, 35, '^');
// glitch puddles under the overpasses
b.fill(17, 19, 27, 28, '~').fill(55, 57, 27, 28, '~');
// spawn on the southern carriageway, the elevator at the east end
b.put('S', [6, 33]).put('E', [W - 4, 27]);

// nests: two in backstreet plazas north, one south, two in plazas between the pillars
b.put('N', [9, 8], [57, 8], [25, 47], [57, 47], [30, 27], [44, 27]);
// the backstreet plazas are tight: their build pads are placed by hand
for (const [x, z] of [[9, 8], [57, 8], [25, 47], [57, 47]]) b.put('p', [x - 3, z], [x + 3, z]);
b.autoNestSurroundings();

b.put('V', [10, 30], [W - 8, 24], [40, 16]);
b.put('*', [18, 16], [56, 16], [18, 39], [56, 39], [37, 23], [37, 32]);
b.put('c', [7, 5], [60, 5], [28, 45], [60, 45], [16, 27], [62, 30]);
b.put(
  'w',
  [3, 16], [18, 16], [34, 16], [50, 16], [70, 16], [3, 39], [18, 39], [34, 39], [50, 39], [70, 39],
  [6, 22], [20, 33], [52, 22], [68, 33], [17, 2], [49, 2], [17, 53], [49, 53],
);

export const floorHighwayRows = b.rows();
export const floorHighway = parseMap('highway', floorHighwayRows);
