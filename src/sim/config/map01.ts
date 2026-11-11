import type { MapDef } from '../types';

export const map01: MapDef = {
  id: 'map01',
  pads: [
    { id: 0, pos: { x: -5.6, z: -14 } },
    { id: 1, pos: { x: 5.6, z: -14 } },
    { id: 2, pos: { x: -5.6, z: -6 } },
    { id: 3, pos: { x: 5.6, z: -6 } },
    { id: 4, pos: { x: -5.6, z: 1 } },
    { id: 5, pos: { x: 5.6, z: 1 } },
    // the risky forward pad in the middle of the lane
    { id: 6, pos: { x: 0, z: -20 } },
  ],
  playerSpawn: { x: 0, z: 5 },
  laneHalfWidth: 4.5,
  spawnZ: -30,
  baseZ: 8,
};
