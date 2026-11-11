import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { Command, TowerKind } from '../../src/sim/types';
import { GATE_PAD, padAtPos, quietSim, rel, run } from './helpers';
import { ENEMIES } from '../../src/sim/config/enemies';
import { TOWERS } from '../../src/sim/config/towers';

const PAD = padAtPos(quietSim(), GATE_PAD.x, GATE_PAD.z);
const build = (padId: number, tower: TowerKind): Command => ({ type: 'build', playerId: 0, padId, tower });

function onPad(coins: number) {
  const s = quietSim();
  const p = s.players[0];
  p.weapons = [];
  p.coins = coins;
  const pad = s.map.pads.find(x => x.id === PAD)!.pos;
  p.pos = { ...pad };
  return { s, p, pad };
}

describe('building', () => {
  it('builds a laser tower on an empty pad and takes the coins', () => {
    const { s, p } = onPad(12);
    stepSim(s, [build(PAD, 'laser')]);
    expect(s.towers).toHaveLength(1);
    expect(s.towers[0]).toMatchObject({ kind: 'laser', padId: PAD });
    expect(p.coins).toBe(0);
    expect(s.events).toContainEqual({ type: 'towerBuilt', kind: 'laser', padId: PAD });
  });

  it('denies building without enough coins and changes nothing', () => {
    const { s, p } = onPad(11);
    stepSim(s, [build(PAD, 'laser')]);
    expect(s.towers).toHaveLength(0);
    expect(p.coins).toBe(11);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: PAD, reason: 'coins' });
  });

  it('denies building on an occupied pad', () => {
    const { s, p } = onPad(100);
    stepSim(s, [build(PAD, 'laser')]);
    stepSim(s, [build(PAD, 'frost')]);
    expect(s.towers).toHaveLength(1);
    expect(p.coins).toBe(88);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: PAD, reason: 'occupied' });
  });

  it('denies building when the player is not on the pad', () => {
    const { s, p } = onPad(100);
    p.pos.x += 3;
    stepSim(s, [build(PAD, 'laser')]);
    expect(s.towers).toHaveLength(0);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: PAD, reason: 'notOnPad' });
  });
});

describe('tower behaviour', () => {
  it('laser tower kills a blob in range', () => {
    const { s, p, pad } = onPad(12);
    stepSim(s, [build(PAD, 'laser')]);
    p.pos = rel(pad, 12, 0);
    const e = spawnEnemy(s, 'blob', rel(pad, -3, -3));
    e.speed = 0;
    const events = run(s, 120);
    expect(events.some(ev => ev.type === 'towerFired' && ev.kind === 'laser')).toBe(true);
    expect(s.enemies.find(x => x.id === e.id)).toBeUndefined();
  });

  it('does not shoot through a wall', () => {
    const { s, p, pad } = onPad(12);
    stepSim(s, [build(PAD, 'laser')]);
    p.pos = rel(pad, 12, 0);
    // the spawn room is behind the wall south of the pad
    const e = spawnEnemy(s, 'blob', rel(pad, -2, 4));
    e.speed = 0;
    run(s, 120);
    expect(e.hp).toBe(ENEMIES.blob.hp);
  });

  it('frost tower slows enemies in range for 2 seconds', () => {
    const { s, p, pad } = onPad(15);
    stepSim(s, [build(PAD, 'frost')]);
    p.pos = rel(pad, 12, 0);
    const e = spawnEnemy(s, 'tank', rel(pad, -2, -2));
    stepSim(s, []);
    expect(e.slowUntil - s.tick).toBeGreaterThan(110);
  });

  it('popcorn mortar damages enemies in an area', () => {
    const { s, p, pad } = onPad(20);
    stepSim(s, [build(PAD, 'popcorn')]);
    p.pos = rel(pad, 12, 0);
    const a = spawnEnemy(s, 'tank', rel(pad, -4, -3));
    const b = spawnEnemy(s, 'tank', rel(pad, -3.2, -3));
    a.speed = b.speed = 0;
    run(s, 60);
    expect(a.hp).toBe(ENEMIES.tank.hp - TOWERS.popcorn.damage);
    expect(b.hp).toBe(ENEMIES.tank.hp - TOWERS.popcorn.damage);
  });

  it('frees the pad when a tower is destroyed', () => {
    const { s } = onPad(100);
    stepSim(s, [build(PAD, 'laser')]);
    s.towers[0].hp = 0;
    stepSim(s, []);
    expect(s.towers).toHaveLength(0);
    stepSim(s, [build(PAD, 'laser')]);
    expect(s.towers).toHaveLength(1);
  });
});
