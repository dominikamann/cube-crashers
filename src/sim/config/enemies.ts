import type { EnemyKind } from '../types';

export interface EnemyDef {
  hp: number;
  speed: number;
  radius: number;
  coins: number;
  /** damage per second while touching a player */
  contactDamage: number;
  baseDamage: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  blob: { hp: 10, speed: 1.8, radius: 0.35, coins: 1, contactDamage: 10, baseDamage: 1 },
  dasher: { hp: 5, speed: 3.6, radius: 0.3, coins: 1, contactDamage: 8, baseDamage: 1 },
  tank: { hp: 60, speed: 0.9, radius: 0.6, coins: 5, contactDamage: 25, baseDamage: 3 },
  splitter: { hp: 20, speed: 1.6, radius: 0.4, coins: 2, contactDamage: 10, baseDamage: 1 },
  splitling: { hp: 6, speed: 2.4, radius: 0.25, coins: 0, contactDamage: 5, baseDamage: 1 },
  miniboss: { hp: 400, speed: 0.6, radius: 1.2, coins: 30, contactDamage: 40, baseDamage: 5 },
  // moved by the worm system, not by updateEnemies
  wormSegment: { hp: 40, speed: 0, radius: 0.45, coins: 1, contactDamage: 30, baseDamage: 5 },
};
