import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/** The elevator platform for the ride between floors: a round deck, everything around it is open shaft. */
const SIZE = 25;
const C = 12;
const R = 9.5;
const b = new GridBuilder(SIZE, SIZE);
for (let z = 1; z < SIZE - 1; z++) {
  for (let x = 1; x < SIZE - 1; x++) {
    if (Math.hypot(x + 0.5 - (C + 0.5), z + 0.5 - (C + 0.5)) > R) b.put('#', [x, z]);
  }
}
// a few crates on the deck as cover
b.fill(8, 8, 8, 8, '=').fill(16, 16, 8, 8, '=').fill(8, 8, 16, 16, '=').fill(16, 16, 16, 16, '=');
b.put('S', [C, C]).put('E', [C, C + 3]);

export const floorShaft = parseMap('shaft', b.rows());
export const SHAFT_CENTER = { x: C + 0.5, z: C + 0.5 };
/** swarmers appear on this circle, out over the open shaft */
export const SHAFT_SPAWN_RADIUS = 11.5;
