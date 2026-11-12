import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { BOSS_RUSH } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { floorCleared } from '../../src/sim/systems/run';
import type { SimState } from '../../src/sim/types';
import { run } from './helpers';

function bossRush(): SimState {
  return createSim(floor01, 5, { mode: 'bossrush', players: 1 });
}

/** the boss falls at once: every body loses its health */
function killBoss(s: SimState) {
  const b = s.boss!;
  const ids = b.kind === 'worm' ? b.worms.flat() : [b.enemyId!];
  for (const e of s.enemies) if (ids.includes(e.id)) e.hp = 0;
  stepSim(s, []);
}

describe('Boss Rush', () => {
  it('is every boss in a row: Mega Block, Segment Worm, then King Rex', () => {
    expect(BOSS_RUSH.map(b => b.boss)).toEqual(['megaBlock', 'worm', 'rex']);
    const s = bossRush();
    expect(s.run.floors).toHaveLength(3);
    expect(s.boss?.kind).toBe('megaBlock');
    expect(s.nests).toHaveLength(0);
  });

  it('after a boss: straight to the shop, then the next boss', () => {
    const s = bossRush();
    killBoss(s);
    expect(s.elevatorOpen).toBe(true);
    floorCleared(s);
    expect(s.run.stage).toBe('shop');
    s.run.shop!.ready.push(...s.players.map(p => p.id));
    stepSim(s, [{ type: 'ready', playerId: 0 }]);
    run(s, 2);
    expect(s.run.floor).toBe(1);
    expect(s.boss?.kind).toBe('worm');
  });

  it('King Rex is a giant T-Rex: it roars and the ground cracks under the players', () => {
    const s = bossRush();
    for (let i = 0; i < 2; i++) {
      killBoss(s);
      floorCleared(s);
      s.run.shop!.ready.push(...s.players.map(p => p.id));
      run(s, 3, () => [{ type: 'ready', playerId: 0 }]);
    }
    expect(s.boss?.kind).toBe('rex');
    const rex = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    expect(rex.kind).toBe('trex');
    expect(rex.maxHp).toBeGreaterThan(1000);
    s.players[0].invulnUntil = 1e9;
    let warned = false;
    for (let i = 0; i < 6 * 60 && !warned; i++) {
      stepSim(s, []);
      warned = s.events.some(e => e.type === 'blastWarning');
    }
    expect(warned).toBe(true);
  });

  it('beating the last boss wins the rush', () => {
    const s = bossRush();
    for (let i = 0; i < 2; i++) {
      killBoss(s);
      floorCleared(s);
      s.run.shop!.ready.push(...s.players.map(p => p.id));
      run(s, 3, () => [{ type: 'ready', playerId: 0 }]);
    }
    killBoss(s);
    floorCleared(s);
    expect(s.phase).toBe('won');
  });
});
