import type { PerkKind } from '../types';

/** How often each perk can be stacked. Effects live where they apply (player, coins, combat). */
export const PERK_MAX: Record<PerkKind, number> = {
  speed: 3,
  dash: 2,
  magnet: 3,
  greed: 3,
  regen: 3,
  stomp: 3,
};

export const ALL_PERKS = Object.keys(PERK_MAX) as PerkKind[];
