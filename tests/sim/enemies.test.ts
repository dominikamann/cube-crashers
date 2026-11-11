import { describe, expect, it } from 'vitest';
import { BLOCKS_ENEMY, isFree, parseMap } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { damageEnemy } from '../../src/sim/systems/combat';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { spawnHorde } from '../../src/sim/systems/hordes';
import type { SimEvent, SimState, Vec2 } from '../../src/sim/types';
import { quietSim, rel, run } from './helpers';
import { ENEMIES } from '../../src/sim/config/enemies';

const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const ROAD = { x: 30.5, z: 54.5 };

function onRoad(): SimState {
  const s = quietSim();
  s.players[0].pos = { ...ROAD };
  return s;
}

function runUntil(s: SimState, max: number, pred: (events: SimEvent[]) => boolean): number {
  for (let i = 0; i < max; i++) {
    stepSim(s, []);
    if (pred(s.events)) return i + 1;
  }
  return -1;
}

describe('chasing', () => {
  it('finds the way around a wall without ever touching it', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos = { x: 30.5, z: 62.5 };
    p.invulnUntil = 1e9;
    const e = spawnEnemy(s, 'hunter', { x: 30.5, z: 55.5 });
    let reached = -1;
    for (let i = 0; i < 600 && reached < 0; i++) {
      stepSim(s, []);
      expect(isFree(s.map, e.pos, e.radius - 1e-6, BLOCKS_ENEMY), `tick ${i}`).toBe(true);
      if (d(e.pos, p.pos) < 1) reached = i;
    }
    expect(reached).toBeGreaterThan(0);
  });

  it('stays put when the player cannot be reached', () => {
    const map = parseMap('sealed', ['#######', '#S.#..#', '#E.#..#', '#######']);
    const s = createSim(map, 1);
    s.alarm.nextAt = 1e9;
    const e = spawnEnemy(s, 'blob', { x: 5.5, z: 1.5 });
    const start = { ...e.pos };
    run(s, 120);
    expect(d(e.pos, start)).toBeLessThan(0.1);
  });

  it('hurts the player on contact', () => {
    const s = onRoad();
    spawnEnemy(s, 'blob', rel(ROAD, 2, 0));
    run(s, 180);
    expect(s.players[0].hp).toBeLessThan(100);
  });

  it('keeps 150 enemies out of the walls', () => {
    const s = quietSim();
    s.players[0].invulnUntil = 1e9;
    for (let i = 0; i < 10; i++) spawnHorde(s, { x: 18.5 + i * 3.5, z: 53.5 }, [{ kind: 'blob', count: 15 }], { rush: true });
    expect(s.enemies).toHaveLength(150);
    run(s, 300);
    for (const e of s.enemies) expect(isFree(s.map, e.pos, e.radius - 1e-6, BLOCKS_ENEMY), `${e.pos.x},${e.pos.z}`).toBe(true);
  });
});

describe('hordes', () => {
  it('wander without hunting a player who is far away', () => {
    const s = quietSim();
    const h = spawnHorde(s, { x: 15.5, z: 5.5 }, [{ kind: 'blob', count: 6 }]);
    const start = s.enemies.map(e => ({ ...e.pos }));
    run(s, 600);
    expect(h.aggro).toBe(false);
    expect(s.enemies.some((e, i) => d(e.pos, start[i]) > 1)).toBe(true);
    expect(s.players[0].hp).toBe(100);
  });

  it('hunt as a group once one of them sees a player', () => {
    const s = onRoad();
    const h = spawnHorde(s, rel(ROAD, 8, 0), [{ kind: 'blob', count: 6 }]);
    const mean = () => s.enemies.reduce((sum, e) => sum + d(e.pos, s.players[0].pos), 0) / s.enemies.length;
    const before = mean();
    run(s, 30);
    expect(h.aggro).toBe(true);
    run(s, 150);
    expect(before - mean()).toBeGreaterThan(2);
  });

  it('turn on whoever shoots them', () => {
    const s = quietSim();
    const h = spawnHorde(s, { x: 15.5, z: 5.5 }, [{ kind: 'tank', count: 2 }]);
    damageEnemy(s, s.enemies[0], 1, 'pixelBlaster', 0);
    expect(h.aggro).toBe(true);
  });

  it('are removed when the last member dies', () => {
    const s = quietSim();
    spawnHorde(s, { x: 15.5, z: 5.5 }, [{ kind: 'blob', count: 2 }]);
    for (const e of s.enemies) damageEnemy(s, e, 100, 'laser');
    run(s, 2);
    expect(s.hordes).toHaveLength(0);
  });
});

describe('shooter', () => {
  it('telegraphs, then fires a bullet that takes 10 hp', () => {
    const s = onRoad();
    spawnEnemy(s, 'shooter', rel(ROAD, 6, 0));
    const windup = runUntil(s, 60, ev => ev.some(e => e.type === 'enemyWindup' && e.kind === 'shooter'));
    expect(windup).toBeGreaterThan(0);
    const shot = runUntil(s, 40, ev => ev.some(e => e.type === 'enemyShot'));
    expect(shot).toBeGreaterThanOrEqual(20);
    run(s, 70);
    expect(s.players[0].hp).toBe(90);
  });

  it('misses a player who is in the air', () => {
    const s = onRoad();
    spawnEnemy(s, 'shooter', rel(ROAD, 6, 0));
    for (let i = 0; i < 150; i++) {
      s.players[0].air = 10;
      stepSim(s, []);
    }
    expect(s.players[0].hp).toBe(100);
  });
});

describe('bomber', () => {
  it('lights its fuse next to the player and explodes 0.6 s later', () => {
    const s = onRoad();
    const bomber = spawnEnemy(s, 'bomber', rel(ROAD, 3, 0));
    const fuse = runUntil(s, 60, ev => ev.some(e => e.type === 'enemyWindup' && e.kind === 'bomber'));
    expect(fuse).toBeGreaterThan(0);
    const blob = spawnEnemy(s, 'blob', rel(bomber.pos, 0, 1));
    blob.speed = 0;
    const boom = runUntil(s, 60, ev => ev.some(e => e.type === 'explosion'));
    expect(boom).toBe(36);
    expect(s.players[0].hp).toBe(75);
    expect(blob.hp).toBeLessThanOrEqual(0);
    expect(s.enemies.includes(bomber)).toBe(false);
  });

  it('blows up at once when killed, hurting only enemies', () => {
    const s = onRoad();
    const bomber = spawnEnemy(s, 'bomber', rel(ROAD, 1, 0));
    const blob = spawnEnemy(s, 'blob', rel(ROAD, 1.8, 0));
    damageEnemy(s, bomber, 100, 'pixelBlaster', 0);
    expect(s.events.some(e => e.type === 'explosion')).toBe(true);
    expect(blob.hp).toBeLessThanOrEqual(0);
    expect(s.players[0].hp).toBe(100);
    expect(s.players[0].combo).toBe(2);
  });
});

describe('rammer', () => {
  it('winds up, then charges and hits for 30', () => {
    const s = onRoad();
    spawnEnemy(s, 'rammer', rel(ROAD, 8, 0));
    const windup = runUntil(s, 30, ev => ev.some(e => e.type === 'enemyWindup' && e.kind === 'rammer'));
    expect(windup).toBeGreaterThan(0);
    run(s, 47);
    expect(s.players[0].hp).toBe(100);
    run(s, 45);
    expect(s.players[0].hp).toBe(70);
  });

  it('misses a player who steps aside and is stunned by the wall', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos = { x: 39.5, z: 60.5 };
    const rammer = spawnEnemy(s, 'rammer', { x: 34.5, z: 60.5 });
    runUntil(s, 30, ev => ev.some(e => e.type === 'enemyWindup'));
    p.pos = { x: 39.5, z: 66.5 };
    const stunnedAfter = (() => {
      for (let i = 0; i < 150; i++) {
        stepSim(s, []);
        if (rammer.state === 'stunned') return i;
      }
      return -1;
    })();
    expect(stunnedAfter).toBeGreaterThan(40);
    expect(rammer.pos.x).toBeGreaterThan(42);
    expect(p.hp).toBe(100);
    const x = rammer.pos.x;
    run(s, 60);
    expect(rammer.pos.x).toBe(x);
  });
});

describe('elite', () => {
  it('has 5 times the hp and drops a crate', () => {
    const s = quietSim();
    const e = spawnEnemy(s, 'blob', rel(s.players[0].pos, 6, 0), { elite: true });
    expect(e.hp).toBe(ENEMIES.blob.hp * 5);
    damageEnemy(s, e, 100, 'pixelBlaster', 0);
    expect(s.crates).toHaveLength(1);
    expect(s.score).toBe(ENEMIES.blob.score * 5);
  });
});
