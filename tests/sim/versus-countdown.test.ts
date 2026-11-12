import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim, stepSim } from '../../src/sim/sim';
import { VERSUS } from '../../src/sim/systems/versus';
import { TICK_RATE } from '../../src/sim/types';

describe('versus countdown', () => {
  it('a match opens with 5 4 3 2 1: nobody moves until GO, and the clock starts after it', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score', countdown: true } });
    const v = s.versus!;
    expect(v.startsAt).toBe(s.tick + VERSUS.countdownTicks);
    expect(VERSUS.countdownTicks).toBe(5 * TICK_RATE);
    expect(v.endsAt - v.startsAt!).toBe(VERSUS.minutes.ffa * 60 * TICK_RATE);
    const p = s.players[0];
    const start = { ...p.pos };
    const go = { type: 'move' as const, playerId: p.id, dir: { x: 1, z: 0 } };
    for (let i = 0; i < VERSUS.countdownTicks - 1; i++) stepSim(s, [go]);
    expect(p.pos).toEqual(start);
    for (let i = 0; i < 20; i++) stepSim(s, [go]);
    expect(p.pos.x).not.toBe(start.x);
  });

  it('without the countdown (tests, replays) the match starts at once', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    expect(s.versus!.startsAt ?? s.tick).toBeLessThanOrEqual(s.tick);
  });
});
