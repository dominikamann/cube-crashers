import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { COUNTDOWN_TICKS, createSim, stepSim } from '../../src/sim/sim';
import { TICK_RATE } from '../../src/sim/types';

describe('the countdown that opens a game', () => {
  it('versus: 6 5 ... 1, nobody moves until GO, and the match clock starts after it', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' }, countdown: true });
    expect(COUNTDOWN_TICKS).toBe(6 * TICK_RATE);
    expect(s.countdown).toBe(COUNTDOWN_TICKS);
    const endsAt = s.versus!.endsAt, tick = s.tick;
    const p = s.players[0];
    const start = { ...p.pos };
    const go = { type: 'move' as const, playerId: p.id, dir: { x: 1, z: 0 } };
    const counted: number[] = [];
    for (let i = 0; i < COUNTDOWN_TICKS; i++) {
      stepSim(s, [go]);
      for (const e of s.events) if (e.type === 'countdown') counted.push(e.n);
    }
    // a beep for each number, and GO at the end
    expect(counted).toEqual([6, 5, 4, 3, 2, 1, 0]);
    expect(p.pos).toEqual(start);
    // the clock stood still: the whole match is still ahead
    expect(s.tick).toBe(tick);
    expect(s.versus!.endsAt).toBe(endsAt);
    for (let i = 0; i < 20; i++) stepSim(s, [go]);
    expect(p.pos.x).not.toBe(start.x);
  });

  it('a Tower Run waits too: the alarm and the nests start at GO', () => {
    const s = createSim(floor01, 3, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], countdown: true });
    const alarm = s.alarm.nextAt - s.tick;
    for (let i = 0; i < COUNTDOWN_TICKS; i++) stepSim(s, []);
    expect(s.alarm.nextAt - s.tick).toBe(alarm);
  });

  it('without it (tests, replays) the game starts at once', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    expect(s.countdown ?? 0).toBe(0);
  });
});
