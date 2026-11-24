import { describe, expect, it } from 'vitest';
import { soundsForEvent } from '../../src/audio/sfx';
import { FLOORS } from '../../src/sim/config/floors';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { conquestHold, updateVersus, VERSUS } from '../../src/sim/systems/versus';
import { updateOffers } from '../../src/sim/systems/offers';
import type { FloorMap } from '../../src/sim/map/tilemap';
import type { SimState, Vec2 } from '../../src/sim/types';

const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

function conquest(mode: 'ffa' | 'team' = 'ffa', players = 2, map: FloorMap = floorNeon, seed = 7): SimState {
  const s = createSim(map, seed, { mode: 'versus', players, versus: { mode, rule: 'conquest', teams: mode === 'team' ? { 0: 0, 1: 1 } : undefined } });
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
  it('holding the zone alone long enough takes it: a point, and the zone goes on to another spot a good way off', () => {
    const s = conquest();
    const [a] = s.players;
    const first = { ...s.versus!.king!.pos };
    a.pos = inZone(s);
    run(s, conquestHold(s) - 1);
    expect(s.versus!.scores[a.id]).toBe(0);
    run(s, 1);
    expect(s.versus!.scores[a.id]).toBe(1);
    expect(s.versus!.conquest).toEqual({ holds: {}, taken: 1 });
    expect(d(s.versus!.king!.pos, first)).toBeGreaterThanOrEqual(VERSUS.zoneApart);
  });

  it('teams take longer than everyone for themselves', () => {
    expect(conquestHold(conquest('team'))).toBeGreaterThan(conquestHold(conquest('ffa')));
  });

  it('does not move by the clock', () => {
    const s = conquest();
    const first = { ...s.versus!.king!.pos };
    run(s, VERSUS.kingMoveTicks + 10);
    expect(s.versus!.king!.pos).toEqual(first);
  });

  it('every side keeps its own hold: a rival in the zone stops everything, a rival alone wears yours down while building theirs', () => {
    const s = conquest();
    const [a, b] = s.players;
    a.pos = inZone(s);
    run(s, 100);
    b.pos = inZone(s);
    run(s, 50);
    expect(s.versus!.conquest!.holds).toEqual({ [a.id]: 100 });
    a.pos = away(s);
    run(s, 40);
    expect(s.versus!.conquest!.holds).toEqual({ [a.id]: 60, [b.id]: 40 });
    // back in alone: a picks up where their hold stood
    b.pos = away(s);
    a.pos = inZone(s);
    run(s, 10);
    expect(s.versus!.conquest!.holds).toEqual({ [a.id]: 70, [b.id]: 30 });
  });

  it('an empty zone lets every hold sink slowly', () => {
    const s = conquest();
    const [a] = s.players;
    a.pos = inZone(s);
    run(s, 100);
    a.pos = away(s);
    run(s, 100);
    expect(s.versus!.conquest!.holds).toEqual({ [a.id]: 50 });
  });

  it('teams: the team takes the zone, and three zones win the match', () => {
    const s = conquest('team');
    const red = s.players.find(p => p.team === 0)!;
    for (let zone = 0; zone < VERSUS.conquestWins; zone++) {
      red.pos = inZone(s);
      run(s, conquestHold(s));
      red.pos = away(s);
    }
    expect(s.versus!.teamScores).toEqual([3, 0]);
    expect(s.phase).toBe('won');
  });

  it('ends after all the zones of a match, even when nobody took three', () => {
    const s = conquest('ffa', 3);
    const [a, b, c] = s.players;
    for (const who of [a, b, c, a]) {
      who.pos = inZone(s);
      run(s, conquestHold(s));
      who.pos = away(s);
    }
    expect(s.phase).toBe('playing');
    b.pos = inZone(s);
    run(s, conquestHold(s));
    expect(s.versus!.conquest!.taken).toBe(VERSUS.conquestZones);
    expect(Math.max(...Object.values(s.versus!.scores))).toBe(2);
    expect(s.phase).toBe('won');
  });

  it('the first zone of a team match lies about as far from either base', () => {
    for (const map of ['neon', 'highway', 'candy', 'arena']) {
      const s = createSim(FLOORS[map].map, 3, { mode: 'versus', players: 4, versus: { mode: 'team', rule: 'conquest' } });
      const zone = s.versus!.king!.pos;
      const red = s.players.filter(p => p.team === 0), blue = s.players.filter(p => p.team === 1);
      const mean = (ps: typeof red) => ps.reduce((n, p) => n + d(p.pos, zone), 0) / ps.length;
      expect(Math.abs(mean(red) - mean(blue))).toBeLessThan(Math.max(mean(red), mean(blue)) * 0.5);
    }
  });

  it('a zone taken sounds short: up for your side, down for another, plain on a shared screen', () => {
    const ids = (team?: 0 | 1, me?: number) => soundsForEvent({ type: 'zoneTaken', side: 0, teams: true, taken: 1 }, team, me).map(x => x.id);
    expect(ids(0)).toEqual(['announce']);
    expect(ids(1)).toEqual(['comboLost']);
    expect(ids()).toEqual(['select']);
  });
});

describe('treasure chests', () => {
  it('a chest of coins shows up now and then in versus, and walking over it gives the coins', () => {
    const s = createSim(floorNeon, 7, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    s.crates = [];
    run(s, VERSUS.bagEveryTicks);
    const chest = s.crates.find(c => c.coins);
    expect(chest?.coins).toBe(VERSUS.bagCoins);
    const p = s.players[0];
    const before = p.coins;
    p.pos = { ...chest!.pos };
    updateOffers(s);
    expect(p.coins).toBe(before + VERSUS.bagCoins);
    expect(s.crates.some(c => c.id === chest!.id)).toBe(false);
    expect(s.offers).toHaveLength(0);
  });
});
