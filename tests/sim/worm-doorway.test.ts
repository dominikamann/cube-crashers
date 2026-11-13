import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnBoss } from '../../src/sim/systems/boss';

/** how often, in three minutes of chasing a player who moves about the map, the worm's head stands still far from them */
function standstills(map: string, seed: number): number {
  const s = createSim(FLOORS[map].map, seed, { mode: 'quick', players: 1 });
  s.enemies = [];
  s.nests = [];
  s.boss = null;
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  spawnBoss(s, 'worm');
  s.players[0].invulnUntil = 1e9;
  s.boss!.nextAttackAt = 1e9;
  const head = () => s.enemies.find(e => e.id === s.boss!.worms[0][0])!;
  let last = { ...head().pos }, stuck = 0;
  for (let i = 0; i < 180 * 60; i++) {
    // (every quarter of a minute the player is somewhere else)
    if (i % 900 === 0) s.players[0].pos = { ...s.map.waypoints[Math.floor((i / 900) * 7 + seed * 3) % s.map.waypoints.length] };
    stepSim(s, []);
    if (i % 300 !== 299) continue;
    const h = head();
    if (Math.hypot(h.pos.x - last.x, h.pos.z - last.z) < 0.5 && Math.hypot(h.pos.x - s.players[0].pos.x, h.pos.z - s.players[0].pos.z) > 3) stuck++;
    last = { ...h.pos };
  }
  return stuck;
}

describe('the Segment Worm gets through every doorway', () => {
  for (const map of ['floor01', 'neon', 'highway', 'jungle', 'candy', 'servers', 'underwater'])
    it(`never stands still in front of one on ${map}`, () => {
      for (const seed of [1, 2, 3]) expect(standstills(map, seed), `seed ${seed}`).toBe(0);
    }, 120_000);
});
