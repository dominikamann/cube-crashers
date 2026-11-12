import { hasLos } from './map/tilemap';
import type { Enemy, SimState, Vec2, BossState } from './types';

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** All living things weapons and towers may target. */
export function targets(s: SimState): Enemy[] {
  return s.enemies.filter(e => e.hp > 0);
}

export function nearestEnemy(s: SimState, from: Vec2, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = range;
  for (const e of targets(s)) {
    const d = dist(from, e.pos);
    if (d <= bestD && hasLos(s.map, from, e.pos)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Up to `n` living enemies within `range`, nearest first. */
/** every boss in the game right now: one on a boss floor, several in a Boss Brawl */
export function allBosses(s: SimState): BossState[] {
  return s.bosses ?? (s.boss ? [s.boss] : []);
}

export function nearestEnemies(s: SimState, from: Vec2, range: number, n: number): Enemy[] {
  return targets(s)
    .map(e => ({ e, d: dist(from, e.pos) }))
    .filter(x => x.d <= range && hasLos(s.map, from, x.e.pos))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.e);
}
