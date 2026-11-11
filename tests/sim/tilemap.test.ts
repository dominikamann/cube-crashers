import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos, moveCircle, parseMap, reachable, Tile, tileAt } from '../../src/sim/map/tilemap';
import { Rng } from '../../src/sim/rng';
import type { Vec2 } from '../../src/sim/types';

const SAMPLE = ['#######', '#S....#', '#.##=.#', '#.....#', '#..E..#', '#######'];
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

function overlapsBlocking(m: typeof floor01, p: Vec2, r: number): boolean {
  for (let tz = Math.floor(p.z - r); tz <= Math.floor(p.z + r); tz++) {
    for (let tx = Math.floor(p.x - r); tx <= Math.floor(p.x + r); tx++) {
      if (!BLOCKS_WALKER(tileAt(m, tx + 0.5, tz + 0.5))) continue;
      const cx = Math.max(tx, Math.min(p.x, tx + 1)), cz = Math.max(tz, Math.min(p.z, tz + 1));
      if (Math.hypot(p.x - cx, p.z - cz) < r - 1e-6) return true;
    }
  }
  return false;
}

describe('parseMap', () => {
  it('reads tiles and markers', () => {
    const m = parseMap('sample', SAMPLE);
    expect([m.w, m.h]).toEqual([7, 6]);
    expect(m.spawn).toEqual({ x: 1.5, z: 1.5 });
    expect(m.elevator).toEqual({ x: 3.5, z: 4.5 });
    expect(tileAt(m, 2.5, 2.5)).toBe(Tile.Wall);
    expect(tileAt(m, 4.5, 2.5)).toBe(Tile.LowWall);
    expect(tileAt(m, 1.5, 1.5)).toBe(Tile.Floor);
    expect(tileAt(m, -3, 2)).toBe(Tile.Wall);
  });

  it('rejects an open border and ragged rows', () => {
    expect(() => parseMap('bad', ['###', '#S.', '#E#', '###'])).toThrow();
    expect(() => parseMap('bad', ['####', '#SE#', '###'])).toThrow();
  });
});

describe('moveCircle', () => {
  it('stops at a wall and slides along it', () => {
    const m = parseMap('sample', SAMPLE);
    const p = { x: 1.5, z: 1.5 };
    const hit = moveCircle(m, p, 2, 2, 0.4, BLOCKS_WALKER);
    expect(hit.hitZ).toBe(true);
    expect(p.z).toBeLessThanOrEqual(1.6 + 1e-6);
    expect(p.x).toBeCloseTo(3.5, 1);
  });

  it('never leaves a walker inside a blocking tile (fuzz)', () => {
    const rng = new Rng(5);
    const p = { ...floor01.spawn };
    for (let i = 0; i < 5000; i++) {
      moveCircle(floor01, p, rng.range(-3, 3), rng.range(-3, 3), 0.4, BLOCKS_WALKER);
      expect(overlapsBlocking(floor01, p, 0.4), `step ${i} at ${p.x},${p.z}`).toBe(false);
    }
  });
});

describe('hasLos', () => {
  it('is blocked by walls but not by low walls', () => {
    const m = parseMap('sample', SAMPLE);
    expect(hasLos(m, { x: 2.5, z: 1.5 }, { x: 2.5, z: 3.5 })).toBe(false);
    expect(hasLos(m, { x: 4.5, z: 1.5 }, { x: 4.5, z: 3.5 })).toBe(true);
  });
});

describe('floor01', () => {
  it('is 70x70 with 7 nest spots that have pads and far-away rush entries', () => {
    expect([floor01.w, floor01.h]).toEqual([70, 70]);
    expect(floor01.nestSpots).toHaveLength(7);
    for (const n of floor01.nestSpots) {
      expect(n.padIds.length, `pads of nest ${n.id}`).toBeGreaterThanOrEqual(3);
      expect(n.entries.length, `entries of nest ${n.id}`).toBeGreaterThanOrEqual(2);
      for (const e of n.entries) expect(dist(e, n.pos)).toBeGreaterThanOrEqual(10);
    }
    expect(floor01.vehicleSpots.length).toBeGreaterThanOrEqual(3);
    expect(floor01.powerSpots.length).toBeGreaterThanOrEqual(6);
    expect(floor01.crateSpots.length).toBeGreaterThanOrEqual(6);
    expect(floor01.waypoints.length).toBeGreaterThanOrEqual(16);
  });

  it('lets enemies reach every point of interest from the spawn', () => {
    const mask = reachable(floor01, floor01.spawn, BLOCKS_ENEMY);
    const ok = (p: Vec2) => mask[Math.floor(p.z) * floor01.w + Math.floor(p.x)] === 1;
    const points = [
      floor01.elevator,
      ...floor01.pads.map(p => p.pos),
      ...floor01.nestSpots.flatMap(n => [n.pos, ...n.entries]),
      ...floor01.vehicleSpots,
      ...floor01.powerSpots,
      ...floor01.crateSpots,
      ...floor01.waypoints,
    ];
    for (const p of points) expect(ok(p), `${p.x},${p.z}`).toBe(true);
  });
});
