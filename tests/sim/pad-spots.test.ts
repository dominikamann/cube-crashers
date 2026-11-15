import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { Tile } from '../../src/sim/map/tilemap';
import { PAD_SIZE } from '../../src/sim/systems/towers';

/** the floors that do something: a pad must not lie on one of these, not even with its edge */
const EFFECT = new Set<Tile>([Tile.Hazard, Tile.Boost, Tile.Ramp, Tile.ConveyorN, Tile.ConveyorE, Tile.ConveyorS, Tile.ConveyorW]);

describe('build pads', () => {
  for (const [id, floor] of Object.entries(FLOORS)) {
    const map = floor.map;
    const at = (x: number, z: number) => map.tiles[z * map.w + x];
    const grass = new Set((map.grass ?? []).map(g => `${Math.floor(g.x)},${Math.floor(g.z)}`));
    it(`${id}: no pad lies on a conveyor, a puddle, a boost strip, a ramp or in tall grass, not even with its edge`, () => {
      for (const p of map.pads) {
        expect(at(Math.floor(p.pos.x), Math.floor(p.pos.z)), `pad ${p.id} at ${p.pos.x},${p.pos.z}`).toBe(Tile.Floor);
        // the pad is wider than its tile: the tiles its edges reach into count too (an edge under a wall is hidden
        // by the wall and fine)
        const half = PAD_SIZE / 2;
        for (let tz = Math.floor(p.pos.z - half); tz <= Math.floor(p.pos.z + half); tz++)
          for (let tx = Math.floor(p.pos.x - half); tx <= Math.floor(p.pos.x + half); tx++) {
            expect(EFFECT.has(at(tx, tz)), `pad ${p.id} at ${p.pos.x},${p.pos.z} reaches tile ${at(tx, tz)} at ${tx},${tz}`).toBe(false);
            expect(grass.has(`${tx},${tz}`), `pad ${p.id} at ${p.pos.x},${p.pos.z} reaches grass at ${tx},${tz}`).toBe(false);
          }
      }
    });
  }
});
