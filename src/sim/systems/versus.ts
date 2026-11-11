import { PLAYER_RADIUS } from '../config/balance';
import { BLOCKS_WALKER, isFree, nearestFree } from '../map/tilemap';
import { TICK_RATE, type Player, type SimState, type Vec2, type VersusMode, type VersusRule } from '../types';
import { dist } from '../util';

export const VERSUS = {
  /** score race: back in the game this long after going down */
  respawnTicks: 3 * TICK_RATE,
  /** safe for a moment after (re)spawning */
  spawnInvulnTicks: Math.round(1.5 * TICK_RATE),
  /** players are tougher than monsters: weapons do this share of their monster damage to players */
  damageScale: 0.5,
  limit: { ffa: 15, team: 30 },
  minutes: { ffa: 5, team: 6 },
  roundsToWin: 4,
  roundBreakTicks: 3 * TICK_RATE,
  /** a new crate shows up this often while there are fewer than `maxCrates` */
  crateEveryTicks: 12 * TICK_RATE,
  maxCrates: 4,
};

/** players `ownerId` may hurt: everyone else who is up, except teammates */
export function rivals(s: SimState, ownerId: number): Player[] {
  const v = s.versus;
  if (!v) return [];
  const owner = s.players.find(p => p.id === ownerId);
  return s.players.filter(p => p.id !== ownerId && p.downUntil === null && (v.mode === 'ffa' || !owner || p.team !== owner.team));
}

/** places to (re)spawn: the start, waypoints and vehicle spots of the map */
function spawnSpots(s: SimState): Vec2[] {
  return [s.map.spawn, ...s.map.waypoints, ...s.map.vehicleSpots, ...s.map.powerSpots];
}

/** the spot furthest from every player who could hurt `p` */
export function safeSpawn(s: SimState, p: Player, others: Player[]): Vec2 {
  let best = s.map.spawn, bestD = -1;
  for (const spot of spawnSpots(s)) {
    const near = Math.min(Infinity, ...others.filter(o => o !== p).map(o => dist(o.pos, spot)));
    if (near > bestD) {
      bestD = near;
      best = spot;
    }
  }
  return isFree(s.map, best, PLAYER_RADIUS, BLOCKS_WALKER) ? { ...best } : nearestFree(s.map, best, PLAYER_RADIUS, BLOCKS_WALKER);
}

function equip(p: Player): void {
  p.weapons = [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }];
  p.selected = 0;
  p.rare = null;
  p.rareSelected = false;
  p.jetpack = false;
  p.jetFuel = 0;
  p.flying = false;
}

/** Sets up a versus match on the current map: teams, spread-out starts, a blaster each. */
export function setupVersus(s: SimState, mode: VersusMode, rule: VersusRule): void {
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  s.nests = [];
  s.boss = null;
  s.versus = {
    mode,
    rule,
    limit: VERSUS.limit[mode],
    endsAt: s.tick + VERSUS.minutes[mode] * 60 * TICK_RATE,
    scores: {},
    teamScores: [0, 0],
    roundWins: {},
    roundBreakUntil: 0,
    round: 1,
    nextCrateAt: s.tick + VERSUS.crateEveryTicks,
  };
  s.players.forEach((p, i) => {
    if (mode === 'team') p.team = (i % 2) as 0 | 1;
    s.versus!.scores[p.id] = 0;
  });
  startRound(s);
}

/** everyone back on their feet, spread out, with just the blaster */
function startRound(s: SimState): void {
  const placed: Player[] = [];
  for (const p of s.players) {
    equip(p);
    p.vehicleId = null;
    p.downUntil = null;
    p.reviveUntil = null;
    p.hp = p.maxHp;
    p.pos = safeSpawn(s, p, placed);
    p.safePoint = { ...p.pos };
    p.invulnUntil = s.tick + VERSUS.spawnInvulnTicks;
    placed.push(p);
  }
  for (const v of s.vehicles) v.driverId = null;
}

/** A player went down in a versus match: score, drop the gear, come back (or sit out the round). */
export function versusDeath(s: SimState, p: Player, attackerId: number | undefined): void {
  const v = s.versus!;
  const killer = attackerId !== undefined && attackerId !== p.id ? s.players.find(x => x.id === attackerId) : undefined;
  if (killer && v.rule === 'score') {
    v.scores[killer.id] = (v.scores[killer.id] ?? 0) + 1;
    if (v.mode === 'team' && killer.team !== undefined) v.teamScores[killer.team]++;
  }
  if (killer) killer.stats.kills++;
  s.events.push({ type: 'pvpKill', killerId: killer?.id ?? null, victimId: p.id });
  if (p.vehicleId !== null) {
    const car = s.vehicles.find(x => x.id === p.vehicleId);
    if (car) car.driverId = null;
    p.vehicleId = null;
  }
  equip(p);
  p.air = 0;
  p.dashTicks = 0;
  p.combo = 0;
  if (v.rule === 'rounds') {
    p.downUntil = Number.MAX_SAFE_INTEGER;
    return;
  }
  p.downUntil = s.tick + VERSUS.respawnTicks;
  p.invulnUntil = p.downUntil + VERSUS.spawnInvulnTicks;
  p.safePoint = safeSpawn(s, p, s.players.filter(o => o !== p && o.downUntil === null));
}

/** who is ahead: player ids (free for all) or the members of the leading team */
function leaders(s: SimState): number[] {
  const v = s.versus!;
  if (v.mode === 'team') {
    const best = v.teamScores[0] === v.teamScores[1] ? null : v.teamScores[0] > v.teamScores[1] ? 0 : 1;
    return best === null ? [] : s.players.filter(p => p.team === best).map(p => p.id);
  }
  const top = Math.max(...Object.values(v.scores));
  return top > 0 ? s.players.filter(p => (v.scores[p.id] ?? 0) === top).map(p => p.id) : [];
}

function end(s: SimState, winners: number[]): void {
  s.phase = 'won';
  s.events.push({ type: 'versusEnd', winners });
  s.events.push({ type: 'gameWon', score: s.score });
}

/** a side still in the round: a player id (free for all) or a team */
const side = (s: SimState, p: Player) => (s.versus!.mode === 'team' ? (p.team ?? 0) : p.id);

export function updateVersus(s: SimState): void {
  const v = s.versus;
  if (!v || s.phase !== 'playing') return;

  if (s.tick >= v.nextCrateAt) {
    v.nextCrateAt = s.tick + VERSUS.crateEveryTicks;
    const free = s.map.crateSpots.filter(c => !s.crates.some(x => dist(x.pos, c) < 1));
    if (s.crates.length < VERSUS.maxCrates && free.length > 0) s.crates.push({ id: s.nextId++, pos: { ...s.rng.pick(free) } });
  }

  if (v.rule === 'score') {
    const reached = v.mode === 'team' ? v.teamScores.some(x => x >= v.limit) : Object.values(v.scores).some(x => x >= v.limit);
    if (reached || s.tick >= v.endsAt) end(s, leaders(s));
    return;
  }

  // last cube standing
  if (v.roundBreakUntil > 0) {
    if (s.tick >= v.roundBreakUntil) {
      v.roundBreakUntil = 0;
      v.round++;
      startRound(s);
    }
    return;
  }
  const standing = new Set(s.players.filter(p => p.downUntil === null).map(p => side(s, p)));
  if (standing.size > 1 || s.players.length < 2) return;
  const winner = standing.size === 1 ? [...standing][0] : null;
  if (winner !== null) v.roundWins[winner] = (v.roundWins[winner] ?? 0) + 1;
  s.events.push({ type: 'versusRound', winner, round: v.round });
  if (winner !== null && v.roundWins[winner] >= VERSUS.roundsToWin) {
    end(s, s.players.filter(p => side(s, p) === winner).map(p => p.id));
    return;
  }
  v.roundBreakUntil = s.tick + VERSUS.roundBreakTicks;
}
