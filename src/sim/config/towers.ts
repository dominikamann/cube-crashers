import type { TowerKind } from '../types';

export interface TowerDef {
  cost: number;
  hp: number;
  range: number;
  /** seconds between shots/pulses */
  cooldown: number;
  damage: number;
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  laser: { cost: 15, hp: 40, range: 7, cooldown: 0.4, damage: 6 },
  popcorn: { cost: 25, hp: 40, range: 9, cooldown: 2, damage: 10 },
  frost: { cost: 20, hp: 40, range: 5, cooldown: 1.5, damage: 0 },
};

export const POPCORN_FLIGHT = 0.8;
export const POPCORN_RADIUS = 2;
export const FROST_SLOW_SECONDS = 2;
