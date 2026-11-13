import { TICK_RATE } from '../types';
import type { Player, SimState, Vec2 } from '../types';

/**
 * The Tarantula Queen's webs: sticky patches on the floor. Whoever walks through one is slowed to a crawl; a
 * dash tears through, and a jump or the jetpack goes over. A web takes a moment to set, and does not last.
 */
export const WEB = {
  radius: 2.3,
  /** from when it is spun to when it sticks */
  setTicks: 40,
  ticks: 7 * TICK_RATE,
  /** how fast a caught player still walks */
  slow: 0.38,
  /** no more than this many at once */
  max: 8,
};

export function spinWeb(s: SimState, pos: Vec2): void {
  const webs = (s.webs ??= []);
  if (webs.length >= WEB.max) webs.shift();
  webs.push({ id: s.nextId++, pos: { ...pos }, radius: WEB.radius, from: s.tick + WEB.setTicks, until: s.tick + WEB.setTicks + WEB.ticks });
}

/** how much of their speed a player on the ground keeps here (1 outside every web) */
export function webSlow(s: SimState, p: Player): number {
  if (!s.webs || s.webs.length === 0 || p.air > 0 || p.flying) return 1;
  for (const w of s.webs) if (s.tick >= (w.from ?? 0) && Math.hypot(p.pos.x - w.pos.x, p.pos.z - w.pos.z) <= w.radius) return WEB.slow;
  return 1;
}

export function updateWebs(s: SimState): void {
  if (s.webs && s.webs.length > 0) s.webs = s.webs.filter(w => s.tick < w.until);
}
