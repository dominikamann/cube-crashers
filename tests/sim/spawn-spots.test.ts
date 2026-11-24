import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { addPlayer, removePlayer } from '../../src/sim/systems/coop';
import { updatePlayers } from '../../src/sim/systems/player';
import { BLOCKS_WALKER, isFree } from '../../src/sim/map/tilemap';
import { PLAYER_RADIUS } from '../../src/sim/config/balance';
import { joinRunning, kingZone, updateVersus, VERSUS, versusDeath } from '../../src/sim/systems/versus';
import type { SimState, Vec2 } from '../../src/sim/types';

const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** the smallest distance between any two of `spots` */
const closest = (spots: Vec2[]) => Math.min(...spots.flatMap((a, i) => spots.slice(i + 1).map(b => d(a, b))));

const versus = (players: number, mode: 'ffa' | 'team'): SimState => createSim(floorNeon, 7, { mode: 'versus', players, versus: { mode, rule: 'score' } });

describe('spawn spots', () => {
  it('co-op: a late joiner after someone left does not land inside another player', () => {
    const s = createSim(floor01, 9, { players: 3 });
    removePlayer(s, 1);
    addPlayer(s, 7, 'Kim');
    expect(closest(s.players.map(p => p.pos))).toBeGreaterThanOrEqual(1);
  });

  it('everyone for themselves: players joining a running match are spread over the map', () => {
    const s = versus(2, 'ffa');
    joinRunning(s, { id: 5, name: 'A' });
    joinRunning(s, { id: 6, name: 'B' });
    expect(closest(s.players.map(p => p.pos))).toBeGreaterThan(4);
  });

  it('teams start next to each other, far from the other team', () => {
    const s = versus(4, 'team');
    const red = s.players.filter(p => p.team === 0), blue = s.players.filter(p => p.team === 1);
    expect(closest(s.players.map(p => p.pos))).toBeGreaterThanOrEqual(1);
    expect(d(red[0].pos, red[1].pos)).toBeLessThan(4);
    expect(d(blue[0].pos, blue[1].pos)).toBeLessThan(4);
    expect(d(red[0].pos, blue[0].pos)).toBeGreaterThan(10);
  });

  it('a team player joining a running match comes in next to the team', () => {
    const s = versus(4, 'team');
    const p = joinRunning(s, { id: 5, name: 'A' })!;
    const mates = s.players.filter(o => o !== p && o.team === p.team);
    expect(Math.min(...mates.map(o => d(o.pos, p.pos)))).toBeLessThan(4);
    expect(closest(s.players.map(o => o.pos))).toBeGreaterThanOrEqual(1);
  });

  it('two players falling at once get back up in different places', () => {
    const s = versus(4, 'ffa');
    const [a, b] = s.players;
    versusDeath(s, a, undefined);
    versusDeath(s, b, undefined);
    expect(d(a.safePoint, b.safePoint)).toBeGreaterThanOrEqual(1);
  });

  it('a team player does not come back right next to an enemy waiting at the base', () => {
    const s = versus(4, 'team');
    const fallen = s.players.find(p => p.team === 0)!;
    const mate = s.players.find(p => p.team === 0 && p !== fallen)!;
    const camper = s.players.find(p => p.team === 1)!;
    camper.pos = { ...mate.pos };
    mate.pos = { ...fallen.pos };
    versusDeath(s, fallen, camper.id);
    expect(d(fallen.safePoint, camper.pos)).toBeGreaterThan(6);
  });
});

describe('capture the cube', () => {
  it('a cube left lying out in the field goes home by itself after 30 seconds', () => {
    const s = createSim(floorNeon, 7, { mode: 'versus', players: 2, versus: { mode: 'team', rule: 'capture' } });
    const f = s.versus!.flags![0];
    const [a, b] = s.versus!.flags!.map(x => x.base);
    f.pos = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    for (const p of s.players) p.pos = { ...s.versus!.flags![p.team === 0 ? 1 : 0].base };
    updateVersus(s);
    s.tick += VERSUS.cubeReturnTicks - 1;
    updateVersus(s);
    expect(d(f.pos, f.base)).toBeGreaterThan(1);
    s.tick += 1;
    updateVersus(s);
    expect(d(f.pos, f.base)).toBeLessThan(0.01);
    expect(f.downAt).toBeUndefined();
  });
});

describe('king of the cube', () => {
  it('tells an empty zone, one held by a side, and one fought over apart', () => {
    const s = createSim(floorNeon, 7, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'king' } });
    const k = s.versus!.king!;
    const [a, b] = s.players;
    a.pos = { x: k.pos.x + 20, z: k.pos.z };
    b.pos = { x: k.pos.x - 20, z: k.pos.z };
    expect(kingZone(s)).toEqual({ state: 'empty' });
    a.pos = { ...k.pos };
    expect(kingZone(s)).toEqual({ state: 'held', side: a.id });
    b.pos = { x: k.pos.x + 1, z: k.pos.z };
    expect(kingZone(s)).toEqual({ state: 'contested' });
  });
});

describe('players do not stand in one another', () => {
  it('two players on the same spot are pushed apart over a few ticks, and stay out of walls', () => {
    const s = versus(2, 'ffa');
    const [a, b] = s.players;
    b.pos = { ...a.pos };
    for (let i = 0; i < 30; i++) updatePlayers(s, new Map());
    expect(d(a.pos, b.pos)).toBeGreaterThan(0.7);
    for (const p of [a, b]) expect(isFree(s.map, p.pos, PLAYER_RADIUS, BLOCKS_WALKER)).toBe(true);
  });
});

describe('a captured cube', () => {
  it('is laid down on top of the scorer\'s own cube at the base', () => {
    const s = createSim(floorNeon, 7, { mode: 'versus', players: 2, versus: { mode: 'team', rule: 'capture', teams: { 0: 0, 1: 1 } } });
    const red = s.players.find(p => p.team === 0)!;
    const flags = s.versus!.flags!;
    const base = flags[0].base;
    // standing at the edge of the base, looking right at its middle
    red.pos = { x: base.x + 1, z: base.z };
    red.facing = { x: -1, z: 0 };
    flags[1].carrier = red.id;
    s.events = [];
    updateVersus(s);
    const e = s.events.find(x => x.type === 'cubeCaptured');
    expect(e && e.type === 'cubeCaptured' && e.pos).toBeTruthy();
    if (e?.type === 'cubeCaptured' && e.pos) expect(d(e.pos, base)).toBeLessThan(0.01);
  });
});
