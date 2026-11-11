import type { Rng } from './rng';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export type Vec2 = { x: number; z: number };

export type EnemyKind = 'blob' | 'dasher' | 'tank' | 'splitter' | 'splitling' | 'miniboss' | 'wormSegment';
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
  kind: EnemyKind;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  slowUntil: number;
  radius: number;
}

export type DamageSource = WeaponKind | TowerKind | 'boss';

/** What happens where a lobbed projectile lands. */
export interface LandEffect {
  radius: number;
  damage: number;
  /** if set, leaves an area that pulses `damage` every `interval` ticks for `duration` ticks */
  duration?: number;
  interval?: number;
}

export interface Projectile {
  id: number;
  kind: DamageSource;
  behavior: 'bolt' | 'lob' | 'boomerang';
  pos: Vec2;
  vel: Vec2;
  damage: number;
  /** extra enemies a bolt may pass through; Infinity for boomerangs */
  pierce: number;
  /** tick at which the projectile expires (bolt) or lands (lob) */
  until: number;
  /** enemy ids already hit (pierce/boomerang must not hit the same enemy twice per pass) */
  hitIds: number[];
  ownerId: number;
  /** lob: start and target for the arc */
  from?: Vec2;
  target?: Vec2;
  launchedAt?: number;
  land?: LandEffect;
  /** boomerang: distance travelled outward, and whether it is returning */
  travelled?: number;
  range?: number;
  returning?: boolean;
}

export interface Area {
  id: number;
  kind: DamageSource;
  pos: Vec2;
  radius: number;
  damage: number;
  interval: number;
  nextAt: number;
  until: number;
}

export interface Coin {
  id: number;
  pos: Vec2;
  value: number;
}

export interface Crate {
  id: number;
  pos: Vec2;
  weapon: WeaponKind;
  hp: number;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  padId: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  cooldown: number;
}

export type SpawnKind = EnemyKind | 'crate';

export interface WaveState {
  /** 0-based index of the current wave, -1 before the first wave */
  index: number;
  spawnQueue: { kind: SpawnKind; at: number }[];
  /** tick at which the next wave starts, null while a wave is running */
  pauseUntil: number | null;
}

export interface Worm {
  id: number;
  /** enemy ids of the segments, head first */
  segmentIds: number[];
  /** tick the worm got its current head (start of its serpentine motion) */
  t0: number;
  wiggle: number;
}

export interface Telegraph {
  id: number;
  pos: Vec2;
  radius: number;
  impactAt: number;
  /** damage to players; towers always take TELEGRAPH_TOWER_DAMAGE */
  damage: number;
}

export interface BossState {
  kind: 'miniboss' | 'worm';
  maxHp: number;
  phase: 1 | 2 | 3;
  /** the mini-boss enemy id (null for the worm) */
  enemyId: number | null;
  worms: Worm[];
  telegraphs: Telegraph[];
  nextAttackAt: number;
  lastPos: Vec2;
}

export type SimEvent =
  | { type: 'shot'; weapon: WeaponKind; pos: Vec2 }
  | { type: 'enemyHit'; pos: Vec2 }
  | { type: 'enemyKilled'; kind: EnemyKind; pos: Vec2 }
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
  areas: Area[];
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
