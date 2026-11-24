import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from '../../src/sim/config/balance';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { FLING } from '../../src/sim/systems/player';
import { addKart, KART, MONSTER_FLING, RAM_FLING, ramFling, VEHICLES } from '../../src/sim/systems/vehicles';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { spawnBoss } from '../../src/sim/systems/boss';
import { ENEMIES } from '../../src/sim/config/enemies';
import type { Command, SimState, Vec2 } from '../../src/sim/types';
import { move, quietSim, rel, run } from './helpers';

const use: Command = { type: 'use', playerId: 0 };
const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const moveAs = (id: number, x: number, z: number): Command => ({ type: 'move', playerId: id, dir: { x, z } });

/** two players in the open middle of the arena: the first in a kart, the second `gap` tiles further along +x */
function match(versus: { mode: 'ffa' | 'team'; teams?: Record<number, 0 | 1> } | null, gap = 4): SimState {
  const s = versus
    ? createSim(FLOORS.arena.map, 3, { mode: 'versus', players: 2, versus: { rule: 'score', ...versus } })
    : createSim(FLOORS.arena.map, 3, { mode: 'quick', players: 2 });
  s.enemies = [];
  s.hordes = [];
  s.nests = [];
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  const mid = { x: s.map.w / 2 + 0.5, z: s.map.h / 2 + 0.5 };
  const [a, b] = s.players;
  a.pos = { ...mid };
  b.pos = rel(mid, gap, 0);
  for (const p of s.players) p.invulnUntil = 0;
  addKart(s, mid, 0);
  stepSim(s, [use]);
  expect(a.vehicleId).not.toBeNull();
  return s;
}

/** drives the kart along +x until the second player is thrown (or `max` ticks are up) */
function ramUntilFlung(s: SimState, max = 90): boolean {
  for (let i = 0; i < max; i++) {
    stepSim(s, [move(1, 0)]);
    if (s.events.some(e => e.type === 'playerFlung' && e.playerId === 1)) return true;
  }
  return false;
}

describe('a parked vehicle is solid', () => {
  it('nobody walks through a kart that stands free, but one can still get in', () => {
    const s = quietSim();
    const at = { x: 30.5, z: 54.5 };
    const kart = addKart(s, at, 0);
    const p = s.players[0];
    p.pos = rel(at, 2.5, 0);
    // held off at its edge every step of the way (sliding round it, as round a tower), never inside
    for (let i = 0; i < 90; i++) {
      stepSim(s, [move(-1, 0)]);
      expect(d(p.pos, kart.pos)).toBeGreaterThanOrEqual(VEHICLES.kart.radius + PLAYER_RADIUS - 0.02);
    }
    p.pos = rel(at, 1.3, 0);
    stepSim(s, [use]);
    expect(p.vehicleId).toBe(kart.id);
  });

  it('a kart someone drives is not a wall for the others: the ram rules handle that', () => {
    const s = quietSim();
    const at = { x: 30.5, z: 54.5 };
    const kart = addKart(s, at, 0);
    kart.driverId = 99;
    const p = s.players[0];
    p.pos = rel(at, 1.5, 0);
    for (let i = 0; i < 20; i++) stepSim(s, [move(-1, 0)]);
    expect(d(p.pos, kart.pos)).toBeLessThan(VEHICLES.kart.radius + PLAYER_RADIUS - 0.1);
  });
});

describe('a parked vehicle is solid for monsters', () => {
  it('a blob on its way to the player goes round a parked kart, never through it', () => {
    const s = quietSim();
    const at = { x: 30.5, z: 54.5 };
    const kart = addKart(s, at, 0);
    s.players[0].pos = rel(at, -3, 0);
    const blob = spawnEnemy(s, 'blob', rel(at, 3, 0));
    const start = d(blob.pos, s.players[0].pos);
    for (let i = 0; i < 180; i++) {
      stepSim(s, []);
      expect(d(blob.pos, kart.pos)).toBeGreaterThanOrEqual(VEHICLES.kart.radius + blob.radius - 0.02);
    }
    expect(d(blob.pos, s.players[0].pos)).toBeLessThan(start - 2);
  });

  it('a charging rammer is stopped at its side', () => {
    const s = quietSim();
    const at = { x: 30.5, z: 54.5 };
    const kart = addKart(s, at, 0);
    const rammer = spawnEnemy(s, 'rammer', rel(at, 2.5, 0));
    rammer.state = 'charge';
    rammer.dir = { x: -1, z: 0 };
    rammer.chargeLeft = 8;
    for (let i = 0; i < 60; i++) {
      stepSim(s, []);
      expect(d(rammer.pos, kart.pos)).toBeGreaterThanOrEqual(VEHICLES.kart.radius + rammer.radius - 0.02);
    }
  });
});

describe('running monsters down', () => {
  /** the player in a kart at `at`, a monster of `kind` in the way along +x */
  function ram(kind: 'rammer' | 'tank' | 'blob', elite = false) {
    const s = quietSim();
    const at = { x: 30.5, z: 54.5 };
    s.players[0].pos = rel(at, 1, 0);
    addKart(s, at, 0);
    stepSim(s, [use]);
    const e = spawnEnemy(s, kind, rel(at, 4, 0), { elite });
    for (let i = 0; i < 90; i++) {
      stepSim(s, [move(1, 0)]);
      if (s.events.some(ev => ev.type === 'kartRam')) break;
    }
    return { s, e };
  }

  it('throws a monster back the way the kart goes, as far as a player, and it survives if it can', () => {
    const { s, e } = ram('blob', true);
    expect(e.hp).toBe(ENEMIES.blob.hp * 3.5 - KART.ramDamage);
    expect(e.flung).toBeDefined();
    expect(e.flung!.dir.x).toBeCloseTo(1);
    // (the first step of the flight is already taken this tick: a tenth of it)
    expect(e.flung!.left).toBeGreaterThan(RAM_FLING.min * 0.9);
    const hit = { ...e.pos };
    run(s, 40);
    expect(e.pos.x - hit.x).toBeGreaterThan(2.5);
    expect(e.flung).toBeUndefined();
  });

  it('one that dies of it bursts flying: its pieces carry the throw', () => {
    const { s, e } = ram('blob');
    expect(e.hp).toBeLessThanOrEqual(0);
    const killed = s.events.find(ev => ev.type === 'enemyKilled');
    expect(killed && killed.type === 'enemyKilled' && killed.thrown!.x).toBeGreaterThan(5);
  });

  it('a heavy one is only shoved a little', () => {
    const { e } = ram('tank');
    expect(e.flung?.left).toBeCloseTo(MONSTER_FLING.heavy * 0.9);
  });

  it('a boss is pushed, not thrown', () => {
    const s = quietSim();
    const at = { x: 30.5, z: 54.5 };
    s.players[0].pos = rel(at, 1, 0);
    addKart(s, at, 0);
    stepSim(s, [use]);
    spawnBoss(s, 'rex', rel(at, 5, 0));
    const boss = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    for (let i = 0; i < 90; i++) {
      stepSim(s, [move(1, 0)]);
      if (s.events.some(ev => ev.type === 'kartRam')) break;
    }
    expect(boss.flung).toBeUndefined();
    expect(Math.hypot(boss.knock.x, boss.knock.z)).toBeGreaterThan(0);
  });
});

describe('running a rival down', () => {
  it('throws the faster the faster the kart goes', () => {
    expect(ramFling(KART.ramSpeed)).toBe(RAM_FLING.min);
    expect(ramFling(KART.speed)).toBe(RAM_FLING.max);
    expect(ramFling(KART.speed * 2)).toBe(RAM_FLING.max);
    expect(ramFling((KART.ramSpeed + KART.speed) / 2)).toBeCloseTo((RAM_FLING.min + RAM_FLING.max) / 2);
  });

  it('knocks a rival over: hurt, thrown along the kart, flat on the floor a moment, then up again', () => {
    const s = match({ mode: 'ffa' });
    const b = s.players[1];
    const from = { ...b.pos };
    expect(ramUntilFlung(s)).toBe(true);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.flung).toBeDefined();
    expect(b.flung!.dir.x).toBeCloseTo(1);
    expect(b.flung!.left).toBeGreaterThanOrEqual(RAM_FLING.min);
    expect(b.flung!.lie).toBe(FLING.lieTicks);
    // thrown along +x over the next moments, whatever they try: no walking back, no shooting; and the kart that
    // drives on behind them does not run them down a second time while they are down
    const hp = b.hp;
    for (let i = 0; i < 40; i++) stepSim(s, [move(1, 0), moveAs(1, -1, 0), { type: 'fire', playerId: 1 }]);
    expect(b.pos.x - from.x).toBeGreaterThan(2);
    expect(b.hp).toBe(hp);
    expect(s.projectiles.filter(x => x.ownerId === 1)).toHaveLength(0);
    // lying there: the flight is over, they do not move yet
    expect(b.flung).toBeDefined();
    expect(b.flung!.left).toBe(0);
    const down = { ...b.pos };
    for (let i = 0; i < 10; i++) stepSim(s, [moveAs(1, -1, 0)]);
    expect(d(b.pos, down)).toBeLessThan(0.01);
    // and up again after the lie, walking as they please
    for (let i = 0; i < FLING.lieTicks; i++) stepSim(s, [moveAs(1, -1, 0)]);
    expect(b.flung).toBeUndefined();
    expect(b.pos.x).toBeLessThan(down.x);
  });

  it('the Rhino rule: a short shove does not put anyone on the floor', () => {
    const s = match({ mode: 'ffa' });
    const b = s.players[1];
    expect(ramUntilFlung(s)).toBe(true);
    b.flung = { dir: { x: 1, z: 0 }, left: 1, lie: 0 };
    for (let i = 0; i < 20; i++) stepSim(s, []);
    expect(b.flung).toBeUndefined();
  });

  it('not a teammate, and not in co-op', () => {
    for (const s of [match({ mode: 'team', teams: { 0: 0, 1: 0 } }), match(null)]) {
      const b = s.players[1];
      if (s.versus) for (const p of s.players) p.team = 0;
      expect(ramUntilFlung(s, 60)).toBe(false);
      expect(b.flung).toBeUndefined();
      expect(b.hp).toBe(b.maxHp);
    }
  });
});
