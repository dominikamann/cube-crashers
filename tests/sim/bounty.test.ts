import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { BOUNTY, crowned, quadOf } from '../../src/sim/systems/bounty';
import { damagePlayer } from '../../src/sim/systems/player';
import { versusDeath } from '../../src/sim/systems/versus';
import type { SimEvent, SimState } from '../../src/sim/types';

function match(players = 3): SimState {
  const s = createSim(FLOORS.neon.map, 3, { mode: 'versus', players, versus: { mode: 'ffa', rule: 'score' } });
  s.countdown = 0;
  s.enemies = [];
  return s;
}
/** `killer` takes `victim` out; the victim is on their feet again for the next one */
function kill(s: SimState, killer: number, victim: number): SimEvent[] {
  s.events = [];
  const v = s.players[victim];
  v.downUntil = null;
  versusDeath(s, v, s.players[killer].id);
  return [...s.events];
}
const bonuses = (events: SimEvent[]) => events.flatMap(e => (e.type === 'killBonus' ? [e.kind] : []));
const score = (s: SimState, i: number) => s.versus!.scores[s.players[i].id] ?? 0;

describe('kills that count for more', () => {
  it('a plain kill is one point', () => {
    const s = match();
    expect(bonuses(kill(s, 0, 1))).toEqual([]);
    expect(score(s, 0)).toBe(1);
  });

  it('revenge: getting back the one who got you last is one more, once', () => {
    const s = match();
    kill(s, 0, 1);
    s.tick += 600;
    expect(bonuses(kill(s, 1, 0))).toEqual(['revenge']);
    expect(score(s, 1)).toBe(2);
    s.tick += 600;
    // (the score is settled: 0 would now have to get 1 back)
    expect(bonuses(kill(s, 1, 2))).toEqual([]);
  });

  it('a second kill right after the first is a double kill', () => {
    const s = match();
    kill(s, 0, 1);
    s.tick += BOUNTY.doubleTicks - 1;
    expect(bonuses(kill(s, 0, 2))).toEqual(['double']);
    expect(score(s, 0)).toBe(3);
  });

  it('a run of kills is said to everyone, and ends with whoever falls; ending one is worth a point', () => {
    const s = match();
    const said: number[] = [];
    for (let i = 0; i < 5; i++) {
      s.tick += 600;
      said.push(...kill(s, 0, 1 + (i % 2)).flatMap(e => (e.type === 'killStreak' ? [e.n] : [])));
    }
    expect(said).toEqual([3, 5]);
    s.tick += 600;
    // 0 leads alone by now: the crown and the run both go
    expect(bonuses(kill(s, 2, 0)).sort()).toEqual(['bounty', 'revenge', 'streakEnded']);
    expect(s.versus!.streaks![s.players[0].id]).toBeUndefined();
  });

  it('whoever leads alone carries the crown; taking it is one more and leaves coins behind', () => {
    const s = match();
    expect(crowned(s)).toBeNull();
    s.versus!.scores[s.players[0].id] = BOUNTY.minLead;
    expect(crowned(s)).toBe(s.players[0].id);
    // (a tie: nobody)
    s.versus!.scores[s.players[1].id] = BOUNTY.minLead;
    expect(crowned(s)).toBeNull();
    s.versus!.scores[s.players[1].id] = 0;
    const coins = s.coins.length;
    expect(bonuses(kill(s, 2, 0))).toEqual(['bounty']);
    expect(score(s, 2)).toBe(2);
    expect(s.coins.length).toBeGreaterThan(coins);
  });
});

describe('Quad Damage', () => {
  it('shows up at the same spot again and again, and whoever takes it hits four times as hard for a while', () => {
    const s = match(2);
    s.crates = [];
    const seen: SimEvent[] = [];
    for (let i = 0; i < BOUNTY.quadFirstTicks + 5; i++) {
      stepSim(s, []);
      seen.push(...s.events);
    }
    const quad = s.powerups.find(p => p.kind === 'quad')!;
    expect(quad).toBeDefined();
    expect(seen.some(e => e.type === 'powerupSpawned' && e.kind === 'quad')).toBe(true);
    const [a, b] = s.players;
    a.pos = { ...quad.pos };
    stepSim(s, []);
    expect(quadOf(s, a.id)).toBe(BOUNTY.quad);
    expect(quadOf(s, b.id)).toBe(1);
    b.invulnUntil = 0;
    b.hp = b.maxHp = 100;
    damagePlayer(s, b, 10, 'shot', a.id);
    expect(b.hp).toBe(100 - 10 * BOUNTY.quad);
    s.tick += BOUNTY.quadTicks + 1;
    expect(quadOf(s, a.id)).toBe(1);
  });
});
