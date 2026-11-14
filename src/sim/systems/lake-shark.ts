import { WALDSEE_BARRIERS } from '../config/waldsee-town';
import { BLOCKS_ENEMY, nearestFree } from '../map/tilemap';
import { TICK_RATE, type Player, type SimState, type Vec2 } from '../types';
import { dist } from '../util';
import { spawnHorde } from './hordes';

/**
 * The sharks of the Town's lake. Whoever stands at the barrier of the police lane and watches them for a while
 * may, before long, see one leap out of the water: it comes over the barrier in an arc, lands in the lane and is
 * after them. After a leap the lake is quiet for a moment; up to three of them are out at a time.
 */
export const LAKE_SHARK = {
  /** how near the barrier one stands to watch, and how squarely one looks out over the lake (cosine) */
  near: 7,
  look: 0.6,
  /** every so many ticks of watching the game rolls `chance` */
  rollTicks: 2 * TICK_RATE,
  chance: 0.25,
  /** how far out in the lake it comes from, how far inside the barrier it lands, how long it is in the air */
  out: 6,
  inside: 2.5,
  leapTicks: 54,
  restTicks: 12 * TICK_RATE,
  /** no more than this many sharks out of the lake at a time */
  most: 3,
};

const LAKE = WALDSEE_BARRIERS.find(b => b.lake);

/** whether this player stands at the lake's barrier and looks out over the water */
export function watchesLake(p: Player): boolean {
  if (!LAKE || p.downUntil !== null) return false;
  const at = { x: LAKE.at[0], z: LAKE.at[1] };
  if (dist(p.pos, at) > LAKE_SHARK.near || (p.pos.x - at.x) * LAKE.dir[0] + (p.pos.z - at.z) * LAKE.dir[1] > 0.5) return false;
  const dx = p.aimPoint.x - p.pos.x, dz = p.aimPoint.z - p.pos.z, len = Math.hypot(dx, dz);
  return len > 0.01 && (dx * LAKE.dir[0] + dz * LAKE.dir[1]) / len >= LAKE_SHARK.look;
}

const sharksOut = (s: SimState): number => s.enemies.filter(e => e.kind === 'shark' && e.hp > 0).length;

/** A shark leaps out of the lake at `p`: it flies in over the barrier and is held until it lands. */
export function leapAt(s: SimState, p: Player): void {
  if (!LAKE) return;
  const from: Vec2 = { x: LAKE.at[0] + LAKE.dir[0] * LAKE_SHARK.out, z: LAKE.at[1] + LAKE.dir[1] * LAKE_SHARK.out };
  const land = nearestFree(s.map, { x: LAKE.at[0] - LAKE.dir[0] * LAKE_SHARK.inside, z: LAKE.at[1] - LAKE.dir[1] * LAKE_SHARK.inside }, 0.6, BLOCKS_ENEMY);
  const room = LAKE_SHARK.most - sharksOut(s);
  const horde = spawnHorde(s, land, [{ kind: 'shark', count: 1 }], { rush: true });
  // (a bigger team gets more than one at once, but never more than the lake lets out)
  const mine = s.enemies.filter(e => e.hordeId === horde.id);
  s.enemies = s.enemies.filter(e => e.hordeId !== horde.id || mine.indexOf(e) < Math.max(1, room));
  for (const e of s.enemies) {
    if (e.hordeId !== horde.id) continue;
    e.leap = { from, to: { ...e.pos }, at: s.tick, until: s.tick + LAKE_SHARK.leapTicks };
    e.pos = { ...from };
  }
  s.events.push({ type: 'sharkLeap', pos: { ...from }, playerId: p.id });
}

export function updateLakeShark(s: SimState): void {
  // (those in the air: on along their arc, and down)
  for (const e of s.enemies) {
    const l = e.leap;
    if (!l) continue;
    const t = Math.min(1, (s.tick - l.at) / (l.until - l.at));
    e.pos = { x: l.from.x + (l.to.x - l.from.x) * t, z: l.from.z + (l.to.z - l.from.z) * t };
    if (t >= 1) {
      e.leap = undefined;
      s.events.push({ type: 'stomp', pos: { ...e.pos }, radius: 1 });
    }
  }
  if (s.map.id !== 'waldsee' || s.run.stage !== 'floor' || s.phase !== 'playing') return;
  const watcher = s.players.find(watchesLake);
  const w = (s.lakeWatch ??= { ticks: 0, restUntil: 0 });
  if (!watcher) {
    w.ticks = 0;
    return;
  }
  if (++w.ticks % LAKE_SHARK.rollTicks !== 0 || s.tick < w.restUntil) return;
  if (sharksOut(s) >= LAKE_SHARK.most || s.rng.next() >= LAKE_SHARK.chance) return;
  w.restUntil = s.tick + LAKE_SHARK.restTicks;
  leapAt(s, watcher);
}
