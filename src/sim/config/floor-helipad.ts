import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Sky Helipad": the landing pad on top of the tower. The big H in the middle is open ground for a long worm,
 * a parked helicopter at its edge is cover, and the wash of its idling rotor blows across the top of the pad
 * (conveyors). Fuel tanks, a control hut, floodlight towers and jersey barriers for cover; the roof ends in a
 * glitchy edge all around, with a railing that has seen better days.
 */
const W = 60;
const H = 54;
/**
 * Where everything stands, in tiles (inclusive block corners): the decoration draws the helicopter, the tanks,
 * the hut's beacon and the pad's markings and lights by these, so the picture and the map never drift apart.
 */
export const HELIPAD = {
  /** the pad's middle and radius: the painted rings, the H and the edge lights follow it */
  pad: { x: 30, z: 26, r: 10 },
  /** the parked helicopter: its body (wall blocks, the nose to the east) and the tail boom west of it (low walls) */
  heli: { x0: 20, x1: 22, z0: 17, z1: 18, tailX0: 16, tailX1: 19, tailZ: 17 },
  /** the rotor wash: it sweeps east across the top of the pad */
  wash: { x0: 23, x1: 36, z0: 17, z1: 18 },
  /** two fuel tanks with a pipe between them */
  tanks: [{ x0: 48, z0: 10 }, { x0: 52, z0: 10 }],
  pipe: { x0: 50, x1: 51, z: 11 },
  /** the plant room: a row of air handlers */
  plant: { x0: 5, x1: 12, z0: 6, z1: 7 },
  /** the control hut by the way in */
  hut: { x0: 6, x1: 13, z0: 41, z1: 43 },
  /** a shipping container in the far corner */
  container: { x0: 47, x1: 54, z0: 46, z1: 47 },
  /** floodlight towers round the pad */
  towers: [[17, 13], [43, 13], [17, 39], [43, 39]] as [number, number][],
  /** jersey barriers left and right of the pad */
  barriers: [{ x: 15, z0: 23, z1: 29 }, { x: 44, z0: 23, z1: 29 }],
  /** the walkway from the elevator up to the pad */
  walkway: { x: 30, z0: 37, z1: 45 },
};
const b = new GridBuilder(W, H);
// glitchy edge all around
b.fill(1, W - 2, 1, 2, '~').fill(1, W - 2, H - 3, H - 2, '~').fill(1, 2, 1, H - 2, '~').fill(W - 3, W - 2, 1, H - 2, '~');
// the helicopter at the pad's north-west edge, its tail boom lying west of it, and its rotor wash
const { heli, wash } = HELIPAD;
b.fill(heli.x0, heli.x1, heli.z0, heli.z1, '#').fill(heli.tailX0, heli.tailX1, heli.tailZ, heli.tailZ, '=');
b.fill(wash.x0, wash.x1, wash.z0, wash.z1, 'R');
// the fuel tanks and their pipe, the plant room, the control hut and the container
for (const t of HELIPAD.tanks) b.fill(t.x0, t.x0 + 1, t.z0, t.z0 + 1, '#');
b.fill(HELIPAD.pipe.x0, HELIPAD.pipe.x1, HELIPAD.pipe.z, HELIPAD.pipe.z, '=');
for (const r of [HELIPAD.plant, HELIPAD.hut, HELIPAD.container]) b.fill(r.x0, r.x1, r.z0, r.z1, '#');
// jersey barriers to jump, and the floodlight towers
for (const r of HELIPAD.barriers) b.fill(r.x, r.x, r.z0, r.z1, '=');
for (const [x, z] of HELIPAD.towers) b.put('#', [x, z]);
// the spawn and the elevator at the south, a walkway up to the pad
b.put('S', [30, 46]).put('E', [30, 49]);
b.put('p', [14, 19], [46, 19], [14, 34], [46, 34], [30, 9], [8, 29], [52, 29]);
b.put('V', [24, 46]);
b.put('*', [22, 30], [38, 30], [30, 12], [30, 40]);
b.put('c', [14, 5], [52, 7], [7, 47], [44, 46]);
b.put('w', [12, 26], [48, 26], [30, 6], [30, 38], [8, 9], [54, 15], [8, 46], [52, 44]);

export const floorHelipad = parseMap('helipad', b.rows());
