import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { Tile } from '../../src/sim/map/tilemap';
import { logoSpots } from '../../src/render/logo-spots';

describe('AmannLabs logos', () => {
  let walls = 0, maps = 0;
  for (const [id, floor] of Object.entries(FLOORS)) {
    if (floor.kind === 'shaft') continue;
    const map = floor.map;
    const at = (x: number, z: number) => map.tiles[z * map.w + x];
    it(`${id}: one small logo on plain floor and at most one on a wall`, () => {
      const spots = logoSpots(map);
      const onFloor = spots.filter(s => s.kind === 'floor');
      const onWall = spots.filter(s => s.kind === 'wall');
      expect(onFloor).toHaveLength(1);
      expect(onWall.length).toBeLessThanOrEqual(1);
      const points = [map.spawn, map.elevator, ...map.pads.map(p => p.pos), ...map.nestSpots.map(n => n.pos), ...map.vehicleSpots, ...map.powerSpots, ...map.crateSpots];
      for (const s of onFloor) {
        expect([s.w, s.h]).toEqual([4, 1]);
        for (let tz = s.tz; tz < s.tz + s.h; tz++) for (let tx = s.tx; tx < s.tx + s.w; tx++) expect(at(tx, tz)).toBe(Tile.Floor);
        for (const p of points) expect(p.x >= s.tx - 1 && p.x <= s.tx + s.w + 1 && p.z >= s.tz - 1 && p.z <= s.tz + s.h + 1).toBe(false);
      }
      for (const s of onWall) {
        // a straight run of wall blocks, each with open floor in front of the side the logo is on
        for (let i = 0; i < s.w; i++) {
          const x = s.tx + (s.along === 'x' ? i : 0), z = s.tz + (s.along === 'z' ? i : 0);
          expect(at(x, z)).toBe(Tile.Wall);
          expect(at(x + s.facing.x, z + s.facing.z)).toBe(Tile.Floor);
        }
        expect(Math.hypot(s.tx - onFloor[0].tx, s.tz - onFloor[0].tz)).toBeGreaterThan(8);
        walls++;
      }
      maps++;
      expect(logoSpots(map)).toEqual(spots);
    });
  }
  it('most maps also get one on a wall', () => expect(walls).toBeGreaterThanOrEqual(maps - 2));
});
