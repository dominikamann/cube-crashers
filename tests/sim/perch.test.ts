import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { JETPACK } from '../../src/sim/config/rare';
import { perchable } from '../../src/sim/map/perch';
import { Tile, tileAt, type FloorMap } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { SimState, Vec2 } from '../../src/sim/types';
import { move, quietSim, run } from './helpers';

/** a wall block inside the map (not the outer rim) with free floor beside it */
function innerWall(m: FloorMap): Vec2 {
  for (let tz = 2; tz < m.h - 2; tz++)
    for (let tx = 2; tx < m.w - 2; tx++) {
      const c = { x: tx + 0.5, z: tz + 0.5 };
      if (perchable(m, c.x, c.z) && perchable(m, c.x + 1, c.z) && tileAt(m, c.x - 1, c.z) === Tile.Floor) return c;
    }
  throw new Error('no inner wall');
}

function onWall(s: SimState, id = 0): { p: SimState['players'][number]; at: Vec2 } {
  const p = s.players.find(x => x.id === id)!;
  const at = innerWall(s.map);
  p.jetpack = true;
  p.jetFuel = JETPACK.fuelTicks;
  p.flying = true;
  p.pos = { ...at };
  return { p, at };
}

describe('landing on a wall with the jetpack', () => {
  it('only the blocks inside the arena count, not the outer rim', () => {
    const s = quietSim();
    expect(perchable(s.map, 0.5, 0.5)).toBe(false);
    expect(perchable(s.map, s.map.w - 0.5, s.map.h / 2)).toBe(false);
    expect(perchable(s.map, s.players[0].pos.x, s.players[0].pos.z)).toBe(false);
    expect(() => innerWall(s.map)).not.toThrow();
  });

  it('letting go above a block lands you on top of it, where the tank fills up again', () => {
    const s = quietSim();
    const { p, at } = onWall(s);
    p.jetFuel = 10;
    stepSim(s, []);
    // sinking down onto the block
    run(s, JETPACK.descentTicks);
    expect(p.flying).toBe(false);
    expect(p.perched).toBe(true);
    expect(p.pos).toEqual(at);
    run(s, 120);
    expect(p.jetFuel).toBeGreaterThan(10);
  });

  it('you walk along the top, and walking off the edge drops you to the floor', () => {
    const s = quietSim();
    const { p, at } = onWall(s);
    stepSim(s, []);
    // sinking down onto the block
    run(s, JETPACK.descentTicks);
    run(s, 10, () => [move(1, 0)]);
    expect(p.perched).toBe(true);
    run(s, 60, () => [move(-1, 0)]);
    expect(p.perched).toBe(false);
    expect(tileAt(s.map, p.pos.x, p.pos.z)).not.toBe(Tile.Wall);
    expect(p.pos.x).toBeLessThan(at.x);
  });

  it('monsters below cannot bite you up there', () => {
    const s = quietSim();
    const { p } = onWall(s);
    stepSim(s, []);
    // sinking down onto the block
    run(s, JETPACK.descentTicks);
    const e = spawnEnemy(s, 'tank', { x: p.pos.x - 1, z: p.pos.z });
    e.speed = 0;
    const hp = p.hp;
    run(s, 60);
    expect(p.hp).toBe(hp);
  });

  it('in versus a rival can still shoot you off it', () => {
    const s = createSim(floorNeon, 4, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    const { p, at } = onWall(s, s.players[1].id);
    p.invulnUntil = 0;
    stepSim(s, []);
    // sinking down onto the block
    run(s, JETPACK.descentTicks);
    expect(p.perched).toBe(true);
    const a = s.players[0];
    a.invulnUntil = 0;
    a.pos = { x: at.x - 1, z: at.z };
    for (let i = 0; i < 20; i++) stepSim(s, [{ type: 'aim', playerId: a.id, point: at }, { type: 'fire', playerId: a.id }]);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('a fresh start is never up on a wall', () => {
    const s = quietSim();
    const { p } = onWall(s);
    stepSim(s, []);
    // sinking down onto the block
    run(s, JETPACK.descentTicks);
    p.downUntil = s.tick;
    stepSim(s, []);
    expect(p.perched).toBe(false);
  });
});
