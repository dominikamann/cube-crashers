import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Server Farm": long rows of server racks with aisles between them, cooling fans that blow you along some
 * aisles (conveyors), cable trays to jump (low walls with ramps), and the glowing core in the middle.
 */
const b = new GridBuilder(70, 70);
// rows of racks, broken up so the aisles connect
for (const z of [6, 14, 22, 44, 52, 60]) {
  b.fill(4, 15, z, z + 1, '#').fill(19, 30, z, z + 1, '#').fill(39, 50, z, z + 1, '#').fill(54, 65, z, z + 1, '#');
}
// cooling fans: the aisles next to the core blow toward the middle
b.fill(19, 30, 10, 11, 'R').fill(39, 50, 10, 11, 'L').fill(19, 30, 56, 57, 'R').fill(39, 50, 56, 57, 'L');
// the core: a block of machines with a ring round it
b.fill(30, 39, 30, 39, '#');
b.fill(33, 36, 33, 36, '#');
b.fill(31, 38, 31, 38, '.').fill(33, 36, 33, 36, '#');
// cable trays to jump over
for (const [x, z] of [[8, 27], [56, 27], [8, 39], [56, 39]]) b.fill(x, x + 5, z, z, '^').fill(x, x + 5, z + 1, z + 1, '=').fill(x, x + 5, z + 2, z + 2, '^');
// coolant spills
b.fill(23, 26, 28, 29, '~').fill(43, 46, 40, 41, '~');
// the spawn corridor and the elevator
b.fill(31, 38, 62, 68, '.');
b.put('S', [35, 64]).put('E', [35, 67]);

b.put('N', [10, 18], [59, 18], [24, 33], [45, 33], [10, 48], [59, 48]);
b.autoNestSurroundings();

b.put('V', [33, 58], [3, 64], [66, 64]);
b.put('*', [17, 3], [52, 3], [35, 26], [35, 42], [3, 33], [66, 33]);
b.put('c', [8, 3], [61, 3], [3, 26], [66, 40], [28, 40], [41, 26]);
b.put('w', [3, 3], [35, 3], [66, 3], [3, 18], [35, 18], [66, 18], [3, 33], [66, 33], [3, 48], [35, 48], [66, 48], [3, 66], [66, 66]);

export const floorServersRows = b.rows();
export const floorServers = parseMap('servers', floorServersRows);
