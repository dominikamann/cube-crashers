import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { updateVersus, VERSUS } from '../../src/sim/systems/versus';
import type { SimState, Vec2 } from '../../src/sim/types';

function conquest(mode: 'ffa' | 'team' = 'ffa', players = 2): SimState {
  const s = createSim(floorNeon, 7, { mode: 'versus', players, versus: { mode, rule: 'conquest', teams: mode === 'team' ? { 0: 0, 1: 1 } : undefined } });
  for (const p of s.players) p.pos = away(s);
  return s;
}

/** a spot far from the zone */
const away = (s: SimState): Vec2 => ({ x: s.versus!.king!.pos.x + 30, z: s.versus!.king!.pos.z });
const inZone = (s: SimState): Vec2 => ({ ...s.versus!.king!.pos });

function run(s: SimState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    s.tick++;
    updateVersus(s);
  }
}

describe('zone conquest', () => {
  it('holding the zone alone long enough takes it: a point, and the zone goes on to another spot', () => {
    const s = conquest();
    const [a] = s.players;
    const first = { ...s.versus!.king!.pos };
    a.pos = inZone(s);
    run(s, VERSUS.conquestHoldTicks - 1);
    expect(s.versus!.scores[a.id]).toBe(0);
    expect(s.versus!.conquest!.side).toBe(a.id);
    run(s, 1);
    expect(s.versus!.scores[a.id]).toBe(1);
    expect(s.versus!.conquest).toMatchObject({ side: null, progress: 0, taken: 1 });
    expect(s.versus!.king!.pos).not.toEqual(first);
  });

  it('does not move by the clock', () => {
    const s = conquest();
    const first = { ...s.versus!.king!.pos };
    run(s, VERSUS.kingMoveTicks + 10);
    expect(s.versus!.king!.pos).toEqual(first);
  });

  it('a rival in the zone stops the hold; a rival alone wears it down before building their own', () => {
    const s = conquest();
    const [a, b] = s.players;
    a.pos = inZone(s);
    run(s, 100);
    b.pos = inZone(s);
    run(s, 50);
    expect(s.versus!.conquest).toMatchObject({ side: a.id, progress: 100 });
    a.pos = away(s);
    run(s, 50);
    expect(s.versus!.conquest).toMatchObject({ side: b.id, progress: 0 });
    run(s, 10);
    expect(s.versus!.conquest).toMatchObject({ side: b.id, progress: 10 });
  });

  it('an empty zone lets a hold sink slowly', () => {
    const s = conquest();
    const [a] = s.players;
    a.pos = inZone(s);
    run(s, 100);
    a.pos = away(s);
    run(s, 100);
    expect(s.versus!.conquest).toMatchObject({ side: a.id, progress: 50 });
  });

  it('teams: the team takes the zone, and three zones win the match', () => {
    const s = conquest('team');
    const red = s.players.find(p => p.team === 0)!;
    for (let zone = 0; zone < VERSUS.conquestWins; zone++) {
      red.pos = inZone(s);
      run(s, VERSUS.conquestHoldTicks);
    }
    expect(s.versus!.teamScores).toEqual([3, 0]);
    expect(s.phase).toBe('won');
  });

  it('ends after all the zones of a match, even when nobody took three', () => {
    const s = conquest('ffa', 3);
    const [a, b, c] = s.players;
    for (const who of [a, b, c, a]) {
      who.pos = inZone(s);
      run(s, VERSUS.conquestHoldTicks);
      who.pos = away(s);
    }
    expect(s.phase).toBe('playing');
    b.pos = inZone(s);
    run(s, VERSUS.conquestHoldTicks);
    expect(s.versus!.conquest!.taken).toBe(VERSUS.conquestZones);
    expect(Math.max(...Object.values(s.versus!.scores))).toBe(2);
    expect(s.phase).toBe('won');
  });
});
