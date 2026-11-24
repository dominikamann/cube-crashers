import { spawnWild, WILD } from './wild-boss';
import { clearSpot, spotClear } from './ground';
import { JUMP_TICKS, MAX_PLAYERS, PLAYER_RADIUS } from '../config/balance';
import { BLOCKS_WALKER, isFree, nearestFree, Tile, tileAt } from '../map/tilemap';
import { TICK_RATE, type CoinOpRule, type KeepWeapons, type Player, type SimState, type Vec2, type VersusMode, type VersusRule, type HeldWeapon, type WeaponKind } from '../types';
import { dist } from '../util';
import { addPlayer, removePlayer, spotNear, syncCredits } from './coop';
import { cardPositions, hiddenPrize, placeStartCrates } from './offers';
import { RARE } from '../config/rare';
import { crowned, endStreak, killBonus, updateQuad } from './bounty';
import { placeStartJetpack } from './rare';
import { placeStartKarts } from './vehicles';
import { spawnHorde } from './hordes';
import { dropCoins, explode } from './combat';

export const VERSUS = {
  /** what a fallen player drops: it can be taken after a moment and lies there for a while; gun game drops coins */
  lootArmTicks: 45,
  lootTicks: 15 * TICK_RATE,
  lootCoins: 5,
  /** score race: back in the game this long after going down */
  // (long enough to watch how it happened: the kill cam shows these last seconds again)
  respawnTicks: 5 * TICK_RATE,
  /** safe for a moment after (re)spawning */
  spawnInvulnTicks: Math.round(1.5 * TICK_RATE),
  /** a team base keeps this far from any tower pad and kart spot, where the map allows */
  baseFromPad: 3,
  /** how far apart the two team bases must be (on a smaller map teams spawn like everyone for themselves) */
  baseApart: 10,
  /** an enemy this close to a team's base: its players come back somewhere safer instead */
  baseCamp: 6,
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
  /** a money bag shows up this often while there are fewer than `maxBags`, with this many coins (for towers and the like) */
  bagEveryTicks: 20 * TICK_RATE,
  maxBags: 2,
  /** a chest turns up at least this far from every player */
  chestFromPlayers: 4,
  /** what a chest holds, and how likely each is (they add up to 1) */
  chestCoins: [
    { coins: 10, chance: 0.4 },
    { coins: 20, chance: 0.3 },
    { coins: 30, chance: 0.2 },
    { coins: 50, chance: 0.1 },
  ],
  /** king of the cube */
  kingRadius: 3,
  /** a zone where walls or special floor come close is smaller, but never less than this */
  kingMinRadius: 2,
  kingMoveTicks: 45 * TICK_RATE,
  kingLimit: { ffa: 60, team: 100 },
  /** a zone that moves on goes at least this far from where it was (where the map allows) */
  zoneApart: 12,
  /** in teams, a zone that moves on goes where neither base is much nearer (see lopsided), where the map has such a spot */
  zoneFair: 0.4,
  /** zone conquest: hold a zone alone this long to take it (teams, everyone for themselves); this many zones a match, this many win it */
  conquestHoldTicks: { team: 15 * TICK_RATE, ffa: 10 * TICK_RATE },
  conquestZones: 5,
  conquestWins: 3,
  /** zone conquest: an empty zone lets every hold sink this much slower than it builds */
  conquestFade: 0.5,
  conquestMinutes: 9,
  /** capture the cube */
  captureLimit: 3,
  captureMinutes: 8,
  /** a cube lying out in the field this long goes home by itself */
  cubeReturnTicks: 30 * TICK_RATE,
  /** a captured cube is shown dancing on the scorer's own cube this long (which nobody can take meanwhile) */
  capturedShowTicks: 2 * TICK_RATE,
  /** carrying a cube slows you down */
  carrySpeed: 0.8,
  touch: 1.1,
  /** chaos: a horde every so often */
  chaosEveryTicks: 20 * TICK_RATE,
  /** chaos with a boss: the first one comes after this long (from, to), the next this long after the last one fell */
  bossFirstTicks: [60 * TICK_RATE, 100 * TICK_RATE],
  bossAgainTicks: [90 * TICK_RATE, 150 * TICK_RATE],
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

/** how high a jumping player's feet are: up and down again over the jump, higher on the moon */
export function jumpLift(s: SimState, p: Player): number {
  const length = jumpTicks(s);
  return p.air > 0 ? Math.sin(Math.PI * (1 - Math.min(1, p.air / length))) * 1.3 * (length > JUMP_TICKS ? 1.6 : 1) : 0;
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
  const rules: VersusRule[] = ['score', 'king', 'rounds', 'capture', 'gungame', 'coinop', 'conquest'];
  const r = i % rules.length, rule = rules[r];
  // within a lap the rules take turns between teams and free for all, and every lap flips it, so every rule comes
  // in both flavours however many rules there are (capture is always teams, gun game always everyone for themselves)
  const team = rule === 'capture' || (rule !== 'gungame' && (r + Math.floor(i / rules.length)) % 2 === 1);
  return { mode: team ? 'team' : 'ffa', rule, map: DISCOVERY_MAPS[(i * 5) % DISCOVERY_MAPS.length], chaos: i % 3 === 2 };
}

/** places to (re)spawn: the start, waypoints and vehicle spots of the map */
function spawnSpots(s: SimState): Vec2[] {
  return [s.map.spawn, ...s.map.waypoints, ...s.map.vehicleSpots, ...s.map.powerSpots];
}

/** the two places on the map furthest apart: the teams' bases (none on a map too small for two) */
/** the bases worked out for a map (they never change while it is played): per map, by how far apart and whether zones count */
const basesOf = new WeakMap<object, Map<string, [Vec2, Vec2] | null>>();

function basePair(s: SimState, apart = VERSUS.baseApart): [Vec2, Vec2] | null {
  const zoned = s.versus?.rule === 'king' || s.versus?.rule === 'conquest';
  const known = basesOf.get(s.map) ?? new Map<string, [Vec2, Vec2] | null>();
  basesOf.set(s.map, known);
  const key = `${apart}:${zoned}`;
  if (!known.has(key)) known.set(key, findBases(s, apart, zoned));
  return known.get(key)!;
}

function findBases(s: SimState, apart: number, zoned: boolean): [Vec2, Vec2] | null {
  // (a base right next to a tower pad looks crammed, and one on a kart's spot has a kart parked on it: those spots
  // only where the map has too few others)
  const roomy = spawnSpots(s).filter(at => s.map.pads.every(p => dist(p.pos, at) >= VERSUS.baseFromPad) && s.map.vehicleSpots.every(v => dist(v, at) >= VERSUS.baseFromPad));
  const spots = roomy.length >= 2 ? roomy : spawnSpots(s);
  // where a zone is fought over (king of the cube, zone conquest), the bases must lie about as far from the zones
  // as each other, or one team is always there first: far apart, less what one base is nearer to the zones
  const zones = zoned ? kingSpots(s) : [];
  const nearer = (x: Vec2, y: Vec2) => zones.reduce((n, z) => n + Math.abs(dist(x, z) - dist(y, z)), 0) / Math.max(1, zones.length);
  let pair: [Vec2, Vec2] | null = null, best = -Infinity;
  for (const x of spots) for (const y of spots) {
    if (dist(x, y) < apart) continue;
    const score = dist(x, y) - 4 * nearer(x, y);
    if (score > best) {
      best = score;
      pair = [x, y];
    }
  }
  return pair;
}

/** players still in the match apart from `p`: everyone who stands, and the fallen waiting to get back up */
const inPlay = (s: SimState, p: Player) => s.players.filter(o => o !== p && o.downUntil !== Number.MAX_SAFE_INTEGER);

/** where everyone else stands, or (when down) will get back up */
function taken(s: SimState, p: Player): Vec2[] {
  return inPlay(s, p).map(o => (o.downUntil === null ? o.pos : o.safePoint));
}

/** where the players who could hurt `p` stand */
function threats(s: SimState, p: Player): Vec2[] {
  return inPlay(s, p).filter(o => o.downUntil === null && (s.versus?.mode !== 'team' || o.team !== p.team)).map(o => o.pos);
}

/**
 * Where `p` (re)enters a match, apart from the spots in `others`: in teams next to the team mates at the own base
 * (in capture the cube a step off the flag), unless an enemy waits there; everyone for themselves as far from the
 * others as the map allows. `enemies`: where those who could hurt `p` stand.
 */
function spawnFor(s: SimState, p: Player, others: Vec2[], enemies: Vec2[]): Vec2 {
  const v = s.versus;
  const base = v?.mode === 'team' ? (v.flags?.[p.team ?? 0]?.base ?? basePair(s)?.[p.team ?? 0]) : undefined;
  if (!base || enemies.some(e => dist(e, base) < VERSUS.baseCamp)) return safeSpawn(s, enemies, others);
  return spotNear(s, base, others, v?.flags ? 1.5 : 0);
}

/** where the king zone can be: nest spots, plazas and power spots of the map */
function kingSpots(s: SimState): Vec2[] {
  const list = [...s.map.nestSpots.map(n => n.pos), ...s.map.powerSpots];
  // (a zone lies on plain open floor only: not over a wall, a ledge, a conveyor, a boost pad, glitch floor, a ramp or
  // a tower pad; those spots only where the map has none that fits)
  const fit = list.filter(at => zoneRadius(s, at) > 0);
  return fit.length > 0 ? fit : list.length > 0 ? list : [s.map.spawn];
}

/**
 * How wide a zone at `at` can be: the full radius where it fits, smaller where walls or special floor come close,
 * down to VERSUS.kingMinRadius; 0 where not even that fits.
 */
export function zoneRadius(s: SimState, at: Vec2): number {
  for (let r = VERSUS.kingRadius; r >= VERSUS.kingMinRadius - 1e-6; r -= 0.25) {
    if (plainFloor(s, at, r) && s.map.pads.every(p => dist(p.pos, at) > r + 0.5)) return r;
  }
  return 0;
}

/** nothing but plain open floor within `radius` of a spot */
function plainFloor(s: SimState, at: Vec2, radius: number): boolean {
  for (let dz = -radius; dz <= radius; dz += 0.25) {
    for (let dx = -radius; dx <= radius; dx += 0.25) {
      if (dx * dx + dz * dz > radius * radius) continue;
      if (tileAt(s.map, at.x + dx, at.z + dz) !== Tile.Floor) return false;
    }
  }
  return true;
}

/** the spot furthest from all of `enemies`, not inside any of `others` (where the rest stand or get up) */
export function safeSpawn(s: SimState, enemies: Vec2[], others: Vec2[] = enemies): Vec2 {
  let best = s.map.spawn, bestD = -1;
  for (const spot of spawnSpots(s)) {
    const near = Math.min(Infinity, ...(enemies.length > 0 ? enemies : others).map(o => dist(o, spot)));
    if (near > bestD) {
      bestD = near;
      best = spot;
    }
  }
  return spotNear(s, best, others);
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

/** whether weapons come back after a fall in this match (never in Gun Game, which has its ladder) */
const keepsWeapons = (s: SimState): boolean => !!s.versus?.keep && s.versus.keep !== 'none' && s.versus.rule !== 'gungame';

/**
 * What comes back after a fall when the match keeps weapons: all of them as they were, or each a level lower (one
 * at its first level is lost, the blaster never). Null where they are gone (the default, and always in Gun Game,
 * which has its ladder).
 */
function keptWeapons(s: SimState, p: Player): HeldWeapon[] | null {
  if (!keepsWeapons(s)) return null;
  if (s.versus?.keep === 'all') return p.weapons.map(w => ({ ...w, cooldown: 0 }));
  return p.weapons.filter(w => w.kind === 'pixelBlaster' || w.level > 1).map(w => ({ ...w, level: Math.max(1, w.level - 1), cooldown: 0 }));
}

/** Sets up a versus match on the current map: teams, spread-out starts, a blaster each. */
/** how long until the next boss: somewhere between `from` and `to` */
const bossWait = (s: SimState, [from, to]: number[]) => Math.round(from + s.rng.next() * (to - from));

export function setupVersus(s: SimState, mode: VersusMode, rule: VersusRule, chaos = false, teams?: Record<number, 0 | 1>, boss = false, keep?: KeepWeapons): void {
  // capture the cube needs two teams; gun game is everyone for themselves
  if (rule === 'capture') mode = 'team';
  if (rule === 'gungame') mode = 'ffa';
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  s.nests = [];
  s.boss = null;
  s.versus = {
    mode,
    rule,
    ...(keep && keep !== 'none' ? { keep } : {}),
    limit: VERSUS.limit[mode],
    endsAt: s.tick + VERSUS.minutes[mode] * 60 * TICK_RATE,
    scores: {},
    teamScores: [0, 0],
    roundWins: {},
    roundBreakUntil: 0,
    round: 1,
    nextCrateAt: s.tick + VERSUS.crateEveryTicks,
    nextBagAt: s.tick + VERSUS.bagEveryTicks,
    chaos,
    nextHordeAt: s.tick + VERSUS.chaosEveryTicks,
    boss: chaos && boss,
    nextBossAt: s.tick + bossWait(s, VERSUS.bossFirstTicks),
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
    const first = firstZone(s, mode);
    v.king = { pos: { ...kingSpots(s)[first] }, radius: zoneRadius(s, kingSpots(s)[first]) || VERSUS.kingRadius, nextMoveAt: s.tick + VERSUS.kingMoveTicks, spot: first };
  }
  if (rule === 'conquest') {
    v.limit = VERSUS.conquestWins;
    // (the zone stays until it is taken)
    const first = firstZone(s, mode);
    v.king = { pos: { ...kingSpots(s)[first] }, radius: zoneRadius(s, kingSpots(s)[first]) || VERSUS.kingRadius, nextMoveAt: Number.MAX_SAFE_INTEGER, spot: first };
    v.conquest = { holds: {}, taken: 0 };
    v.endsAt = s.tick + VERSUS.conquestMinutes * 60 * TICK_RATE;
  }
  if (rule === 'gungame') v.limit = GUN_LADDER.length;
  if (rule === 'capture') {
    v.limit = VERSUS.captureLimit;
    v.endsAt = s.tick + VERSUS.captureMinutes * 60 * TICK_RATE;
    // the two bases: the pair of places furthest apart
    const [a, b] = basePair(s, 0)!;
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
  const placed: Vec2[] = [];
  for (const p of s.players) {
    // (a match that keeps weapons starts the next round with what each has now: the fallen lost theirs, or a
    // level of them, when they fell)
    const kept = keepsWeapons(s) ? p.weapons.map(w => ({ ...w, cooldown: 0 })) : null;
    equip(p, s);
    if (kept) p.weapons = kept;
    p.perched = false;
    p.climb = null;
    p.descent = 0;
    p.quadUntil = undefined;
    p.vehicleId = null;
    p.downUntil = null;
    p.reviveUntil = null;
    p.hp = p.maxHp;
    p.disco = null;
    // teams start together at their own base, everyone for themselves spread over the map
    p.pos = spawnFor(s, p, placed, s.versus?.mode === 'team' ? [] : placed);
    p.safePoint = { ...p.pos };
    p.invulnUntil = s.tick + VERSUS.spawnInvulnTicks;
    placed.push(p.pos);
  }
  for (const v of s.vehicles) v.driverId = null;
}

/**
 * Someone comes into the game while it runs (a dedicated server takes newcomers at once). In a versus match they
 * come in like after a fall: at a safe place, with the weapons of the rule, on the smaller team; `insteadOf` is the
 * bot that makes room for them, whose team they take. On a floor they join the team at the start. Null where nobody
 * can come in right now (a minigame, the shop, a game that is over): they wait for the next floor or match.
 */
export function joinRunning(s: SimState, who: { id: number; name: string; color?: number; character?: string }, insteadOf?: number): Player | null {
  if (s.phase !== 'playing' || s.players.some(p => p.id === who.id)) return null;
  if (!s.versus && s.run.stage !== 'floor') return null;
  const bot = insteadOf === undefined ? undefined : s.players.find(p => p.id === insteadOf && p.bot);
  if (!bot && s.players.length >= MAX_PLAYERS) return null;
  const team = bot?.team;
  if (bot) {
    // (a cube it carried stays where it stood)
    if (carryingCube(s, bot)) dropCube(s, bot);
    removePlayer(s, bot.id);
    if (s.versus) delete s.versus.scores[bot.id];
  }
  const p = addPlayer(s, who.id, who.name);
  if (who.color !== undefined && !s.players.some(o => o !== p && o.color === who.color)) p.color = who.color;
  if (who.character) p.character = who.character;
  const v = s.versus;
  if (v) {
    if (v.mode === 'team') {
      const count = (t: 0 | 1) => s.players.filter(o => o !== p && o.team === t).length;
      p.team = team ?? (count(0) <= count(1) ? 0 : 1);
      p.color = p.team === 0 ? 1 : 0;
    }
    v.scores[p.id] = 0;
    equip(p, s);
    p.pos = spawnFor(s, p, taken(s, p), threats(s, p));
    p.safePoint = { ...p.pos };
    p.invulnUntil = s.tick + VERSUS.spawnInvulnTicks;
  }
  s.events.push({ type: 'playerRespawn', playerId: p.id });
  return p;
}

/**
 * Someone who lost the connection is back (see joinRunning, which let them in as `p`): they get what they had
 * when they went (`was`, and their `score` in a versus match): weapons, perks, coins, lives, their team. On a
 * floor they stand where they stood; in a versus match they come in like after a fall.
 */
export function takeSeat(s: SimState, p: Player, was: Player, score?: number): void {
  Object.assign(p, { weapons: was.weapons, selected: was.selected, perks: was.perks, coins: was.coins, maxHp: was.maxHp, jetpack: was.jetpack, jetFuel: was.jetFuel, rare: was.rare, rareSelected: was.rareSelected, stats: was.stats });
  if (was.bought !== undefined) p.bought = was.bought;
  if (was.jetExtra !== undefined) p.jetExtra = was.jetExtra;
  if (was.lives !== undefined) p.lives = was.lives;
  // (whoever lay on the ground when the line broke gets up fresh)
  const up = was.downUntil === null && !was.out && was.hp > 0;
  p.hp = up ? Math.min(was.hp, p.maxHp) : p.maxHp;
  const v = s.versus;
  if (!v) {
    if (up) {
      p.pos = { ...was.pos };
      p.safePoint = { ...was.safePoint };
      p.facing = { ...was.facing };
      p.aim = { ...was.aim };
    }
    syncCredits(s);
    return;
  }
  if (v.mode === 'team' && was.team !== undefined && was.team !== p.team) {
    p.team = was.team;
    p.color = p.team === 0 ? 1 : 0;
    p.pos = spawnFor(s, p, taken(s, p), threats(s, p));
    p.safePoint = { ...p.pos };
  }
  v.scores[p.id] = score ?? 0;
  if (was.id !== p.id) {
    delete v.scores[was.id];
    if (v.roundWins[was.id] !== undefined) {
      v.roundWins[p.id] = v.roundWins[was.id];
      delete v.roundWins[was.id];
    }
  }
}

/** A player went down in a versus match: score, drop the gear, come back (or sit out the round). */
/**
 * What a fallen player leaves behind for whoever gets there first: their two best extra weapons as cards and
 * their jetpack. In gun game the ladder decides the weapons, so there it is a few coins.
 */
function dropLoot(s: SimState, p: Player, kept: HeldWeapon[] | null = null): void {
  const at = isFree(s.map, p.pos, PLAYER_RADIUS, BLOCKS_WALKER) ? { ...p.pos } : nearestFree(s.map, p.pos, PLAYER_RADIUS, BLOCKS_WALKER);
  if (s.versus?.rule === 'gungame') {
    dropCoins(s, at, VERSUS.lootCoins);
    return;
  }
  const extra = p.weapons.filter(w => w.kind !== 'pixelBlaster' && !kept?.some(k => k.kind === w.kind)).sort((a, b) => b.level - a.level).slice(0, 2);
  if (extra.length > 0) {
    s.offers.push({
      id: s.nextId++,
      pos: at,
      cards: extra.map(w => ({ type: 'weapon' as const, weapon: w.kind })),
      cardPos: cardPositions(s, at, extra.length),
      armedAt: s.tick + VERSUS.lootArmTicks,
      expiresAt: s.tick + VERSUS.lootTicks,
    });
    s.events.push({ type: 'offerOpened', pos: { ...at } });
  }
  if (p.jetpack) s.jetpacks.push({ id: s.nextId++, pos: { ...clearSpot(s, at) } });
}

export function versusDeath(s: SimState, p: Player, attackerId: number | undefined): void {
  const v = s.versus!;
  const killer = attackerId !== undefined && attackerId !== p.id ? s.players.find(x => x.id === attackerId) : undefined;
  if (killer && (v.rule === 'score' || v.rule === 'coinop')) {
    // (a kill can count for more: the crown, a run ended, revenge, the second in a row; see bounty.ts)
    const points = 1 + killBonus(s, killer, p, crowned(s));
    v.scores[killer.id] = (v.scores[killer.id] ?? 0) + points;
    if (v.mode === 'team' && killer.team !== undefined) v.teamScores[killer.team] += points;
  }
  endStreak(s, p);
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
  // (weapons that come back with the player are not dropped as well; the jetpack and what is lost still are)
  const kept = keptWeapons(s, p);
  dropLoot(s, p, kept);
  equip(p, s);
  if (kept) p.weapons = kept;
  p.air = 0;
  p.dashTicks = 0;
  p.flung = undefined;
  p.combo = 0;
  p.perched = false;
  p.climb = null;
  p.descent = 0;
  // (Quad Damage goes with the fall: nobody comes back with the rest of it)
  p.quadUntil = undefined;
  if (v.rule === 'rounds') {
    p.downUntil = Number.MAX_SAFE_INTEGER;
    return;
  }
  p.downUntil = s.tick + VERSUS.respawnTicks;
  p.invulnUntil = p.downUntil + VERSUS.spawnInvulnTicks;
  p.safePoint = spawnFor(s, p, taken(s, p), threats(s, p));
  // coin-op chaos: whoever goes down blows up and may take others along (only once they are down themselves,
  // so the blast cannot catch them again; the blast counts as nobody's kill)
  if (v.coinop?.rule === 'boom') explode(s, { ...p.pos }, VERSUS.boomRadius, { player: VERSUS.boomDamage }, 'explosion');
}

/**
 * Somewhere a treasure chest can show up: any open plain floor (no special floor under it, no wall at hand), a few
 * steps from everyone, so it turns up anywhere on the map rather than at the crates' spots. Null if none was found.
 */
function chestSpot(s: SimState): Vec2 | null {
  for (let tries = 0; tries < 40; tries++) {
    const at = { x: Math.floor(s.rng.next() * s.map.w) + 0.5, z: Math.floor(s.rng.next() * s.map.h) + 0.5 };
    if (tileAt(s.map, at.x, at.z) !== Tile.Floor || !isFree(s.map, at, 0.9, BLOCKS_WALKER)) continue;
    if (s.players.some(p => dist(p.pos, at) < VERSUS.chestFromPlayers) || s.crates.some(c => dist(c.pos, at) < 3)) continue;
    if (!spotClear(s, at)) continue;
    return at;
  }
  return null;
}

/** whether a capture-the-cube cube lies at its base (nobody carries it, it is not out in the field) */
export function cubeHome(f: { base: Vec2; pos: Vec2; carrier: number | null }): boolean {
  return f.carrier === null && dist(f.pos, f.base) < 0.01;
}

/** how close to the own base a carrier scores */
export const CAPTURE_RANGE = VERSUS.touch * 1.5;

/** the cube `p` carries falls where they stand */
function dropCube(s: SimState, p: Player): void {
  const flags = s.versus?.flags;
  if (!flags) return;
  flags.forEach((f, team) => {
    if (f.carrier !== p.id) return;
    f.carrier = null;
    f.pos = { ...p.pos };
    f.downAt = s.tick;
    s.events.push({ type: 'cubeDropped', team: team as 0 | 1, pos: { ...p.pos } });
  });
}

/** whether `p` is carrying a cube (slower, no flying, no karts) */
export function carryingCube(s: SimState, p: Player): boolean {
  return !!s.versus?.flags?.some(f => f.carrier === p.id);
}

/** king of the cube: who stands in the zone (on their feet) */
export function inKingZone(s: SimState): Player[] {
  const k = s.versus?.king;
  return k ? s.players.filter(p => p.downUntil === null && dist(p.pos, k.pos) <= k.radius) : [];
}

/** king of the cube: whether the zone is empty, held by one side (a player, or a team), or fought over */
export function kingZone(s: SimState): { state: 'empty' } | { state: 'held'; side: number } | { state: 'contested' } {
  const sides = new Set(inKingZone(s).map(p => side(s, p)));
  if (sides.size === 0) return { state: 'empty' };
  return sides.size === 1 ? { state: 'held', side: [...sides][0] } : { state: 'contested' };
}

/** the zone goes on to another spot (and moves again at `nextAt`) */
/** how much nearer a spot lies to one team's base than to the other's, as a share of the further (0: fair) */
function lopsided(s: SimState, at: Vec2): number {
  const bases = s.versus?.mode === 'team' ? basePair(s) : null;
  if (!bases) return 0;
  const a = dist(at, bases[0]), b = dist(at, bases[1]);
  return Math.abs(a - b) / Math.max(a, b, 1);
}

/**
 * The zone goes on to another spot (and moves again at `nextAt`): a good way off and with nobody in it yet, so
 * nobody has a head start, and in teams one about as far from both bases where the map has such; on a map too
 * small for that, the spot furthest away. `quiet`: no 'moved' event (zone conquest announces the take instead).
 */
function moveZone(s: SimState, nextAt: number, quiet = false): void {
  const k = s.versus!.king!;
  const spots = kingSpots(s);
  const standing = s.players.filter(p => p.downUntil === null);
  const fresh = spots.map((_, i) => i).filter(i => i !== k.spot && dist(spots[i], k.pos) >= VERSUS.zoneApart && standing.every(p => dist(p.pos, spots[i]) > k.radius + 1));
  const fair = fresh.filter(i => lopsided(s, spots[i]) <= VERSUS.zoneFair);
  // (on a map too small for a fresh spot: the furthest one with nobody in it, or failing that the furthest)
  const far = spots.map((_, i) => i).filter(i => i !== k.spot).sort((a, b) => dist(spots[b], k.pos) - dist(spots[a], k.pos));
  const empty = far.filter(i => standing.every(p => dist(p.pos, spots[i]) > k.radius + 1));
  k.spot = fair.length > 0 ? s.rng.pick(fair) : fresh.length > 0 ? s.rng.pick(fresh) : (empty[0] ?? far[0] ?? k.spot);
  k.pos = { ...spots[k.spot] };
  k.radius = zoneRadius(s, k.pos) || VERSUS.kingRadius;
  k.nextMoveAt = nextAt;
  if (!quiet) s.events.push({ type: 'kingMoved', pos: { ...k.pos } });
}

/** the first zone: as far from one team's base as from the other's; everyone for themselves, anywhere */
function firstZone(s: SimState, mode: VersusMode): number {
  const spots = kingSpots(s);
  if (mode !== 'team' || !basePair(s)) return Math.floor(s.rng.next() * spots.length);
  const off = spots.map(at => lopsided(s, at));
  return off.indexOf(Math.min(...off));
}

/** zone conquest: how long a side has to hold a zone alone to take it */
export const conquestHold = (s: SimState): number => VERSUS.conquestHoldTicks[s.versus?.mode === 'team' ? 'team' : 'ffa'];

/** zone conquest: the side furthest along in holding the zone, and how far (null: nobody has started) */
export function conquestLead(s: SimState): { side: number; progress: number } | null {
  let best: { side: number; progress: number } | null = null;
  for (const [k, progress] of Object.entries(s.versus?.conquest?.holds ?? {})) if (progress > 0 && (!best || progress > best.progress)) best = { side: Number(k), progress };
  return best;
}

/**
 * Zone conquest: every side keeps its own hold on the zone. Whoever stands in it alone builds theirs while
 * everyone else's wears down as fast; fought over everything stands still; empty every hold sinks slowly. A full
 * hold takes the zone: a point, and the zone goes on to another spot.
 */
function updateConquest(s: SimState): void {
  const v = s.versus!;
  const c = v.conquest!;
  const zone = kingZone(s);
  if (zone.state === 'contested') return;
  for (const k of Object.keys(c.holds)) {
    const key = Number(k);
    if (zone.state === 'held' && key === zone.side) continue;
    c.holds[key] = Math.max(0, c.holds[key] - (zone.state === 'held' ? 1 : VERSUS.conquestFade));
    if (c.holds[key] === 0) delete c.holds[key];
  }
  if (zone.state !== 'held') return;
  const taker = zone.side;
  c.holds[taker] = (c.holds[taker] ?? 0) + 1;
  if (c.holds[taker] < conquestHold(s)) return;
  for (const p of inKingZone(s)) v.scores[p.id] = (v.scores[p.id] ?? 0) + 1;
  if (v.mode === 'team') v.teamScores[taker === 1 ? 1 : 0]++;
  c.taken++;
  c.holds = {};
  s.events.push({ type: 'zoneTaken', side: taker, teams: v.mode === 'team', taken: c.taken });
  moveZone(s, Number.MAX_SAFE_INTEGER, true);
}

function updateKing(s: SimState): void {
  const v = s.versus!;
  const k = v.king!;
  if (s.tick >= k.nextMoveAt) moveZone(s, s.tick + VERSUS.kingMoveTicks);
  // one point per full second in the zone
  if ((s.tick + 1) % TICK_RATE !== 0) return;
  if (kingZone(s).state !== 'held') return;
  const inside = inKingZone(s);
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
    f.downAt = s.tick;
    s.events.push({ type: 'cubeDropped', team: team as 0 | 1, pos: { ...f.pos } });
  });
  // a cube left lying out in the field goes home by itself after a while
  flags.forEach((f, team) => {
    if (f.carrier !== null || cubeHome(f)) {
      delete f.downAt;
      return;
    }
    f.downAt ??= s.tick;
    if (s.tick < f.downAt + VERSUS.cubeReturnTicks) return;
    f.pos = { ...f.base };
    delete f.downAt;
    s.events.push({ type: 'cubeReturned', team: team as 0 | 1 });
  });
  for (const p of s.players) {
    if (p.downUntil !== null || p.team === undefined) continue;
    const own = flags[p.team];
    const enemy = flags[1 - p.team];
    // carried cubes move with their carrier
    if (enemy.carrier === p.id) enemy.pos = { ...p.pos };
    // touch the enemy cube: take it (not from a kart)
    if (enemy.carrier === null && p.vehicleId === null && s.tick >= (enemy.safeUntil ?? 0) && dist(enemy.pos, p.pos) <= VERSUS.touch) {
      enemy.carrier = p.id;
      delete enemy.downAt;
      s.events.push({ type: 'cubeTaken', team: (1 - p.team) as 0 | 1, playerId: p.id });
    }
    // touch the own cube lying out in the field: it goes home
    if (own.carrier === null && !cubeHome(own) && dist(own.pos, p.pos) <= VERSUS.touch) {
      own.pos = { ...own.base };
      delete own.downAt;
      s.events.push({ type: 'cubeReturned', team: p.team });
    }
    // home with the enemy cube while the own one is at home: a capture
    // (not while the last capture still dances there: one at a time)
    if (enemy.carrier === p.id && dist(p.pos, own.base) <= CAPTURE_RANGE && cubeHome(own) && s.tick >= (own.safeUntil ?? 0)) {
      enemy.carrier = null;
      enemy.pos = { ...enemy.base };
      v.teamScores[p.team]++;
      v.scores[p.id] = (v.scores[p.id] ?? 0) + 1;
      // (it is laid down on top of the scorer's own cube at the base, where it dances a moment before it shatters;
      // meanwhile their own cube cannot be taken)
      own.safeUntil = s.tick + VERSUS.capturedShowTicks;
      s.events.push({ type: 'cubeCaptured', team: p.team, playerId: p.id, pos: { ...own.base } });
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
/** the side `p` plays for: their team, or (everyone for themselves) just them */
export const side = (s: SimState, p: Player) => (s.versus!.mode === 'team' ? (p.team ?? 0) : p.id);

export function updateVersus(s: SimState): void {
  const v = s.versus;
  if (!v || s.phase !== 'playing') return;
  updateQuad(s);

  if (s.tick >= v.nextCrateAt && v.rule !== 'gungame') {
    v.nextCrateAt = s.tick + VERSUS.crateEveryTicks;
    const free = s.map.crateSpots.filter(c => spotClear(s, c));
    if (s.crates.filter(c => !c.coins).length < VERSUS.maxCrates && free.length > 0) s.crates.push({ id: s.nextId++, pos: { ...s.rng.pick(free) }, ...hiddenPrize(s, RARE.missileCrate.versus) });
  }
  // now and then a treasure chest of coins: for towers and the like, where no monsters drop any (not in gun game,
  // which hands out the weapons itself and has no crates)
  if (s.tick >= (v.nextBagAt ?? 0) && v.rule !== 'gungame') {
    v.nextBagAt = s.tick + VERSUS.bagEveryTicks;
    const at = s.crates.filter(c => c.coins).length < VERSUS.maxBags ? chestSpot(s) : null;
    if (at) {
      // (how much is in it: mostly a little, now and then a lot)
      let roll = s.rng.next();
      const coins = VERSUS.chestCoins.find(c => (roll -= c.chance) < 0)?.coins ?? VERSUS.chestCoins[0].coins;
      s.crates.push({ id: s.nextId++, pos: at, coins });
      s.events.push({ type: 'chestAppeared', pos: { ...at }, coins });
    }
  }

  // chaos: monster hordes join the fight
  if (v.chaos && s.tick >= (v.nextHordeAt ?? 0) && s.map.waypoints.length > 0) {
    v.nextHordeAt = s.tick + VERSUS.chaosEveryTicks;
    if (s.enemies.length < 40) spawnHorde(s, s.rng.pick(s.map.waypoints), [{ kind: 'blob', count: 4 }, { kind: 'hunter', count: 2 }], { rush: true });
  }
  // chaos with a boss: now and then King Rex, the Rhino or the Schrättele breaks in, far from everyone
  if (v.boss) {
    // (the wait for the next one starts when this one has fallen)
    if (s.boss) v.nextBossAt = 0;
    else if (!v.nextBossAt) v.nextBossAt = s.tick + bossWait(s, VERSUS.bossAgainTicks);
    else if (s.tick >= v.nextBossAt) {
      const alive = s.players.filter(p => p.downUntil === null);
      const far = (w: Vec2) => Math.min(Infinity, ...alive.map(p => dist(p.pos, w)));
      const spot = [...s.map.waypoints].sort((a, b) => far(b) - far(a))[0] ?? s.map.spawn;
      spawnWild(s, s.rng.pick(WILD.fits[s.map.id] ?? ['rex', 'rhino', 'witch']), spot);
      v.nextBossAt = 0;
    }
  }
  if (v.coinop && s.tick >= v.coinop.nextAt) {
    v.coinop = { rule: nextCoinOp(s, v.coinop.rule), nextAt: s.tick + VERSUS.coinOpEveryTicks };
    s.events.push({ type: 'coinOpRule', rule: v.coinop.rule });
  }
  if (v.rule === 'king') updateKing(s);
  if (v.rule === 'conquest') {
    updateConquest(s);
    // all the zones of the match taken: whoever took the most wins (players level at the top share it; teams level: a draw)
    if (v.conquest!.taken >= VERSUS.conquestZones) {
      end(s, leaders(s));
      return;
    }
  }
  if (v.rule === 'capture') updateFlags(s);
  if (v.rule !== 'rounds') {
    const reached = v.mode === 'team' ? v.teamScores.some(x => x >= v.limit) : Object.values(v.scores).some(x => x >= v.limit);
    // (the winning capture still dances on its base: the match ends once it has shattered, so nobody misses it)
    if (reached && v.flags?.some(f => s.tick < (f.safeUntil ?? 0))) return;
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
