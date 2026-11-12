import { describe, expect, it } from 'vitest';
import { BLOCKS_AIR, BLOCKS_KART, BLOCKS_WALKER, isFree } from '../../src/sim/map/tilemap';
import { Rng } from '../../src/sim/rng';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { damagePlayer } from '../../src/sim/systems/player';
import { addKart, KART } from '../../src/sim/systems/vehicles';
import type { Command, SimEvent, SimState, Vec2, Vehicle } from '../../src/sim/types';
import { dash, GATE_PAD, jump, move, padAtPos, quietSim, rel, run } from './helpers';
import { ENEMIES } from '../../src/sim/config/enemies';

const use: Command = { type: 'use', playerId: 0 };
const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** player sitting in a kart at `at` */
function driving(at: Vec2 = { x: 30.5, z: 54.5 }): { s: SimState; kart: Vehicle } {
  const s = quietSim();
  s.players[0].pos = rel(at, 1, 0);
  const kart = addKart(s, at, 0);
  stepSim(s, [use]);
  return { s, kart };
}

function driveUntil(s: SimState, dir: Vec2, max: number, type: SimEvent['type']): number {
  for (let i = 0; i < max; i++) {
    stepSim(s, [move(dir.x, dir.z)]);
    if (s.events.some(e => e.type === type)) return i + 1;
  }
  return -1;
}

describe('getting in and out', () => {
  it('E next to a kart gets in, E again gets out onto a free tile', () => {
    const { s, kart } = driving();
    const p = s.players[0];
    expect(p.vehicleId).toBe(kart.id);
    expect(kart.driverId).toBe(0);
    expect(p.pos).toEqual(kart.pos);
    stepSim(s, [use]);
    expect(p.vehicleId).toBeNull();
    expect(kart.driverId).toBeNull();
    expect(d(p.pos, kart.pos)).toBeGreaterThan(0.9);
    expect(isFree(s.map, p.pos, 0.4, BLOCKS_WALKER)).toBe(true);
  });

  it('does nothing when no kart is near', () => {
    const s = quietSim();
    addKart(s, rel(s.players[0].pos, 4, 0), 0);
    stepSim(s, [use]);
    expect(s.players[0].vehicleId).toBeNull();
  });

  it('ignores jump, dash and building while driving', () => {
    const s = quietSim();
    const pad = s.map.pads.find(x => x.id === padAtPos(s, GATE_PAD.x, GATE_PAD.z))!;
    s.players[0].pos = rel(pad.pos, 0.5, 0);
    s.players[0].coins = 50;
    addKart(s, pad.pos, 0);
    stepSim(s, [use]);
    stepSim(s, [jump, dash, { type: 'build', playerId: 0, padId: pad.id, tower: 'laser' }]);
    expect(s.events.some(e => e.type === 'jump' || e.type === 'dash')).toBe(false);
    expect(s.towers).toHaveLength(0);
  });
});

describe('driving', () => {
  it('reaches 12 tiles per second and needs time to turn around', () => {
    const { s, kart } = driving();
    run(s, 40, () => [move(1, 0)]);
    expect(Math.hypot(kart.vel.x, kart.vel.z)).toBeCloseTo(12, 1);
    expect(s.players[0].pos).toEqual(kart.pos);
    run(s, 6, () => [move(-1, 0)]);
    expect(kart.vel.x).toBeGreaterThan(0);
    run(s, 60, () => [move(-1, 0)]);
    expect(kart.vel.x).toBeCloseTo(-12, 1);
  });

  it('stops at walls', () => {
    const { s, kart } = driving({ x: 40.5, z: 54.5 });
    run(s, 60, () => [move(0, -1)]);
    expect(kart.pos.z).toBeGreaterThanOrEqual(51.7);
    expect(kart.pos.z).toBeLessThan(51.95);
    expect(kart.vel.z).toBe(0);
  });

  it('runs out of fuel after 20 seconds of driving, throws the driver out and comes back later', () => {
    const { s, kart } = driving();
    expect(kart.fuel).toBe(1200);
    kart.fuel = 60;
    const after = driveUntil(s, { x: -1, z: 0 }, 120, 'kartDestroyed');
    expect(after).toBeGreaterThan(55);
    const p = s.players[0];
    expect(p.vehicleId).toBeNull();
    expect(p.hp).toBe(100);
    expect(s.vehicles).toHaveLength(0);
    expect(s.vehicleRespawns).toHaveLength(1);
    run(s, KART.respawnTicks + 1);
    expect(s.vehicles).toHaveLength(1);
    expect(s.vehicles[0].pos).toEqual(s.map.vehicleSpots[0]);
  });
});

describe('ramming', () => {
  it('kills a blob, costs 2 durability and feeds the combo', () => {
    const { s, kart } = driving();
    const blob = spawnEnemy(s, 'blob', rel(kart.pos, 5, 0));
    blob.speed = 0;
    expect(driveUntil(s, { x: 1, z: 0 }, 60, 'kartRam')).toBeGreaterThan(0);
    expect(blob.hp).toBeLessThanOrEqual(0);
    expect(kart.hp).toBe(98);
    expect(s.players[0].combo).toBe(1);
    expect(s.stats.kills.kart).toBe(1);
  });

  it('costs 10 durability against an Armor Block', () => {
    const { s, kart } = driving();
    const tank = spawnEnemy(s, 'tank', rel(kart.pos, 5, 0));
    tank.speed = 0;
    driveUntil(s, { x: 1, z: 0 }, 60, 'kartRam');
    expect(tank.hp).toBe(ENEMIES.tank.hp - KART.ramDamage);
    expect(kart.hp).toBe(90);
  });

  it('protects the driver: hits go to the kart', () => {
    const { s, kart } = driving();
    damagePlayer(s, s.players[0], 10);
    expect(s.players[0].hp).toBe(100);
    expect(kart.hp).toBe(90);
    spawnEnemy(s, 'tank', { ...kart.pos }).speed = 0;
    run(s, 60);
    expect(s.players[0].hp).toBe(100);
  });

  it('is wrecked at 0 durability', () => {
    const { s, kart } = driving();
    damagePlayer(s, s.players[0], 100);
    stepSim(s, []);
    expect(s.events.some(e => e.type === 'kartDestroyed')).toBe(true);
    expect(s.vehicles.includes(kart)).toBe(false);
    expect(s.players[0].vehicleId).toBeNull();
    expect(s.credits).toBe(3);
  });
});

describe('ramps and low walls', () => {
  it('a low wall stops a kart on the ground', () => {
    const { s, kart } = driving({ x: 52.5, z: 32.2 });
    run(s, 60, () => [move(0, 1)]);
    expect(kart.pos.z).toBeLessThan(33);
  });

  it('a ramp sends the kart over the low wall and the landing hurts', () => {
    const { s, kart } = driving({ x: 52.5, z: 26.5 });
    const tank = spawnEnemy(s, 'tank', { x: 52.5, z: 40.5 });
    tank.speed = 0;
    expect(driveUntil(s, { x: 0, z: 1 }, 60, 'kartJump')).toBeGreaterThan(0);
    expect(driveUntil(s, { x: 0, z: 1 }, 60, 'kartLand')).toBeGreaterThan(40);
    expect(kart.pos.z).toBeGreaterThan(35);
    expect(tank.hp).toBeLessThan(ENEMIES.tank.hp);
    expect(isFree(s.map, kart.pos, KART.radius - 1e-6, BLOCKS_KART)).toBe(true);
  });

  it('never ends up inside a wall (fuzz)', () => {
    const { s, kart } = driving();
    kart.fuel = 1e9;
    kart.hp = 1e9;
    const rng = new Rng(11);
    let dir = { x: 1, z: 0 };
    for (let i = 0; i < 3000; i++) {
      if (i % 20 === 0) {
        const a = rng.range(0, Math.PI * 2);
        dir = { x: Math.cos(a), z: Math.sin(a) };
      }
      stepSim(s, [move(dir.x, dir.z)]);
      const blocks = kart.air > 0 ? BLOCKS_AIR : BLOCKS_KART;
      expect(isFree(s.map, kart.pos, KART.radius - 1e-6, blocks), `tick ${i} at ${kart.pos.x},${kart.pos.z}`).toBe(true);
    }
  });
});

describe('vehicles and solid bosses', () => {
  it('no vehicle drives through the Mega Block: it stops at its edge, and a ram at speed still hurts it', async () => {
    const { FLOORS } = await import('../../src/sim/config/floors');
    const { createSim } = await import('../../src/sim/sim');
    const { addVehicle, VEHICLES } = await import('../../src/sim/systems/vehicles');
    const { solidEdge } = await import('../../src/sim/systems/combat');
    for (const kind of ['kart', 'roller', 'hoverboard', 'unicorn'] as const) {
      const s = createSim(FLOORS.arena.map, 3, { mode: 'quick' });
      const boss = s.enemies.find(e => e.kind === 'megaBlock')!;
      boss.speed = 0;
      s.boss!.nextAttackAt = 1e9;
      const p = s.players[0];
      p.invulnUntil = 1e9;
      const v = addVehicle(s, kind, { x: boss.pos.x - 6, z: boss.pos.z }, 0);
      v.driverId = p.id;
      p.vehicleId = v.id;
      const hp = boss.hp;
      let closest = Infinity;
      for (let i = 0; i < 150; i++) {
        stepSim(s, [{ type: 'move', playerId: p.id, dir: { x: 1, z: 0 } }]);
        closest = Math.min(closest, Math.hypot(v.pos.x - boss.pos.x, v.pos.z - boss.pos.z));
      }
      expect(closest, kind).toBeGreaterThanOrEqual(solidEdge(s, boss) - 0.01);
      expect(v.pos.x, kind).toBeLessThan(boss.pos.x);
      // (the hoverboard floats and never rams)
      if (VEHICLES[kind].ramDamage > 0) expect(boss.hp, kind).toBeLessThan(hp);
    }
  });
});
