/** Run-level tuning values. Everything here is meant to be tweaked during balancing. */
export const START_CREDITS = 3;
export const RESPAWN_TICKS = 180;
export const RESPAWN_INVULN_TICKS = 120;
export const DOWN_COIN_LOSS = 0.25;

export const PLAYER_SPEED = 6;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HP = 100;

export const JUMP_TICKS = 30;
export const STOMP_RADIUS = 1.2;
export const STOMP_DAMAGE = 15;
export const STOMP_KNOCKBACK = 6;

export const DASH_TICKS = 9;
/** 4 tiles in 0.15 s */
export const DASH_SPEED = 4 / (DASH_TICKS / 60);
export const DASH_DAMAGE = 10;
export const DASH_RECHARGE_TICKS = 72;

export const COMBO_TICKS = 180;
export const COMBO_STEP = 10;
export const COMBO_MAX_MULT = 10;

export const COIN_LIFETIME_TICKS = 480;
export const MAGNET_RADIUS = 2.5;
export const MAGNET_SPEED = 10;
export const POWER_MAGNET_SPEED = 20;
export const PICKUP_RADIUS = 0.5;
export const STREAK_WINDOW_TICKS = 30;

export const HAZARD_DPS = 10;
export const BOOST_TICKS = 120;
export const BOOST_FACTOR = 1.6;

export const CLOSE_RANGE = 3;
export const CLOSE_BONUS = 1.5;

export const SAMPLE_TICKS = 600;
export const IDLE_EPSILON = 0.005;
