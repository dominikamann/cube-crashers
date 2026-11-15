import { describe, expect, it } from 'vitest';
import { FLOORS, RUN_BOSSES, runFloors } from '../../src/sim/config/floors';
import { BLOCKS_WALKER, isFree, Tile, tileAt, type FloorMap } from '../../src/sim/map/tilemap';
import { logoSpots } from '../../src/sim/map/logo-spots';
import { createSim, stepSim } from '../../src/sim/sim';
import { BRAWL_MAPS, QUICK_MAPS, VERSUS_MAPS } from '../../src/maps';
import type { Vec2 } from '../../src/sim/types';

/** every tile a walker can reach from the spawn */
function reachable(m: FloorMap): Set<number> {
  const seen = new Set<number>();
  const start = Math.floor(m.spawn.z) * m.w + Math.floor(m.spawn.x);
  const queue = [start];
  seen.add(start);
  while (queue.length) {
    const i = queue.pop()!;
    const tx = i % m.w, tz = (i - tx) / m.w;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tx + ox, z = tz + oz, j = z * m.w + x;
      if (seen.has(j) || !isFree(m, { x: x + 0.5, z: z + 0.5 }, 0.4, BLOCKS_WALKER)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen;
}
const at = (m: FloorMap, p: Vec2) => Math.floor(p.z) * m.w + Math.floor(p.x);

describe('the Uplink Dish', () => {
  const m = FLOORS.uplink.map;

  it('is a boss floor with the worm as its own boss, and the same final bosses as the roof', () => {
    expect(FLOORS.uplink.kind).toBe('boss');
    expect(FLOORS.uplink.boss).toBe('worm');
    expect(RUN_BOSSES.uplink).toEqual(RUN_BOSSES.rooftop);
    expect(createSim(m, 16).boss?.kind).toBe('worm');
  });

  it('is the last floor of some runs, and does not move in step with the floor before it', () => {
    const last = new Set<string>(), pairs = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const floors = runFloors(seed);
      last.add(floors[4]);
      pairs.add(`${floors[3]}+${floors[4]}`);
    }
    expect(last).toContain('uplink');
    expect(last).toContain('rooftop');
    // every world of floor 4 comes before each world of floor 5
    expect(pairs.size).toBe(3 * last.size);
  });

  it('is offered everywhere the other boss floors are: Single floor, versus and the Boss Brawl (so the Boss Rush too)', () => {
    for (const list of [QUICK_MAPS, VERSUS_MAPS, BRAWL_MAPS]) expect(list).toContain('uplink');
  });

  it('the elevator, every pad, crate, vehicle spot and waypoint can be walked to from the spawn', () => {
    const ok = reachable(m);
    for (const p of [m.elevator, ...m.pads.map(p => p.pos), ...m.crateSpots, ...m.vehicleSpots, ...m.waypoints]) expect(ok.has(at(m, p)), `${p.x},${p.z}`).toBe(true);
  });

  it('the feeder lines run out from the pedestal to the four sides, the yards are live gratings at the sides', () => {
    // the pedestal in the middle, a boost lane leaving it each way
    expect(tileAt(m, 31, 29)).toBe(Tile.Wall);
    for (const [x, z] of [[31, 25], [31, 33], [26, 29], [36, 29]]) expect(tileAt(m, x, z), `${x},${z}`).toBe(Tile.Boost);
    expect(tileAt(m, 4, 28)).toBe(Tile.Hazard);
    expect(tileAt(m, 57, 28)).toBe(Tile.Hazard);
    // the apron north of the dish, where the boss comes in, is open floor
    for (let z = 8; z < 20; z++) for (let x = 16; x < 46; x++) expect(tileAt(m, x + 0.5, z + 0.5), `${x},${z}`).toBe(Tile.Floor);
  });

  it('gets both AmannLabs logos: one on the floor and one on a wall with plain floor in front', () => {
    const spots = logoSpots(m);
    expect(spots.map(s => s.kind).sort()).toEqual(['floor', 'wall']);
    const wall = spots.find(s => s.kind === 'wall')!;
    for (let i = 0; i < wall.w; i++) {
      const x = wall.tx + (wall.along === 'x' ? i : 0), z = wall.tz + (wall.along === 'z' ? i : 0);
      expect(tileAt(m, x + 0.5 + wall.facing.x, z + 0.5 + wall.facing.z)).toBe(Tile.Floor);
    }
  });

  it('a Single floor there plays: nobody starts in a wall, and the worm is there', () => {
    const s = createSim(m, 3, { mode: 'quick', players: 4 });
    for (const p of s.players) expect(isFree(s.map, p.pos, 0.3, BLOCKS_WALKER)).toBe(true);
    for (let i = 0; i < 10 * 60 && s.phase === 'playing'; i++) stepSim(s, []);
    expect(s.phase).toBe('playing');
    expect(s.boss?.kind).toBe('worm');
    expect(s.enemies.some(e => e.kind === 'wormSegment')).toBe(true);
  });
});
