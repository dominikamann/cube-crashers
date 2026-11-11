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
  leak: { blob: 5, hunter: 5, splitter: 8, splitling: 2, tank: 20, shooter: 6, bomber: 15, rammer: 15 } as Partial<Record<EnemyKind, number>>,
  waveTicks: 6 * TICK_RATE,
  /** coins for a cabinet at full health (less for a damaged one), and a bonus for a perfect defence */
  rewardCoins: 80,
  perfectBonus: 40,
  reach: 1.4,
};

/** what a wave is made of: more and tougher monsters as the defence goes on */
function wave(n: number): EnemyKind[] {
  const out: EnemyKind[] = [];
  for (let i = 0; i < 4 + n; i++) out.push('blob');
  for (let i = 0; i < Math.floor(n / 2); i++) out.push('hunter');
  if (n >= 4) out.push('splitter');
  if (n >= 6) out.push('tank');
  if (n >= 9) out.push('bomber', 'tank');
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
    const kinds = wave(lane.waves++);
    const count = Math.round(kinds.length * hordeScale(s));
    for (let i = 0; i < count && s.enemies.length < ENEMY_CAP; i++) {
      const from = s.map.waypoints[i % s.map.waypoints.length];
      spawnEnemy(s, kinds[i % kinds.length], { x: from.x + s.rng.range(-1, 1), z: from.z + s.rng.range(0, 2) });
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
