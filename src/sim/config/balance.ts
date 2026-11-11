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

export const FLOW_REBUILD_TICKS = 15;
export const AGGRO_RADIUS = 10;
export const DEAGGRO_RADIUS = 22;
export const ROAM_SPEED_FACTOR = 0.6;
export const WANDER_RANGE = 25;
export const ALARM_SPEED_STEP = 0.05;

export const SHOOTER = { min: 5, max: 7, fireRange: 8, windupTicks: 24, cooldownTicks: 132, bulletSpeed: 6, damage: 10 };
export const BOMBER = { trigger: 1.6, fuseTicks: 36, radius: 2, player: 25, enemy: 30, tower: 20, deathRadius: 1.8 };
export const RAMMER = { range: 9, windupTicks: 48, speed: 14, distance: 12, damage: 30, towerDamage: 20, stunTicks: 90, hitStunTicks: 45, cooldownTicks: 180 };

export const NESTS_PER_FLOOR = 4;
export const ROAMING_HORDES = 4;
export const START_CLEAR_RADIUS = 14;
export const PLANT_RANGE = 2.5;
export const PLANT_TICKS = 60;
export const HOLD_TICKS = 1500;
export const HOLD_RADIUS = 6;
export const RUSH_INTERVAL_TICKS = 300;
export const FIRST_RUSH_TICKS = 90;
export const RUSH_BASE_SIZE = 6;
export const RUSH_SIZE_PER_ALARM = 2;
export const NEST_SPAWN_TICKS = 1800;
export const NEST_BLAST = { radius: 6, damage: 100, coins: 25 };
export const ENEMY_CAP = 160;

export const ALARM_MAX = 5;
export const ALARM_TICKS = 3600;
export const ALARM_SIZE_STEP = 0.2;
export const OVERLOAD_RUSH_TICKS = 480;

export const ELEVATOR_RADIUS = 1.5;
export const CREDIT_BONUS = 500;
export const PAR_SECONDS = 360;
export const TIME_BONUS_PER_SECOND = 10;
