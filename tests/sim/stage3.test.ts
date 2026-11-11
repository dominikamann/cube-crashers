import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { BLOCKS_WALKER, isFree, Tile, tileAt } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { HOLD_TICKS } from '../../src/sim/config/balance';
import { addVehicle, VEHICLES } from '../../src/sim/systems/vehicles';
import { ENEMIES } from '../../src/sim/config/enemies';
import type { Command, SimState, Vec2 } from '../../src/sim/types';
import { move, quietSim, run } from './helpers';

const use: Command = { type: 'use', playerId: 0 };

function drive(kind: 'roller' | 'hoverboard', at: Vec2): SimState {
  const s = quietSim();
  s.players[0].pos = { x: at.x - 1, z: at.z };
  addVehicle(s, kind, at, 0);
  stepSim(s, [use]);
  return s;
}

describe('unlocks in the game', () => {
  it('locked weapons never come out of crates', () => {
    const s = createSim(floor01, 3, { unlocked: [] });
    for (let i = 0; i < 60; i++) {
      s.crates.push({ id: s.nextId++, pos: { ...s.players[0].pos } });
      stepSim(s, []);
      for (const o of s.offers) for (const c of o.cards) if (c.type === 'weapon') expect(['joystickBoomerang', 'discoBall', 'bananaMine', 'bomb']).not.toContain(c.weapon);
      s.offers = [];
    }
  });

  it('only unlocked vehicles are parked on the floor', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(createSim(floor01, seed, { unlocked: [] }).vehicles.every(v => v.kind === 'kart')).toBe(true);
    }
    const kinds = new Set([1, 2, 3, 4, 5, 6, 7, 8].flatMap(seed => createSim(floor01, seed, { unlocked: ['roller', 'hoverboard'] }).vehicles.map(v => v.kind)));
    expect(kinds.has('roller') || kinds.has('hoverboard')).toBe(true);
  });
});

describe('roller', () => {
  it('is slow, crushes hard and shrugs off hits', () => {
    const s = drive('roller', { x: 30.5, z: 54.5 });
    const v = s.vehicles[0];
    expect(v.hp).toBe(VEHICLES.roller.hp);
    const tank = spawnEnemy(s, 'tank', { x: 36.5, z: 54.5 });
    tank.speed = 0;
    run(s, 60, () => [move(1, 0)]);
    expect(Math.hypot(v.vel.x, v.vel.z)).toBeLessThanOrEqual(VEHICLES.roller.speed + 1e-6);
    expect(tank.hp).toBeLessThanOrEqual(ENEMIES.tank.hp - VEHICLES.roller.ramDamage);
  });

  it('does not jump off ramps', () => {
    const s = drive('roller', { x: 52.5, z: 26.5 });
    const events = run(s, 90, () => [move(0, 1)]);
    expect(events.some(e => e.type === 'kartJump')).toBe(false);
    expect(s.vehicles[0].pos.z).toBeLessThan(33);
  });
});

describe('hoverboard', () => {
  it('floats over glitch floor and low walls without harm', () => {
    const s = drive('hoverboard', { x: 52.5, z: 29.5 });
    run(s, 60, () => [move(0, 1)]);
    expect(s.vehicles[0].pos.z).toBeGreaterThan(36);
    const t = drive('hoverboard', { x: 33.5, z: 16.5 });
    run(t, 40, () => [move(1, 0)]);
    expect(t.players[0].hp).toBe(100);
    expect(tileAt(t.map, 34.5, 16.5)).toBe(Tile.Hazard);
  });

  it('is fast but does not ram', () => {
    const s = drive('hoverboard', { x: 30.5, z: 54.5 });
    const blob = spawnEnemy(s, 'blob', { x: 36.5, z: 54.5 });
    blob.speed = 0;
    run(s, 60, () => [move(1, 0)]);
    expect(Math.hypot(s.vehicles[0].vel.x, s.vehicles[0].vel.z)).toBeGreaterThan(13);
    expect(blob.hp).toBe(ENEMIES.blob.hp);
  });

  it('puts the rider on free floor when leaving above a low wall', () => {
    const s = drive('hoverboard', { x: 52.5, z: 31.5 });
    run(s, 12, () => [move(0, 1)]);
    stepSim(s, [use]);
    expect(isFree(s.map, s.players[0].pos, 0.4, BLOCKS_WALKER)).toBe(true);
  });
});

describe('endless mode', () => {
  function endless(): SimState {
    const s = createSim(floor01, 4, { mode: 'endless' });
    s.enemies = [];
    s.hordes = [];
    s.players[0].invulnUntil = 1e9;
    return s;
  }

  it('brings destroyed nests back after 60 seconds and never opens the elevator', () => {
    const s = endless();
    const n = s.nests[0];
    n.state = 'planted';
    n.progress = HOLD_TICKS - 1;
    s.players[0].pos = { x: n.pos.x + 1, z: n.pos.z };
    stepSim(s, []);
    expect(n.state).toBe('destroyed');
    for (const x of s.nests) x.state = 'destroyed';
    stepSim(s, []);
    expect(s.elevatorOpen).toBe(false);
    run(s, 60 * 60 + 5);
    expect(s.nests.some(x => x.state === 'idle')).toBe(true);
  });

  it('lets the alarm climb past 5', () => {
    const s = endless();
    s.alarm.level = 5;
    s.alarm.nextAt = s.tick + 1;
    run(s, 3);
    expect(s.alarm.level).toBe(6);
  });
});
