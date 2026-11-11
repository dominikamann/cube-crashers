import { PLAYER_HP } from './config/balance';
import { DIFFICULTY } from './config/difficulty';
import { addPlayer, defaultName, registerPlayerFactory, updateRevives } from './systems/coop';
import type { FloorMap } from './map/tilemap';
import { FLOORS, RUN_FLOORS } from './config/floors';
import { Rng } from './rng';
import { initRun, updateRunStage } from './systems/run';
import { updateConveyors } from './systems/conveyors';
import { updateShaft } from './systems/shaft';
import { updateRace } from './systems/race';
import { moveBoss, updateBoss } from './systems/boss';
import { removeDead, updateAreas, updateMines, updateProjectiles } from './systems/combat';
import { updateCoins } from './systems/coins';
import { updateEnemies } from './systems/enemies';
import { updateHordes } from './systems/hordes';
import { setupFloor, updateAlarm, updateBlasts, updateNests } from './systems/nests';
import { updateOffers } from './systems/offers';
import { updatePowerups } from './systems/powerups';
import { updateJetpacks, updateRare } from './systems/rare';
import { updateVehicles } from './systems/vehicles';
import { updateOutcome } from './systems/outcome';
import { updatePlayers } from './systems/player';
import { sampleStats } from './systems/stats';
import { tryBuild, tryUpgrade, updateTowerWork, updateTowers } from './systems/towers';
import { updateWeapons } from './systems/weapons';
import { ALL_WEAPONS } from './config/weapons';
import type { Command, Difficulty, Intent, Player, RunMode, SimState, Vec2, WeaponKind } from './types';

export function createPlayer(id: number, pos: Vec2, name = defaultName(id), color = id % 6): Player {
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
  /** unlocked items (profile ids); leave out to allow everything */
  unlocked?: string[];
  /** LAN: the player ids and lobby colours, in lobby order */
  ids?: number[];
  names?: string[];
  colors?: number[];
}

export function createSim(firstMap: FloorMap, seed: number, opts: SimOptions = {}): SimState {
  const difficulty = opts.difficulty ?? 'medium';
  const mode = opts.mode ?? 'quick';
  const floors = mode === 'run' ? RUN_FLOORS : [firstMap.id];
  const map = mode === 'run' ? FLOORS[RUN_FLOORS[0]].map : firstMap;
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
  setupFloor(s);
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
      case 'build':
        tryBuild(s, c.playerId, c.padId, c.tower);
        break;
      case 'upgrade':
        tryUpgrade(s, c.playerId, c.padId);
        break;
    }
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
  updateBoss(s);
  updateCoins(s);
  updateOffers(s);
  if (onFloor) {
    updatePowerups(s);
    updateJetpacks(s);
  }
  updateRare(s);
  removeDead(s);
  updateOutcome(s);
  sampleStats(s);
  s.tick++;
}
