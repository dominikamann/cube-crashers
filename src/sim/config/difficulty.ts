import type { Difficulty } from '../types';

export interface DifficultyDef {
  enemyHp: number;
  /** how tough bosses are: closer together than the monsters', so a boss is a fight on every level */
  bossHp: number;
  enemyDamage: number;
  hordeSize: number;
  credits: number;
  /** >1 = the alarm rises faster */
  alarmSpeed: number;
  score: number;
  /** health per second you heal after REGEN_DELAY_TICKS without being hit */
  regen: number;
  /** crates on a floor: how many lie around at the start, and how many elites at most drop one */
  crates: { start: number; elites: number };
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  ultraLow: { enemyHp: 0.5, bossHp: 0.8, enemyDamage: 0.35, hordeSize: 0.5, credits: 4, alarmSpeed: 0.5, score: 0.5, regen: 6, crates: { start: 1, elites: 1 } },
  low: { enemyHp: 0.75, bossHp: 0.9, enemyDamage: 0.5, hordeSize: 0.65, credits: 3, alarmSpeed: 0.75, score: 0.75, regen: 3, crates: { start: 1, elites: 1 } },
  medium: { enemyHp: 1, bossHp: 1, enemyDamage: 1, hordeSize: 1, credits: 3, alarmSpeed: 1, score: 1, regen: 0, crates: { start: 2, elites: 1 } },
  high: { enemyHp: 1.25, bossHp: 1.2, enemyDamage: 1.25, hordeSize: 1.2, credits: 3, alarmSpeed: 1.2, score: 1.5, regen: 0, crates: { start: 2, elites: 2 } },
  ultraHigh: { enemyHp: 1.5, bossHp: 1.4, enemyDamage: 1.5, hordeSize: 1.4, credits: 2, alarmSpeed: 1.4, score: 2, regen: 0, crates: { start: 2, elites: 2 } },
};

export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];
