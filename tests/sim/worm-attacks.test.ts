import { describe, expect, it } from 'vitest';
import { floorRooftop } from '../../src/sim/config/floor-rooftop';
import { createSim, stepSim } from '../../src/sim/sim';
import { BOSS, wormPace } from '../../src/sim/systems/boss';
import type { SimState } from '../../src/sim/types';

function wormFight(seed = 4): SimState {
  const s = createSim(floorRooftop, seed, { mode: 'quick', players: 1 });
  s.players[0].invulnUntil = 1e9;
  return s;
}

/** the most warnings one tick brought within the next seconds */
function biggestVolley(s: SimState, seconds: number): number {
  let most = 0;
  for (let i = 0; i < seconds * 60; i++) {
    stepSim(s, []);
    most = Math.max(most, s.events.filter(e => e.type === 'blastWarning').length);
  }
  return most;
}

describe('Segment Worm', () => {
  it('gets faster the shorter it is', () => {
    expect(wormPace(BOSS.wormSegments)).toBe(1);
    expect(wormPace(3)).toBeGreaterThan(1.4);
    expect(wormPace(9)).toBeGreaterThan(wormPace(14));
  });

  it('lunges: a line of strikes ahead of its head', () => {
    const s = wormFight();
    expect(s.boss?.kind).toBe('worm');
    expect(biggestVolley(s, 40)).toBeGreaterThanOrEqual(BOSS.wormLunge);
  });

  it('whips its tail from the second phase on: a ring around the tail', () => {
    const s = wormFight();
    s.boss!.phase = 2;
    expect(biggestVolley(s, 60)).toBeGreaterThanOrEqual(BOSS.wormWhip);
  });
});
