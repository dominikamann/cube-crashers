import type { WeaponKind } from '../types';

export const MAX_WEAPONS = 6;
export const MAX_WEAPON_LEVEL = 5;

export interface WeaponDef {
  /** seconds to reload */
  cooldown: number;
  damage: number;
}

export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  pixelBlaster: { cooldown: 0.2, damage: 4 },
  laserSword: { cooldown: 0.5, damage: 18 },
  candyCannon: { cooldown: 0.8, damage: 4 },
  hotdogSlinger: { cooldown: 3, damage: 4 },
  joystickBoomerang: { cooldown: 2, damage: 10 },
  discoBall: { cooldown: 3.5, damage: 12 },
  bananaMine: { cooldown: 2.5, damage: 40 },
  bomb: { cooldown: 5, damage: 50 },
  flySwatter: { cooldown: 0.8, damage: 55 },
};

export const ALL_WEAPONS = Object.keys(WEAPONS) as WeaponKind[];

/** +20 % damage per level above 1. */
export function levelMul(level: number): number {
  return 1 + 0.2 * (level - 1);
}

export const BLASTER = { speed: 20, range: 9 };
export const SWORD = { radius: 2.2, radiusPerLevel: 0.2, halfArcDeg: 70 };
/** the fly swatter: a huge slap, but only right in front of you (the knife of this game) */
export const SWATTER = { radius: 1.4, radiusPerLevel: 0.1, halfArcDeg: 40 };
export const CANDY = { speed: 14, range: 5, pellets: 6, spreadDeg: 40 };
/** a ketchup burst on impact, then a sticky mustard puddle that slows and nibbles */
export const HOTDOG = { range: 8, flightTicks: 24, radius: 1.6, impact: 14, durationTicks: 150, intervalTicks: 15, slowTicks: 20 };
export const BOOMERANG = { speed: 14, distance: 7 };
export const DISCO = { range: 5, targets: 4 };
export const MINE = { armTicks: 30, trigger: 1.0, radius: 2.5, lifetimeTicks: 1800, max: 5 };
export const BOMB = { range: 7, flightTicks: 42, radius: 3 };
