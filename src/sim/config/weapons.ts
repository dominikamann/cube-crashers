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
  // (each of its pulses: see DISCO)
  discoBall: { cooldown: 3.5, damage: 5 },
  bananaMine: { cooldown: 2.5, damage: 40 },
  bomb: { cooldown: 5, damage: 50 },
  flySwatter: { cooldown: 0.8, damage: 55 },
  pixelRail: { cooldown: 1.4, damage: 26 },
  bubbleWand: { cooldown: 1.6, damage: 6 },
  magnetGlove: { cooldown: 2.2, damage: 10 },
  yoyoLauncher: { cooldown: 0.9, damage: 9 },
};

export const ALL_WEAPONS = Object.keys(WEAPONS) as WeaponKind[];

/** +20 % damage per level above 1 (the Pixel Blaster has its own table, see BLASTER.power). */
export function levelMul(level: number): number {
  return 1 + 0.2 * (level - 1);
}

/** `power`: what all its bolts together deal at each level, as a multiple of level 1 (it grows by bolts, not by +20 %) */
// (45 tiles a second: in first person a shot lands where one looks; at 20 a rival running across was missed from 3 tiles on)
export const BLASTER = { speed: 45, range: 10, power: [1, 1.3, 1.8, 2.3, 3] };
export const SWORD = { radius: 2.2, radiusPerLevel: 0.2, halfArcDeg: 70 };
/** the fly swatter: a huge slap, but only right in front of you (the knife of this game) */
/** the pixel rail: an instant beam through everything in a line, with full damage up to the first wall (the sniper) */
export const RAIL = { width: 0.3 };
/** past its full reach a Pixel Blaster bolt goes on, each tile taking this share of its damage away (at 10 tiles it
 * does all of it, at 11 85 %, at 12 70 %, ...), until nothing is left: then it is spent */
const PER_TILE = 0.15;
export const FALLOFF = { perTile: PER_TILE, tiles: 1 / PER_TILE };
/** the share of its damage a shot still does `d` tiles from where it was fired, with full damage up to `reach` */
export const falloff = (d: number, reach: number): number => (d <= reach ? 1 : Math.max(0, 1 - FALLOFF.perTile * (d - reach)));
export const SWATTER = { radius: 1.4, radiusPerLevel: 0.1, halfArcDeg: 40 };
// (the shotgun: full damage up to `range`, then in steps less: up to 7 tiles 80 %, up to 8 half; `tiers`: [up to, share])
export const CANDY = { speed: 24, range: 6, tiers: [[7, 0.8], [8, 0.5]] as [number, number][], pellets: 6, spreadDeg: 40 };
/** a ketchup burst on impact, then a sticky mustard puddle that slows and nibbles */
export const HOTDOG = { range: 8, flightTicks: 24, radius: 1.6, impact: 14, durationTicks: 150, intervalTicks: 15, slowTicks: 20 };
export const BOOMERANG = { speed: 20, distance: 9.5 };
/** (`show`: how long the ball hangs there with its lights and its music, in seconds; while it hangs it lets go
 * `pulses` bursts of beams, one every `everyTicks`, the first at once, each at the nearest `targets` in `range`) */
export const DISCO = { range: 7, targets: 4, show: 3.8, pulses: 4, everyTicks: 54 };
export const MINE = { armTicks: 30, trigger: 1.0, radius: 2.5, lifetimeTicks: 1800, max: 5 };
export const BOMB = { range: 7, flightTicks: 42, radius: 3 };
/** a slow soap bubble: the monster it hits floats stuck in it for a while */
export const BUBBLE_WAND = { speed: 18, range: 9, stuckTicks: 150 };
/** pulls the monsters in a cone toward the crosshair (set up a bomb); rivals are yanked toward you */
/** (`slowTicks`: the monsters it pulled in are slowed this long afterwards, dazed: time to throw the bomb) */
export const MAGNET = { range: 6.5, halfArcDeg: 50, pull: 9, rivalPull: 1.6, slowTicks: 90 };
/** out and straight back on its string, hitting on both ways */
export const YOYO = { speed: 16, distance: 4.5 };
