import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { WEAPONS } from '../../src/sim/config/weapons';
import { createSim, stepSim } from '../../src/sim/sim';
import { damagePlayer } from '../../src/sim/systems/player';
import { COIN_OP_RULES, VERSUS, versusDeath } from '../../src/sim/systems/versus';
import type { CoinOpRule, SimState } from '../../src/sim/types';
import { run } from './helpers';

function coinOp(rule?: CoinOpRule, players = 3): SimState {
  const s = createSim(floorNeon, 11, { mode: 'versus', players, versus: { mode: 'ffa', rule: 'coinop' } });
  if (rule) s.versus!.coinop!.rule = rule;
  return s;
}

describe('Coin-Op Chaos', () => {
  it('starts with a rule and switches to a different one every 30 seconds, telling everyone', () => {
    const s = coinOp();
    const seen = [s.versus!.coinop!.rule];
    for (let i = 0; i < 4; i++) {
      run(s, VERSUS.coinOpEveryTicks + 1);
      const now = s.versus!.coinop!.rule;
      expect(now).not.toBe(seen[seen.length - 1]);
      seen.push(now);
    }
    expect(seen.every(r => COIN_OP_RULES.includes(r))).toBe(true);
  });

  it('kills count like a score race', () => {
    const s = coinOp('turbo');
    const [a, b] = s.players;
    versusDeath(s, b, a.id);
    expect(s.versus!.scores[a.id]).toBe(1);
    expect(s.versus!.limit).toBe(VERSUS.limit.ffa);
  });

  it('turbo: everyone runs half again as fast', () => {
    const ran = (rule: CoinOpRule) => {
      const s = coinOp(rule, 1);
      const p = s.players[0];
      p.invulnUntil = 1e9;
      const start = { ...p.pos };
      for (let i = 0; i < 20; i++) stepSim(s, [{ type: 'move', playerId: p.id, dir: { x: 1, z: 0 } }]);
      return Math.hypot(p.pos.x - start.x, p.pos.z - start.z);
    };
    expect(ran('turbo')).toBeCloseTo(ran('double') * 1.5, 1);
  });

  it('swords: whatever you hold, you swing the laser sword', () => {
    const s = coinOp('swords', 1);
    const p = s.players[0];
    stepSim(s, [{ type: 'fire', playerId: p.id }]);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'shot', weapon: 'laserSword' }));
    expect(s.projectiles).toHaveLength(0);
  });

  it('rapid: weapons reload twice as fast', () => {
    const s = coinOp('rapid', 1);
    const p = s.players[0];
    stepSim(s, [{ type: 'fire', playerId: p.id }]);
    const after = p.weapons[0].cooldown;
    run(s, 6);
    expect(after - p.weapons[0].cooldown).toBeCloseTo((6 / 60) * 2, 2);
    expect(after).toBeCloseTo(WEAPONS.pixelBlaster.cooldown);
  });

  it('boom: whoever goes down blows up', () => {
    const s = coinOp('boom');
    const [a, b] = s.players;
    // past the spawn protection
    b.invulnUntil = 0;
    damagePlayer(s, b, 9999, 'shot', a.id);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'explosion' }));
  });

  it('double: hits between players do twice the damage', () => {
    const hit = (rule: CoinOpRule) => {
      const s = coinOp(rule);
      const [a, b] = s.players;
      b.invulnUntil = 0;
      const before = b.hp;
      damagePlayer(s, b, 10, 'shot', a.id);
      return before - b.hp;
    };
    expect(hit('double')).toBeCloseTo(hit('turbo') * 2);
  });
});
