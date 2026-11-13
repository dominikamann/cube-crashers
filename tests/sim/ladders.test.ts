import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { ladders } from '../../src/sim/map/ladders';
import { perchable } from '../../src/sim/map/perch';
import { Tile } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { enterFloor } from '../../src/sim/systems/run';
import { move } from './helpers';

describe('ladders', () => {
  it('every world with walls has a few, each on the floor against a wall you can stand on', () => {
    for (const [id, def] of Object.entries(FLOORS)) {
      const list = ladders(def.map);
      if (['race', 'lane', 'maze', 'shaft'].includes(def.kind) || id === 'waldsee') {
        expect(list, id).toHaveLength(0);
        continue;
      }
      expect(list.length, id).toBeGreaterThanOrEqual(3);
      for (const l of list) {
        expect(def.map.tiles[l.tz * def.map.w + l.tx], id).toBe(Tile.Floor);
        expect(perchable(def.map, l.top.x, l.top.z), id).toBe(true);
      }
    }
  });

  it('walking into a ladder climbs it, onto the wall top', () => {
    const def = FLOORS[Object.keys(FLOORS)[0]];
    const s = createSim(def.map, 3, { mode: 'quick', players: 1 });
    s.enemies = [];
    const p = s.players[0];
    p.invulnUntil = 1e9;
    const l = ladders(def.map)[0];
    p.pos = { x: l.tx + 0.5, z: l.tz + 0.5 };
    const toward = { x: Math.sign(l.top.x - p.pos.x) * (Math.abs(l.top.x - p.pos.x) > 0.3 ? 1 : 0), z: Math.sign(l.top.z - p.pos.z) * (Math.abs(l.top.z - p.pos.z) > 0.3 ? 1 : 0) };
    stepSim(s, [move(toward.x, toward.z)]);
    expect(p.climb).toBeTruthy();
    // let go: the climb goes on by itself
    stepSim(s, [move(0, 0)]);
    for (let i = 0; i < 60; i++) stepSim(s, []);
    expect(p.climb).toBeFalsy();
    expect(p.perched).toBe(true);
    expect(perchable(def.map, p.pos.x, p.pos.z)).toBe(true);
  });

  it('a climb under way does not carry over to the next floor', () => {
    const s = createSim(FLOORS.floor01.map, 3, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], players: 1 });
    const p = s.players[0];
    const l = ladders(s.map)[0];
    p.climb = { ticks: 10, top: { ...l.top } };
    p.perched = true;
    enterFloor(s, 1);
    expect(p.climb).toBeFalsy();
    expect(p.perched).toBeFalsy();
  });
});
