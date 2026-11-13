import { describe, expect, it } from 'vitest';
import { SHOOTER } from '../../src/sim/config/balance';
import { hasLos, parseMap } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { EnemyKind, SimState } from '../../src/sim/types';

/** two rooms with a wall between them and one gap in it (row 4) */
const ROOMS = parseMap('rooms', [
  '################',
  '#S.....#.......#',
  '#......#.......#',
  '#......#.......#',
  '#..............#',
  '#......#.......#',
  '#......#.......#',
  '#E.....#.......#',
  '################',
]);
const HIDDEN = { x: 3.5, z: 1.5 };
const IN_THE_GAP = { x: 3.5, z: 4.5 };

function rooms(kind: EnemyKind, at: { x: number; z: number }, player: { x: number; z: number }) {
  const s = createSim(ROOMS, 1);
  s.alarm.nextAt = 1e9;
  s.nextPowerupAt = 1e9;
  s.players[0].pos = { ...player };
  const e = spawnEnemy(s, kind, at);
  return { s, e, p: s.players[0] };
}

const happened = (s: SimState, type: string) => s.events.some(ev => ev.type === type);

describe('monsters shoot only at who they see', () => {
  it('a shooter behind a wall does not aim or fire: it walks until it sees the player, then shoots', () => {
    const { s, e, p } = rooms('shooter', { x: 10.5, z: 1.5 }, HIDDEN);
    const start = { ...e.pos };
    let aimedBlind = false, shotAt = -1;
    for (let i = 0; i < 900 && shotAt < 0; i++) {
      p.hp = p.maxHp;
      stepSim(s, []);
      if (happened(s, 'enemyWindup') && !hasLos(s.map, e.pos, p.pos)) aimedBlind = true;
      if (happened(s, 'enemyShot')) shotAt = i;
      // (for the first second and a half there is no way it could have found the gap)
      if (i < 90) expect(shotAt).toBe(-1);
    }
    expect(aimedBlind).toBe(false);
    expect(Math.hypot(e.pos.x - start.x, e.pos.z - start.z)).toBeGreaterThan(2);
    expect(shotAt).toBeGreaterThan(0);
    expect(hasLos(s.map, e.pos, p.pos)).toBe(true);
  });

  it('a shooter that was aiming holds its fire when the player steps behind a wall, and comes looking', () => {
    const { s, e, p } = rooms('shooter', { x: 10.5, z: 4.5 }, IN_THE_GAP);
    for (let i = 0; i < 120 && !happened(s, 'enemyWindup'); i++) stepSim(s, []);
    expect(e.state).toBe('windup');
    p.pos = { ...HIDDEN };
    expect(hasLos(s.map, e.pos, p.pos)).toBe(false);
    let shot = false;
    for (let i = 0; i < SHOOTER.windupTicks + 30; i++) {
      stepSim(s, []);
      shot ||= happened(s, 'enemyShot');
    }
    expect(shot).toBe(false);
    expect(s.projectiles).toHaveLength(0);
    expect(e.state).toBe('move');
    expect(p.hp).toBe(p.maxHp);
  });

  it('a shot already in the air stops at the wall', () => {
    const { s, p } = rooms('blob', { x: 13.5, z: 7.5 }, HIDDEN);
    s.enemies = [];
    s.projectiles.push({ id: s.nextId++, kind: 'explosion', behavior: 'bolt', hostile: true, pos: { x: 12.5, z: 1.5 }, vel: { x: -SHOOTER.bulletSpeed, z: 0 }, damage: SHOOTER.damage, pierce: 0, until: s.tick + 180, hitIds: [], ownerId: -1 });
    for (let i = 0; i < 170; i++) stepSim(s, []);
    expect(s.projectiles).toHaveLength(0);
    expect(p.hp).toBe(p.maxHp);
  });

  it('a monkey that was winding up keeps its coconut when the player is out of sight', () => {
    const { s, e, p } = rooms('monkey', { x: 10.5, z: 4.5 }, IN_THE_GAP);
    for (let i = 0; i < 120 && !happened(s, 'enemyWindup'); i++) stepSim(s, []);
    expect(e.state).toBe('windup');
    p.pos = { ...HIDDEN };
    for (let i = 0; i < 60; i++) stepSim(s, []);
    expect(s.blasts).toHaveLength(0);
    expect(p.hp).toBe(p.maxHp);
  });
});
