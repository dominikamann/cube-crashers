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
  blob: { hp: 10, speed: 1.8, radius: 0.35, coins: 1, score: 10, contactDamage: 10 },
  hunter: { hp: 8, speed: 4.2, radius: 0.3, coins: 1, score: 15, contactDamage: 12 },
  tank: { hp: 60, speed: 1.0, radius: 0.6, coins: 5, score: 60, contactDamage: 25 },
  splitter: { hp: 20, speed: 1.6, radius: 0.4, coins: 2, score: 25, contactDamage: 10 },
  splitling: { hp: 6, speed: 2.6, radius: 0.25, coins: 0, score: 5, contactDamage: 5 },
  shooter: { hp: 14, speed: 1.6, radius: 0.35, coins: 2, score: 25, contactDamage: 5 },
  bomber: { hp: 12, speed: 3.6, radius: 0.35, coins: 2, score: 25, contactDamage: 0 },
  rammer: { hp: 40, speed: 1.4, radius: 0.55, coins: 4, score: 50, contactDamage: 15 },
};

export const ELITE = { hp: 5, radius: 1.4, contact: 1.5, score: 5 };
