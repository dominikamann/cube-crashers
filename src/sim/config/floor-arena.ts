import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/** "Mega Block Arena": a round sand arena with pillars to hide behind and tower pads around the edge. */
const SIZE = 46;
const C = 23;
const b = new GridBuilder(SIZE, SIZE);
for (let z = 1; z < SIZE - 1; z++) {
  for (let x = 1; x < SIZE - 1; x++) {
    const d = Math.hypot(x + 0.5 - C, z + 0.5 - C);
    if (d > 20.5 && !(x >= 20 && x <= 26 && z > C)) b.put('#', [x, z]);
  }
}
// the entrance corridor at the bottom with the elevator
b.fill(20, 26, 40, 44, '.');
for (const [x, z] of [[14, 14], [31, 14], [14, 31], [31, 31], [22, 9], [9, 22], [36, 22]]) b.fill(x, x + 1, z, z + 1, '#');
b.put('S', [23, 40]).put('E', [23, 43]);
b.put('p', [10, 10], [35, 10], [10, 35], [35, 35], [23, 5], [5, 23], [40, 23]);
b.put('V', [18, 37]);
b.put('*', [17, 23], [29, 23], [23, 17], [23, 29]);
b.put('c', [6, 18], [39, 28]);
b.put('w', [12, 23], [33, 23], [23, 12], [23, 33], [16, 16], [30, 16], [16, 30], [30, 30]);

export const floorArena = parseMap('arena', b.rows());
