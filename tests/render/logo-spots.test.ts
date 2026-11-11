import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { Tile } from '../../src/sim/map/tilemap';
import { logoSpots } from '../../src/render/logo-spots';

describe('AmannLabs floor logos', () => {
  for (const [id, floor] of Object.entries(FLOORS)) {
    if (floor.kind === 'shaft') continue;
    const map = floor.map;
    it(`${id}: one or two logos on plain floor, clear of pads and spots`, () => {
      const spots = logoSpots(map);
      expect(spots.length).toBeGreaterThanOrEqual(1);
      expect(spots.length).toBeLessThanOrEqual(2);
      const points = [map.spawn, map.elevator, ...map.pads.map(p => p.pos), ...map.nestSpots.map(n => n.pos), ...map.vehicleSpots, ...map.powerSpots, ...map.crateSpots];
      for (const s of spots) {
        for (let tz = s.tz; tz < s.tz + s.h; tz++) for (let tx = s.tx; tx < s.tx + s.w; tx++) expect(map.tiles[tz * map.w + tx]).toBe(Tile.Floor);
        for (const p of points) expect(p.x >= s.tx - 1 && p.x <= s.tx + s.w + 1 && p.z >= s.tz - 1 && p.z <= s.tz + s.h + 1).toBe(false);
      }
      if (spots.length === 2) {
        const [a, b] = spots;
        expect(Math.hypot(a.tx - b.tx, a.tz - b.tz)).toBeGreaterThan(10);
        expect(spots.map(s => s.kind)).toEqual(['wordmark', 'small']);
      }
      expect(logoSpots(map)).toEqual(spots);
    });
  }
});
