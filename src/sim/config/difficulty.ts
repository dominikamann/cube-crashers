import type { Difficulty } from '../types';

export interface DifficultyDef {
  enemyHp: number;
  enemyDamage: number;
  hordeSize: number;
  credits: number;
  /** >1 = the alarm rises faster */
  alarmSpeed: number;
  score: number;
  /** health per second you heal after REGEN_DELAY_TICKS without being hit */
  regen: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  ultraLow: { enemyHp: 0.5, enemyDamage: 0.35, hordeSize: 0.5, credits: 6, alarmSpeed: 0.5, score: 0.5, regen: 6 },
  low: { enemyHp: 0.75, enemyDamage: 0.6, hordeSize: 0.75, credits: 4, alarmSpeed: 0.75, score: 0.75, regen: 3 },
  medium: { enemyHp: 1, enemyDamage: 1, hordeSize: 1, credits: 3, alarmSpeed: 1, score: 1, regen: 0 },
  high: { enemyHp: 1.25, enemyDamage: 1.25, hordeSize: 1.2, credits: 3, alarmSpeed: 1.2, score: 1.5, regen: 0 },
  ultraHigh: { enemyHp: 1.5, enemyDamage: 1.5, hordeSize: 1.4, credits: 2, alarmSpeed: 1.4, score: 2, regen: 0 },
};

export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];
