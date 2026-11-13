import { MAX_PLAYERS } from './config/balance';
import { PLAYER_HP } from './config/balance';
import { DIFFICULTY } from './config/difficulty';
import { addPlayer, defaultName, registerPlayerFactory, updateRevives } from './systems/coop';
import type { FloorMap } from './map/tilemap';
import { BOSS_RUSH, FLOORS, RUN_FLOORS, runFloors } from './config/floors';
import { Rng } from './rng';
import { initRun, updateRunStage } from './systems/run';
import { updateConveyors } from './systems/conveyors';
import { updateShaft } from './systems/shaft';
import { updateRace } from './systems/race';
import { updateLane } from './systems/lane';
import { updateMaze } from './systems/maze';
import { setupVersus, updateVersus } from './systems/versus';
import { moveBoss, updateBoss } from './systems/boss';
import { removeDead, updateAreas, updateMines, updateProjectiles } from './systems/combat';
import { updateCoins } from './systems/coins';
import { updateEnemies } from './systems/enemies';
import { updateHordes } from './systems/hordes';
import { setupFloor, updateAlarm, updateBlasts, updateNests } from './systems/nests';
import { updateOffers } from './systems/offers';
import { updatePowerups } from './systems/powerups';
import { updateJetpacks, updateRare } from './systems/rare';
import { updateHeart } from './systems/heart';
import { updateLogoSpin } from './systems/logo-spin';
import { updateEggs } from './systems/eggs';
import { updateMiniDominik } from './systems/mini-dominik';
import { updateVehicles } from './systems/vehicles';
import { updateOutcome } from './systems/outcome';
import { updatePlayers } from './systems/player';
import { sampleStats } from './systems/stats';
import { tryBuild, tryUpgrade, updateTowerWork, updateTowers } from './systems/towers';
import { updateWeapons } from './systems/weapons';
import { ALL_WEAPONS } from './config/weapons';
import { handleEmote } from './systems/emotes';
import { TICK_RATE, type Command, type Difficulty, type Intent, type Player, type RunMode, type SimState, type Vec2, type VersusMode, type VersusRule, type WeaponKind } from './types';

export function createPlayer(id: number, pos: Vec2, name = defaultName(id), color = id % MAX_PLAYERS): Player {
  return {
    id,
    name,
    color,
    pos: { ...pos },
    facing: { x: 0, z: -1 },
    aim: { x: 0, z: -1 },
    aimPoint: { x: pos.x, z: pos.z - 4 },
    selected: 0,
    hp: PLAYER_HP,
    maxHp: PLAYER_HP,
    coins: 0,
    downUntil: null,
    weapons: [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }],
    coinStreak: 0,
    lastCoinTick: -1000,
    air: 0,
    dashTicks: 0,
    dashDir: { x: 0, z: -1 },
    dashCharges: 1,
    dashRecharge: 0,
    dashHits: [],
    invulnUntil: 0,
    lastHitEventAt: -1000,
    lastEmoteAt: -1000,
    combo: 0,
    comboUntil: 0,
    perks: { speed: 0, dash: 0, magnet: 0, greed: 0, regen: 0, stomp: 0 },
    vehicleId: null,
    boostUntil: 0,
    rapidUntil: 0,
    magnetUntil: 0,
    safePoint: { ...pos },
    plantTicks: 0,
    jetpack: false,
    flyHold: 0,
    lastDamageAt: -1e9,
    jetFuel: 0,
    flying: false,
    rare: null,
    rareSelected: false,
    reviveUntil: null,
    reviveProgress: 0,
    stats: { kills: 0, killsBy: {}, coins: 0, towersBuilt: 0, revives: 0, downs: 0, bestCombo: 0, score: 0 },
  };
}

registerPlayerFactory(createPlayer);

const LOCKABLE_WEAPONS: WeaponKind[] = ['joystickBoomerang', 'discoBall', 'bananaMine', 'bomb'];

function unlocksFrom(unlocked?: string[]): SimState['unlocks'] {
  const all = ALL_WEAPONS;
  if (!unlocked) return { weapons: [...all], vehicles: ['kart', 'roller', 'hoverboard'] };
  return {
    weapons: all.filter(w => !LOCKABLE_WEAPONS.includes(w) || unlocked.includes(w)),
    vehicles: ['kart', ...(['roller', 'hoverboard'] as const).filter(v => unlocked.includes(v))],
  };
}

export interface SimOptions {
  players?: number;
  difficulty?: Difficulty;
  /** 'run' plays all floors of RUN_FLOORS (starting with the first), 'quick' just `map` */
  mode?: RunMode;
  /** versus (PvP): free for all or teams, score race or last cube standing */
  versus?: { mode: VersusMode; rule: VersusRule; chaos?: boolean; boss?: boolean; teams?: Record<number, 0 | 1> };
  /** Boss Rush: the map of each boss, instead of their own floors */
  rushMaps?: string[];
  /** the game opens with a countdown (5 4 3 2 1 GO!) during which nothing moves; leave out to start at once */
  countdown?: boolean;
  /** unlocked items (profile ids); leave out to allow everything */
  unlocked?: string[];
  /** LAN: the player ids and lobby colours, in lobby order */
  ids?: number[];
  names?: string[];
  colors?: number[];
}

/** the countdown that opens a game: 6 5 ... 1 GO! */
export const COUNTDOWN_TICKS = 6 * TICK_RATE;

export function createSim(firstMap: FloorMap, seed: number, opts: SimOptions = {}): SimState {
  const difficulty = opts.difficulty ?? 'medium';
  const mode = opts.mode ?? 'quick';
  const floors = mode === 'run' ? runFloors(seed) : mode === 'bossrush' ? BOSS_RUSH.map((b, i) => (opts.rushMaps?.[i] && FLOORS[opts.rushMaps[i]] ? opts.rushMaps[i] : b.map)) : [firstMap.id];
  const map = mode === 'run' ? FLOORS[RUN_FLOORS[0]].map : mode === 'bossrush' ? FLOORS[floors[0]].map : firstMap;
  const s: SimState = {
    tick: 0,
    seed,
    difficulty,
    run: { mode, floors, floor: 0, stage: 'floor', stageUntil: 0, shop: null },
    theme: 'plaza',
    rng: new Rng(seed),
    map,
    players: [],
    enemies: [],
    hordes: [],
    projectiles: [],
    areas: [],
    mines: [],
    coins: [],
    crates: [],
    offers: [],
    towers: [],
    nests: [],
    boss: null,
    blasts: [],
    vehicles: [],
    vehicleRespawns: [],
    unlocks: unlocksFrom(opts.unlocked),
    powerups: [],
    nextPowerupAt: 0,
    jetpacks: [],
    nextJetpackAt: 0,
    bubbles: [],
    credits: DIFFICULTY[difficulty].credits,
    alarm: { level: 0, nextAt: 0 },
    elevatorOpen: false,
    score: 0,
    stats: {
      kills: { weapon: 0, tower: 0, kart: 0, stomp: 0, dash: 0, other: 0 },
      maxCombo: 0,
      damageTaken: 0,
      damageBy: { contact: 0, shot: 0, explosion: 0, glitch: 0, rammer: 0, other: 0 },
      downs: 0,
      distance: 0,
      idleTicks: 0,
      samples: [],
    },
    phase: 'playing',
    look: 'day',
    nextId: 1,
    events: [],
    flow: null,
  };
  initRun(s, mode, floors);
  for (let i = 0; i < Math.max(1, opts.players ?? 1); i++) {
    const p = addPlayer(s, opts.ids?.[i] ?? i, opts.names?.[i]);
    if (opts.colors?.[i] !== undefined) p.color = opts.colors[i];
  }
  if (mode === 'versus') setupVersus(s, opts.versus?.mode ?? 'ffa', opts.versus?.rule ?? 'score', opts.versus?.chaos ?? false, opts.versus?.teams, opts.versus?.boss ?? false);
  else setupFloor(s);
  if (opts.countdown) s.countdown = COUNTDOWN_TICKS;
  return s;
}

function emptyIntent(): Intent {
  return { move: { x: 0, z: 0 }, jump: false, fly: false, dash: false, use: false, hold: false, fire: false, aim: null, select: null, buy: [], ready: false };
}

export function stepSim(s: SimState, commands: Command[]): void {
  s.events = [];
  if (s.phase !== 'playing') return;
  const intents = new Map<number, Intent>(s.players.map(p => [p.id, emptyIntent()]));
  for (const c of commands) {
    const it = intents.get(c.playerId);
    if (!it) continue;
    switch (c.type) {
      case 'move':
        it.move = c.dir;
        break;
      case 'jump':
        it.jump = true;
        break;
      case 'fly':
        it.fly = true;
        break;
      case 'dash':
        it.dash = true;
        break;
      case 'use':
        it.use = true;
        break;
      case 'hold':
        it.hold = true;
        break;
      case 'fire':
        it.fire = true;
        break;
      case 'aim':
        it.aim = c.point;
        break;
      case 'select':
        it.select = c.slot;
        break;
      case 'buy':
        it.buy.push(c.offer);
        break;
      case 'ready':
        it.ready = true;
        break;
      case 'emote':
        handleEmote(s, c);
        break;
      case 'build':
        tryBuild(s, c.playerId, c.padId, c.tower);
        break;
      case 'upgrade':
        tryUpgrade(s, c.playerId, c.padId);
        break;
    }
  }
  if ((s.countdown ?? 0) > 0) {
    // the countdown before the game: everyone waits at the start and the game's clock stands still, so every
    // timer (alarm, match time, race clock) starts at GO
    if (s.countdown! % TICK_RATE === 0) s.events.push({ type: 'countdown', n: s.countdown! / TICK_RATE });
    s.countdown!--;
    if (s.countdown === 0) s.events.push({ type: 'countdown', n: 0 });
    return;
  }
  if (s.run.stage === 'shop') {
    // in the shop nothing else moves
    updateRunStage(s, intents);
    s.tick++;
    return;
  }
  updatePlayers(s, intents);
  updateRevives(s, intents);
  updateVehicles(s, intents);
  const onFloor = s.run.stage === 'floor';
  if (onFloor) {
    updateNests(s, intents);
    updateAlarm(s);
  } else {
    updateShaft(s);
    updateRace(s);
    updateLane(s);
    updateMaze(s);
  }
  updateBlasts(s);
  updateHordes(s);
  updateEnemies(s);
  moveBoss(s);
  updateConveyors(s);
  updateWeapons(s, intents);
  updateProjectiles(s);
  updateMines(s);
  updateTowerWork(s, intents);
  updateTowers(s);
  updateAreas(s);
  updateBoss(s, intents);
  updateEggs(s);
  updateMiniDominik(s);
  updateCoins(s);
  updateOffers(s);
  if (onFloor) {
    updatePowerups(s);
    updateJetpacks(s);
    updateHeart(s);
    updateLogoSpin(s);
  }
  updateRare(s);
  removeDead(s);
  updateOutcome(s);
  updateVersus(s);
  sampleStats(s);
  s.tick++;
}
