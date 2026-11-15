import type { RareKind } from '../types';

export const JETPACK = {
  /** 5 seconds of flight */
  fuelTicks: 300,
  /** every further jetpack picked up on top of the one on your back makes its tank this much bigger */
  extraFuel: 0.1,
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
  /** the Thunder Hammer: a smash in front of you, and lightning that jumps on to the nearest others */
  hammer: { cooldownTicks: 36, reach: 1.8, radius: 2.4, damage: 70, chain: 3, chainRange: 6, chainDamage: 35 },
  pizza: { cooldownTicks: 72, speed: 13, lifeTicks: 240, bounces: 6, damage: 12, rehitTicks: 20 },
  /**
   * the Lock-On Launcher: a target within `range` and `halfConeDeg` of the crosshair is locked after `lockTicks`;
   * the missile flies at `speed`, turns `turn` radians a second and blows up with `damage` in `radius` (a rival
   * it was after and reached takes `direct` on top, which with the blast is more than a full health bar)
   */
  missile: { cooldownTicks: 150, range: 22, halfConeDeg: 9, lockTicks: 42, speed: 13, turn: 3.2, lifeTicks: 360, radius: 2.4, damage: 150, direct: 60 },
  /** where the launcher hides: in this share of the crates of a versus match and of fallen elites, and of the crates a wild boss leaves */
  missileCrate: { versus: 0.06, elite: 0.05, wild: 0.5 },
  /** and how often a golden card is the launcher, against 1 for each of the others: now and then, about one golden card in eleven */
  missileCard: 0.4,
};

/** the rare weapons that are on golden cards (the Lock-On Launcher only now and then, see RARE.missileCard) */
export const ALL_RARE: RareKind[] = ['slushMachine', 'bubblegumBazooka', 'leafBlower', 'pizzaCutter'];
/** every rare weapon there is: those of the golden cards, and the two that come out of crates (and now and then a card) */
export const EVERY_RARE: RareKind[] = [...ALL_RARE, 'thunderHammer', 'missileLauncher'];

/** frozen monsters take this much more damage */
export const FROZEN_DAMAGE = 2;

/** how much the tank of a jetpack holds (ticks of flight) with `extra` further jetpacks picked up on top of it */
export const jetTank = (extra = 0): number => JETPACK.fuelTicks * (1 + JETPACK.extraFuel * extra);
