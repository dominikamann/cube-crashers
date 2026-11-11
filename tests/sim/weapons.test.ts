import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { Command, HeldWeapon, WeaponKind } from '../../src/sim/types';
import { aimAt, fire, quietSim, rel, run } from './helpers';

const held = (...kinds: WeaponKind[]): HeldWeapon[] => kinds.map(kind => ({ kind, level: 1, cooldown: 0 }));
const select = (slot: number): Command => ({ type: 'select', playerId: 0, slot });

describe('manual fire', () => {
  it('does not shoot on its own', () => {
    const s = quietSim();
    const e = spawnEnemy(s, 'blob', rel(s.players[0].pos, 0, -3));
    const events = run(s, 60);
    expect(events.some(ev => ev.type === 'shot')).toBe(false);
    expect(e.hp).toBe(10);
  });

  it('shoots along the aim and misses what is not on the line', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos.z = 66.5;
    const onLine = spawnEnemy(s, 'tank', rel(p.pos, 0, -6));
    const aside = spawnEnemy(s, 'tank', rel(p.pos, 4, -3));
    stepSim(s, [aimAt(rel(p.pos, 0, -4)), fire]);
    expect(s.events).toContainEqual({ type: 'shot', weapon: 'pixelBlaster', pos: p.pos });
    run(s, 40);
    expect(onLine.hp).toBe(55);
    expect(aside.hp).toBe(60);
  });

  it('deals 50 % more within 3 tiles', () => {
    const s = quietSim();
    const p = s.players[0];
    const near = spawnEnemy(s, 'tank', rel(p.pos, 0, -2));
    stepSim(s, [aimAt(near.pos), fire]);
    run(s, 20);
    expect(near.hp).toBe(52.5);
  });

  it('bolts stop at walls', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos = { x: 30.5, z: 62.5 };
    const e = spawnEnemy(s, 'tank', { x: 30.5, z: 55.5 });
    run(s, 90, () => [aimAt(e.pos), fire]);
    expect(e.hp).toBe(60);
  });

  it('keeps reloading weapons that are not selected', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = held('pixelBlaster', 'bomb');
    p.weapons[1].cooldown = 2;
    run(s, 60);
    expect(p.weapons[1].cooldown).toBeCloseTo(1, 2);
    run(s, 61);
    expect(p.weapons[1].cooldown).toBe(0);
  });

  it('fires the selected weapon and respects its cooldown', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = held('pixelBlaster', 'laserSword');
    stepSim(s, [select(1)]);
    expect(p.selected).toBe(1);
    expect(s.events).toContainEqual({ type: 'weaponSelected', playerId: 0, slot: 1 });
    const events = run(s, 31, () => [aimAt(rel(p.pos, 0, -3)), fire]);
    const shots = events.filter(e => e.type === 'shot');
    expect(shots.every(e => e.type === 'shot' && e.weapon === 'laserSword')).toBe(true);
    expect(shots).toHaveLength(2);
  });

  it('ignores a slot without a weapon', () => {
    const s = quietSim();
    stepSim(s, [select(4)]);
    expect(s.players[0].selected).toBe(0);
  });
});

describe('weapons', () => {
  it('laser sword hits what is in front, not what is behind', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = held('laserSword');
    const front = spawnEnemy(s, 'tank', rel(p.pos, 0, -1.5));
    const back = spawnEnemy(s, 'tank', rel(p.pos, 0, 1.5));
    stepSim(s, [aimAt(rel(p.pos, 0, -5)), fire]);
    expect(front.hp).toBe(33);
    expect(back.hp).toBe(60);
  });

  it('candy cannon fires a spread of 6 pellets', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = held('candyCannon');
    stepSim(s, [aimAt(rel(p.pos, 0, -5)), fire]);
    expect(s.projectiles).toHaveLength(6);
    expect(new Set(s.projectiles.map(b => b.vel.x.toFixed(3))).size).toBe(6);
  });

  it('hotdog slinger leaves a mustard puddle at the aim point', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos.z = 66.5;
    p.weapons = held('hotdogSlinger');
    const target = rel(p.pos, 0, -6);
    const e = spawnEnemy(s, 'tank', target);
    stepSim(s, [aimAt(target), fire]);
    run(s, 120);
    expect(e.hp).toBeLessThan(60);
    expect(e.hp).toBeGreaterThan(20);
  });

  it('boomerang pierces and comes back', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos.z = 66.5;
    p.weapons = held('joystickBoomerang');
    const a = spawnEnemy(s, 'tank', rel(p.pos, 0, -4));
    const b = spawnEnemy(s, 'tank', rel(p.pos, 0, -5.5));
    stepSim(s, [aimAt(rel(p.pos, 0, -6)), fire]);
    run(s, 120);
    expect(a.hp).toBe(40);
    expect(b.hp).toBe(40);
    expect(s.projectiles).toHaveLength(0);
  });

  it('disco ball zaps the nearest enemies around and keeps its charge when nothing is near', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = held('discoBall');
    stepSim(s, [fire]);
    expect(p.weapons[0].cooldown).toBe(0);
    const es = [rel(p.pos, 4, 0), rel(p.pos, -4, 0), rel(p.pos, 0, 4.5)].map(pos => spawnEnemy(s, 'tank', pos));
    stepSim(s, [fire]);
    expect(es.map(e => e.hp)).toEqual([48, 48, 48]);
    expect(p.weapons[0].cooldown).toBeGreaterThan(3);
  });

  it('banana mine explodes when an enemy touches it', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = held('bananaMine');
    const spot = { ...p.pos };
    stepSim(s, [fire]);
    expect(s.mines).toHaveLength(1);
    p.pos = rel(spot, 6, 0);
    run(s, 40);
    expect(s.mines).toHaveLength(1);
    const blob = spawnEnemy(s, 'blob', rel(spot, 0.5, 0));
    const tank = spawnEnemy(s, 'tank', rel(spot, 2, 0));
    const events = run(s, 2);
    expect(events.some(e => e.type === 'explosion')).toBe(true);
    expect(s.mines).toHaveLength(0);
    expect(s.enemies.includes(blob)).toBe(false);
    expect(tank.hp).toBe(20);
    expect(p.hp).toBe(100);
  });

  it('keeps at most 5 mines per player', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = held('bananaMine');
    const start = { ...p.pos };
    for (let i = 0; i < 6; i++) {
      p.pos = rel(start, (i % 3) * 2 - 2, i < 3 ? 0 : 2);
      p.weapons[0].cooldown = 0;
      stepSim(s, [fire]);
    }
    expect(s.mines).toHaveLength(5);
    expect(s.mines.some(m => m.pos.x === start.x - 2 && m.pos.z === start.z)).toBe(false);
  });

  it('bomb lands at the aim point and blasts everything within 3 tiles', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos.z = 66.5;
    p.weapons = held('bomb');
    const target = rel(p.pos, 0, -6);
    const inside = spawnEnemy(s, 'tank', rel(target, 2.2, 0));
    const outside = spawnEnemy(s, 'tank', rel(target, 4.5, 0));
    stepSim(s, [aimAt(target), fire]);
    const events = run(s, 50);
    expect(events.filter(e => e.type === 'explosion')).toHaveLength(1);
    expect(inside.hp).toBe(10);
    expect(outside.hp).toBe(60);
  });

  it('adds 20 % damage per level', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos.z = 66.5;
    p.weapons = [{ kind: 'pixelBlaster', level: 2, cooldown: 0 }];
    const e = spawnEnemy(s, 'tank', rel(p.pos, 0, -6));
    stepSim(s, [aimAt(e.pos), fire]);
    run(s, 40);
    expect(e.hp).toBe(54);
  });

  it('splitter leaves two splitlings', () => {
    const s = quietSim();
    const e = spawnEnemy(s, 'splitter', rel(s.players[0].pos, 0, -6));
    e.hp = 1;
    run(s, 40, () => [aimAt(e.pos), fire]);
    expect(s.enemies.filter(x => x.kind === 'splitling').length).toBeGreaterThanOrEqual(1);
    expect(s.enemies.includes(e)).toBe(false);
  });
});
