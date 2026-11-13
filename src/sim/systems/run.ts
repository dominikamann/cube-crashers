import { enterRace } from './race';
import { enterLane } from './lane';
import { enterMaze } from './maze';
import { CREDIT_BONUS, PAR_SECONDS, TIME_BONUS_PER_SECOND } from '../config/balance';
import { floorDef, FLOORS } from '../config/floors';
import { BLOCKS_WALKER, isFree, nearestFree } from '../map/tilemap';
import { TICK_RATE, type Intent, type RunMode, type SimState } from '../types';
import { spawnPoint, backIn } from './coop';
import { setupFloor } from './nests';
import { enterShaft } from './shaft';
import { buy, openShop, shopDone } from './shop';

/** points for every floor cleared in a run */
export const FLOOR_BONUS = 1000;

export function initRun(s: SimState, mode: RunMode, floors: string[]): void {
  s.run = { mode, floors, floor: 0, stage: 'floor', stageUntil: 0, shop: null };
  s.theme = floorDef(s.map.id)?.theme ?? 'plaza';
}

/**
 * Where a run stands, for the display: on floor `n` of its floors (the shop counts to the floor before it), or in
 * game `n` of the games between them (one after every floor but the last). Both totals come from the run's own
 * list of floors.
 */
export function runProgress(s: SimState): { stage: 'floor' | 'between'; n: number; total: number } {
  const between = s.run.stage !== 'floor' && s.run.stage !== 'shop';
  return { stage: between ? 'between' : 'floor', n: s.run.floor + 1, total: s.run.floors.length - (between ? 1 : 0) };
}

/** How many floors of the run are done, out of how many it has. */
export function floorsCleared(s: SimState): { cleared: number; total: number } {
  return { cleared: s.run.floor + (s.phase === 'won' ? 1 : 0), total: s.run.floors.length };
}

/** The elevator was reached: the next stage of the run, or the end of it. */
/** what comes after floor i of a run, before the shop */
export const INTERMISSIONS: ('race' | 'lane' | 'maze' | 'shaft')[] = ['race', 'lane', 'maze', 'shaft'];

export function floorCleared(s: SimState): void {
  const multi = s.run.mode === 'run' || s.run.mode === 'bossrush';
  const last = !multi || s.run.floor >= s.run.floors.length - 1;
  const seconds = s.tick / TICK_RATE;
  if (last) {
    // lives left count as the team's average, so a bigger team does not score more for them
    s.score += Math.round(s.credits / Math.max(1, s.players.length)) * CREDIT_BONUS + Math.round(Math.max(0, PAR_SECONDS - seconds) * TIME_BONUS_PER_SECOND);
    if (multi) s.score += FLOOR_BONUS;
    s.phase = 'won';
    s.events.push({ type: 'gameWon', score: s.score });
    return;
  }
  s.score += FLOOR_BONUS;
  s.events.push({ type: 'floorCleared', floor: s.run.floor });
  // the floor is done: whoever was out is back, with one life, for the game between the floors and the next floor
  backIn(s);
  // a hidden heart nobody found stays behind
  s.heart = null;
  // Boss Rush: no games in between, just the shop before the next boss
  if (s.run.mode === 'bossrush') {
    openShop(s);
    return;
  }
  // between floors: a different game each time (the shaft ride where nothing else is planned yet)
  const next = INTERMISSIONS[s.run.floor];
  if (next === 'race') enterRace(s);
  else if (next === 'lane') enterLane(s);
  else if (next === 'maze') enterMaze(s);
  else enterShaft(s);
}

/** Sets up floor `index` of the run; players keep their weapons, perks, coins and the team its credits. */
export function enterFloor(s: SimState, index: number): void {
  const def = FLOORS[s.run.floors[index]];
  s.map = def.map;
  s.theme = def.theme;
  s.run.floor = index;
  s.run.stage = 'floor';
  s.run.shop = null;
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
    p.pos = spawnPoint(s, i);
    if (!isFree(s.map, p.pos, 0.4, BLOCKS_WALKER)) p.pos = nearestFree(s.map, p.pos, 0.4, BLOCKS_WALKER);
    p.safePoint = { ...p.pos };
    p.vehicleId = null;
    p.flying = false;
    // off any wall top or ladder of the floor before
    p.perched = false;
    p.climb = null;
    p.descent = 0;
    // a jetpack is only for the floor it was found on
    p.jetpack = false;
    p.jetFuel = 0;
    p.air = 0;
    p.dashTicks = 0;
    p.plantTicks = 0;
    p.reviveUntil = null;
    p.reviveProgress = 0;
    if (p.downUntil !== null) {
      p.downUntil = null;
      p.hp = p.maxHp;
    }
    p.invulnUntil = s.tick + 120;
  });
  // whoever went out in the game between the floors is back for the new floor, with one life
  backIn(s);
  setupFloor(s);
  s.events.push({ type: 'floorStart', floor: index, mapId: s.map.id });
}

/** Between floors: the shop (the shaft ride comes before it). */
export function updateRunStage(s: SimState, intents: Map<number, Intent>): void {
  if (s.run.stage !== 'shop') return;
  for (const p of s.players) {
    const it = intents.get(p.id);
    if (!it) continue;
    for (const i of it.buy) buy(s, p, i);
    if (it.ready && !s.run.shop!.ready.includes(p.id)) s.run.shop!.ready.push(p.id);
  }
  if (shopDone(s)) enterFloor(s, s.run.floor + 1);
}
