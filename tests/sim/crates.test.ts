import { describe, expect, it } from 'vitest';
import { grantWeapon } from '../../src/sim/systems/crates';
import type { WeaponKind } from '../../src/sim/types';
import { quietSim } from './helpers';

const ALL: WeaponKind[] = ['pixelBlaster', 'laserSword', 'candyCannon', 'hotdogSlinger', 'joystickBoomerang', 'discoBall'];

describe('grantWeapon', () => {
  it('adds a new weapon at level 1', () => {
    const s = quietSim();
    const p = s.players[0];
    grantWeapon(s, p, 'candyCannon');
    expect(p.weapons.map(w => [w.kind, w.level])).toEqual([['pixelBlaster', 1], ['candyCannon', 1]]);
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
