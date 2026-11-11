import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim, stepSim } from '../../src/sim/sim';
import { explode } from '../../src/sim/systems/combat';
import { VERSUS } from '../../src/sim/systems/versus';
import type { Command, SimState } from '../../src/sim/types';
import { run } from './helpers';

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

function versusSim(players = 4, mode: 'ffa' | 'team' = 'ffa', rule: 'score' | 'rounds' = 'score'): SimState {
  return createSim(floorNeon, 7, { mode: 'versus', players, versus: { mode, rule } });
}

/** puts `b` right in front of `a`, aiming at it */
function face(s: SimState, a: number, b: number) {
  const pa = s.players[a], pb = s.players[b];
  pa.pos = { x: 35.5, z: 18.5 };
  pb.pos = { x: 38.5, z: 18.5 };
  for (const p of [pa, pb]) p.invulnUntil = 0;
  pa.aimPoint = { ...pb.pos };
}

const fire = (id: number): Command => ({ type: 'fire', playerId: id });

describe('versus', () => {
  it('starts with every player apart from the others, no nests, and only the pixel blaster', () => {
    const s = versusSim(4);
    expect(s.nests).toHaveLength(0);
    expect(s.versus!.mode).toBe('ffa');
    for (const p of s.players) expect(p.weapons.map(w => w.kind)).toEqual(['pixelBlaster']);
    for (const a of s.players) for (const b of s.players) if (a !== b) expect(d(a.pos, b.pos)).toBeGreaterThan(4);
  });

  it('a shot hurts a rival, but never a teammate', () => {
    const ffa = versusSim(2);
    face(ffa, 0, 1);
    run(ffa, 40, () => [fire(0)]);
    expect(ffa.players[1].hp).toBeLessThan(100);

    const team = versusSim(2, 'team');
    team.players[1].team = team.players[0].team;
    face(team, 0, 1);
    run(team, 40, () => [fire(0)]);
    expect(team.players[1].hp).toBe(100);
  });

  it('a kill scores for the killer; the victim loses their weapons and comes back away from the killer', () => {
    const s = versusSim(2);
    face(s, 0, 1);
    const victim = s.players[1];
    victim.weapons.push({ kind: 'candyCannon', level: 3, cooldown: 0 });
    victim.hp = 1;
    run(s, 30, () => [fire(0)]);
    expect(s.versus!.scores[0]).toBe(1);
    expect(s.events.some(e => e.type === 'pvpKill') || victim.downUntil !== null).toBe(true);
    run(s, VERSUS.respawnTicks + 5);
    expect(victim.downUntil).toBeNull();
    expect(victim.hp).toBe(victim.maxHp);
    expect(victim.weapons.map(w => w.kind)).toEqual(['pixelBlaster']);
    expect(d(victim.pos, s.players[0].pos)).toBeGreaterThan(8);
  });

  it('an explosion from a player hurts rivals in reach, not the player who set it off', () => {
    const s = versusSim(2);
    face(s, 0, 1);
    explode(s, s.players[1].pos, 2, { enemy: 40 }, 'bomb', 0);
    expect(s.players[1].hp).toBeLessThan(100);
    expect(s.players[0].hp).toBe(100);
  });

  it('a stomp lands on rivals too', () => {
    const s = versusSim(2);
    face(s, 0, 1);
    s.players[1].pos = { x: 35.9, z: 18.5 };
    stepSim(s, [{ type: 'jump', playerId: 0 }]);
    run(s, 35);
    expect(s.players[1].hp).toBeLessThan(100);
  });

  it('score race: reaching the kill limit wins the match', () => {
    const s = versusSim(2);
    s.versus!.scores[0] = s.versus!.limit - 1;
    face(s, 0, 1);
    s.players[1].hp = 1;
    const events = run(s, 30, () => [fire(0)]);
    expect(s.phase).toBe('won');
    expect(events).toContainEqual(expect.objectContaining({ type: 'versusEnd', winners: [0] }));
  });

  it('score race: when time runs out the most kills win', () => {
    const s = versusSim(3);
    s.versus!.scores = { 0: 2, 1: 5, 2: 1 };
    s.versus!.endsAt = s.tick;
    stepSim(s, []);
    expect(s.phase).toBe('won');
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'versusEnd', winners: [1] }));
  });

  it('teams score together', () => {
    const s = versusSim(4, 'team');
    const [a, b] = s.players.filter(p => p.team === 0);
    const rival = s.players.find(p => p.team === 1)!;
    expect(a && b && rival).toBeTruthy();
    a.pos = { x: 35.5, z: 18.5 };
    rival.pos = { x: 38.5, z: 18.5 };
    rival.invulnUntil = 0;
    a.aimPoint = { ...rival.pos };
    rival.hp = 1;
    run(s, 30, () => [fire(a.id)]);
    expect(s.versus!.teamScores[0]).toBe(1);
  });

  it('last cube standing: no respawn in a round, the last one alive wins it, first to the round limit wins', () => {
    const s = versusSim(2, 'ffa', 'rounds');
    face(s, 0, 1);
    s.players[1].hp = 1;
    run(s, 30, () => [fire(0)]);
    expect(s.versus!.roundWins[0]).toBe(1);
    // a new round: everyone back, full health
    run(s, VERSUS.roundBreakTicks + 5);
    expect(s.players.every(p => p.downUntil === null && p.hp === p.maxHp)).toBe(true);
    s.versus!.roundWins[0] = VERSUS.roundsToWin - 1;
    face(s, 0, 1);
    s.players[1].hp = 1;
    run(s, 30, () => [fire(0)]);
    expect(s.phase).toBe('won');
  });
});
