import { DIFFICULTIES } from '../../src/sim/config/difficulty';
import { FLOORS } from '../../src/sim/config/floors';
import { floor01 } from '../../src/sim/config/floor01';
import { ALL_WEAPONS, MAX_WEAPON_LEVEL } from '../../src/sim/config/weapons';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnBoss } from '../../src/sim/systems/boss';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { spawnWild } from '../../src/sim/systems/wild-boss';
import { TICK_RATE, type BossKind, type Difficulty, type SimState, type WeaponKind } from '../../src/sim/types';
import { createBot } from '../sim/bot';
import { quietSim } from '../sim/helpers';

/**
 * The balance harness: what a weapon really deals, what a boss really has, and what a scripted player earns and
 * spends on a run. Everything is measured by running the game's own rules, so the numbers follow the tables.
 * `BALANCE_REPORT=1 ./node_modules/.bin/vitest run tests/balance/report.test.ts` prints them.
 */

export const LEVELS = Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) => i + 1);
export const BOSSES: BossKind[] = ['megaBlock', 'kraken', 'worm', 'rex', 'rhino', 'spider', 'dominik'];
/** the weapons that are fought with at arm's length: measured there, the others from across the arena */
const MELEE: WeaponKind[] = ['laserSword', 'flySwatter', 'bananaMine'];

/**
 * Damage per second of one weapon at one level on a boss-sized target that stands still: a player who never
 * misses and never stops firing. Thrown and shot weapons are measured from outside the close-range bonus.
 */
export function weaponDps(kind: WeaponKind, level: number, seconds = 30): number {
  const s = quietSim();
  const p = s.players[0];
  p.weapons = [{ kind, level, cooldown: 0 }];
  p.selected = 0;
  // on the open ring road of the Arcade Plaza, far from every wall
  p.pos = { x: 31.5, z: 56.5 };
  const far = MELEE.includes(kind) ? 2.2 : 5.2;
  const dummy = spawnEnemy(s, 'megaBlock', { x: p.pos.x + far, z: p.pos.z });
  s.boss = { kind: 'megaBlock', maxHp: 1e9, phase: 1, enemyId: dummy.id, worms: [], nextAttackAt: Number.MAX_SAFE_INTEGER, lastPos: { ...dummy.pos } };
  dummy.hp = dummy.maxHp = 1e9;
  dummy.speed = 0;
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    p.hp = p.maxHp;
    p.pos = { x: 31.5, z: 56.5 };
    stepSim(s, [{ type: 'aim', playerId: 0, point: dummy.pos }, { type: 'fire', playerId: 0 }]);
  }
  return (1e9 - dummy.hp) / seconds;
}

export interface BossSetup {
  difficulty?: Difficulty;
  players?: number;
  /** the level of every weapon the players carry */
  level?: number;
  /** the boss of the last floor of a Tower Run */
  final?: boolean;
  /** a wild boss on a nest floor */
  wild?: boolean;
}

/** The health a boss comes with (for the Segment Worm: all its segments together). */
export function bossHealth(kind: BossKind, o: BossSetup = {}): number {
  const s = createSim(floor01, 3, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], difficulty: o.difficulty ?? 'medium', players: o.players ?? 1 });
  s.enemies = [];
  s.hordes = [];
  s.nests = [];
  s.map = FLOORS.arena.map;
  s.run.floor = o.final ? s.run.floors.length - 1 : 2;
  for (const p of s.players) p.weapons = [{ kind: 'pixelBlaster', level: o.level ?? 1, cooldown: 0 }];
  if (o.wild) spawnWild(s, kind, { x: s.map.w / 2, z: s.map.h / 2 });
  else spawnBoss(s, kind);
  return s.boss!.maxHp;
}

export interface Fight {
  won: boolean;
  seconds: number;
  downs: number;
}

/** The scripted player fights the boss of `floor` (a map id), or `boss` on that floor, with one weapon at one level. */
export function botFight(floor: string, weapon: WeaponKind, level: number, difficulty: Difficulty, seed = 3, final = false, boss?: BossKind): Fight {
  const s = createSim(floor01, seed, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], difficulty });
  const index = final ? s.run.floors.length - 1 : 2;
  s.run.floors[index] = floor;
  // (the floor's own boss, whatever the seed would pick, unless another one is asked for)
  s.run.bosses = boss ? s.run.floors.map((_, i) => (i === index ? boss : null)) : undefined;
  s.players[0].weapons = [{ kind: weapon, level, cooldown: 0 }];
  // straight to that floor
  s.run.floor = index - 1;
  s.run.stage = 'shop';
  s.run.shop = { offers: {}, ready: [], creditSold: false };
  s.run.stageUntil = s.tick;
  stepSim(s, []);
  s.crates = [];
  const bot = createBot();
  const start = s.tick;
  let dead = -1;
  for (let i = 0; i < 15 * 60 * TICK_RATE && s.phase === 'playing' && dead < 0; i++) {
    stepSim(s, bot(s));
    if (s.elevatorOpen) dead = s.tick;
  }
  return { won: dead >= 0, seconds: ((dead >= 0 ? dead : s.tick) - start) / TICK_RATE, downs: s.stats.downs };
}

export interface FloorReport {
  floor: number;
  map: string;
  seconds: number;
  /** coins picked up or paid out on this floor and in the game after it */
  earned: number;
  /** coins left when the shop opens, what the shop asked for all it offered, and what was left after it */
  atShop: number;
  shopTotal: number;
  lifePrice: number;
  cratesOpened: number;
  bestLevel: number;
  levels: number;
  downs: number;
  bossSeconds: number | null;
}

/** A whole Tower Run by the scripted player: time, income, crates and weapon levels floor by floor. */
export function botRun(difficulty: Difficulty, seed: number, minutes = 45): { result: SimState['phase']; floors: FloorReport[]; coins: number; lives: number } {
  const s = createSim(floor01, seed, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], difficulty });
  const p = s.players[0];
  const bot = createBot();
  const floors: FloorReport[] = [];
  const fresh = (): FloorReport => ({ floor: s.run.floor + 1, map: s.map.id, seconds: 0, earned: 0, atShop: 0, shopTotal: 0, lifePrice: 0, cratesOpened: 0, bestLevel: 0, levels: 0, downs: 0, bossSeconds: null });
  let cur = fresh();
  let start = 0, downs = 0, bossAt = s.boss ? 0 : -1;
  let stage = s.run.stage;
  const close = () => {
    cur.seconds = (s.tick - start) / TICK_RATE;
    cur.bestLevel = Math.max(...p.weapons.map(w => w.level));
    cur.levels = p.weapons.reduce((n, w) => n + w.level, 0);
    cur.downs = s.stats.downs - downs;
    floors.push(cur);
  };
  for (let i = 0; i < minutes * 60 * TICK_RATE && s.phase === 'playing'; i++) {
    const before = p.coins, floor = s.run.floor;
    stepSim(s, bot(s));
    if (s.run.floor !== floor) {
      close();
      cur = fresh();
      start = s.tick;
      downs = s.stats.downs;
      bossAt = s.boss ? s.tick : -1;
    }
    // (every coin that comes into the purse: picked up, or paid out by a game between the floors)
    if (p.coins > before) cur.earned += p.coins - before;
    cur.cratesOpened += s.events.filter(e => e.type === 'offerOpened' || e.type === 'crateCoins').length;
    if (bossAt >= 0 && cur.bossSeconds === null && s.elevatorOpen) cur.bossSeconds = (s.tick - bossAt) / TICK_RATE;
    if (s.run.stage === 'shop' && stage !== 'shop') {
      const offers = s.run.shop!.offers[p.id] ?? [];
      cur.atShop = p.coins;
      cur.shopTotal = offers.reduce((n, o) => n + o.cost, 0);
      cur.lifePrice = offers.find(o => o.kind === 'credit')?.cost ?? 0;
    }
    stage = s.run.stage;
  }
  close();
  return { result: s.phase, floors, coins: p.stats.coins, lives: p.lives ?? 0 };
}

export { ALL_WEAPONS, DIFFICULTIES };
