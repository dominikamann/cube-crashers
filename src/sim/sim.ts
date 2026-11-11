import { PLAYER_HP, START_CREDITS } from './config/balance';
import type { FloorMap } from './map/tilemap';
import { Rng } from './rng';
import { removeDead, updateAreas, updateMines, updateProjectiles } from './systems/combat';
import { updateCoins } from './systems/coins';
import { updateEnemies } from './systems/enemies';
import { updateHordes } from './systems/hordes';
import { setupFloor, updateAlarm, updateNests } from './systems/nests';
import { updateOutcome } from './systems/outcome';
import { updatePlayers } from './systems/player';
import { sampleStats } from './systems/stats';
import { tryBuild, updateTowers } from './systems/towers';
import { updateWeapons } from './systems/weapons';
import type { Command, Intent, Player, SimState, Vec2 } from './types';

export function createPlayer(id: number, pos: Vec2): Player {
  return {
    id,
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
    combo: 0,
    comboUntil: 0,
    perks: { speed: 0, dash: 0, magnet: 0, greed: 0, regen: 0, stomp: 0 },
    vehicleId: null,
    boostUntil: 0,
    rapidUntil: 0,
    magnetUntil: 0,
    safePoint: { ...pos },
    plantTicks: 0,
  };
}

export function createSim(map: FloorMap, seed: number): SimState {
  const s: SimState = {
    tick: 0,
    seed,
    rng: new Rng(seed),
    map,
    players: [createPlayer(0, map.spawn)],
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
    vehicles: [],
    vehicleRespawns: [],
    powerups: [],
    nextPowerupAt: 0,
    credits: START_CREDITS,
    alarm: { level: 0, nextAt: 0 },
    elevatorOpen: false,
    score: 0,
    stats: {
      kills: { weapon: 0, tower: 0, kart: 0, stomp: 0, dash: 0, other: 0 },
      maxCombo: 0,
      damageTaken: 0,
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
  setupFloor(s);
  return s;
}

function emptyIntent(): Intent {
  return { move: { x: 0, z: 0 }, jump: false, dash: false, use: false, hold: false, fire: false, aim: null, select: null };
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
      case 'build':
        tryBuild(s, c.playerId, c.padId, c.tower);
        break;
    }
  }
  updatePlayers(s, intents);
  updateNests(s, intents);
  updateAlarm(s);
  updateHordes(s);
  updateEnemies(s);
  updateWeapons(s, intents);
  updateProjectiles(s);
  updateMines(s);
  updateTowers(s);
  updateAreas(s);
  removeDead(s);
  updateCoins(s);
  updateOutcome(s);
  sampleStats(s);
  s.tick++;
}
