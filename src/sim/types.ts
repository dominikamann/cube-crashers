import type { Rng } from './rng';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export type Vec2 = { x: number; z: number };

export type EnemyKind = 'blob' | 'dasher' | 'tank' | 'splitter' | 'splitling' | 'miniboss';
export type WeaponKind =
  | 'pixelBlaster'
  | 'laserSword'
  | 'candyCannon'
  | 'hotdogSlinger'
  | 'joystickBoomerang'
  | 'discoBall';
export type TowerKind = 'laser' | 'popcorn' | 'frost';

export type Command =
  | { type: 'move'; playerId: number; dir: Vec2 }
  | { type: 'build'; playerId: number; padId: number; tower: TowerKind };

export interface MapDef {
  id: string;
  pads: { id: number; pos: Vec2 }[];
  playerSpawn: Vec2;
  laneHalfWidth: number;
  spawnZ: number;
  baseZ: number;
}

export interface HeldWeapon {
  kind: WeaponKind;
  level: number;
  cooldown: number;
}

export interface Player {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  coins: number;
  downUntil: number | null;
  weapons: HeldWeapon[];
  coinStreak: number;
  lastCoinTick: number;
}

export interface Enemy {
  id: number;
  pos: Vec2;
}

export interface Projectile {
  id: number;
  pos: Vec2;
}

export interface Coin {
  id: number;
  pos: Vec2;
}

export interface Crate {
  id: number;
  pos: Vec2;
}

export interface Tower {
  id: number;
  pos: Vec2;
}

export interface WaveState {
  index: number;
}

export interface BossState {
  kind: 'miniboss' | 'worm';
}

export type SimEvent =
  | { type: 'shot'; weapon: WeaponKind; pos: Vec2 }
  | { type: 'enemyHit'; pos: Vec2 }
  | { type: 'enemyKilled'; kind: EnemyKind | 'segment'; pos: Vec2 }
  | { type: 'coinPicked'; playerId: number; streak: number }
  | { type: 'crateOpened'; playerId: number; weapon: WeaponKind; level: number }
  | { type: 'towerBuilt'; kind: TowerKind; padId: number }
  | { type: 'buildDenied'; padId: number; reason: 'coins' | 'occupied' | 'notOnPad' }
  | { type: 'towerFired'; kind: TowerKind; pos: Vec2; target: Vec2 }
  | { type: 'baseHit'; hp: number }
  | { type: 'playerHit'; playerId: number; hp: number }
  | { type: 'playerDown'; playerId: number }
  | { type: 'playerRespawn'; playerId: number }
  | { type: 'waveStart'; wave: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'bossSpawn'; kind: 'miniboss' | 'worm' }
  | { type: 'bossPhase'; phase: 2 | 3 }
  | { type: 'bossTelegraph'; pos: Vec2; radius: number; delay: number }
  | { type: 'bossImpact'; pos: Vec2; radius: number }
  | { type: 'wormSplit'; pos: Vec2 }
  | { type: 'bossDead'; pos: Vec2 }
  | { type: 'gameWon'; stars: 1 | 2 | 3 }
  | { type: 'gameLost' };

export interface SimState {
  tick: number;
  rng: Rng;
  map: MapDef;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  coins: Coin[];
  crates: Crate[];
  towers: Tower[];
  base: { hp: number; maxHp: number };
  wave: WaveState;
  boss: BossState | null;
  phase: 'playing' | 'won' | 'lost';
  look: 'day' | 'night';
  nextId: number;
  events: SimEvent[];
}
