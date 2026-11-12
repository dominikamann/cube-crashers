import type { EnemyKind } from '../types';

export interface EnemyDef {
  hp: number;
  speed: number;
  radius: number;
  coins: number;
  score: number;
  /** damage per second while touching a player */
  contactDamage: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  blob: { hp: 14, speed: 2.0, radius: 0.35, coins: 1, score: 10, contactDamage: 15 },
  hunter: { hp: 12, speed: 4.4, radius: 0.3, coins: 1, score: 15, contactDamage: 18 },
  tank: { hp: 110, speed: 1.1, radius: 0.6, coins: 5, score: 60, contactDamage: 30 },
  splitter: { hp: 28, speed: 1.8, radius: 0.4, coins: 2, score: 25, contactDamage: 15 },
  splitling: { hp: 8, speed: 2.8, radius: 0.25, coins: 0, score: 5, contactDamage: 8 },
  shooter: { hp: 22, speed: 1.8, radius: 0.35, coins: 2, score: 25, contactDamage: 5 },
  bomber: { hp: 16, speed: 3.8, radius: 0.35, coins: 2, score: 25, contactDamage: 0 },
  rammer: { hp: 70, speed: 1.6, radius: 0.55, coins: 4, score: 50, contactDamage: 15 },
  // flies: ignores walls (shaft ride)
  swarmer: { hp: 6, speed: 4, radius: 0.3, coins: 1, score: 10, contactDamage: 8 },
  // Glitch Maze: chases, cannot be hurt by weapons (there are none), only crashed while powered up
  ghost: { hp: 9999, speed: 3.4, radius: 0.4, coins: 0, score: 50, contactDamage: 0 },
  // carries a shield in front: shots from the front do little, from behind or from above (blasts) in full
  shielder: { hp: 40, speed: 1.7, radius: 0.45, coins: 3, score: 35, contactDamage: 15 },
  // stays back and mends the monsters around it: take it out first
  healer: { hp: 24, speed: 1.9, radius: 0.35, coins: 3, score: 40, contactDamage: 5 },
  // shimmers, then blinks right next to you
  teleporter: { hp: 18, speed: 2.2, radius: 0.35, coins: 2, score: 30, contactDamage: 14 },
  megaBlock: { hp: 1800, speed: 1.3, radius: 1.6, coins: 0, score: 2000, contactDamage: 40 },
  // moved by the boss system
  wormSegment: { hp: 80, speed: 0, radius: 0.5, coins: 1, score: 40, contactDamage: 30 },
};

export const ELITE = { hp: 5, radius: 1.4, contact: 1.5, score: 5 };
