import { describe, expect, it } from 'vitest';
import { FLOORS, RUN_BOSSES, runBosses, runFloors } from '../../src/sim/config/floors';
import { HELIPAD } from '../../src/sim/config/floor-helipad';
import { BLOCKS_ENEMY, BLOCKS_WALKER, isFree, Tile, tileAt, type FloorMap } from '../../src/sim/map/tilemap';
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
const m = FLOORS.helipad.map;

describe('the Sky Helipad', () => {
  it('is a boss floor of its own, the worm\'s, and a final floor of the Tower Run beside the Rooftop', () => {
    expect(FLOORS.helipad.kind).toBe('boss');
    expect(FLOORS.helipad.boss).toBe('worm');
    expect(RUN_BOSSES.helipad).toEqual(RUN_BOSSES.rooftop);
    const last = new Set<string>();
    for (let seed = 1; seed < 80; seed++) last.add(runFloors(seed)[4]);
    expect(last.has('helipad')).toBe(true);
    expect(last.has('rooftop')).toBe(true);
    // the last floor's world does not move in step with the others: over the seeds every pairing comes up
    const pairs = new Set<string>();
    for (let seed = 1; seed < 80; seed++) pairs.add(runFloors(seed).slice(2).join('+'));
    // (two worlds for floor 3, three for floor 4, three tops: the Rooftop, the Helipad and the Uplink Dish)
    expect(pairs.size).toBe(2 * 3 * 3);
    // and the run ends with one of its bosses
    const bosses = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const floors = runFloors(seed);
      if (floors[4] === 'helipad') bosses.add(runBosses(seed, floors)[4]!);
    }
    expect([...bosses].sort()).toEqual(['rex', 'spider', 'witch', 'worm']);
  });

  it('the elevator, every pad, crate, power-up and vehicle spot can be walked to from the spawn', () => {
    const ok = reachable(m);
    for (const p of [m.elevator, ...m.pads.map(p => p.pos), ...m.crateSpots, ...m.vehicleSpots, ...m.powerSpots, ...m.waypoints]) expect(ok.has(at(m, p)), `${p.x},${p.z}`).toBe(true);
  });

  it('the pad is open ground: the worm lies along its middle with room to move, and a boss never starts in a wall', () => {
    // (a boss starts at the map's middle, a third of the way down, and the worm's segments trail toward the middle)
    for (let z = Math.floor(m.h * 0.35) - 1; z < m.h * 0.35 + 18; z++) expect(isFree(m, { x: m.w / 2, z: z + 0.5 }, 1.2, BLOCKS_ENEMY), `z ${z}`).toBe(true);
    let open = 0, all = 0;
    for (let tz = HELIPAD.pad.z - HELIPAD.pad.r; tz < HELIPAD.pad.z + HELIPAD.pad.r; tz++)
      for (let tx = HELIPAD.pad.x - HELIPAD.pad.r; tx < HELIPAD.pad.x + HELIPAD.pad.r; tx++) {
        if (Math.hypot(tx + 0.5 - HELIPAD.pad.x, tz + 0.5 - HELIPAD.pad.z) > HELIPAD.pad.r) continue;
        all++;
        if (tileAt(m, tx, tz) !== Tile.Wall && tileAt(m, tx, tz) !== Tile.LowWall) open++;
      }
    expect(open / all).toBeGreaterThan(0.95);
    const s = createSim(m, 5, { mode: 'quick', players: 1 });
    expect(s.boss?.kind).toBe('worm');
    for (const id of s.boss!.worms[0]) {
      const seg = s.enemies.find(e => e.id === id)!;
      expect(tileAt(m, seg.pos.x, seg.pos.z)).not.toBe(Tile.Wall);
    }
  });

  it('the helicopter is cover with a tail to jump, and its rotor wash blows a player east across the top of the pad', () => {
    expect(tileAt(m, HELIPAD.heli.x0 + 0.5, HELIPAD.heli.z0 + 0.5)).toBe(Tile.Wall);
    expect(tileAt(m, HELIPAD.heli.tailX0 + 0.5, HELIPAD.heli.tailZ + 0.5)).toBe(Tile.LowWall);
    const s = createSim(m, 5, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.boss = null;
    const p = s.players[0];
    p.invulnUntil = 1e9;
    p.pos = { x: 26.5, z: 17.5 };
    expect(tileAt(m, p.pos.x, p.pos.z)).toBe(Tile.ConveyorE);
    for (let i = 0; i < 30; i++) stepSim(s, []);
    expect(p.pos.x).toBeGreaterThan(27.5);
    expect(Math.abs(p.pos.z - 17.5)).toBeLessThan(0.2);
  });

  it('the spawn and the elevator are at the south, by the way up, like on the other boss floors', () => {
    expect(m.spawn.z).toBeGreaterThan(m.h * 0.8);
    expect(m.elevator.z).toBeGreaterThan(m.spawn.z);
    expect(Math.abs(m.spawn.x - m.w / 2)).toBeLessThan(1);
    expect(Math.hypot(m.spawn.x - HELIPAD.pad.x, m.spawn.z - HELIPAD.pad.z)).toBeGreaterThan(HELIPAD.pad.r + 6);
  });

  it('gets both AmannLabs logos: one on the floor and one on the control hut\'s wall, with plain floor in front', () => {
    const spots = logoSpots(m);
    expect(spots.filter(s => s.kind === 'floor')).toHaveLength(1);
    const wall = spots.find(s => s.kind === 'wall');
    expect(wall).toBeDefined();
    if (wall?.kind !== 'wall') return;
    for (let i = 0; i < wall.w; i++) {
      const x = wall.tx + (wall.along === 'x' ? i : 0), z = wall.tz + (wall.along === 'z' ? i : 0);
      expect(tileAt(m, x + 0.5, z + 0.5)).toBe(Tile.Wall);
      expect(tileAt(m, x + wall.facing.x + 0.5, z + wall.facing.z + 0.5)).toBe(Tile.Floor);
    }
  });

  it('is offered wherever the other boss floors are: Single floor, Versus and the Boss Brawl', () => {
    for (const list of [QUICK_MAPS, VERSUS_MAPS, BRAWL_MAPS]) {
      expect(list).toContain('helipad');
      expect(list.indexOf('helipad')).toBe(list.indexOf('rooftop') + 1);
    }
  });
});
