import { ladders } from '../map/ladders';
import { perchable } from '../map/perch';
import type { FloorMap } from '../map/tilemap';
import type { SimState, Vec2 } from '../types';
import { dist } from '../util';
import { startLives, syncCredits } from './coop';

/**
 * The hidden heart of a Tower Run: now and then one lies on top of a block, as far from the start as it gets.
 * You have to climb a ladder (or land a jetpack) and walk along the wall tops to it. It gives every player a
 * life, up to what they started with, and brings back whoever was out.
 */
export const HEART = { chance: 0.4, pickupRadius: 0.8 };

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cache = new WeakMap<FloorMap, Vec2 | null>();

/** where the heart of this map lies: the wall top furthest from the start that a ladder leads up to */
export function heartSpot(m: FloorMap): Vec2 | null {
  if (cache.has(m)) return cache.get(m)!;
  let best: Vec2 | null = null;
  let bestScore = -1;
  const seen = new Set<number>();
  for (const l of ladders(m)) {
    // every wall top you can walk to from the top of this ladder
    const start = Math.floor(l.top.z) * m.w + Math.floor(l.top.x);
    if (seen.has(start)) continue;
    const queue: [number, number][] = [[start, 0]];
    seen.add(start);
    while (queue.length > 0) {
      const [i, steps] = queue.shift()!;
      const tx = i % m.w, tz = (i - tx) / m.w;
      const at = { x: tx + 0.5, z: tz + 0.5 };
      // far from the start counts most, a long walk along the top a little
      const score = dist(at, m.spawn) + steps * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = at;
      }
      for (const [ox, oz] of DIRS) {
        const j = (tz + oz) * m.w + tx + ox;
        if (seen.has(j) || !perchable(m, tx + ox + 0.5, tz + oz + 0.5)) continue;
        seen.add(j);
        queue.push([j, steps + 1]);
      }
    }
  }
  cache.set(m, best);
  return best;
}

/** Called when a nest floor of a run is set up; `always` skips the dice (tests, dev). */
export function placeHiddenHeart(s: SimState, always = false): void {
  s.heart = null;
  // its own dice from the seed and the floor, so the run's other random numbers stay as they were
  const roll = Math.abs(Math.sin(s.seed * 12.9898 + (s.run.floor + 1) * 78.233) * 43758.5453) % 1;
  if (!always && roll >= HEART.chance) return;
  const at = heartSpot(s.map);
  if (at) s.heart = { pos: { ...at } };
}

export function updateHeart(s: SimState): void {
  const h = s.heart;
  if (!h) return;
  const finder = s.players.find(p => p.downUntil === null && p.perched && dist(p.pos, h.pos) <= HEART.pickupRadius);
  if (!finder) return;
  s.heart = null;
  const most = startLives(s);
  for (const p of s.players) {
    p.lives = Math.max(p.lives ?? 0, Math.min(most, (p.lives ?? 0) + 1));
    if (p.out) {
      // back in the game, at the last safe spot
      p.out = false;
      p.downUntil = s.tick + 1;
    }
  }
  syncCredits(s);
  s.events.push({ type: 'heartFound', playerId: finder.id });
}
