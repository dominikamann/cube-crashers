import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnBoss } from '../../src/sim/systems/boss';
import type { BossKind } from '../../src/sim/types';

const MAPS = ['arena', 'floor01', 'candy', 'neon', 'highway', 'rooftop', 'jungle', 'servers', 'underwater'].filter(id => FLOORS[id]);

/** how close the boss gets to a player who stands still at the entrance, within a minute */
function closest(map: string, kind: BossKind, seed: number): number {
  const s = createSim(FLOORS[map].map, seed, { mode: 'quick', players: 1 });
  s.enemies = [];
  s.nests = [];
  s.boss = null;
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  spawnBoss(s, kind);
  s.players[0].invulnUntil = 1e9;
  // (the worm: its head)
  const id = s.boss!.enemyId ?? s.boss!.worms[0][0];
  let best = Infinity;
  for (let i = 0; i < 60 * 60; i++) {
    stepSim(s, []);
    const b = s.enemies.find(e => e.id === id);
    if (!b) break;
    best = Math.min(best, Math.hypot(b.pos.x - s.players[0].pos.x, b.pos.z - s.players[0].pos.z));
  }
  return best;
}

describe('big bosses do not get stuck on the way to the players', () => {
  for (const kind of ['rex', 'rhino', 'megaBlock', 'kraken', 'worm', 'dominik', 'spider'] as BossKind[])
    for (const map of MAPS)
      it(`${kind} on ${map}`, () => {
        expect(closest(map, kind, 3)).toBeLessThan(5);
      }, 60_000);
});
