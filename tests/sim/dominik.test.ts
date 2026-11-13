import { describe, expect, it } from 'vitest';
import { RARE } from '../../src/sim/config/rare';
import { BOSS_RUSH, FLOORS } from '../../src/sim/config/floors';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { BOSS, laserAngle, laserHits, spawnBoss } from '../../src/sim/systems/boss';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { MINI, releaseMiniDominik } from '../../src/sim/systems/mini-dominik';
import { fireRare } from '../../src/sim/systems/rare';
import type { SimState } from '../../src/sim/types';

function fight(seed = 4): SimState {
  const s = createSim(FLOORS.arena.map, seed, { mode: 'quick', players: 1 });
  s.enemies = [];
  s.nests = [];
  s.boss = null;
  s.crates = [];
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  spawnBoss(s, 'dominik');
  return s;
}
const bodyOf = (s: SimState) => s.enemies.find(e => e.id === s.boss!.enemyId)!;

describe('Angry Dominik', () => {
  it('is the very last boss of the Boss Rush', () => {
    expect(BOSS_RUSH[BOSS_RUSH.length - 1].boss).toBe('dominik');
  });

  it('is tougher than any other boss', () => {
    const s = fight();
    expect(bodyOf(s).maxHp).toBeGreaterThan(BOSS.rexHp);
  });

  it('his laser eyes sweep a beam: it hits who stands in it, not who stands beside it or beyond its reach', () => {
    const s = fight();
    const body = bodyOf(s);
    s.boss!.laser = { startAt: s.tick, fireAt: s.tick, endAt: s.tick + 100, from: 0, sweep: 1 };
    expect(laserAngle(s.boss!, s.tick)).toBe(0);
    expect(laserAngle(s.boss!, s.tick + 50)).toBeCloseTo(0.5);
    const at = (dx: number, dz: number) => ({ x: body.pos.x + dx, z: body.pos.z + dz });
    expect(laserHits(s, s.boss!, at(4, 0))).toBe(true);
    expect(laserHits(s, s.boss!, at(4, 2.5))).toBe(false);
    expect(laserHits(s, s.boss!, at(BOSS.laser.length + 3, 0))).toBe(false);
    expect(laserHits(s, s.boss!, at(-4, 0))).toBe(false);
  });

  it('the beam warns first, then burns a player who stays in it', () => {
    const s = fight();
    const body = bodyOf(s);
    body.speed = 0;
    const p = s.players[0];
    p.pos = { x: body.pos.x + 4, z: body.pos.z };
    s.boss!.nextAttackAt = 1e9;
    s.boss!.laser = { startAt: s.tick, fireAt: s.tick + 30, endAt: s.tick + 60, from: 0, sweep: 0 };
    const hp = p.hp;
    for (let i = 0; i < 25; i++) stepSim(s, []);
    expect(p.hp).toBe(hp);
    for (let i = 0; i < 30; i++) stepSim(s, []);
    expect(p.hp).toBeLessThan(hp);
    for (let i = 0; i < 20; i++) stepSim(s, []);
    expect(s.boss!.laser ?? null).toBeNull();
  });

  it('uses his eyes and his hammer', () => {
    const s = fight();
    s.players[0].invulnUntil = 1e9;
    let lasers = 0, volleys = 0;
    let had = false;
    for (let i = 0; i < 90 * 60; i++) {
      stepSim(s, []);
      if (s.boss?.laser && !had) lasers++;
      had = !!s.boss?.laser;
      if (s.events.filter(e => e.type === 'blastWarning').length >= 6) volleys++;
    }
    expect(lasers).toBeGreaterThan(1);
    expect(volleys).toBeGreaterThan(1);
  });

  it('falls with thunder and usually leaves a crate with his hammer in it', () => {
    let hammers = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = fight(seed);
      bodyOf(s).hp = 0;
      stepSim(s, []);
      expect(s.events.some(e => e.type === 'bossDead' && e.kind === 'dominik')).toBe(true);
      expect(s.crates).toHaveLength(1);
      if (s.crates[0].prize === 'thunderHammer') hammers++;
    }
    expect(hammers).toBeGreaterThanOrEqual(12);
    expect(hammers).toBeLessThan(20);
  });

  it('the crate opens with the Thunder Hammer on top: a weapon for a minute', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.crates = [{ id: s.nextId++, pos: { x: s.players[0].pos.x + 0.3, z: s.players[0].pos.z }, prize: 'thunderHammer' }];
    for (let i = 0; i < 30 && s.offers.length === 0; i++) stepSim(s, []);
    expect(s.offers[0].cards[0]).toEqual({ type: 'rare', rare: 'thunderHammer' });
  });

  it('the Thunder Hammer smashes what is in front of you and its lightning jumps on', () => {
    const s = createSim(FLOORS.arena.map, 2, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.boss = null;
    const p = s.players[0];
    p.aim = { x: 1, z: 0 };
    p.rare = { kind: 'thunderHammer', until: s.tick + RARE.durationTicks, cooldown: 0 };
    const near = spawnEnemy(s, 'tank', { x: p.pos.x + RARE.hammer.reach, z: p.pos.z });
    const chained = spawnEnemy(s, 'tank', { x: p.pos.x + RARE.hammer.reach + 4, z: p.pos.z });
    const far = spawnEnemy(s, 'tank', { x: p.pos.x - 12, z: p.pos.z });
    expect(fireRare(s, p)).toBe(true);
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(chained.hp).toBeLessThan(chained.maxHp);
    expect(near.maxHp - near.hp).toBeGreaterThan(chained.maxHp - chained.hp);
    expect(far.hp).toBe(far.maxHp);
    expect(fireRare(s, p)).toBe(false);
  });
});

describe('a small Angry Dominik from the wall', () => {
  it('comes out, is nearly impossible to beat, and is gone again after half a minute', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.nests = [];
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    s.players[0].invulnUntil = 1e9;
    releaseMiniDominik(s, { ...s.players[0].pos });
    expect(s.mini).toBeTruthy();
    const body = s.enemies.find(e => e.id === s.mini!.enemyId)!;
    expect(body.maxHp).toBeGreaterThan(3000);
    let joined = false;
    for (let i = 0; i < MINI.ticks - 30; i++) {
      stepSim(s, []);
      joined ||= s.events.some(e => e.type === 'dominikJoined');
    }
    expect(s.enemies.includes(body)).toBe(true);
    let left = false;
    for (let i = 0; i < 90; i++) {
      stepSim(s, []);
      left ||= s.events.some(e => e.type === 'dominikLeft');
    }
    expect(left).toBe(true);
    expect(s.mini ?? null).toBeNull();
    expect(s.enemies.includes(body)).toBe(false);
    void joined;
  });
});
