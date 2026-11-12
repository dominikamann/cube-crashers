import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Sunken Arcade": a boss floor on the sea bed. Coral reefs and old cabinet wrecks for cover around a wide
 * open middle where the Kraken waits, kelp beds (hazard) at the edges, currents (conveyors) that carry you.
 */
const b = new GridBuilder(60, 60);
// coral reefs and wrecks
for (const [x, z, w, h] of [
  [8, 8, 4, 3], [48, 8, 4, 3], [8, 48, 4, 3], [48, 48, 4, 3], [18, 18, 2, 3], [40, 18, 2, 3], [18, 38, 2, 3], [40, 38, 2, 3],
  [4, 28, 3, 4], [53, 28, 3, 4], [28, 4, 4, 2], [28, 52, 4, 2],
] as [number, number, number, number][]) b.fill(x, x + w - 1, z, z + h - 1, '#');
// kelp beds: stinging hazard
b.fill(2, 5, 14, 20, '~').fill(54, 57, 38, 44, '~').fill(14, 20, 54, 57, '~').fill(40, 46, 2, 5, '~');
// currents along the sides
b.fill(12, 13, 22, 36, 'U').fill(46, 47, 22, 36, 'D');
// the spawn and the elevator (the way up)
b.fill(27, 32, 54, 58, '.');
b.put('S', [30, 55]).put('E', [30, 57]);

b.put('V', [20, 52], [40, 52]);
b.put('*', [10, 30], [50, 30], [30, 12], [30, 46]);
b.put('c', [14, 14], [45, 14], [14, 45], [45, 45]);
b.put('w', [6, 6], [30, 8], [54, 6], [8, 30], [52, 30], [6, 54], [54, 54], [30, 30]);

export const floorUnderwaterRows = b.rows();
export const floorUnderwater = parseMap('underwater', floorUnderwaterRows);
