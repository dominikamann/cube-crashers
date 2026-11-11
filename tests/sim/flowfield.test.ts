import { describe, expect, it } from 'vitest';
import { buildFlowField, flowDir } from '../../src/sim/map/flowfield';
import { BLOCKS_ENEMY, parseMap } from '../../src/sim/map/tilemap';

const MAP = parseMap('t', [
  '#########',
  '#S..#...#',
  '#...#...#',
  '#...#...#',
  '#.......#',
  '#...#####',
  '#E..#...#',
  '#########',
]);

describe('flow field', () => {
  it('measures walking distance around walls', () => {
    const f = buildFlowField(MAP, [{ x: 1.5, z: 1.5 }], BLOCKS_ENEMY);
    const at = (x: number, z: number) => f[z * MAP.w + x];
    expect(at(1, 1)).toBe(0);
    expect(at(3, 1)).toBe(2);
    // the tile right of the wall is only reachable through the gap in row 4
    expect(at(5, 1)).toBe(10);
    expect(at(6, 6)).toBe(-1);
  });

  it('points along the shortest way, not through the wall', () => {
    const f = buildFlowField(MAP, [{ x: 1.5, z: 1.5 }], BLOCKS_ENEMY);
    const d = flowDir(MAP, f, { x: 5.5, z: 1.5 });
    expect(d.z).toBeGreaterThan(0.9);
    expect(Math.abs(d.x)).toBeLessThan(0.3);
  });

  it('gives no direction where the target cannot be reached', () => {
    const f = buildFlowField(MAP, [{ x: 1.5, z: 1.5 }], BLOCKS_ENEMY);
    expect(flowDir(MAP, f, { x: 6.5, z: 6.5 })).toEqual({ x: 0, z: 0 });
  });

  it('still guides enemies when the target stands on a tile they avoid', () => {
    const map = parseMap('pool', ['#########', '#S......#', '#.~~~~..#', '#.~~~~..#', '#.~~~~..#', '#.~~~~..#', '#E......#', '#########']);
    const f = buildFlowField(map, [{ x: 3.5, z: 3.5 }], BLOCKS_ENEMY);
    expect(f[6 * map.w + 7]).toBeGreaterThan(0);
    const d = flowDir(map, f, { x: 7.5, z: 6.5 });
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });
});
