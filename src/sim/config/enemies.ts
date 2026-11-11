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
};

export const ELITE = { hp: 5, radius: 1.4, contact: 1.5, score: 5 };
