import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/sim/config/enemies';
import { FLOORS } from '../../src/sim/config/floors';
import { DIFFICULTY } from '../../src/sim/config/difficulty';
import { REGEN_DELAY_TICKS } from '../../src/sim/config/balance';
import { createSim, stepSim } from '../../src/sim/sim';
import { BOSS, spawnBoss } from '../../src/sim/systems/boss';
import type { Difficulty, SimState } from '../../src/sim/types';

function rexFight(difficulty: Difficulty = 'medium'): SimState {
  const s = createSim(FLOORS.arena.map, 4, { mode: 'quick', players: 1, difficulty });
  s.enemies = [];
  s.nests = [];
  s.boss = null;
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  spawnBoss(s, 'rex');
  return s;
}
const rexOf = (s: SimState) => s.enemies.find(e => e.id === s.boss!.enemyId)!;

describe('King Rex is a real fight', () => {
  it('is much faster than a common T-Rex, and faster again with every phase', () => {
    const s = rexFight();
    const rex = rexOf(s);
    expect(rex.speed).toBeGreaterThanOrEqual(ENEMIES.trex.speed * 1.6);
    const before = rex.speed;
    s.players[0].invulnUntil = 1e9;
    rex.hp = rex.maxHp * 0.5;
    stepSim(s, []);
    expect(s.boss!.phase).toBe(2);
    expect(rex.speed).toBeGreaterThan(before);
  });

  it('snaps at a player: a line of strikes from its jaws, with a short warning', () => {
    const s = rexFight();
    s.players[0].invulnUntil = 1e9;
    let bites = 0;
    for (let i = 0; i < 60 * 60; i++) {
      stepSim(s, []);
      const fast = s.blasts.filter(b => b.createdAt >= s.tick - 1 && b.at - b.createdAt < BOSS.warnTicks);
      if (fast.length >= BOSS.rexBite) bites++;
    }
    expect(bites).toBeGreaterThan(0);
  });

  it('roars in two rings from the second phase on', () => {
    const s = rexFight();
    s.players[0].invulnUntil = 1e9;
    s.boss!.phase = 2;
    let most = 0;
    for (let i = 0; i < 60 * 60; i++) {
      stepSim(s, []);
      most = Math.max(most, s.events.filter(e => e.type === 'blastWarning').length);
    }
    expect(most).toBeGreaterThanOrEqual(8 + BOSS.rexOuterRing);
  });
});

describe('auto-heal on the easy levels', () => {
  it('heals only half as fast while a boss is alive', () => {
    const heal = (boss: boolean) => {
      const s = boss ? rexFight('ultraLow') : createSim(FLOORS.arena.map, 4, { mode: 'quick', players: 1, difficulty: 'ultraLow' });
      if (!boss) {
        s.enemies = [];
        s.boss = null;
      } else rexOf(s).pos = { x: 2, z: 2 };
      const p = s.players[0];
      p.hp = 10;
      p.lastDamageAt = s.tick - REGEN_DELAY_TICKS;
      p.invulnUntil = 1e9;
      stepSim(s, []);
      return p.hp - 10;
    };
    expect(heal(false)).toBeCloseTo(DIFFICULTY.ultraLow.regen / 60);
    expect(heal(true)).toBeCloseTo(DIFFICULTY.ultraLow.regen / 120);
  });
});
