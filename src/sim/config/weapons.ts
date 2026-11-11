import type { WeaponKind } from '../types';

export const MAX_WEAPONS = 6;
export const MAX_WEAPON_LEVEL = 5;

export interface WeaponDef {
  /** seconds between shots */
  cooldown: number;
  /** auto-target range */
  range: number;
  damage: number;
}

export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  pixelBlaster: { cooldown: 0.35, range: 9, damage: 4 },
  laserSword: { cooldown: 0.9, range: 1.8, damage: 8 },
  candyCannon: { cooldown: 0.8, range: 7, damage: 2 },
  hotdogSlinger: { cooldown: 1.6, range: 8, damage: 3 },
  joystickBoomerang: { cooldown: 1.4, range: 7, damage: 5 },
  discoBall: { cooldown: 0.5, range: 6, damage: 3 },
};

/** +20 % damage per level above 1. */
export function levelMul(level: number): number {
  return 1 + 0.2 * (level - 1);
}

export const BOLT_SPEED = 16;
export const CANDY_SPEED = 12;
export const BOOMERANG_SPEED = 14;
export const BOOMERANG_DISTANCE = 7;
export const HOTDOG_FLIGHT = 0.6;
export const HOTDOG_PUDDLE = { radius: 1.5, duration: 2, interval: 0.25 };
export const SWORD_RADIUS_PER_LEVEL = 0.2;
export const CANDY_SPREAD_DEG = 40;
