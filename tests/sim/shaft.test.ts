import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { SHAFT } from '../../src/sim/systems/shaft';
import { BLOCKS_WALKER, isFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { damageEnemy } from '../../src/sim/systems/combat';
import type { SimState } from '../../src/sim/types';
import { aimAt, fire, run } from './helpers';

function toShaft(): SimState {
  const s = createSim(floor01, 5, { mode: 'run' });
  // the shaft follows the fourth floor (after the first three come Kart Rally, Lane Defense, Glitch Maze)
  s.run.floor = 3;
  for (const n of s.nests) n.state = 'destroyed';
  s.elevatorOpen = true;
  s.enemies = [];
  s.hordes = [];
  s.players[0].pos = { ...s.map.elevator };
  stepSim(s, []);
  return s;
}

describe('shaft ride', () => {
  it('comes right after a cleared floor, on its own small map', () => {
    const s = toShaft();
    expect(s.run.stage).toBe('shaft');
    expect(s.map.id).toBe('shaft');
    expect(s.theme).toBe('shaft');
    expect(isFree(s.map, s.players[0].pos, 0.4, BLOCKS_WALKER)).toBe(true);
  });

  it('sends swarmers that fly over walls toward the players', () => {
    const s = toShaft();
    run(s, 240);
    const swarmers = s.enemies.filter(e => e.kind === 'swarmer');
    expect(swarmers.length).toBeGreaterThan(3);
    const p = s.players[0];
    const before = Math.min(...swarmers.map(e => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z)));
    run(s, 30);
    const after = Math.min(...s.enemies.filter(e => e.kind === 'swarmer').map(e => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z)));
    expect(after).toBeLessThan(before);
  });

  it('lets players shoot them down', () => {
    const s = toShaft();
    run(s, 240);
    const e = s.enemies.find(x => x.kind === 'swarmer')!;
    damageEnemy(s, e, 1000, 'pixelBlaster', 0);
    run(s, 1, () => [aimAt(e.pos), fire]);
    expect(s.enemies.includes(e)).toBe(false);
    expect(s.players[0].combo).toBeGreaterThan(0);
  });

  it('ends after 45 seconds even with swarmers left, then opens the shop', () => {
    const s = toShaft();
    s.players[0].invulnUntil = 1e9;
    run(s, SHAFT.ticks + 2);
    expect(s.run.stage).toBe('shop');
    expect(s.enemies).toHaveLength(0);
  });

  it('nobody can leave the platform', () => {
    const s = toShaft();
    const p = s.players[0];
    p.invulnUntil = 1e9;
    run(s, 300, () => [{ type: 'move', playerId: 0, dir: { x: 1, z: 0.3 } }]);
    expect(p.pos.x).toBeLessThan(s.map.w - 1);
    expect(isFree(s.map, p.pos, 0.4, BLOCKS_WALKER)).toBe(true);
  });
});
