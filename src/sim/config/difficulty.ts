import type { Difficulty } from '../types';

export interface DifficultyDef {
  enemyHp: number;
  enemyDamage: number;
  hordeSize: number;
  credits: number;
  /** >1 = the alarm rises faster */
  alarmSpeed: number;
  score: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  ultraLow: { enemyHp: 0.6, enemyDamage: 0.5, hordeSize: 0.6, credits: 5, alarmSpeed: 0.65, score: 0.5 },
  low: { enemyHp: 0.8, enemyDamage: 0.75, hordeSize: 0.8, credits: 4, alarmSpeed: 0.8, score: 0.75 },
  medium: { enemyHp: 1, enemyDamage: 1, hordeSize: 1, credits: 3, alarmSpeed: 1, score: 1 },
  high: { enemyHp: 1.25, enemyDamage: 1.25, hordeSize: 1.2, credits: 3, alarmSpeed: 1.2, score: 1.5 },
  ultraHigh: { enemyHp: 1.5, enemyDamage: 1.5, hordeSize: 1.4, credits: 2, alarmSpeed: 1.4, score: 2 },
};

export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];
