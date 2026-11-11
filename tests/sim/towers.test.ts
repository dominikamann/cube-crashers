import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { Command, TowerKind } from '../../src/sim/types';
import { GATE_PAD, padAtPos, quietSim, rel, run } from './helpers';
import { ENEMIES } from '../../src/sim/config/enemies';
import { BUILD_TICKS, MAX_TOWER_LEVEL, REPAIR_PER_SECOND, TOWERS, UPGRADE_TICKS, towerStats, upgradeCost } from '../../src/sim/config/towers';

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
    const { s, p } = onPad(TOWERS.laser.cost);
    stepSim(s, [build(PAD, 'laser')]);
    s.towers[0].buildLeft = 0;
    expect(s.towers).toHaveLength(1);
    expect(s.towers[0]).toMatchObject({ kind: 'laser', padId: PAD });
    expect(p.coins).toBe(0);
    expect(s.events).toContainEqual({ type: 'towerBuilt', kind: 'laser', padId: PAD, playerId: 0 });
  });

  it('denies building without enough coins and changes nothing', () => {
    const { s, p } = onPad(TOWERS.laser.cost - 1);
    stepSim(s, [build(PAD, 'laser')]);
    expect(s.towers).toHaveLength(0);
    expect(p.coins).toBe(TOWERS.laser.cost - 1);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: PAD, reason: 'coins', playerId: 0 });
  });

  it('denies building on an occupied pad', () => {
    const { s, p } = onPad(100);
    stepSim(s, [build(PAD, 'laser')]);
    stepSim(s, [build(PAD, 'frost')]);
    expect(s.towers).toHaveLength(1);
    expect(p.coins).toBe(100 - TOWERS.laser.cost);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: PAD, reason: 'occupied', playerId: 0 });
  });

  it('denies building when the player is not on the pad', () => {
    const { s, p } = onPad(100);
    p.pos.x += 3;
    stepSim(s, [build(PAD, 'laser')]);
    expect(s.towers).toHaveLength(0);
    expect(s.events).toContainEqual({ type: 'buildDenied', padId: PAD, reason: 'notOnPad', playerId: 0 });
  });
});

describe('tower behaviour', () => {
  it('laser tower kills a blob in range', () => {
    const { s, p, pad } = onPad(TOWERS.laser.cost);
    stepSim(s, [build(PAD, 'laser')]);
    s.towers[0].buildLeft = 0;
    p.pos = rel(pad, 12, 0);
    const e = spawnEnemy(s, 'blob', rel(pad, -3, -3));
    e.speed = 0;
    const events = run(s, 120);
    expect(events.some(ev => ev.type === 'towerFired' && ev.kind === 'laser')).toBe(true);
    expect(s.enemies.find(x => x.id === e.id)).toBeUndefined();
  });

  it('does not shoot through a wall', () => {
    const { s, p, pad } = onPad(TOWERS.laser.cost);
    stepSim(s, [build(PAD, 'laser')]);
    s.towers[0].buildLeft = 0;
    p.pos = rel(pad, 12, 0);
    // the spawn room is behind the wall south of the pad
    const e = spawnEnemy(s, 'blob', rel(pad, -2, 4));
    e.speed = 0;
    run(s, 120);
    expect(e.hp).toBe(ENEMIES.blob.hp);
  });

  it('frost tower slows enemies in range for 2 seconds', () => {
    const { s, p, pad } = onPad(TOWERS.frost.cost);
    stepSim(s, [build(PAD, 'frost')]);
    s.towers[0].buildLeft = 0;
    p.pos = rel(pad, 12, 0);
    const e = spawnEnemy(s, 'tank', rel(pad, -2, -2));
    stepSim(s, []);
    expect(e.slowUntil - s.tick).toBeGreaterThan(110);
  });

  it('popcorn mortar damages enemies in an area', () => {
    const { s, p, pad } = onPad(TOWERS.popcorn.cost);
    stepSim(s, [build(PAD, 'popcorn')]);
    s.towers[0].buildLeft = 0;
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

describe('destroyed towers', () => {
  it('report that they are gone', () => {
    const { s } = onPad(100);
    stepSim(s, [build(PAD, 'laser')]);
    s.towers[0].hp = 0;
    stepSim(s, []);
    expect(s.events).toContainEqual({ type: 'towerDestroyed', kind: 'laser', pos: s.map.pads.find(p => p.id === PAD)!.pos });
  });
});

describe('construction, repair and upgrades', () => {
  const hold: Command = { type: 'hold', playerId: 0 };
  const upgrade = (padId: number): Command => ({ type: 'upgrade', playerId: 0, padId });

  function built(kind: TowerKind = 'laser', coins = 0) {
    const o = onPad(TOWERS[kind].cost + coins);
    stepSim(o.s, [build(PAD, kind)]);
    run(o.s, BUILD_TICKS + 5, () => [hold]);
    return o;
  }

  it('a new tower is only a frame: it does not fire until it is built', () => {
    const { s, pad } = onPad(TOWERS.laser.cost);
    stepSim(s, [build(PAD, 'laser')]);
    expect(s.towers[0].buildLeft).toBe(BUILD_TICKS);
    s.players[0].pos = rel(pad, 0, 3);
    spawnEnemy(s, 'tank', rel(pad, 3, 0));
    const events = run(s, 60);
    expect(events.some(e => e.type === 'towerFired')).toBe(false);
  });

  it('holding E on the pad builds it; letting go keeps the progress for later', () => {
    const { s } = onPad(TOWERS.laser.cost);
    stepSim(s, [build(PAD, 'laser')]);
    run(s, 50, () => [hold]);
    expect(s.towers[0].buildLeft).toBe(BUILD_TICKS - 50);
    run(s, 100);
    expect(s.towers[0].buildLeft).toBe(BUILD_TICKS - 50);
    const events = run(s, BUILD_TICKS - 50, () => [hold]);
    expect(s.towers[0].buildLeft).toBe(0);
    expect(events).toContainEqual({ type: 'towerDone', padId: PAD, level: 1 });
  });

  it('holding E repairs a damaged tower for free, up to full health', () => {
    const { s, p } = built();
    const t = s.towers[0];
    t.hp = 10;
    run(s, 30, () => [hold]);
    expect(t.hp).toBeCloseTo(10 + t.maxHp * REPAIR_PER_SECOND * 0.5, 5);
    run(s, 600, () => [hold]);
    expect(t.hp).toBe(t.maxHp);
    expect(p.coins).toBe(0);
  });

  it('an upgrade costs coins, is built like a tower and makes it stronger', () => {
    const { s, p } = built('laser', upgradeCost('laser', 2));
    const before = towerStats('laser', 1);
    stepSim(s, [upgrade(PAD)]);
    expect(p.coins).toBe(0);
    expect(s.towers[0].level).toBe(1);
    expect(s.towers[0].buildLeft).toBe(UPGRADE_TICKS);
    const events = run(s, UPGRADE_TICKS, () => [hold]);
    expect(events).toContainEqual({ type: 'towerDone', padId: PAD, level: 2 });
    const after = towerStats('laser', 2);
    expect(s.towers[0].level).toBe(2);
    expect(s.towers[0].maxHp).toBe(after.hp);
    expect(after.damage).toBeGreaterThan(before.damage);
    expect(after.range).toBeGreaterThan(before.range);
  });

  it('denies an upgrade without coins, while still building, and past the top level', () => {
    const { s, p } = onPad(TOWERS.laser.cost + 1000);
    stepSim(s, [build(PAD, 'laser')]);
    stepSim(s, [upgrade(PAD)]);
    expect(s.events).toContainEqual({ type: 'upgradeDenied', padId: PAD, reason: 'building', playerId: 0 });
    run(s, BUILD_TICKS, () => [hold]);
    for (let lvl = 2; lvl <= MAX_TOWER_LEVEL; lvl++) {
      stepSim(s, [upgrade(PAD)]);
      run(s, UPGRADE_TICKS, () => [hold]);
    }
    expect(s.towers[0].level).toBe(MAX_TOWER_LEVEL);
    stepSim(s, [upgrade(PAD)]);
    expect(s.events).toContainEqual({ type: 'upgradeDenied', padId: PAD, reason: 'maxLevel', playerId: 0 });
    p.coins = 0;
    s.towers[0].level = 1;
    stepSim(s, [upgrade(PAD)]);
    expect(s.events).toContainEqual({ type: 'upgradeDenied', padId: PAD, reason: 'coins', playerId: 0 });
  });

  it('prices: towers 40-60 coins, upgrades the same and half again', () => {
    expect([TOWERS.laser.cost, TOWERS.frost.cost, TOWERS.popcorn.cost]).toEqual([40, 50, 60]);
    expect(upgradeCost('laser', 2)).toBe(40);
    expect(upgradeCost('laser', 3)).toBe(60);
  });
});
