import type { RareKind } from '../types';

export const JETPACK = {
  /** 5 seconds of flight */
  fuelTicks: 300,
  /** an empty tank fills up again in 6 seconds on the ground */
  rechargeTicks: 360,
  /** Space has to be held this long before you take off; a shorter tap is a jump */
  takeoffTicks: 12,
  /** let go of Space: this long to sink back down before landing */
  descentTicks: 24,
  respawnTicks: 5400,
  pickupRadius: 0.9,
  speedFactor: 1.2,
  landRadius: 1,
  landDamage: 10,
};

/** Rare weapons: found on golden cards, held in their own slot (Q) for a minute. Mutable for tests. */
export const RARE = {
  cardChance: 0.1,
  durationTicks: 3600,
  slush: { everyTicks: 6, range: 5, halfConeDeg: 20, damage: 2, chill: 6, freezeAt: 60, frozenTicks: 120 },
  bubble: { cooldownTicks: 90, speed: 12, range: 9, radius: 2.5, stuckTicks: 180, damage: 40 },
  blower: { range: 6, halfConeDeg: 25, push: 2, maxKnock: 10, slamSpeed: 6, slamDamage: 15, slamCooldownTicks: 30, coinPull: 8 },
  pizza: { cooldownTicks: 72, speed: 13, lifeTicks: 240, bounces: 6, damage: 12, rehitTicks: 20 },
};

export const ALL_RARE: RareKind[] = ['slushMachine', 'bubblegumBazooka', 'leafBlower', 'pizzaCutter'];

/** frozen monsters take this much more damage */
export const FROZEN_DAMAGE = 2;
