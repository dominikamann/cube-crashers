import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos, inSolid, isFree, moveCircle, parseMap, reachable, Tile, tileAt } from '../../src/sim/map/tilemap';
import { buildFlowField, flowDir } from '../../src/sim/map/flowfield';
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

describe('solids: walls that run slanted across the tiles', () => {
  // an 11x11 room with one house in it: a tilted square (3,3)-(6,2.5)-(6.5,5.5)-(3.5,6), the tiles under it floor
  const ROOM = ['###########', '#S........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#....E....#', '###########'];
  const HOUSE = [3, 3, 6, 2.5, 6, 2.5, 6.5, 5.5, 6.5, 5.5, 3.5, 6, 3.5, 6, 3, 3];
  const room = () => ({ ...parseMap('room', ROOM), solids: [HOUSE] });
  const toHouse = (p: Vec2) => {
    let d = Infinity;
    for (let i = 0; i < HOUSE.length; i += 4) {
      const dx = HOUSE[i + 2] - HOUSE[i], dz = HOUSE[i + 3] - HOUSE[i + 1], L2 = dx * dx + dz * dz;
      const u = Math.max(0, Math.min(1, ((p.x - HOUSE[i]) * dx + (p.z - HOUSE[i + 1]) * dz) / L2));
      d = Math.min(d, Math.hypot(p.x - HOUSE[i] - dx * u, p.z - HOUSE[i + 1] - dz * u));
    }
    return d;
  };

  it('block a circle at the wall line and anything inside, and nowhere else', () => {
    const m = room();
    expect(isFree(m, { x: 4.5, z: 4.5 }, 0.01, BLOCKS_WALKER)).toBe(false);
    expect(isFree(m, { x: 4.5, z: 4.5 }, 0.4, BLOCKS_ENEMY)).toBe(false);
    expect(isFree(m, { x: 8.5, z: 8.5 }, 0.4, BLOCKS_WALKER)).toBe(true);
    // just outside the slanted north wall: free at 0.45 from it, not at 0.35
    const nx = -0.5 / Math.hypot(3, 0.5), nz = -3 / Math.hypot(3, 0.5);
    expect(isFree(m, { x: 4.5 + nx * 0.45, z: 2.75 + nz * 0.45 }, 0.4, BLOCKS_WALKER)).toBe(true);
    expect(isFree(m, { x: 4.5 + nx * 0.35, z: 2.75 + nz * 0.35 }, 0.4, BLOCKS_WALKER)).toBe(false);
    expect(inSolid(m, 4.5, 4.5)).toBe(true);
    expect(inSolid(m, 1.5, 1.5)).toBe(false);
  });

  it('stop a walker at the wall and let it slide along it, never through', () => {
    const m = room();
    // straight at the west wall (3,3)-(3.5,6) from the left: stopped at the line
    const p = { x: 1.5, z: 4.5 };
    moveCircle(m, p, 3, 0, 0.4, BLOCKS_WALKER);
    expect(toHouse(p)).toBeGreaterThan(0.4 - 1e-6);
    expect(toHouse(p)).toBeLessThan(0.5);
    // at it slantwise: slides along the wall instead of sticking
    const q = { x: 1.5, z: 4 };
    moveCircle(m, q, 2, 1.5, 0.4, BLOCKS_WALKER);
    expect(toHouse(q)).toBeGreaterThan(0.4 - 1e-6);
    expect(q.z).toBeGreaterThan(4.8);
    // fuzz: never inside, never through the line
    const rng = new Rng(9);
    const w = { x: 1.5, z: 1.5 };
    for (let i = 0; i < 4000; i++) {
      moveCircle(m, w, rng.range(-2, 2), rng.range(-2, 2), 0.4, BLOCKS_WALKER);
      expect(inSolid(m, w.x, w.z), `inside at step ${i}`).toBe(false);
      expect(toHouse(w), `in the wall at step ${i}`).toBeGreaterThan(0.4 - 1e-6);
    }
  });

  it('block sight, and keep the flow field off the tiles whose middle is inside', () => {
    const m = room();
    expect(hasLos(m, { x: 1.5, z: 4.5 }, { x: 9.5, z: 4.5 })).toBe(false);
    expect(hasLos(m, { x: 1.5, z: 8.5 }, { x: 9.5, z: 8.5 })).toBe(true);
    const field = buildFlowField(m, [m.elevator], BLOCKS_ENEMY);
    expect(field[4 * m.w + 4]).toBe(-1);
    expect(field[5 * m.w + 3]).toBe(-1);
    expect(field[1 * m.w + 1]).toBeGreaterThan(0);
    // a walker on the sliver of such a tile is sent out toward a tile the field knows
    const dir = flowDir(m, field, { x: 3.1, z: 5.9 });
    expect(Math.hypot(dir.x, dir.z)).toBeCloseTo(1, 5);
  });

  it('change nothing on a map without them', () => {
    const plain = parseMap('room', ROOM);
    expect(isFree(plain, { x: 4.5, z: 4.5 }, 0.4, BLOCKS_WALKER)).toBe(true);
    expect(inSolid(plain, 4.5, 4.5)).toBe(false);
    const p = { x: 1.5, z: 4.5 };
    moveCircle(plain, p, 3, 0, 0.4, BLOCKS_WALKER);
    expect(p.x).toBe(4.5);
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
