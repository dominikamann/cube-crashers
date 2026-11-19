import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { addPlayer, removePlayer } from '../../src/sim/systems/coop';
import { joinRunning, versusDeath } from '../../src/sim/systems/versus';
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
