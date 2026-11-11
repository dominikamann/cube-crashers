import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim, stepSim } from '../../src/sim/sim';
import { VERSUS } from '../../src/sim/systems/versus';
import type { SimState } from '../../src/sim/types';
import { run } from './helpers';

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

function sim(rule: 'king' | 'capture', mode: 'ffa' | 'team' = 'ffa', players = 2, chaos = false): SimState {
  return createSim(floorNeon, 9, { mode: 'versus', players, versus: { mode, rule, chaos } });
}

describe('king of the cube', () => {
  it('a player alone in the zone scores a point every second', () => {
    const s = sim('king');
    const k = s.versus!.king!;
    s.players[0].pos = { ...k.pos };
    s.players[1].pos = { x: k.pos.x + 20, z: k.pos.z };
    run(s, 61);
    expect(s.versus!.scores[0]).toBe(1);
    expect(s.versus!.scores[1]).toBe(0);
  });

  it('a contested zone scores for nobody', () => {
    const s = sim('king');
    const k = s.versus!.king!;
    s.players[0].pos = { ...k.pos };
    s.players[1].pos = { x: k.pos.x + 0.5, z: k.pos.z };
    run(s, 61);
    expect(s.versus!.scores[0]).toBe(0);
    expect(s.versus!.scores[1]).toBe(0);
  });

  it('the zone moves on after a while', () => {
    const s = sim('king');
    const before = { ...s.versus!.king!.pos };
    run(s, VERSUS.kingMoveTicks + 1);
    expect(d(before, s.versus!.king!.pos)).toBeGreaterThan(5);
  });

  it('reaching the point limit wins', () => {
    const s = sim('king');
    s.versus!.scores[0] = VERSUS.kingLimit.ffa - 1;
    const k = s.versus!.king!;
    s.players[0].pos = { ...k.pos };
    s.players[1].pos = { x: k.pos.x + 20, z: k.pos.z };
    const events = run(s, 61);
    expect(s.phase).toBe('won');
    expect(events).toContainEqual(expect.objectContaining({ type: 'versusEnd', winners: [0] }));
  });
});

describe('capture the cube', () => {
  it('is always played in teams, each with a cube at home in its base', () => {
    const s = sim('capture', 'ffa', 4);
    expect(s.versus!.mode).toBe('team');
    const f = s.versus!.flags!;
    expect(f).toHaveLength(2);
    expect(d(f[0].base, f[1].base)).toBeGreaterThan(20);
    expect(f.every(x => x.carrier === null && d(x.pos, x.base) < 0.01)).toBe(true);
  });

  it('touching the enemy cube picks it up; the carrier is slower and cannot fly', () => {
    const s = sim('capture', 'team', 2);
    const [red, blue] = [s.players.find(p => p.team === 0)!, s.players.find(p => p.team === 1)!];
    const blueCube = s.versus!.flags![1];
    red.pos = { ...blueCube.base };
    stepSim(s, []);
    expect(blueCube.carrier).toBe(red.id);
    red.jetpack = true;
    red.jetFuel = 300;
    run(s, 20, () => [{ type: 'fly', playerId: red.id }]);
    expect(red.flying).toBe(false);
    void blue;
  });

  it('bringing it home while the own cube is at home scores a capture', () => {
    const s = sim('capture', 'team', 2);
    const red = s.players.find(p => p.team === 0)!;
    const f = s.versus!.flags!;
    red.pos = { ...f[1].base };
    stepSim(s, []);
    red.pos = { ...f[0].base };
    const events = run(s, 2);
    expect(s.versus!.teamScores[0]).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'cubeCaptured', team: 0 }));
    expect(f[1].carrier).toBeNull();
    expect(d(f[1].pos, f[1].base)).toBeLessThan(0.01);
  });

  it('a carrier who goes down drops the cube; the own team returns it by touching it', () => {
    const s = sim('capture', 'team', 2);
    const red = s.players.find(p => p.team === 0)!;
    const blue = s.players.find(p => p.team === 1)!;
    const f = s.versus!.flags!;
    red.pos = { ...f[1].base };
    stepSim(s, []);
    red.pos = { x: 35.5, z: 35.5 };
    red.invulnUntil = 0;
    red.hp = 1;
    blue.pos = { x: 38.5, z: 35.5 };
    blue.aimPoint = { ...red.pos };
    run(s, 30, () => [{ type: 'fire', playerId: blue.id }]);
    expect(f[1].carrier).toBeNull();
    expect(d(f[1].pos, f[1].base)).toBeGreaterThan(5);
    blue.pos = { ...f[1].pos };
    stepSim(s, []);
    expect(d(f[1].pos, f[1].base)).toBeLessThan(0.01);
  });

  it('three captures win', () => {
    const s = sim('capture', 'team', 2);
    s.versus!.teamScores[0] = VERSUS.captureLimit - 1;
    const red = s.players.find(p => p.team === 0)!;
    const f = s.versus!.flags!;
    red.pos = { ...f[1].base };
    stepSim(s, []);
    red.pos = { ...f[0].base };
    run(s, 2);
    expect(s.phase).toBe('won');
  });
});

describe('chaos', () => {
  it('lets monster hordes roam the arena', () => {
    const s = sim('king', 'ffa', 2, true);
    run(s, VERSUS.chaosEveryTicks + 2);
    expect(s.enemies.length).toBeGreaterThan(0);
  });

  it('without chaos there are no monsters', () => {
    const s = sim('king');
    run(s, VERSUS.chaosEveryTicks + 2);
    expect(s.enemies).toHaveLength(0);
  });
});
