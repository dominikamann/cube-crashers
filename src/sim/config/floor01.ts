import { parseMap } from '../map/tilemap';

/**
 * "Arcade Plaza": an outer band of rooms (7 nest rooms + the spawn room), a ring road for the kart,
 * and an open plaza in the middle. Built from rectangles into a text grid, then parsed like any map.
 */
const SIZE = 70;
const grid: string[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => '.'));

/** fills the inclusive rectangle x0..x1, z0..z1 */
function fill(x0: number, x1: number, z0: number, z1: number, ch: string): void {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z][x] = ch;
}
function put(ch: string, ...points: [number, number][]): void {
  for (const [x, z] of points) grid[z][x] = ch;
}

// border
fill(0, 69, 0, 0, '#');
fill(0, 69, 69, 69, '#');
fill(0, 0, 0, 69, '#');
fill(69, 69, 0, 69, '#');

// frame between the outer rooms and the ring road, with doors
fill(11, 58, 11, 12, '#');
fill(11, 58, 57, 58, '#');
fill(11, 12, 11, 58, '#');
fill(57, 58, 11, 58, '#');
for (const [a, b] of [[19, 21], [30, 32], [37, 39], [48, 50]]) {
  fill(a, b, 11, 12, '.');
  fill(11, 12, a, b, '.');
  fill(57, 58, a, b, '.');
}
for (const [a, b] of [[19, 21], [33, 36], [48, 50]]) fill(a, b, 57, 58, '.');

// walls that split the outer band into rooms, each with a door
for (const a of [24, 44]) {
  fill(a, a + 1, 1, 10, '#');
  fill(a, a + 1, 4, 6, '.');
  fill(a, a + 1, 59, 68, '#');
  fill(a, a + 1, 62, 64, '.');
  fill(1, 10, a, a + 1, '#');
  fill(4, 6, a, a + 1, '.');
  fill(59, 68, a, a + 1, '#');
  fill(62, 64, a, a + 1, '.');
}

// buildings between the ring road and the plaza; streets in the middle of each side, corners open
fill(23, 46, 19, 22, '#');
fill(23, 46, 47, 50, '#');
fill(19, 22, 23, 46, '#');
fill(47, 50, 23, 46, '#');
fill(33, 36, 19, 22, '.');
fill(33, 36, 47, 50, '.');
fill(19, 22, 33, 36, '.');
fill(47, 50, 33, 36, '.');

// plaza: four pillars and a glitch pool in the centre
for (const [x, z] of [[28, 28], [40, 28], [28, 40], [40, 40]]) fill(x, x + 1, z, z + 1, '#');
fill(33, 36, 33, 36, '~');

// ring road: glitch strip in the north, low walls with ramps east and west, boost tiles on the straights
fill(34, 35, 13, 18, '~');
fill(15, 18, 33, 34, '=');
fill(15, 18, 31, 31, '^');
fill(15, 18, 36, 36, '^');
fill(51, 54, 33, 34, '=');
fill(51, 54, 31, 31, '^');
fill(51, 54, 36, 36, '^');
fill(22, 25, 14, 17, '>');
fill(44, 47, 52, 55, '>');
fill(22, 25, 52, 55, '>');
fill(52, 55, 22, 25, '>');
fill(14, 17, 44, 47, '>');

// spawn room
put('S', [35, 62]);
put('E', [35, 66]);

// nest spots with their pads and rush entries
put('N', [6, 6], [35, 5], [63, 6], [5, 35], [64, 35], [6, 63], [63, 63]);
put(
  'p',
  [12, 4], [12, 8], [4, 12], [8, 12],
  [29, 9], [34, 9], [36, 9], [41, 9],
  [57, 4], [57, 8], [65, 12], [61, 12],
  [9, 29], [9, 34], [9, 36], [9, 41],
  [60, 29], [60, 34], [60, 36], [60, 41],
  [12, 61], [12, 65], [4, 57], [8, 57],
  [57, 61], [57, 65], [65, 57], [61, 57],
  [31, 56], [38, 56],
);
put(
  'r',
  [18, 15], [15, 18],
  [30, 16], [40, 16], [35, 24],
  [51, 15], [54, 18],
  [16, 30], [16, 40], [24, 35],
  [53, 30], [53, 40], [45, 35],
  [18, 54], [15, 51],
  [51, 54], [54, 51],
);

put('V', [30, 54], [14, 26], [55, 44], [42, 16]);
put('*', [30, 30], [39, 30], [30, 39], [39, 39], [35, 26], [35, 43], [15, 15], [54, 15], [15, 54], [54, 54]);
put('c', [2, 2], [67, 2], [2, 67], [67, 67], [21, 5], [48, 5], [5, 21], [5, 48], [64, 21], [64, 48], [25, 25], [44, 44]);
put(
  'w',
  [16, 14], [28, 14], [44, 14], [53, 14], [55, 28], [55, 42], [53, 55], [42, 55], [28, 55], [16, 55], [14, 42], [14, 28],
  [27, 27], [42, 27], [27, 42], [42, 42], [35, 29], [35, 41],
  [15, 5], [54, 5], [5, 15], [5, 54], [64, 15], [64, 54],
);

export const floor01Rows: string[] = grid.map(row => row.join(''));
export const floor01 = parseMap('floor01', floor01Rows);
