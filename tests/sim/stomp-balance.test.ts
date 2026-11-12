import { describe, expect, it } from 'vitest';
import { JUMP_TICKS, STOMP_DAMAGE } from '../../src/sim/config/balance';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { quietSim, rel } from './helpers';

describe('jumping and stomping', () => {
  it('monsters catch you as you take off and land, not at the top of the jump', () => {
    const s = quietSim();
    const p = s.players[0];
    p.invulnUntil = 0;
    const e = spawnEnemy(s, 'tank', rel(p.pos, 0, 0));
    e.speed = 0;
    // just before landing: low enough to be caught
    p.air = 2;
    const low = p.hp;
    stepSim(s, []);
    expect(p.hp).toBeLessThan(low);
    // high in the jump: out of reach
    p.hp = p.maxHp;
    p.invulnUntil = 0;
    p.air = Math.round(JUMP_TICKS / 2);
    const high = p.hp;
    stepSim(s, []);
    expect(p.hp).toBe(high);
  });

  it('stomp after stomp in a row hurts less each time, a pause brings it back', () => {
    const s = quietSim();
    const p = s.players[0];
    p.invulnUntil = 1e9;
    const hits: number[] = [];
    const landOnTank = () => {
      const e = spawnEnemy(s, 'tank', rel(p.pos, 0.3, 0));
      e.speed = 0;
      const hp = e.hp;
      p.air = 1;
      stepSim(s, []);
      hits.push(hp - e.hp);
      e.hp = 0;
    };
    landOnTank();
    for (let i = 0; i < JUMP_TICKS; i++) stepSim(s, []);
    landOnTank();
    for (let i = 0; i < JUMP_TICKS; i++) stepSim(s, []);
    landOnTank();
    for (let i = 0; i < JUMP_TICKS; i++) stepSim(s, []);
    landOnTank();
    expect(hits[0]).toBeCloseTo(STOMP_DAMAGE, 5);
    expect(hits[1]).toBeCloseTo(STOMP_DAMAGE * 0.6, 5);
    expect(hits[2]).toBeCloseTo(STOMP_DAMAGE * 0.4, 5);
    expect(hits[3]).toBeCloseTo(STOMP_DAMAGE * 0.4, 5);
    // a second on the ground and it is back to full
    for (let i = 0; i < 90; i++) stepSim(s, []);
    landOnTank();
    expect(hits[4]).toBeCloseTo(STOMP_DAMAGE, 5);
  });
});
