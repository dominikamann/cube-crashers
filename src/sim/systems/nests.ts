import {
  ALARM_MAX,
  ALARM_SIZE_STEP,
  ALARM_TICKS,
  DOUBLE_RUSH_ALARM,
  GUARD_FACTOR,
  ENEMY_CAP,
  FIRST_RUSH_TICKS,
  HOLD_RADIUS,
  HOLD_TICKS,
  NEST_DEFENCE,
  NEST_BLAST,
  NEST_SPAWN_TICKS,
  NESTS_PER_FLOOR,
  OVERLOAD_RUSH_TICKS,
  PLANT_RANGE,
  PLANT_TICKS,
  ROAMING_HORDES,
  RUSH_BASE_SIZE,
  RUSH_INTERVAL_TICKS,
  RUSH_SIZE_PER_ALARM,
  START_CLEAR_RADIUS,
} from '../config/balance';
import { DIFFICULTY } from '../config/difficulty';
import { floorDef } from '../config/floors';
import { BLOCKS_WALKER, type FloorMap } from '../map/tilemap';
import type { Intent, Nest, SimState, Vec2 } from '../types';
import { dist } from '../util';
import { dropCoins, explode } from './combat';
import { spawnBoss } from './boss';
import { enterRace } from './race';
import { enterLane } from './lane';
import { enterMaze } from './maze';
import { placeStartCrates } from './offers';
import { POWERUP } from './powerups';
import { placeStartJetpack } from './rare';
import { placeStartKarts } from './vehicles';
import { HORDE_COMPS, hordeMembers, spawnHorde, type HordeComp } from './hordes';

const eliteBonus = (s: SimState) => floorDef(s.map.id)?.eliteBonus ?? 0;

const ENDLESS_NEST_RESPAWN_TICKS = 3600;
const ENDLESS_ALARM_MAX = 9;

function alarmTicks(s: SimState): number {
  return Math.round(ALARM_TICKS / DIFFICULTY[s.difficulty].alarmSpeed);
}

function shuffled<T>(s: SimState, list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(s.rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Roaming horde mixes get nastier as the alarm rises. */
function roamingComp(s: SimState, scale = 1): HordeComp {
  const names = ['blobSwarm', 'hunterPack', 'mixed', 'shieldWall', 'boomSquad', 'ramCrew', 'shieldLine', 'fieldMedic', 'blinkers'];
  // the big ones only show up once the alarm has risen
  if (s.alarm.level >= 2) names.push('jungle');
  if (s.alarm.level >= 3) names.push('rexHunt');
  const factor = (1 + ALARM_SIZE_STEP * s.alarm.level) * scale;
  return HORDE_COMPS[s.rng.pick(names)].map(g => ({ kind: g.kind, count: Math.ceil(g.count * factor) }));
}

/** A rush horde of exactly `size` enemies; higher alarm levels mix in the dangerous kinds. */
function rushComp(s: SimState, size: number): HordeComp {
  const level = s.alarm.level;
  const special = level % 2 === 1 ? 'rammer' : 'bomber';
  const specials = Math.min(3, Math.floor(size / 5));
  const shooters = Math.floor(size / 4);
  const hunters = Math.floor((size - specials - shooters) / 2);
  const comp: HordeComp = [
    { kind: 'blob', count: size - specials - shooters - hunters },
    { kind: 'hunter', count: hunters },
    { kind: 'shooter', count: shooters },
  ];
  comp.push({ kind: special, count: specials });
  return comp.filter(g => g.count > 0);
}

const compSize = (comp: HordeComp) => comp.reduce((n, g) => n + g.count, 0);

function canSpawn(s: SimState, comp: HordeComp): boolean {
  return s.enemies.length + compSize(comp) <= ENEMY_CAP;
}

/** Fills a fresh floor: which nest spots are used, their first hordes, and a few roaming hordes. */
export function setupFloor(s: SimState): void {
  // all timers count from now: later floors start long after tick 0
  s.alarm = { level: 0, nextAt: s.tick + alarmTicks(s) };
  s.boss = null;
  const def = floorDef(s.map.id);
  if (def?.kind === 'maze') {
    // the Glitch Maze played on its own
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    enterMaze(s);
    return;
  }
  if (def?.kind === 'lane') {
    // Lane Defense played on its own
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    enterLane(s);
    return;
  }
  if (def?.kind === 'race') {
    // the Kart Rally played on its own
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    enterRace(s);
    return;
  }
  if (def?.kind === 'boss') {
    // a boss floor: no nests, no rising alarm, just the boss and a few helpers
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    s.nests = [];
    spawnBoss(s, def.boss!);
    placeStartCrates(s);
    placeStartKarts(s);
    s.nextPowerupAt = s.tick + POWERUP.firstTicks;
    s.look = 'day';
    return;
  }
  const spots = shuffled(s, s.map.nestSpots).slice(0, NESTS_PER_FLOOR);
  s.nests = spots.map(spot => ({
    id: s.nextId++,
    spotId: spot.id,
    pos: { ...spot.pos },
    state: 'idle' as const,
    progress: 0,
    nextSpawnAt: s.tick + NEST_SPAWN_TICKS,
    nextRushAt: 0,
    nextBlastAt: 0,
  }));
  for (const n of s.nests) spawnHorde(s, besideNest(s, n), roamingComp(s, GUARD_FACTOR));
  const far = shuffled(s, s.map.waypoints.filter(w => dist(w, s.map.spawn) > START_CLEAR_RADIUS + 3));
  for (const w of far.slice(0, ROAMING_HORDES)) spawnHorde(s, w, roamingComp(s), { eliteChance: 0.25 + eliteBonus(s) });
  s.look = s.theme === 'neon' ? 'night' : 'day';
  placeStartCrates(s);
  placeStartKarts(s);
  placeStartJetpack(s);
  s.nextPowerupAt = s.tick + POWERUP.firstTicks;
}

function besideNest(s: SimState, n: Nest): Vec2 {
  const spot = s.map.nestSpots.find(x => x.id === n.spotId);
  const toward = spot?.entries[0] ?? s.map.spawn;
  const d = dist(n.pos, toward) || 1;
  return { x: n.pos.x + ((toward.x - n.pos.x) / d) * 3, z: n.pos.z + ((toward.z - n.pos.z) / d) * 3 };
}

function destroyNest(s: SimState, n: Nest): void {
  n.state = 'destroyed';
  s.events.push({ type: 'nestDestroyed', id: n.id, pos: { ...n.pos } });
  explode(s, n.pos, NEST_BLAST.radius, { enemy: NEST_BLAST.damage }, 'explosion');
  dropCoins(s, n.pos, NEST_BLAST.coins);
  s.crates.push({ id: s.nextId++, pos: { x: n.pos.x, z: n.pos.z + 1.5 } });
  if (s.alarm.level > 0) {
    s.alarm.level--;
    s.events.push({ type: 'alarmChanged', level: s.alarm.level });
  }
  s.alarm.nextAt = s.tick + alarmTicks(s);
  for (const p of s.players) p.safePoint = { ...n.pos };
  if (s.run.mode === 'endless') {
    n.respawnAt = s.tick + ENDLESS_NEST_RESPAWN_TICKS;
    return;
  }
  if (s.nests.every(x => x.state === 'destroyed')) {
    s.elevatorOpen = true;
    s.events.push({ type: 'elevatorOpen' });
  }
}

const zoneCache = new Map<string, Set<number>>();

/** tile indices of a nest's hold zone: walkable tiles connected to the nest whose centre is within HOLD_RADIUS */
function zoneSet(map: FloorMap, pos: Vec2): Set<number> {
  const key = `${map.id}:${pos.x},${pos.z}`;
  let set = zoneCache.get(key);
  if (set) return set;
  set = new Set<number>();
  const start = Math.floor(pos.z) * map.w + Math.floor(pos.x);
  const queue = [start];
  set.add(start);
  while (queue.length > 0) {
    const i = queue.pop()!;
    const tx = i % map.w, tz = Math.floor(i / map.w);
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= map.w || nz >= map.h) continue;
      const j = nz * map.w + nx;
      if (set.has(j) || BLOCKS_WALKER(map.tiles[j]) || dist({ x: nx + 0.5, z: nz + 0.5 }, pos) > HOLD_RADIUS) continue;
      set.add(j);
      queue.push(j);
    }
  }
  zoneCache.set(key, set);
  return set;
}

export function zoneTiles(map: FloorMap, pos: Vec2): { tx: number; tz: number }[] {
  return [...zoneSet(map, pos)].map(i => ({ tx: i % map.w, tz: Math.floor(i / map.w) }));
}

/** whether a position stands in a nest's hold zone */
export function inZone(map: FloorMap, nestPos: Vec2, at: Vec2): boolean {
  const tx = Math.floor(at.x), tz = Math.floor(at.z);
  if (tx < 0 || tz < 0 || tx >= map.w || tz >= map.h) return false;
  return zoneSet(map, nestPos).has(tz * map.w + tx);
}

export function updateNests(s: SimState, intents: Map<number, Intent>): void {
  const alive = s.players.filter(p => p.downUntil === null);

  for (const p of s.players) {
    const nest = s.nests.find(n => n.state === 'idle' && dist(n.pos, p.pos) <= PLANT_RANGE);
    const planting = p.downUntil === null && p.vehicleId === null && nest !== undefined && intents.get(p.id)?.hold === true;
    if (!planting) {
      p.plantTicks = 0;
      continue;
    }
    p.plantTicks++;
    if (p.plantTicks >= PLANT_TICKS) {
      p.plantTicks = 0;
      nest.state = 'planted';
      nest.nextRushAt = s.tick + FIRST_RUSH_TICKS;
      nest.nextBlastAt = s.tick + NEST_DEFENCE.firstTicks;
      s.events.push({ type: 'nestPlanted', id: nest.id });
    }
  }

  for (const n of s.nests) {
    if (n.state === 'destroyed' && n.respawnAt !== undefined && s.tick >= n.respawnAt) respawnNest(s, n);
    if (n.state === 'idle') {
      if (s.tick < n.nextSpawnAt) continue;
      n.nextSpawnAt = s.tick + Math.round(NEST_SPAWN_TICKS / (1 + 0.25 * s.alarm.level));
      const comp = roamingComp(s);
      if (canSpawn(s, comp)) spawnHorde(s, besideNest(s, n), comp, { eliteChance: 0.15 + 0.05 * s.alarm.level + eliteBonus(s) });
    } else if (n.state === 'planted') {
      if (!alive.some(p => inZone(s.map, n.pos, p.pos))) {
        n.progress = Math.max(0, n.progress - 0.5);
        continue;
      }
      n.progress++;
      if (n.progress >= HOLD_TICKS) {
        destroyNest(s, n);
        continue;
      }
      if (s.tick >= n.nextBlastAt) {
        n.nextBlastAt = s.tick + NEST_DEFENCE.intervalTicks - NEST_DEFENCE.intervalPerAlarm * s.alarm.level;
        for (const p of alive) {
          if (!inZone(s.map, n.pos, p.pos)) continue;
          s.blasts.push({ id: s.nextId++, pos: { ...p.pos }, radius: NEST_DEFENCE.radius, createdAt: s.tick, at: s.tick + NEST_DEFENCE.warnTicks, damage: NEST_DEFENCE.damage });
          s.events.push({ type: 'blastWarning', pos: { ...p.pos }, radius: NEST_DEFENCE.radius });
        }
      }
      if (s.tick >= n.nextRushAt) {
        n.nextRushAt = s.tick + RUSH_INTERVAL_TICKS;
        const entries = s.map.nestSpots.find(x => x.id === n.spotId)?.entries ?? [];
        const comp = rushComp(s, RUSH_BASE_SIZE + RUSH_SIZE_PER_ALARM * s.alarm.level);
        const waves = s.alarm.level >= DOUBLE_RUSH_ALARM ? 2 : 1;
        const from = shuffled(s, entries).slice(0, waves);
        for (const entry of from) if (canSpawn(s, comp)) spawnHorde(s, entry, comp, { rush: true });
      }
    }
  }
}

/** Turns the roaming horde nearest to a living player into a hunting party. */
function sendHunters(s: SimState): void {
  const alive = s.players.filter(p => p.downUntil === null);
  if (alive.length === 0) return;
  const p = s.rng.pick(alive);
  let best: { horde: (typeof s.hordes)[number]; d: number } | null = null;
  for (const [id, list] of hordeMembers(s)) {
    const horde = s.hordes.find(h => h.id === id);
    if (!horde || horde.rush) continue;
    const d = Math.min(...list.map(e => dist(e.pos, p.pos)));
    if (!best || d < best.d) best = { horde, d };
  }
  if (best) {
    best.horde.rush = true;
    best.horde.aggro = true;
  }
}

/** Endless mode: a destroyed nest grows back on a free spot away from the players. */
function respawnNest(s: SimState, n: Nest): void {
  const used = new Set(s.nests.filter(x => x !== n && x.state !== 'destroyed').map(x => x.spotId));
  const free = s.map.nestSpots.filter(sp => !used.has(sp.id) && s.players.every(p => dist(p.pos, sp.pos) > 15));
  if (free.length === 0) return;
  const spot = s.rng.pick(free);
  Object.assign(n, { spotId: spot.id, pos: { ...spot.pos }, state: 'idle', progress: 0, nextSpawnAt: s.tick + NEST_SPAWN_TICKS, nextRushAt: 0, nextBlastAt: 0, respawnAt: undefined });
  spawnHorde(s, besideNest(s, n), roamingComp(s, GUARD_FACTOR));
  s.events.push({ type: 'nestAppeared', id: n.id, pos: { ...n.pos } });
}

export function updateBlasts(s: SimState): void {
  s.blasts = s.blasts.filter(b => {
    if (s.tick < b.at) return true;
    explode(s, b.pos, b.radius, { player: b.damage }, 'explosion');
    return false;
  });
}

export function updateAlarm(s: SimState): void {
  // endless keeps climbing past the overload, so the hordes keep growing
  const max = s.run.mode === 'endless' ? ENDLESS_ALARM_MAX : ALARM_MAX;
  if (s.tick >= s.alarm.nextAt) {
    if (s.alarm.level < max) {
      s.alarm.level++;
      s.alarm.nextAt = s.tick + (s.alarm.level >= ALARM_MAX ? OVERLOAD_RUSH_TICKS * (s.alarm.level === ALARM_MAX ? 1 : 4) : alarmTicks(s));
      s.events.push({ type: 'alarmChanged', level: s.alarm.level });
      sendHunters(s);
    } else {
      sendHunters(s);
      // overload: hordes keep coming for the players until a nest falls
      s.alarm.nextAt = s.tick + OVERLOAD_RUSH_TICKS;
      const alive = s.players.filter(p => p.downUntil === null);
      if (alive.length > 0) {
        const p = s.rng.pick(alive);
        const spots = s.map.waypoints.filter(w => dist(w, p.pos) >= 15 && dist(w, p.pos) <= 30);
        const comp = rushComp(s, RUSH_BASE_SIZE + RUSH_SIZE_PER_ALARM * ALARM_MAX);
        if (spots.length > 0 && canSpawn(s, comp)) spawnHorde(s, s.rng.pick(spots), comp, { rush: true });
      }
    }
  }
  s.look = s.alarm.level >= ALARM_MAX || s.theme === 'neon' ? 'night' : 'day';
}
