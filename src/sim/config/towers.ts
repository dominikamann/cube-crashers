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
  laser: { cost: 40, hp: 40, range: 7, cooldown: 0.4, damage: 6 },
  popcorn: { cost: 60, hp: 40, range: 9, cooldown: 2, damage: 10 },
  frost: { cost: 50, hp: 40, range: 5, cooldown: 1.5, damage: 0 },
};

/** ticks of holding E to build a new tower (60 ticks = 1 s) */
export const BUILD_TICKS = 150;
/** ticks of holding E to build an upgrade */
export const UPGRADE_TICKS = 180;
/** share of max health repaired per second of holding E */
export const REPAIR_PER_SECOND = 0.25;
export const MAX_TOWER_LEVEL = 3;

/** level 2 costs as much as the tower, level 3 half again */
export function upgradeCost(kind: TowerKind, toLevel: number): number {
  return Math.round(TOWERS[kind].cost * (toLevel <= 2 ? 1 : 1.5));
}

/** each level: +50 % damage and health, +1 range, 15 % faster */
export function towerStats(kind: TowerKind, level: number): TowerDef {
  const d = TOWERS[kind], k = level - 1;
  return {
    cost: d.cost,
    hp: Math.round(d.hp * (1 + 0.5 * k)),
    range: d.range + k,
    cooldown: d.cooldown * Math.pow(0.85, k),
    damage: d.damage * (1 + 0.5 * k),
  };
}

export const POPCORN_FLIGHT = 0.8;
export const POPCORN_RADIUS = 2;
export const FROST_SLOW_SECONDS = 2;
