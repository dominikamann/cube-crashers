import type { FloorMap } from './map/tilemap';
import type { Rng } from './rng';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export type Vec2 = { x: number; z: number };

export type EnemyKind =
  | 'blob'
  | 'hunter'
  | 'tank'
  | 'splitter'
  | 'splitling'
  | 'shooter'
  | 'bomber'
  | 'rammer'
  | 'swarmer'
  | 'megaBlock'
  | 'wormSegment'
  | 'ghost'
  | 'shielder'
  | 'healer'
  | 'teleporter'
  | 'croc'
  | 'monkey'
  | 'trex'
  | 'phantom'
  | 'fish'
  | 'shark'
  | 'kraken';
export type WeaponKind =
  | 'pixelBlaster'
  | 'laserSword'
  | 'candyCannon'
  | 'hotdogSlinger'
  | 'joystickBoomerang'
  | 'discoBall'
  | 'bananaMine'
  | 'bomb'
  | 'flySwatter'
  | 'pixelRail'
  | 'bubbleWand'
  | 'magnetGlove'
  | 'yoyoLauncher';
export type TowerKind = 'laser' | 'popcorn' | 'frost' | 'tesla' | 'bumper';
export type PerkKind = 'speed' | 'dash' | 'magnet' | 'greed' | 'regen' | 'stomp';
export type ThemeId = 'plaza' | 'candy' | 'arena' | 'neon' | 'rooftop' | 'shaft' | 'race' | 'lane' | 'maze' | 'jungle' | 'servers' | 'underwater';
export type VehicleKind = 'kart' | 'roller' | 'hoverboard' | 'unicorn';
export type RunMode = 'run' | 'quick' | 'endless' | 'versus' | 'bossrush' | 'brawl';
export type BossKind = 'megaBlock' | 'worm' | 'rex' | 'kraken' | 'rhino' | 'dominik';
export type VersusMode = 'ffa' | 'team';
export type VersusRule = 'score' | 'rounds' | 'king' | 'capture' | 'gungame' | 'coinop';
/** Coin-Op Chaos: the rule in force for the next 30 seconds */
export type CoinOpRule = 'turbo' | 'moon' | 'rapid' | 'swords' | 'boom' | 'double';
export type Difficulty = 'ultraLow' | 'low' | 'medium' | 'high' | 'ultraHigh';
export type RareKind = 'slushMachine' | 'bubblegumBazooka' | 'leafBlower' | 'pizzaCutter' | 'thunderHammer';
export type PowerupKind = 'magnet' | 'rapid' | 'bomb' | 'frost' | 'heart';
export type DamageSource = WeaponKind | RareKind | TowerKind | 'stomp' | 'dash' | 'kart' | 'explosion' | 'bomb';
/** quick messages: help, a ping at the crosshair, nest here, need coins, nice, good game */
export type EmoteId = 'help' | 'here' | 'nest' | 'coins' | 'nice' | 'gg';
export type KillCategory = 'weapon' | 'tower' | 'kart' | 'stomp' | 'dash' | 'other';

export type Command =
  | { type: 'move'; playerId: number; dir: Vec2 }
  | { type: 'jump'; playerId: number }
  /** Space is held: flies while a jetpack has fuel */
  | { type: 'fly'; playerId: number }
  | { type: 'dash'; playerId: number }
  /** tap E: enter or leave a vehicle */
  | { type: 'use'; playerId: number }
  /** E is held this tick: plants a charge at a nest */
  | { type: 'hold'; playerId: number }
  | { type: 'build'; playerId: number; padId: number; tower: TowerKind }
  | { type: 'upgrade'; playerId: number; padId: number }
  /** where the player's crosshair is on the ground */
  | { type: 'aim'; playerId: number; point: Vec2 }
  /** the fire button is held this tick */
  | { type: 'fire'; playerId: number }
  /** slot 0–5 = normal weapons, -1 = the rare weapon (Q) */
  | { type: 'select'; playerId: number; slot: number }
  /** elevator shop: buy offer number `offer` */
  | { type: 'buy'; playerId: number; offer: number }
  | { type: 'ready'; playerId: number }
  /** a quick message; `at` marks a spot (pings) */
  | { type: 'emote'; playerId: number; emote: EmoteId; at?: Vec2 };

/** Everything one player asked for in one tick, collected from the commands. */
export interface Intent {
  move: Vec2;
  jump: boolean;
  fly: boolean;
  dash: boolean;
  use: boolean;
  hold: boolean;
  fire: boolean;
  aim: Vec2 | null;
  select: number | null;
  buy: number[];
  ready: boolean;
}

export interface HeldWeapon {
  kind: WeaponKind;
  level: number;
  cooldown: number;
}

export interface PlayerStats {
  kills: number;
  /** kills by what did them (weapon kind, rare weapon, stomp, dash, kart, ...) */
  killsBy: Record<string, number>;
  coins: number;
  towersBuilt: number;
  revives: number;
  downs: number;
  bestCombo: number;
  score: number;
}

export interface Player {
  id: number;
  name: string;
  /** versus with teams: 0 or 1 */
  team?: 0 | 1;
  /** index into PLAYER_COLORS */
  color: number;
  pos: Vec2;
  /** unit vector of the last movement direction */
  facing: Vec2;
  /** unit vector from the player toward the crosshair */
  aim: Vec2;
  aimPoint: Vec2;
  /** index of the weapon that fires */
  selected: number;
  hp: number;
  maxHp: number;
  coins: number;
  downUntil: number | null;
  weapons: HeldWeapon[];
  coinStreak: number;
  lastCoinTick: number;
  /** ticks left in the air (0 = on the ground) */
  air: number;
  dashTicks: number;
  dashDir: Vec2;
  dashCharges: number;
  /** ticks until the next dash charge is back */
  dashRecharge: number;
  /** enemy ids already hit by the current dash */
  dashHits: number[];
  invulnUntil: number;
  lastHitEventAt: number;
  /** tick of the last emote (one a second at most) */
  lastEmoteAt: number;
  combo: number;
  comboUntil: number;
  perks: Record<PerkKind, number>;
  vehicleId: number | null;
  boostUntil: number;
  rapidUntil: number;
  magnetUntil: number;
  /** where the player gets back up after going down */
  safePoint: Vec2;
  /** ticks E has been held next to a nest */
  plantTicks: number;
  /** jetpack fuel in ticks, 0 = no jetpack */
  /** carries a jetpack: kept for the rest of the floor */
  jetpack: boolean;
  /** ticks Space has been held in a row */
  flyHold: number;
  /** tick of the last damage taken (for healing on easy levels) */
  lastDamageAt: number;
  jetFuel: number;
  flying: boolean;
  /** standing on top of a wall block (landed there with the jetpack) */
  perched?: boolean;
  /** climbing a ladder: ticks left until you stand on the wall top at `top` */
  climb?: { ticks: number; top: Vec2 } | null;
  /** lives left (each player has their own); at 0 the player is out until the next floor */
  lives?: number;
  out?: boolean;
  /** stomps in a row (each one lands soon after the last): every one after the first hurts less */
  stompChain?: number;
  /** sinking down after the jetpack was let go: ticks until the landing */
  descent?: number;
  lastStompAt?: number;
  rare: { kind: RareKind; until: number; cooldown: number } | null;
  rareSelected: boolean;
  /** downed in a team game: can be helped up until this tick */
  reviveUntil: number | null;
  /** ticks a teammate has been helping */
  reviveProgress: number;
  stats: PlayerStats;
}

export type EnemyState = 'move' | 'windup' | 'charge' | 'stunned' | 'fuse';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  slowUntil: number;
  radius: number;
  hordeId: number | null;
  elite: boolean;
  state: EnemyState;
  stateUntil: number;
  /** locked direction of a windup/charge */
  dir: Vec2;
  /** knockback velocity, decays every tick */
  knock: Vec2;
  cooldownUntil: number;
  /** a kart cannot ram this enemy again before this tick */
  ramHitUntil: number;
  /** distance left in a rammer charge */
  chargeLeft: number;
  /** slush build-up; at RARE.slush.freezeAt the enemy freezes */
  chill: number;
  frozenUntil: number;
  /** caught in a gum bubble */
  stuckUntil: number;
  /** a wall slam from the leaf blower cannot repeat before this tick */
  slamUntil: number;
}

export interface Horde {
  id: number;
  waypoint: Vec2;
  aggro: boolean;
  /** rush hordes hunt the players from the start and never give up */
  rush: boolean;
  nextWanderAt: number;
}

/** What happens where a lobbed projectile lands. */
export interface LandEffect {
  radius: number;
  damage: number;
  /** if set, leaves an area that pulses `damage` every `interval` ticks for `duration` ticks */
  duration?: number;
  interval?: number;
  /** a burst of damage on landing before the area starts */
  impact?: number;
  /** the area slows monsters inside it */
  slows?: boolean;
}

export interface Projectile {
  id: number;
  kind: DamageSource;
  behavior: 'bolt' | 'lob' | 'boomerang' | 'saw';
  /** fired by an enemy: hits players instead of enemies */
  hostile?: boolean;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  /** extra enemies a bolt may pass through; Infinity for boomerangs */
  pierce: number;
  /** tick at which the projectile expires (bolt) or lands (lob) */
  until: number;
  /** enemy ids already hit (pierce/boomerang must not hit the same enemy twice per pass) */
  hitIds: number[];
  /** player id, or -1 for towers and enemies */
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
  /** saw: wall bounces left */
  bounces?: number;
}

export interface Area {
  id: number;
  kind: DamageSource;
  ownerId: number;
  pos: Vec2;
  radius: number;
  damage: number;
  interval: number;
  nextAt: number;
  until: number;
  /** monsters inside are slowed (mustard) */
  slows?: boolean;
}

export interface Mine {
  id: number;
  pos: Vec2;
  ownerId: number;
  damage: number;
  armedAt: number;
  expiresAt: number;
}

export interface JetpackItem {
  id: number;
  pos: Vec2;
}

export interface Bubble {
  id: number;
  pos: Vec2;
  ownerId: number;
  popAt: number;
}

export interface Coin {
  id: number;
  pos: Vec2;
  value: number;
  expiresAt: number;
}

export interface Crate {
  id: number;
  pos: Vec2;
  /** a rare weapon that is the first card when it opens (Angry Dominik's hammer) */
  prize?: RareKind;
}

export type Card = { type: 'weapon'; weapon: WeaponKind } | { type: 'perk'; perk: PerkKind } | { type: 'rare'; rare: RareKind };

export interface Offer {
  id: number;
  pos: Vec2;
  cards: Card[];
  cardPos: Vec2[];
  /** cards cannot be taken before this tick */
  armedAt: number;
  expiresAt: number;
}

/** what hurt a player (for the run log) */
export type HurtSource = 'contact' | 'shot' | 'explosion' | 'glitch' | 'rammer' | 'other';

export interface Tower {
  id: number;
  kind: TowerKind;
  padId: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  cooldown: number;
  level: number;
  /** ticks of building (holding E on the pad) still needed; 0 = finished */
  buildLeft: number;
  /** the work in progress is an upgrade: the tower keeps firing at its current level meanwhile */
  upgrading: boolean;
  /** who built it (versus: it fights that player's rivals) */
  ownerId?: number;
}

export interface Nest {
  id: number;
  spotId: number;
  pos: Vec2;
  state: 'idle' | 'planted' | 'destroyed';
  /** ticks of successful holding, up to HOLD_TICKS */
  progress: number;
  nextSpawnAt: number;
  nextRushAt: number;
  nextBlastAt: number;
  /** endless mode: when a destroyed nest comes back somewhere else */
  respawnAt?: number;
}

/** A delayed ground blast that is shown as a warning ring first. Only hurts players. */
export interface Blast {
  id: number;
  pos: Vec2;
  radius: number;
  createdAt: number;
  at: number;
  damage: number;
  /** it throws whoever it hurts away from `from`, up to `dist` tiles (Angry Dominik's hammer) */
  fling?: { from: Vec2; dist: number };
  /** no warning on the floor and none to hear (his thrown hammer: the hammer in the air is the warning) */
  hidden?: boolean;
  /** it comes down as a bolt of lightning (the strikes that fall with Angry Dominik's attacks) */
  bolt?: boolean;
}

export interface BossState {
  kind: BossKind;
  maxHp: number;
  phase: 1 | 2 | 3;
  /** Mega Block: its enemy id */
  enemyId: number | null;
  /** Segment Worm: each worm as segment enemy ids, head first */
  worms: number[][];
  nextAttackAt: number;
  lastPos: Vec2;
  /** a wild boss of the Tower Run: the floor does not end with it */
  wild?: boolean;
  /** a wild boss waits by the elevator until someone comes near or hurts it: the speed it gets back then */
  waiting?: number;
  /** Angry Dominik's laser eyes: it aims from `startAt`, burns from `fireAt` to `endAt`, turning from angle `from` by `sweep` */
  laser?: { startAt: number; fireAt: number; endAt: number; from: number; sweep: number } | null;
  /** the Kraken: a player held by a tentacle and dragged in, until this tick */
  grab?: { playerId: number; until: number } | null;
  /** the Mega Block in mid-leap: from where to where, and when it lands */
  leap?: { from: Vec2; to: Vec2; start: number; land: number } | null;
  /** the Kraken: when it next calls a school of fish and sharks */
  nextSchoolAt?: number;
}

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  pos: Vec2;
  vel: Vec2;
  /** durability */
  hp: number;
  /** ticks of driving left */
  fuel: number;
  driverId: number | null;
  air: number;
  /** index into map.vehicleSpots */
  spot: number;
  /** a race kart: its driver cannot get out and it never runs out of fuel */
  locked?: boolean;
  /** versus: when each rival it rammed can be rammed again (by player id) */
  rammedUntil?: Record<number, number>;
}

export interface Powerup {
  id: number;
  kind: PowerupKind;
  pos: Vec2;
  expiresAt: number;
}

export interface ShopOffer {
  kind: 'weapon' | 'perk' | 'heal' | 'credit';
  weapon?: WeaponKind;
  perk?: PerkKind;
  cost: number;
  sold: boolean;
}

export interface ShopState {
  /** offers per player id */
  offers: Record<number, ShopOffer[]>;
  ready: number[];
  creditSold: boolean;
}

export interface RunState {
  mode: RunMode;
  /** map ids of the floors of this run, in order */
  floors: string[];
  floor: number;
  stage: 'floor' | 'shaft' | 'shop' | 'race' | 'lane' | 'maze';
  /** tick at which the current shaft or shop stage ends on its own */
  stageUntil: number;
  shop: ShopState | null;
  /** the Kart Rally, while it runs */
  race?: RaceState | null;
  /** Lane Defense, while it runs: the arcade cabinet's health and the waves sent so far */
  lane?: { coreHp: number; waves: number } | null;
  /** Glitch Maze, while it runs */
  maze?: MazeState | null;
}

export interface VersusState {
  mode: VersusMode;
  rule: VersusRule;
  /** score race: kills to win (per player, or per team) */
  limit: number;
  /** score race: the match ends at this tick */
  endsAt: number;
  /** kills per player id */
  scores: Record<number, number>;
  teamScores: [number, number];
  /** last cube standing: rounds won per player id (free for all) or team index */
  roundWins: Record<number, number>;
  /** between two rounds: the next one starts at this tick (0 while a round runs) */
  roundBreakUntil: number;
  round: number;
  nextCrateAt: number;
  /** monster hordes roam the arena too */
  chaos?: boolean;
  nextHordeAt?: number;
  /** chaos with a boss: now and then King Rex or the Rhino breaks in; when the next one comes */
  boss?: boolean;
  nextBossAt?: number;
  /** king of the cube: the zone, its radius and when it moves on */
  king?: { pos: Vec2; radius: number; nextMoveAt: number; spot: number } | null;
  /** coin-op chaos: the rule in force and when it changes */
  coinop?: { rule: CoinOpRule; nextAt: number } | null;
  /** capture the cube: each team's cube, its base, and who carries it */
  flags?: { base: Vec2; pos: Vec2; carrier: number | null }[] | null;
}

export interface MazeState {
  /** tile indices that still hold a pixel */
  pixels: number[];
  total: number;
  /** pixels collected per player id */
  collected: Record<number, number>;
  /** power cubes still lying in the maze (indices into MAZE_CUBES) */
  cubes: number[];
  /** ghosts are crashable until this tick */
  powerUntil: number;
  /** ticks at which crashed ghosts come back */
  respawns: number[];
}

export interface RaceState {
  /** laps per player id */
  laps: Record<number, number>;
  /** index of the checkpoint each player has to reach next */
  next: Record<number, number>;
  /** last checkpoint each player passed (where a wrecked kart comes back) */
  last: Record<number, number>;
  /** a wrecked kart is back at this tick */
  wreckedUntil: Record<number, number>;
}

export interface RunSample {
  /** seconds since the run started */
  t: number;
  distance: number;
  idleTicks: number;
  kills: number;
  alarm: number;
}

export interface RunStats {
  kills: Record<KillCategory, number>;
  maxCombo: number;
  damageTaken: number;
  damageBy: Record<HurtSource, number>;
  downs: number;
  distance: number;
  idleTicks: number;
  samples: RunSample[];
}

export type SimEvent =
  | { type: 'shot'; weapon: WeaponKind; pos: Vec2 }
  | { type: 'weaponSelected'; playerId: number; slot: number }
  | { type: 'enemyHit'; id: number; pos: Vec2; amount: number }
  | { type: 'enemyKilled'; kind: EnemyKind; pos: Vec2; elite: boolean }
  | { type: 'coinPicked'; playerId: number; streak: number }
  | { type: 'towerBuilt'; kind: TowerKind; padId: number; playerId: number }
  | { type: 'buildDenied'; padId: number; reason: 'coins' | 'occupied' | 'notOnPad'; playerId: number }
  | { type: 'upgradeDenied'; padId: number; reason: 'coins' | 'maxLevel' | 'building' | 'notOnPad'; playerId: number }
  | { type: 'towerUpgrade'; padId: number; level: number; playerId: number }
  | { type: 'raceLap'; playerId: number; lap: number }
  /** the opening countdown: 5 4 3 2 1, then 0 for GO! */
  | { type: 'countdown'; n: number }
  | { type: 'pvpKill'; killerId: number | null; victimId: number }
  | { type: 'gunLevel'; playerId: number; level: number; weapon: WeaponKind }
  | { type: 'versusRound'; winner: number | null; round: number }
  | { type: 'versusEnd'; winners: number[] }
  | { type: 'cubeTaken'; team: 0 | 1; playerId: number }
  | { type: 'cubeDropped'; team: 0 | 1; pos: Vec2 }
  | { type: 'cubeReturned'; team: 0 | 1 }
  | { type: 'cubeCaptured'; team: 0 | 1; playerId: number }
  | { type: 'kingMoved'; pos: Vec2 }
  | { type: 'coinOpRule'; rule: CoinOpRule }
  | { type: 'emote'; playerId: number; emote: EmoteId; pos?: Vec2 }
  | { type: 'laneLeak'; pos: Vec2; coreHp: number }
  | { type: 'laneEnd'; coreLeft: number; coins: number }
  | { type: 'mazePower'; playerId: number }
  | { type: 'mazeGhost'; playerId: number; pos: Vec2 }
  | { type: 'mazeCaught'; playerId: number }
  | { type: 'mazeEnd'; cleared: boolean; collected: Record<number, number> }
  | { type: 'raceEnd'; laps: Record<number, number>; medal: 'gold' | 'silver' | 'bronze' | null; winners: number[] }
  | { type: 'raceWreck'; playerId: number; pos: Vec2 }
  | { type: 'towerDone'; padId: number; level: number }
  | { type: 'towerFired'; kind: TowerKind; pos: Vec2; target: Vec2 }
  | { type: 'railFired'; from: Vec2; to: Vec2 }
  | { type: 'magnetPull'; from: Vec2; to: Vec2 }
  /** a healer mended the monsters at these spots */
  | { type: 'enemyHealed'; pos: Vec2; targets: Vec2[] }
  /** a teleporter vanished at `from` and appeared at `to` */
  | { type: 'enemyBlink'; from: Vec2; to: Vec2 }
  /** a tesla coil's lightning: from the coil through every monster it jumped to */
  | { type: 'teslaChain'; points: Vec2[] }
  | { type: 'towerDestroyed'; kind: TowerKind; pos: Vec2 }
  | { type: 'playerHit'; playerId: number; hp: number }
  | { type: 'playerDown'; playerId: number }
  | { type: 'playerDowned'; playerId: number }
  | { type: 'playerRevived'; playerId: number; by: number }
  | { type: 'teamWipe' }
  | { type: 'playerRespawn'; playerId: number }
  | { type: 'creditLost'; credits: number; playerId?: number }
  /** a player lost their last life: out until the next floor (or a hidden heart) */
  | { type: 'playerOut'; playerId: number }
  /** the hidden heart was found: a life for everyone */
  | { type: 'heartFound'; playerId: number }
  /** the easter egg: a shot hit the AmannLabs logo; enough of them and it answers with a prize (or not) */
  | { type: 'logoHit'; pos: Vec2; hits: number }
  | { type: 'logoEgg'; pos: Vec2; prize: 'coins' | 'crate' | 'nothing' }
  | { type: 'jump'; playerId: number }
  | { type: 'stomp'; pos: Vec2; radius: number }
  | { type: 'dash'; playerId: number }
  | { type: 'boost'; playerId: number }
  | { type: 'comboUp'; playerId: number; mult: number }
  | { type: 'comboLost'; playerId: number }
  | { type: 'enemyWindup'; id: number; kind: EnemyKind; pos: Vec2; dir: Vec2 }
  | { type: 'enemyShot'; pos: Vec2 }
  | { type: 'explosion'; pos: Vec2; radius: number }
  | { type: 'blastWarning'; pos: Vec2; radius: number }
  | { type: 'nestPlanted'; id: number }
  | { type: 'nestAppeared'; id: number; pos: Vec2 }
  | { type: 'nestDestroyed'; id: number; pos: Vec2 }
  | { type: 'alarmChanged'; level: number }
  | { type: 'elevatorOpen' }
  | { type: 'offerOpened'; pos: Vec2 }
  | { type: 'cardPicked'; playerId: number; card: Card; level: number }
  | { type: 'crateCoins'; playerId: number; coins: number }
  | { type: 'powerupSpawned'; kind: PowerupKind; pos: Vec2 }
  | { type: 'powerupPicked'; kind: PowerupKind; playerId: number }
  | { type: 'kartEnter'; playerId: number }
  | { type: 'unicornAppeared'; pos: Vec2 }
  | { type: 'kartRam'; pos: Vec2 }
  | { type: 'kartJump'; pos: Vec2 }
  | { type: 'kartLand'; pos: Vec2 }
  | { type: 'kartDestroyed'; pos: Vec2 }
  | { type: 'jetpackPicked'; playerId: number }
  | { type: 'jetpackEmpty'; playerId: number }
  | { type: 'rareFired'; kind: RareKind; playerId: number; pos: Vec2 }
  | { type: 'rareExpired'; playerId: number }
  | { type: 'bubblePop'; pos: Vec2 }
  | { type: 'floorCleared'; floor: number }
  | { type: 'floorStart'; floor: number; mapId: string }
  | { type: 'bought'; playerId: number; offer: number; kind: ShopOffer['kind'] }
  | { type: 'buyDenied'; playerId: number; offer: number }
  | { type: 'bossSpawn'; kind: BossKind }
  /** a boss begins an attack (its voice) */
  | { type: 'bossAttack'; kind: BossKind }
  | { type: 'krakenGrab'; playerId: number }
  | { type: 'krakenRelease'; playerId: number }
  | { type: 'bossPhase'; phase: 2 | 3 }
  | { type: 'bossDead'; pos: Vec2; kind?: BossKind }
  /** a small Angry Dominik steps out of the wall logo, and goes back into it */
  | { type: 'dominikJoined'; pos: Vec2 }
  | { type: 'dominikLeft'; pos: Vec2 }
  /** Angry Dominik throws his hammer: out to `to` and back */
  | { type: 'hammerThrow'; from: Vec2; to: Vec2 }
  /** Angry Dominik raises his hammer for a slam: it meets the floor at tick `at` */
  | { type: 'hammerSlam'; pos: Vec2; at: number }
  /** a bolt of lightning strikes the floor */
  | { type: 'lightning'; pos: Vec2 }
  /** his eyes take aim, and then they burn: once each per laser */
  | { type: 'laserAim'; pos: Vec2 }
  | { type: 'laserFire'; pos: Vec2 }
  /** a baby dino breaks out of its egg */
  | { type: 'eggHatch'; pos: Vec2 }
  | { type: 'wormSplit'; pos: Vec2 }
  | { type: 'gameWon'; score: number }
  | { type: 'gameLost' };

export interface SimState {
  tick: number;
  /** the opening countdown: ticks left before GO; the game's clock stands still meanwhile */
  countdown?: number;
  seed: number;
  difficulty: Difficulty;
  run: RunState;
  theme: ThemeId;
  rng: Rng;
  map: FloorMap;
  players: Player[];
  enemies: Enemy[];
  hordes: Horde[];
  projectiles: Projectile[];
  areas: Area[];
  mines: Mine[];
  coins: Coin[];
  crates: Crate[];
  offers: Offer[];
  towers: Tower[];
  nests: Nest[];
  boss: BossState | null;
  /** Boss Brawl: every boss in the arena right now (`boss` is the first of them) */
  bosses?: BossState[];
  /** Boss Brawl: the bosses still to come, when the next wave enters and when the next shark swims by */
  brawl?: { queue: BossKind[]; nextAt: number; wave: number; nextSharkAt: number } | null;
  blasts: Blast[];
  vehicles: Vehicle[];
  vehicleRespawns: { spot: number; at: number; kind: VehicleKind }[];
  /** what this run may use (locked weapons never appear in crates, locked vehicles are not parked) */
  unlocks: { weapons: WeaponKind[]; vehicles: VehicleKind[] };
  powerups: Powerup[];
  nextPowerupAt: number;
  jetpacks: JetpackItem[];
  /** the easter egg: shots that hit the AmannLabs logo on the wall, and how often it has answered on this floor */
  logoEgg?: { hits: number; given: number } | null;
  /** the hidden heart of this floor, if there is one (see systems/heart.ts) */
  heart?: { pos: Vec2 } | null;
  /** King Rex's eggs: thrown from where it fell (`from`) to where they lie, each hatches a baby dino */
  eggs?: { id: number; pos: Vec2; from: Vec2; laidAt: number; hatchAt: number }[];
  /** the small Angry Dominik from the wall logo: his body, when he goes back and where to */
  mini?: { enemyId: number; until: number; home: Vec2; nextSlamAt: number } | null;
  /** Tower Run: the wild boss that breaks in on this floor when the first nest falls */
  wild?: { kind: BossKind } | null;
  nextJetpackAt: number;
  /** when the game next rolls for a unicorn to turn up */
  nextUnicornAt?: number;
  bubbles: Bubble[];
  credits: number;
  alarm: { level: number; nextAt: number };
  elevatorOpen: boolean;
  score: number;
  stats: RunStats;
  /** a versus match (PvP), or null in the co-op modes */
  versus?: VersusState | null;
  phase: 'playing' | 'won' | 'lost';
  look: 'day' | 'night';
  nextId: number;
  events: SimEvent[];
  /** flow field toward the players and the tick it was built; derived data, rebuilt on demand */
  flow: { field: Int16Array; builtAt: number } | null;
}
