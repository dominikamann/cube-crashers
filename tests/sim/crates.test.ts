import { describe, expect, it } from 'vitest';
import { grantWeapon } from '../../src/sim/systems/crates';
import { stepSim } from '../../src/sim/sim';
import type { WeaponKind } from '../../src/sim/types';
import { quietSim, run } from './helpers';

const ALL: WeaponKind[] = ['pixelBlaster', 'laserSword', 'candyCannon', 'hotdogSlinger', 'joystickBoomerang', 'discoBall'];

describe('grantWeapon', () => {
  it('adds a new weapon at level 1', () => {
    const s = quietSim();
    const p = s.players[0];
    grantWeapon(s, p, 'candyCannon');
    expect(p.weapons.map(w => [w.kind, w.level])).toEqual([['pixelBlaster', 1], ['candyCannon', 1]]);
    expect(s.events).toContainEqual({ type: 'crateOpened', playerId: 0, weapon: 'candyCannon', level: 1 });
  });

  it('levels up a weapon already held', () => {
    const s = quietSim();
    const p = s.players[0];
    grantWeapon(s, p, 'pixelBlaster');
    expect(p.weapons[0].level).toBe(2);
  });

  it('caps the level at 5', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons[0].level = 5;
    grantWeapon(s, p, 'pixelBlaster');
    expect(p.weapons[0].level).toBe(5);
  });

  it('pays 25 coins when all 6 held weapons are at level 5', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = ALL.map(kind => ({ kind, level: 5, cooldown: 0 }));
    grantWeapon(s, p, 'candyCannon');
    expect(p.coins).toBe(25);
    expect(p.weapons.every(w => w.level === 5)).toBe(true);
  });
});

describe('crates', () => {
  it('opens when the player walks into it and grants a non-starter weapon', () => {
    const s = quietSim();
    const p = s.players[0];
    s.crates.push({ id: s.nextId++, pos: { x: p.pos.x, z: p.pos.z - 0.3 }, weapon: 'discoBall', hp: 8 });
    stepSim(s, []);
    expect(p.weapons.map(w => w.kind)).toContain('discoBall');
    expect(s.crates).toHaveLength(0);
  });

  it('spawns from the wave schedule and drifts toward the base', () => {
    const s = quietSim();
    s.players[0].weapons = [];
    s.wave.spawnQueue = [{ kind: 'crate', at: s.tick }];
    s.wave.pauseUntil = null;
    stepSim(s, []);
    expect(s.crates).toHaveLength(1);
    expect(s.crates[0].weapon).not.toBe('pixelBlaster');
    const z0 = s.crates[0].pos.z;
    run(s, 60);
    expect(s.crates[0].pos.z - z0).toBeCloseTo(1.8, 1);
  });
});
