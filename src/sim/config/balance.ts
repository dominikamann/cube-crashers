/** Run-level tuning values. Everything here is meant to be tweaked during balancing. */
export const START_CREDITS = 3;
export const RESPAWN_TICKS = 180;
export const RESPAWN_INVULN_TICKS = 120;
export const DOWN_COIN_LOSS = 0.25;

export const PLAYER_SPEED = 6;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HP = 100;
/** easy levels: healing starts this long after the last hit */
export const REGEN_DELAY_TICKS = 240;
/** every monster touching you beyond the strongest one adds only this share of its contact damage */
export const CROWD_CONTACT_SHARE = 0.3;

export const JUMP_TICKS = 30;
export const STOMP_RADIUS = 1.2;
export const STOMP_DAMAGE = 15;
export const STOMP_KNOCKBACK = 6;
/** bosses take only this share of stomp and kart damage: they have to be shot */
export const BOSS_BODY_RESIST = 0.25;

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

/** shots from within this angle of a shielder's front only do `front` of their damage */
export const SHIELDER = { halfArcDeg: 70, front: 0.2 };
/** a healer mends monsters within `radius` by `share` of their health every `everyTicks`; it keeps `keepAway` from players */
export const HEALER = { radius: 3.5, share: 0.12, everyTicks: 60, keepAway: 5 };
/** a teleporter blinks to a player between `min` and `max` tiles away that it can see */
export const TELEPORTER = { min: 3, max: 10, windupTicks: 45, cooldownTicks: 300, beside: 1.3 };
export const SHOOTER = { min: 5, max: 7, fireRange: 8, windupTicks: 24, cooldownTicks: 132, bulletSpeed: 6, damage: 10 };
export const BOMBER = { trigger: 1.6, fuseTicks: 36, radius: 2, player: 25, enemy: 30, tower: 20, deathRadius: 1.8 };
export const RAMMER = { range: 9, windupTicks: 48, speed: 14, distance: 12, damage: 30, towerDamage: 20, stunTicks: 90, hitStunTicks: 45, cooldownTicks: 180 };

export const NESTS_PER_FLOOR = 4;
export const ROAMING_HORDES = 6;
export const START_CLEAR_RADIUS = 14;
export const PLANT_RANGE = 2.5;
export const PLANT_TICKS = 60;
export const HOLD_TICKS = 1500;
/** how fast the hold counter climbs per extra alarm level is unchanged; rush hordes get tougher instead */
export const HOLD_RADIUS = 6;
export const RUSH_INTERVAL_TICKS = 450;
/** from this alarm level on, rushes come from two entries at once */
export const DOUBLE_RUSH_ALARM = 2;
export const GUARD_FACTOR = 1.5;
export const FIRST_RUSH_TICKS = 60;
export const RUSH_BASE_SIZE = 8;
export const RUSH_SIZE_PER_ALARM = 3;
export const NEST_SPAWN_TICKS = 1200;
export const NEST_BLAST = { radius: 6, damage: 250, coins: 25 };
/** the crocodile's lunge: like a rammer's charge, but short and quick to come again */
export const CROC = { range: 5.5, windupTicks: 32, speed: 12, distance: 5.5, damage: 28, towerDamage: 25, stunTicks: 50, hitStunTicks: 40, cooldownTicks: 150 };
/** the monkey stays between `min` and `max` tiles away and throws a coconut every `cooldownTicks` */
export const MONKEY = { min: 4, max: 7, throwRange: 9, windupTicks: 30, cooldownTicks: 170, flightTicks: 50, radius: 1.5, damage: 22 };
/** the T-Rex roars when a player is within `range`, then its stomp hurts everything within `radius` */
export const TREX = { range: 3.2, windupTicks: 40, cooldownTicks: 200, radius: 3, damage: 30, tower: 30 };
/** the shark's lunge: longer and faster than the crocodile's */
export const SHARK = { range: 7, windupTicks: 30, speed: 15, distance: 7, damage: 24, towerDamage: 20, stunTicks: 45, hitStunTicks: 40, cooldownTicks: 140 };
export const ENEMY_CAP = 160;

export const ALARM_MAX = 5;
export const ALARM_TICKS = 3600;
export const ALARM_SIZE_STEP = 0.2;
export const OVERLOAD_RUSH_TICKS = 480;

export const ELEVATOR_RADIUS = 1.5;
export const CREDIT_BONUS = 500;
export const PAR_SECONDS = 360;
export const TIME_BONUS_PER_SECOND = 10;

/** a planted nest fights back: it blasts the ground under whoever holds the zone */
export const NEST_DEFENCE = { firstTicks: 90, intervalTicks: 100, intervalPerAlarm: 10, warnTicks: 50, radius: 2.0, damage: 25 };

export const MAX_PLAYERS = 10;
/** a downed teammate can be helped up for this long */
export const REVIVE_TICKS = 480;
export const REVIVE_HOLD_TICKS = 90;
export const REVIVE_RANGE = 1.5;
export const REVIVE_INVULN_TICKS = 120;
/** hordes grow by this much per extra player, monster health by the second value */
export const TEAM_HORDE_STEP = 0.35;
export const TEAM_HP_STEP = 0.15;
export const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8', 'Player 9', 'Player 10'];
