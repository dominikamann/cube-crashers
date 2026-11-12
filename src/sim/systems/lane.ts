import { ENEMY_CAP } from '../config/balance';
import { floorLane, LANE_CORE } from '../config/floor-lane';
import { TICK_RATE, type EnemyKind, type SimState } from '../types';
import { dist } from '../util';
import { hordeScale, spawnPoint } from './coop';
import { spawnEnemy } from './enemies';
import { openShop } from './shop';

export const LANE = {
  /** 90 seconds */
  ticks: 90 * TICK_RATE,
  coreHp: 100,
  /** how much of the cabinet a monster takes when it gets there */
  leak: { blob: 5, hunter: 5, splitter: 8, splitling: 2, tank: 20, shooter: 6, bomber: 15, rammer: 15, swarmer: 3 } as Partial<Record<EnemyKind, number>>,
  waveTicks: 4.5 * TICK_RATE,
  /** a minigame should keep you busy on any difficulty: waves never shrink below this share */
  minScale: 0.85,
  /** coins for a cabinet at full health (less for a damaged one), and a bonus for a perfect defence */
  rewardCoins: 80,
  perfectBonus: 40,
  reach: 1.4,
};

/** each wave has a flavour, so no two in a row look alike: a rush, a wall, a firing line, ... */
const FLAVOURS: EnemyKind[][] = [
  ['blob', 'blob', 'hunter'],
  ['swarmer', 'swarmer', 'hunter'],
  ['splitter', 'blob', 'blob'],
  ['shooter', 'blob', 'hunter'],
  ['tank', 'blob', 'blob', 'blob'],
  ['rammer', 'hunter', 'swarmer'],
  ['bomber', 'blob', 'splitter'],
];

/** what a wave is made of: more and tougher monsters as the defence goes on, in a mix (heaviest last) */
function wave(n: number): EnemyKind[] {
  const flavour = FLAVOURS[n % FLAVOURS.length];
  const size = 6 + Math.floor(n * 1.2);
  const out: EnemyKind[] = [];
  for (let i = 0; i < size; i++) out.push(flavour[i % flavour.length]);
  // later waves bring an extra heavy one
  if (n >= 8) out.push('tank');
  if (n >= 12) out.push('bomber', 'rammer');
  return out;
}

/** Lane Defense between two floors: hold one long lane for 90 seconds and keep the arcade cabinet alive. */
export function enterLane(s: SimState): void {
  s.run.stage = 'lane';
  s.run.stageUntil = s.tick + LANE.ticks;
  s.run.lane = { coreHp: LANE.coreHp, waves: 0 };
  s.map = floorLane;
  s.theme = 'lane';
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
  s.nextPowerupAt = s.tick + 10 * TICK_RATE;
  s.players.forEach((p, i) => {
    p.pos = spawnPoint(s, i);
    p.safePoint = { ...p.pos };
    p.vehicleId = null;
    p.flying = false;
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
  });
}

export function updateLane(s: SimState): void {
  const lane = s.run.lane;
  if (s.run.stage !== 'lane' || !lane) return;

  // monsters that reach the cabinet take a bite out of it and are gone
  for (const e of s.enemies) {
    if (e.hp <= 0 || dist(e.pos, LANE_CORE) > LANE.reach + e.radius) continue;
    lane.coreHp = Math.max(0, lane.coreHp - (LANE.leak[e.kind] ?? 5));
    e.hp = 0;
    s.events.push({ type: 'laneLeak', pos: { ...e.pos }, coreHp: lane.coreHp });
  }
  s.enemies = s.enemies.filter(e => e.hp > 0);

  if (lane.coreHp <= 0 || s.tick >= s.run.stageUntil) {
    finishLane(s);
    return;
  }

  const elapsed = LANE.ticks - (s.run.stageUntil - s.tick);
  if (elapsed % LANE.waveTicks === 0) {
    const n = lane.waves++;
    const kinds = wave(n);
    // fewer on easy settings, but never just the first few (that used to leave only blobs)
    const count = Math.max(3, Math.round(kinds.length * Math.max(LANE.minScale, hordeScale(s))));
    for (let i = 0; i < count && s.enemies.length < ENEMY_CAP; i++) {
      const kind = kinds[Math.floor((i * kinds.length) / count)];
      const from = s.map.waypoints[i % s.map.waypoints.length];
      // the last waves come with an elite at the back
      const elite = n >= 10 && i === count - 1;
      spawnEnemy(s, kind, { x: from.x + s.rng.range(-1, 1), z: from.z + s.rng.range(0, 2) }, { elite });
    }
  }
}

function finishLane(s: SimState): void {
  const lane = s.run.lane!;
  const coreLeft = lane.coreHp / LANE.coreHp;
  const coins = coreLeft > 0 ? Math.round(LANE.rewardCoins * coreLeft) + (coreLeft === 1 ? LANE.perfectBonus : 0) : 0;
  for (const p of s.players) p.coins += coins;
  s.events.push({ type: 'laneEnd', coreLeft, coins });
  s.enemies = [];
  s.projectiles = [];
  s.areas = [];
  s.towers = [];
  s.run.lane = null;
  if (s.run.mode !== 'run') {
    s.phase = 'won';
    s.events.push({ type: 'gameWon', score: s.score });
    return;
  }
  openShop(s);
}
