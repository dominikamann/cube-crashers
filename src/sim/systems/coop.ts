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

/** Loses one credit; the run ends when none are left. Returns false if the run is now lost. */
export function loseCredit(s: SimState): boolean {
  s.credits--;
  s.events.push({ type: 'creditLost', credits: s.credits });
  if (s.credits > 0) return true;
  s.phase = 'lost';
  s.events.push({ type: 'gameLost' });
  return false;
}

/** Back on the feet at the safe point after RESPAWN_TICKS, with fewer coins. */
export function sendToRespawn(s: SimState, p: Player): void {
  p.reviveUntil = null;
  p.reviveProgress = 0;
  p.downUntil = s.tick + RESPAWN_TICKS;
  p.coins -= Math.floor(p.coins * DOWN_COIN_LOSS);
}

/** Everyone is down at once: one credit for the whole team, then all get back up. */
function teamWipe(s: SimState): void {
  s.events.push({ type: 'teamWipe' });
  if (!loseCredit(s)) return;
  for (const p of s.players) if (p.reviveUntil !== null || p.downUntil === null) sendToRespawn(s, p);
}

export function checkTeamWipe(s: SimState): void {
  if (s.phase !== 'playing' || s.players.length < 2) return;
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
    if (!loseCredit(s)) return;
    sendToRespawn(s, p);
  }
}

export function addPlayer(s: SimState, id: number, name?: string): Player {
  // late import cycle guard: createPlayer lives in sim.ts
  const p = makePlayer(id, spawnPoint(s, s.players.length), name ?? defaultName(s.players.length), freeColor(s));
  s.players.push(p);
  return p;
}

export function removePlayer(s: SimState, id: number): void {
  const p = s.players.find(x => x.id === id);
  if (!p) return;
  for (const v of s.vehicles) if (v.driverId === id) v.driverId = null;
  s.mines = s.mines.filter(m => m.ownerId !== id);
  s.players = s.players.filter(x => x.id !== id);
  s.flow = null;
}

let makePlayer: (id: number, pos: Vec2, name: string, color: number) => Player = () => {
  throw new Error('player factory not registered');
};

/** sim.ts registers its player factory here, so coop.ts does not import sim.ts (which imports coop.ts). */
export function registerPlayerFactory(f: typeof makePlayer): void {
  makePlayer = f;
}
