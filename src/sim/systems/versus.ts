import { JUMP_TICKS, PLAYER_RADIUS } from '../config/balance';
import { BLOCKS_WALKER, isFree, nearestFree } from '../map/tilemap';
import { TICK_RATE, type CoinOpRule, type Player, type SimState, type Vec2, type VersusMode, type VersusRule, type WeaponKind } from '../types';
import { dist } from '../util';
import { placeStartCrates } from './offers';
import { placeStartJetpack } from './rare';
import { placeStartKarts } from './vehicles';
import { spawnHorde } from './hordes';
import { explode } from './combat';

export const VERSUS = {
  /** the countdown that opens a match */
  countdownTicks: 5 * TICK_RATE,
  /** score race: back in the game this long after going down */
  respawnTicks: 3 * TICK_RATE,
  /** safe for a moment after (re)spawning */
  spawnInvulnTicks: Math.round(1.5 * TICK_RATE),
  /**
   * weapons do this much of their monster damage to players (about 13 blaster hits down a player), but one
   * hit never takes more than `maxHit`, so a bomb hurts without wiping someone out on its own
   */
  damageScale: 2,
  maxHit: 45,
  /** towers only nibble at players: this share of their monster damage */
  towerScale: 1 / 3,
  limit: { ffa: 15, team: 30 },
  minutes: { ffa: 5, team: 6 },
  roundsToWin: 4,
  roundBreakTicks: 3 * TICK_RATE,
  /** a new crate shows up this often while there are fewer than `maxCrates` */
  crateEveryTicks: 12 * TICK_RATE,
  maxCrates: 4,
  /** king of the cube */
  kingRadius: 3,
  kingMoveTicks: 45 * TICK_RATE,
  kingLimit: { ffa: 60, team: 100 },
  /** capture the cube */
  captureLimit: 3,
  captureMinutes: 8,
  /** carrying a cube slows you down */
  carrySpeed: 0.8,
  touch: 1.1,
  /** chaos: a horde every so often */
  chaosEveryTicks: 20 * TICK_RATE,
  /** coin-op chaos: a new rule this often */
  coinOpEveryTicks: 30 * TICK_RATE,
  /** coin-op chaos */
  turbo: 1.5,
  moonJump: 1.8,
  boomRadius: 2.5,
  boomDamage: 25,
};

/** the rules coin-op chaos switches between */
export const COIN_OP_RULES: CoinOpRule[] = ['turbo', 'moon', 'rapid', 'swords', 'boom', 'double'];

/** the coin-op rule in force right now, or null */
export function coinOpRule(s: SimState): CoinOpRule | null {
  return s.versus?.coinop?.rule ?? null;
}

/** how long a jump lasts: longer on the moon */
export function jumpTicks(s: SimState): number {
  return coinOpRule(s) === 'moon' ? Math.round(JUMP_TICKS * VERSUS.moonJump) : JUMP_TICKS;
}

/** a coin-op rule other than the current one */
function nextCoinOp(s: SimState, current: CoinOpRule | null): CoinOpRule {
  const others = COIN_OP_RULES.filter(r => r !== current);
  return others[Math.floor(s.rng.next() * others.length) % others.length];
}

/** what a weapon hit worth `amount` against monsters does to a player */
export function pvpDamage(amount: number): number {
  return Math.min(VERSUS.maxHit, amount * VERSUS.damageScale);
}

/** players `ownerId` may hurt: everyone else who is up, except teammates */
export function rivals(s: SimState, ownerId: number): Player[] {
  const v = s.versus;
  if (!v) return [];
  const owner = s.players.find(p => p.id === ownerId);
  return s.players.filter(p => p.id !== ownerId && p.downUntil === null && (v.mode === 'ffa' || !owner || p.team !== owner.team));
}

/**
 * Red and blue: players who chose a team get it, the others go to the smaller team, and the bots come last
 * so they even out whatever the humans picked.
 */
export function balanceTeams(players: { id: number; wish?: 0 | 1 | null; bot?: boolean }[]): Record<number, 0 | 1> {
  const out: Record<number, 0 | 1> = {};
  const size = [0, 0];
  const put = (id: number, team: 0 | 1) => {
    out[id] = team;
    size[team]++;
  };
  const smaller = (): 0 | 1 => (size[0] <= size[1] ? 0 : 1);
  for (const p of players) if (!p.bot && (p.wish === 0 || p.wish === 1)) put(p.id, p.wish);
  for (const p of players) if (!p.bot && p.wish !== 0 && p.wish !== 1) put(p.id, smaller());
  for (const p of players) if (p.bot) put(p.id, smaller());
  return out;
}

/** the arenas a discovery rotation goes through */
export const DISCOVERY_MAPS = ['neon', 'highway', 'floor01', 'candy', 'arena', 'rooftop'];

/**
 * Discovery: step `i` of a rotation that walks through every rule (score race, king of the cube, last cube
 * standing, capture the cube), switches between teams and free for all, changes the map every time and
 * throws in monsters now and then.
 */
export function discovery(i: number): { mode: VersusMode; rule: VersusRule; map: string; chaos: boolean } {
  const rules: VersusRule[] = ['score', 'king', 'rounds', 'capture', 'gungame', 'coinop'];
  const rule = rules[i % rules.length];
  // over the rules' cycle the team mode flips every lap, so every rule comes in both flavours
  // (capture is always teams, gun game always everyone for themselves)
  const team = rule === 'capture' || (rule !== 'gungame' && (i + Math.floor(i / rules.length)) % 2 === 1);
  return { mode: team ? 'team' : 'ffa', rule, map: DISCOVERY_MAPS[(i * 5) % DISCOVERY_MAPS.length], chaos: i % 3 === 2 };
}

/** places to (re)spawn: the start, waypoints and vehicle spots of the map */
function spawnSpots(s: SimState): Vec2[] {
  return [s.map.spawn, ...s.map.waypoints, ...s.map.vehicleSpots, ...s.map.powerSpots];
}

/** a free spot close to a team's base, apart from players already placed there */
function nearBase(s: SimState, base: Vec2, placed: Player[]): Vec2 {
  for (let r = 1.5; r < 6; r += 0.5) {
    for (let a = 0; a < 8; a++) {
      const at = { x: base.x + Math.cos((a * Math.PI) / 4) * r, z: base.z + Math.sin((a * Math.PI) / 4) * r };
      if (isFree(s.map, at, PLAYER_RADIUS, BLOCKS_WALKER) && placed.every(o => dist(o.pos, at) > 1)) return at;
    }
  }
  return nearestFree(s.map, base, PLAYER_RADIUS, BLOCKS_WALKER);
}

/** where the king zone can be: nest spots, plazas and power spots of the map */
function kingSpots(s: SimState): Vec2[] {
  const list = [...s.map.nestSpots.map(n => n.pos), ...s.map.powerSpots];
  return list.length > 0 ? list : [s.map.spawn];
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

/** gun game: the weapons from first to last; a kill with the last one wins */
export const GUN_LADDER: WeaponKind[] = ['pixelBlaster', 'candyCannon', 'hotdogSlinger', 'joystickBoomerang', 'pixelRail', 'bomb', 'discoBall', 'laserSword', 'flySwatter'];

/** a fresh start: the blaster, or in gun game the weapon of the player's step on the ladder */
function equip(p: Player, s?: SimState): void {
  const step = s?.versus?.rule === 'gungame' ? Math.min(GUN_LADDER.length - 1, s.versus.scores[p.id] ?? 0) : -1;
  p.weapons = [{ kind: step >= 0 ? GUN_LADDER[step] : 'pixelBlaster', level: step >= 0 ? 3 : 1, cooldown: 0 }];
  p.selected = 0;
  p.rare = null;
  p.rareSelected = false;
  p.jetpack = false;
  p.jetFuel = 0;
  p.flying = false;
}

/** Sets up a versus match on the current map: teams, spread-out starts, a blaster each. */
export function setupVersus(s: SimState, mode: VersusMode, rule: VersusRule, chaos = false, teams?: Record<number, 0 | 1>, countdown = false): void {
  // a countdown first (5 4 3 2 1 GO!): every timer of the match starts after it
  const wait = countdown ? VERSUS.countdownTicks : 0;
  // capture the cube needs two teams; gun game is everyone for themselves
  if (rule === 'capture') mode = 'team';
  if (rule === 'gungame') mode = 'ffa';
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  s.nests = [];
  s.boss = null;
  s.versus = {
    mode,
    rule,
    limit: VERSUS.limit[mode],
    endsAt: s.tick + wait + VERSUS.minutes[mode] * 60 * TICK_RATE,
    startsAt: countdown ? s.tick + wait : undefined,
    scores: {},
    teamScores: [0, 0],
    roundWins: {},
    roundBreakUntil: 0,
    round: 1,
    nextCrateAt: s.tick + VERSUS.crateEveryTicks,
    chaos,
    nextHordeAt: s.tick + VERSUS.chaosEveryTicks,
    king: null,
    flags: null,
    coinop: null,
  };
  const v = s.versus;
  if (rule === 'coinop') {
    v.coinop = { rule: nextCoinOp(s, null), nextAt: s.tick + VERSUS.coinOpEveryTicks };
    s.events.push({ type: 'coinOpRule', rule: v.coinop.rule });
  }
  if (rule === 'king') {
    v.limit = VERSUS.kingLimit[mode];
    v.king = { pos: { ...kingSpots(s)[0] }, radius: VERSUS.kingRadius, nextMoveAt: s.tick + VERSUS.kingMoveTicks, spot: 0 };
  }
  if (rule === 'gungame') v.limit = GUN_LADDER.length;
  if (rule === 'capture') {
    v.limit = VERSUS.captureLimit;
    v.endsAt = s.tick + VERSUS.captureMinutes * 60 * TICK_RATE;
    // the two bases: the pair of places furthest apart
    const spots = spawnSpots(s);
    let a = spots[0], b = spots[1], best = -1;
    for (const x of spots) for (const y of spots) if (dist(x, y) > best) {
      best = dist(x, y);
      a = x;
      b = y;
    }
    v.flags = [a, b].map(base => ({ base: { ...base }, pos: { ...base }, carrier: null }));
  }
  s.players.forEach((p, i) => {
    // teams wear their colours: red (suit colour 1) and blue (suit colour 0)
    if (mode === 'team') {
      p.team = teams?.[p.id] ?? ((i % 2) as 0 | 1);
      p.color = p.team === 0 ? 1 : 0;
    }
    s.versus!.scores[p.id] = 0;
  });
  // something to grab right away: crates, karts and a jetpack on the map
  // (gun game hands out the weapons itself: no crates)
  if (rule !== 'gungame') placeStartCrates(s);
  placeStartKarts(s);
  placeStartJetpack(s);
  s.nextPowerupAt = s.tick + 20 * TICK_RATE;
  startRound(s);
}

/** everyone back on their feet, spread out, with just the blaster */
function startRound(s: SimState): void {
  const placed: Player[] = [];
  for (const p of s.players) {
    equip(p, s);
    p.perched = false;
    p.climb = null;
    p.descent = 0;
    p.vehicleId = null;
    p.downUntil = null;
    p.reviveUntil = null;
    p.hp = p.maxHp;
    // capture the cube: each team starts at its own base
    const base = s.versus?.flags?.[p.team ?? 0]?.base;
    p.pos = base && s.versus?.rule === 'capture' ? nearBase(s, base, placed) : safeSpawn(s, p, placed);
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
  if (killer && (v.rule === 'score' || v.rule === 'coinop')) {
    v.scores[killer.id] = (v.scores[killer.id] ?? 0) + 1;
    if (v.mode === 'team' && killer.team !== undefined) v.teamScores[killer.team]++;
  }
  if (killer && v.rule === 'gungame') {
    // swatted: the victim drops a step (before the killer moves up, so the swatter kill still wins)
    if (killer.weapons[0]?.kind === 'flySwatter') v.scores[p.id] = Math.max(0, (v.scores[p.id] ?? 0) - 1);
    v.scores[killer.id] = (v.scores[killer.id] ?? 0) + 1;
    const level = v.scores[killer.id];
    if (level < GUN_LADDER.length) {
      equip(killer, s);
      s.events.push({ type: 'gunLevel', playerId: killer.id, level, weapon: GUN_LADDER[level] });
    }
  }
  if (killer) killer.stats.kills++;
  s.events.push({ type: 'pvpKill', killerId: killer?.id ?? null, victimId: p.id });
  if (p.vehicleId !== null) {
    const car = s.vehicles.find(x => x.id === p.vehicleId);
    if (car) car.driverId = null;
    p.vehicleId = null;
  }
  dropCube(s, p);
  equip(p, s);
  p.air = 0;
  p.dashTicks = 0;
  p.combo = 0;
  p.perched = false;
  p.climb = null;
  p.descent = 0;
  if (v.rule === 'rounds') {
    p.downUntil = Number.MAX_SAFE_INTEGER;
    return;
  }
  p.downUntil = s.tick + VERSUS.respawnTicks;
  p.invulnUntil = p.downUntil + VERSUS.spawnInvulnTicks;
  const base = v.rule === 'capture' ? v.flags?.[p.team ?? 0]?.base : undefined;
  p.safePoint = base ? nearBase(s, base, []) : safeSpawn(s, p, s.players.filter(o => o !== p && o.downUntil === null));
  // coin-op chaos: whoever goes down blows up and may take others along (only once they are down themselves,
  // so the blast cannot catch them again; the blast counts as nobody's kill)
  if (v.coinop?.rule === 'boom') explode(s, { ...p.pos }, VERSUS.boomRadius, { player: VERSUS.boomDamage }, 'explosion');
}

/** the cube `p` carries falls where they stand */
function dropCube(s: SimState, p: Player): void {
  const flags = s.versus?.flags;
  if (!flags) return;
  flags.forEach((f, team) => {
    if (f.carrier !== p.id) return;
    f.carrier = null;
    f.pos = { ...p.pos };
    s.events.push({ type: 'cubeDropped', team: team as 0 | 1, pos: { ...p.pos } });
  });
}

/** whether `p` is carrying a cube (slower, no flying, no karts) */
export function carryingCube(s: SimState, p: Player): boolean {
  return !!s.versus?.flags?.some(f => f.carrier === p.id);
}

function updateKing(s: SimState): void {
  const v = s.versus!;
  const k = v.king!;
  if (s.tick >= k.nextMoveAt) {
    const spots = kingSpots(s);
    k.spot = (k.spot + 1 + Math.floor(s.rng.next() * Math.max(1, spots.length - 1))) % spots.length;
    k.pos = { ...spots[k.spot] };
    k.nextMoveAt = s.tick + VERSUS.kingMoveTicks;
    s.events.push({ type: 'kingMoved', pos: { ...k.pos } });
  }
  // one point per full second in the zone
  if ((s.tick + 1) % TICK_RATE !== 0) return;
  const inside = s.players.filter(p => p.downUntil === null && dist(p.pos, k.pos) <= k.radius);
  const sides = new Set(inside.map(p => side(s, p)));
  if (sides.size !== 1) return;
  for (const p of inside) v.scores[p.id] = (v.scores[p.id] ?? 0) + 1;
  if (v.mode === 'team') v.teamScores[inside[0].team ?? 0]++;
}

function updateFlags(s: SimState): void {
  const v = s.versus!;
  const flags = v.flags!;
  // a carrier who left the game (LAN) drops the cube where it was last seen
  flags.forEach((f, team) => {
    if (f.carrier === null || s.players.some(p => p.id === f.carrier)) return;
    f.carrier = null;
    s.events.push({ type: 'cubeDropped', team: team as 0 | 1, pos: { ...f.pos } });
  });
  for (const p of s.players) {
    if (p.downUntil !== null || p.team === undefined) continue;
    const own = flags[p.team];
    const enemy = flags[1 - p.team];
    // carried cubes move with their carrier
    if (enemy.carrier === p.id) enemy.pos = { ...p.pos };
    // touch the enemy cube: take it (not from a kart)
    if (enemy.carrier === null && p.vehicleId === null && dist(enemy.pos, p.pos) <= VERSUS.touch) {
      enemy.carrier = p.id;
      s.events.push({ type: 'cubeTaken', team: (1 - p.team) as 0 | 1, playerId: p.id });
    }
    // touch the own cube lying out in the field: it goes home
    if (own.carrier === null && dist(own.pos, own.base) > 0.01 && dist(own.pos, p.pos) <= VERSUS.touch) {
      own.pos = { ...own.base };
      s.events.push({ type: 'cubeReturned', team: p.team });
    }
    // home with the enemy cube while the own one is at home: a capture
    if (enemy.carrier === p.id && dist(p.pos, own.base) <= VERSUS.touch * 1.5 && own.carrier === null && dist(own.pos, own.base) < 0.01) {
      enemy.carrier = null;
      enemy.pos = { ...enemy.base };
      v.teamScores[p.team]++;
      v.scores[p.id] = (v.scores[p.id] ?? 0) + 1;
      s.events.push({ type: 'cubeCaptured', team: p.team, playerId: p.id });
    }
  }
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

  if (s.tick >= v.nextCrateAt && v.rule !== 'gungame') {
    v.nextCrateAt = s.tick + VERSUS.crateEveryTicks;
    const free = s.map.crateSpots.filter(c => !s.crates.some(x => dist(x.pos, c) < 1));
    if (s.crates.length < VERSUS.maxCrates && free.length > 0) s.crates.push({ id: s.nextId++, pos: { ...s.rng.pick(free) } });
  }

  // chaos: monster hordes join the fight
  if (v.chaos && s.tick >= (v.nextHordeAt ?? 0) && s.map.waypoints.length > 0) {
    v.nextHordeAt = s.tick + VERSUS.chaosEveryTicks;
    if (s.enemies.length < 40) spawnHorde(s, s.rng.pick(s.map.waypoints), [{ kind: 'blob', count: 4 }, { kind: 'hunter', count: 2 }], { rush: true });
  }
  if (v.coinop && s.tick >= v.coinop.nextAt) {
    v.coinop = { rule: nextCoinOp(s, v.coinop.rule), nextAt: s.tick + VERSUS.coinOpEveryTicks };
    s.events.push({ type: 'coinOpRule', rule: v.coinop.rule });
  }
  if (v.rule === 'king') updateKing(s);
  if (v.rule === 'capture') updateFlags(s);
  if (v.rule !== 'rounds') {
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
