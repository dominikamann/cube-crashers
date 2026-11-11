import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { Command, TowerKind } from '../../src/sim/types';
import { quietSim, run } from './helpers';

const build = (padId: number, tower: TowerKind): Command => ({ type: 'build', playerId: 0, padId, tower });

function onPad(padId: number, coins: number) {
  const s = quietSim();
  const p = s.players[0];
  p.weapons = [];
  p.coins = coins;
  p.pos = { ...s.map.pads.find(x => x.id === padId)!.pos };
  return s;
}

describe('building', () => {
  it('builds a laser tower for 15 coins on an empty pad', () => {
    const s = onPad(4, 15);
    stepSim(s, [build(4, 'laser')]);
    expect(s.towers).toHaveLength(1);
    expect(s.towers[0]).toMatchObject({ kind: 'laser', padId: 4 });
    expect(s.players[0].coins).toBe(0);
    expect(s.events).toContainEqual({ type: 'towerBuilt', kind: 'laser', padId: 4 });
  });

  it('denies building without enough coins and changes nothing', () => {
    const s = onPad(4, 14);
    stepSim(s, [build(4, 'laser')]);
    expect(s.towers).toHaveLength(0);
    expect(s.players[0].coins).toBe(14);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: 4, reason: 'coins' });
  });

  it('denies building on an occupied pad', () => {
    const s = onPad(4, 100);
    stepSim(s, [build(4, 'laser')]);
    stepSim(s, [build(4, 'frost')]);
    expect(s.towers).toHaveLength(1);
    expect(s.players[0].coins).toBe(85);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: 4, reason: 'occupied' });
  });

  it('denies building when the player is not on the pad', () => {
    const s = onPad(4, 100);
    s.players[0].pos.x += 3;
    stepSim(s, [build(4, 'laser')]);
    expect(s.towers).toHaveLength(0);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: 4, reason: 'notOnPad' });
  });
});

describe('tower behaviour', () => {
  it('laser tower kills a blob in range', () => {
    const s = onPad(4, 15);
    stepSim(s, [build(4, 'laser')]);
    s.players[0].pos = { x: 0, z: 6 };
    const e = spawnEnemy(s, 'blob', { x: -3, z: -3 });
    e.speed = 0;
    const events = run(s, 120);
    expect(events.some(ev => ev.type === 'towerFired' && ev.kind === 'laser')).toBe(true);
    expect(s.enemies.find(x => x.id === e.id)).toBeUndefined();
  });

  it('frost tower halves enemy speed for 2 seconds', () => {
    const s = onPad(4, 20);
    stepSim(s, [build(4, 'frost')]);
    s.players[0].pos = { x: 6, z: 6 };
    const e = spawnEnemy(s, 'tank', { x: -4, z: -1 });
    stepSim(s, []);
    expect(e.slowUntil).toBeGreaterThan(s.tick);
    const z0 = e.pos.z;
    run(s, 60);
    expect(e.pos.z - z0).toBeCloseTo(0.45, 1);
  });

  it('popcorn mortar damages enemies in an area', () => {
    const s = onPad(4, 25);
    stepSim(s, [build(4, 'popcorn')]);
    s.players[0].pos = { x: 6, z: 6 };
    const a = spawnEnemy(s, 'tank', { x: -2, z: -4 });
    const b = spawnEnemy(s, 'tank', { x: -1.2, z: -4 });
    a.speed = b.speed = 0;
    run(s, 60);
    expect(a.hp).toBe(50);
    expect(b.hp).toBe(50);
  });

  it('frees the pad when a tower is destroyed', () => {
    const s = onPad(4, 100);
    stepSim(s, [build(4, 'laser')]);
    s.towers[0].hp = 0;
    stepSim(s, []);
    expect(s.towers).toHaveLength(0);
    stepSim(s, [build(4, 'laser')]);
    expect(s.towers).toHaveLength(1);
  });
});
