import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Uplink Dish": the very top of the tower, a satellite ground station at dusk. The giant dish stands on its
 * pedestal in the middle (the bowl hangs high over the floor, you walk under it), its live feeder lines run
 * out from the pedestal to the four sides as boost lanes with a junction cabinet at the end of three of them,
 * the north half is the open apron where the boss waits. Equipment cabinets, two cable trays to jump, the
 * control room and the transmitter hall by the spawn are the cover; the two transformer yards at the sides
 * are live gratings (hazard) that no monster sets foot on.
 */
const W = 62;
const H = 58;
const b = new GridBuilder(W, H);
// the pedestal of the dish (one patch of wall heights, so its blocks are level)
b.fill(30, 31, 28, 29, '#');
// the feeder lines: live cable trenches out from the pedestal, a jolt of speed along them (a tile of plain floor
// lies between a line and every block it runs up to: a lit strip that touches a block looks cut off under it)
b.fill(30, 31, 22, 26, '>').fill(30, 31, 31, 35, '>').fill(23, 28, 28, 29, '>').fill(33, 38, 28, 29, '>');
// junction cabinets where three of the lines end (the north one runs out onto the apron)
b.fill(20, 21, 28, 29, '#').fill(40, 41, 28, 29, '#').fill(30, 31, 37, 38, '#');
// equipment cabinets: cover on the apron and in the south, generators in the corners by the spawn
for (const [x, z] of [[12, 14], [48, 14], [12, 42], [48, 42], [6, 52], [54, 52]]) b.fill(x, x + 1, z, z + 1, '#');
// transformers along the north parapet, antenna masts on them
b.fill(8, 10, 4, 5, '#').fill(52, 54, 4, 5, '#');
// the transformer yards: live gratings at the east and west sides
b.fill(2, 6, 26, 31, '~').fill(55, 59, 26, 31, '~');
// cable trays to jump over (low walls with a ramp on each side)
for (const x of [16, 43]) b.fill(x, x, 34, 39, '^').fill(x + 1, x + 1, 34, 39, '=').fill(x + 2, x + 2, 34, 39, '^');
// the control room and the transmitter hall, either side of the way in
b.fill(5, 14, 44, 48, '#').fill(47, 56, 44, 48, '#');
// the spawn and the elevator (the way up is over: from here only the way down)
b.put('S', [31, 50]).put('E', [31, 53]);

b.put('p', [16, 20], [46, 20], [31, 12], [14, 30], [48, 30], [20, 44], [42, 44]);
b.put('V', [24, 52], [38, 52]);
b.put('*', [12, 8], [50, 8], [31, 42], [8, 38], [54, 38]);
b.put('c', [4, 10], [57, 10], [31, 45]);
b.put('w', [8, 8], [31, 10], [54, 8], [8, 22], [26, 24], [36, 24], [54, 22], [10, 36], [34, 33], [31, 41], [52, 36], [20, 50], [42, 50]);

export const floorUplinkRows = b.rows();
export const floorUplink = parseMap('uplink', floorUplinkRows);
