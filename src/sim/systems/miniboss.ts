import { ENEMIES } from '../config/enemies';
import type { SimState } from '../types';
import { spawnEnemy } from './enemies';

export const MINIBOSS_SLAM_RADIUS = 2.5;
export const MINIBOSS_ATTACK_SECONDS = 4;

/** Spawns the mini-boss enemy; returns its id and max hp. */
export function spawnMiniboss(s: SimState): { enemyId: number; maxHp: number } {
  const e = spawnEnemy(s, 'miniboss', { x: 0, z: s.map.spawnZ });
  return { enemyId: e.id, maxHp: ENEMIES.miniboss.hp };
}
