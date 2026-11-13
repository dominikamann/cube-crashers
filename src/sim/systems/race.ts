import { ENEMY_CAP } from '../config/balance';
import { floorRace, RACE_CHECKPOINTS, RACE_GRID } from '../config/floor-race';
import { TICK_RATE, type Player, type SimState, type Vec2 } from '../types';
import { spawnEnemy } from './enemies';
import { openShop } from './shop';
import { addVehicle } from './vehicles';

export const RACE = {
  /** the first to drive this many laps wins, and the race ends right then */
  laps: 3,
  /** the longest a race may take, in case nobody finishes */
  maxTicks: 4 * 60 * TICK_RATE,
  /** a wrecked kart is back on the track after this long */
  wreckTicks: 2 * TICK_RATE,
  coinsPerLap: 25,
  winnerBonus: 50,
  /** playing alone: a medal for finishing the laps within this many seconds */
  medals: {
    gold: { seconds: 48, coins: 100 },
    silver: { seconds: 63, coins: 60 },
    bronze: { seconds: 90, coins: 30 },
  },
  spawnEveryTicks: 4 * TICK_RATE,
  spawnCount: 3,
};

const inside = (p: Vec2, i: number) => {
  const c = RACE_CHECKPOINTS[i];
  return p.x >= c.x0 && p.x < c.x1 + 1 && p.z >= c.z0 && p.z < c.z1 + 1;
};
const centre = (i: number): Vec2 => {
  const c = RACE_CHECKPOINTS[i];
  return { x: (c.x0 + c.x1 + 1) / 2, z: (c.z0 + c.z1 + 1) / 2 };
};

function seat(s: SimState, p: Player, at: Vec2): void {
  const v = addVehicle(s, 'kart', at, 0);
  v.locked = true;
  v.driverId = p.id;
  p.vehicleId = v.id;
  p.pos = { ...at };
  p.facing = { x: 1, z: 0 };
}

/** seconds since the start of the race */
export function raceSeconds(s: SimState): number {
  return (RACE.maxTicks - (s.run.stageUntil - s.tick)) / TICK_RATE;
}

/** The Kart Rally between two floors: everyone in a kart, the first to drive three laps wins. */
export function enterRace(s: SimState): void {
  s.run.stage = 'race';
  s.run.stageUntil = s.tick + RACE.maxTicks;
  s.run.race = { laps: {}, next: {}, last: {}, wreckedUntil: {} };
  s.map = floorRace;
  s.theme = 'race';
  s.look = 'night';
  s.enemies = [];
  s.hordes = [];
  s.projectiles = [];
  s.areas = [];
  s.mines = [];
  s.coins = [];
  s.crates = [];
  s.offers = [];
  s.towers = [];
  s.nests = [];
  s.boss = null;
  s.blasts = [];
  s.vehicles = [];
  s.vehicleRespawns = [];
  s.powerups = [];
  s.jetpacks = [];
  s.bubbles = [];
  s.flow = null;
  s.elevatorOpen = false;
  s.players.forEach((p, i) => {
    p.flying = false;
    p.descent = 0;
    p.jetpack = false;
    p.jetFuel = 0;
    p.air = 0;
    p.plantTicks = 0;
    if (p.downUntil !== null) {
      p.downUntil = null;
      p.hp = p.maxHp;
    }
    p.reviveUntil = null;
    p.reviveProgress = 0;
    p.invulnUntil = s.tick + 120;
    s.run.race!.laps[p.id] = 0;
    // the start line is right ahead: the first goal is checkpoint 1
    s.run.race!.next[p.id] = 1;
    s.run.race!.last[p.id] = 0;
    seat(s, p, RACE_GRID[i % RACE_GRID.length]);
  });
}

export function updateRace(s: SimState): void {
  const race = s.run.race;
  if (s.run.stage !== 'race' || !race) return;

  for (const p of s.players) {
    const v = s.vehicles.find(x => x.id === p.vehicleId);
    if (v && v.hp <= 0) {
      // wrecked: off the track for a moment, then back at the last checkpoint
      s.events.push({ type: 'raceWreck', playerId: p.id, pos: { ...v.pos } });
      s.vehicles = s.vehicles.filter(x => x !== v);
      p.vehicleId = null;
      race.wreckedUntil[p.id] = s.tick + RACE.wreckTicks;
      continue;
    }
    if (!v) {
      if (s.tick >= (race.wreckedUntil[p.id] ?? 0)) seat(s, p, centre(race.last[p.id] ?? 0));
      continue;
    }
    const next = race.next[p.id] ?? 1;
    if (!inside(v.pos, next)) continue;
    race.last[p.id] = next;
    race.next[p.id] = (next + 1) % RACE_CHECKPOINTS.length;
    if (next === 0) {
      race.laps[p.id] = (race.laps[p.id] ?? 0) + 1;
      s.events.push({ type: 'raceLap', playerId: p.id, lap: race.laps[p.id] });
      if (race.laps[p.id] >= RACE.laps) return finishRace(s, p.id);
    }
  }

  // monsters wander onto the track to be rammed or shot
  const elapsed = RACE.maxTicks - (s.run.stageUntil - s.tick);
  if (elapsed > 0 && elapsed % RACE.spawnEveryTicks === 0 && s.map.waypoints.length > 0) {
    const at = s.rng.pick(s.map.waypoints);
    for (let i = 0; i < RACE.spawnCount && s.enemies.length < ENEMY_CAP; i++) {
      spawnEnemy(s, 'blob', { x: at.x + s.rng.range(-1.5, 1.5), z: at.z + s.rng.range(-1.5, 1.5) });
    }
  }

  if (s.tick >= s.run.stageUntil) finishRace(s);
}

/** `finisher`: the player who just drove the last lap; without one the time ran out and the most laps win */
function finishRace(s: SimState, finisher?: number): void {
  const race = s.run.race!;
  const laps = { ...race.laps };
  let medal: 'gold' | 'silver' | 'bronze' | null = null;
  let winners: number[] = [];
  if (s.players.length === 1) {
    const p = s.players[0];
    const seconds = raceSeconds(s);
    if (finisher === p.id) {
      for (const m of ['gold', 'silver', 'bronze'] as const) {
        if (seconds <= RACE.medals[m].seconds) {
          medal = m;
          p.coins += RACE.medals[m].coins;
          break;
        }
      }
    }
  } else {
    const best = Math.max(...s.players.map(p => laps[p.id] ?? 0));
    for (const p of s.players) p.coins += (laps[p.id] ?? 0) * RACE.coinsPerLap;
    if (finisher !== undefined) winners = [finisher];
    else if (best > 0) winners = s.players.filter(p => (laps[p.id] ?? 0) === best).map(p => p.id);
    for (const p of s.players) if (winners.includes(p.id)) p.coins += RACE.winnerBonus;
  }
  s.events.push({ type: 'raceEnd', laps, medal, winners });
  // out of the karts
  for (const p of s.players) p.vehicleId = null;
  s.vehicles = [];
  s.enemies = [];
  s.projectiles = [];
  s.areas = [];
  s.run.race = null;
  if (s.run.mode !== 'run') {
    s.phase = 'won';
    s.events.push({ type: 'gameWon', score: s.score });
    return;
  }
  openShop(s);
}
