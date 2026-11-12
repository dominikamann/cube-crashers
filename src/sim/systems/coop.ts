import { DOWN_COIN_LOSS, MAX_PLAYERS, PLAYER_NAMES, PLAYER_RADIUS, RESPAWN_TICKS, REVIVE_HOLD_TICKS, REVIVE_INVULN_TICKS, REVIVE_RANGE, TEAM_HORDE_STEP, TEAM_HP_STEP } from '../config/balance';
import { DIFFICULTY } from '../config/difficulty';
import { BLOCKS_WALKER, nearestFree } from '../map/tilemap';
import type { Intent, Player, SimState, Vec2 } from '../types';
import { dist } from '../util';

/** How much bigger hordes are for this team size and difficulty. */
export function hordeScale(s: SimState): number {
  return (1 + TEAM_HORDE_STEP * (s.players.length - 1)) * DIFFICULTY[s.difficulty].hordeSize;
}

/** How much tougher monsters are for this team size and difficulty. */
export function hpScale(s: SimState): number {
  return (1 + TEAM_HP_STEP * (s.players.length - 1)) * DIFFICULTY[s.difficulty].enemyHp;
}

/** Players start on a small ring around the spawn point. */
export function spawnPoint(s: SimState, index: number): Vec2 {
  if (index === 0) return { ...s.map.spawn };
  const a = (index / MAX_PLAYERS) * Math.PI * 2;
  const want = { x: s.map.spawn.x + Math.cos(a) * 1.2, z: s.map.spawn.z + Math.sin(a) * 1.2 };
  return nearestFree(s.map, want, PLAYER_RADIUS, BLOCKS_WALKER);
}

export function freeColor(s: SimState): number {
  for (let c = 0; c < MAX_PLAYERS; c++) if (!s.players.some(p => p.color === c)) return c;
  return s.players.length % MAX_PLAYERS;
}

export function defaultName(index: number): string {
  return PLAYER_NAMES[index % PLAYER_NAMES.length];
}

/** the lives each player starts with (and the most a hidden heart fills up to) */
export function startLives(s: SimState): number {
  return DIFFICULTY[s.difficulty].credits;
}

/** the team's credits are everyone's lives together (alone: just yours) */
export function syncCredits(s: SimState): void {
  s.credits = s.players.reduce((n, p) => n + (p.lives ?? 0), 0);
}

/**
 * `p` loses one of their own lives. With none left they are out (until the next floor or a hidden heart) while
 * the others play on; the run is lost when everyone is out. Returns true when `p` gets back up.
 */
export function loseLife(s: SimState, p: Player): boolean {
  p.lives = Math.max(0, (p.lives ?? 0) - 1);
  syncCredits(s);
  s.events.push({ type: 'creditLost', credits: p.lives, playerId: p.id });
  if (p.lives > 0) return true;
  p.out = true;
  p.reviveUntil = null;
  p.reviveProgress = 0;
  p.downUntil = Number.MAX_SAFE_INTEGER;
  s.events.push({ type: 'playerOut', playerId: p.id });
  checkAllOut(s);
  return false;
}

/** The run is lost when nobody is left in the game. */
function checkAllOut(s: SimState): void {
  if (s.phase !== 'playing' || s.players.length === 0 || !s.players.every(p => p.out)) return;
  s.phase = 'lost';
  s.events.push({ type: 'gameLost' });
}

/**
 * Whoever is out comes back into the game with at least `lives` lives (a cleared floor, a new floor, a life
 * bought in the shop). Lives they were given meanwhile are kept.
 */
export function backIn(s: SimState, lives = 1): void {
  for (const p of s.players) {
    if (!p.out) continue;
    p.out = false;
    p.lives = Math.max(lives, p.lives ?? 0);
    p.downUntil = null;
    p.hp = p.maxHp;
  }
  syncCredits(s);
}

/** Back on the feet at the safe point after RESPAWN_TICKS, with fewer coins. */
export function sendToRespawn(s: SimState, p: Player): void {
  p.reviveUntil = null;
  p.reviveProgress = 0;
  p.downUntil = s.tick + RESPAWN_TICKS;
  p.coins -= Math.floor(p.coins * DOWN_COIN_LOSS);
}

/** Everyone is down at once: each of them loses a life, and those with one left get back up. */
function teamWipe(s: SimState): void {
  s.events.push({ type: 'teamWipe' });
  for (const p of s.players) {
    if (p.out || !(p.reviveUntil !== null || p.downUntil === null)) continue;
    if (loseLife(s, p)) sendToRespawn(s, p);
  }
}

export function checkTeamWipe(s: SimState): void {
  if (s.phase !== 'playing' || s.players.length === 0) return;
  if (!s.players.every(p => p.downUntil !== null)) return;
  if (!s.players.some(p => p.reviveUntil !== null)) return;
  teamWipe(s);
}

/** Downed players bleed out or get helped up by a teammate holding E next to them. */
export function updateRevives(s: SimState, intents: Map<number, Intent>): void {
  for (const p of s.players) {
    if (p.reviveUntil === null || s.phase !== 'playing') continue;
    const helper = s.players.find(h => h !== p && h.downUntil === null && h.vehicleId === null && dist(h.pos, p.pos) <= REVIVE_RANGE && intents.get(h.id)?.hold);
    if (helper) {
      p.reviveProgress++;
      if (p.reviveProgress >= REVIVE_HOLD_TICKS) {
        p.reviveUntil = null;
        p.reviveProgress = 0;
        p.downUntil = null;
        p.hp = p.maxHp / 2;
        p.invulnUntil = s.tick + REVIVE_INVULN_TICKS;
        helper.stats.revives++;
        helper.plantTicks = 0;
        s.events.push({ type: 'playerRevived', playerId: p.id, by: helper.id });
      }
      continue;
    }
    p.reviveProgress = 0;
    if (s.tick < p.reviveUntil) continue;
    if (loseLife(s, p)) sendToRespawn(s, p);
    if (s.phase !== 'playing') return;
  }
}

export function addPlayer(s: SimState, id: number, name?: string): Player {
  // late import cycle guard: createPlayer lives in sim.ts
  const p = makePlayer(id, spawnPoint(s, s.players.length), name ?? defaultName(s.players.length), freeColor(s));
  p.lives = startLives(s);
  s.players.push(p);
  syncCredits(s);
  return p;
}

export function removePlayer(s: SimState, id: number): void {
  const p = s.players.find(x => x.id === id);
  if (!p) return;
  for (const v of s.vehicles) if (v.driverId === id) v.driverId = null;
  s.mines = s.mines.filter(m => m.ownerId !== id);
  s.players = s.players.filter(x => x.id !== id);
  s.flow = null;
  syncCredits(s);
  // the one who left may have been the last who could help the others up, or the last still in the game
  checkTeamWipe(s);
  checkAllOut(s);
}

let makePlayer: (id: number, pos: Vec2, name: string, color: number) => Player = () => {
  throw new Error('player factory not registered');
};

/** sim.ts registers its player factory here, so coop.ts does not import sim.ts (which imports coop.ts). */
export function registerPlayerFactory(f: typeof makePlayer): void {
  makePlayer = f;
}
