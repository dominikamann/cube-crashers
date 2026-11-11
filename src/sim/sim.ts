import { PLAYER_HP, START_CREDITS } from './config/balance';
import type { FloorMap } from './map/tilemap';
import { Rng } from './rng';
import { removeDead, updateAreas, updateProjectiles } from './systems/combat';
import { updateCoins } from './systems/coins';
import { updateEnemies } from './systems/enemies';
import { updateOutcome } from './systems/outcome';
import { updatePlayers } from './systems/player';
import { tryBuild, updateTowers } from './systems/towers';
import { updateWeapons } from './systems/weapons';
import type { Command, Player, SimState, Vec2 } from './types';

export function createPlayer(id: number, pos: Vec2): Player {
  return {
    id,
    pos: { ...pos },
    facing: { x: 0, z: -1 },
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
  return {
    tick: 0,
    seed,
    rng: new Rng(seed),
    map,
    players: [createPlayer(0, map.spawn)],
    enemies: [],
    hordes: [],
    projectiles: [],
    areas: [],
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
}

export function stepSim(s: SimState, commands: Command[]): void {
  s.events = [];
  if (s.phase !== 'playing') return;
  const moves = new Map<number, Vec2>();
  for (const c of commands) {
    if (c.type === 'move') moves.set(c.playerId, c.dir);
    else if (c.type === 'build') tryBuild(s, c.playerId, c.padId, c.tower);
  }
  updatePlayers(s, moves);
  updateEnemies(s);
  updateWeapons(s);
  updateProjectiles(s);
  updateTowers(s);
  updateAreas(s);
  removeDead(s);
  updateCoins(s);
  updateOutcome(s);
  s.tick++;
}
