import { TICK_RATE } from '../types';
import { Tile, tileAt, type FloorMap } from '../map/tilemap';
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
  max: 12,
};

/** Does a web of this size lie on open floor here, all of it? (No wall, no barrier, nothing raised, not off the map.) */
function fits(m: FloorMap, x: number, z: number, r: number): boolean {
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++)
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      // (the tile counts if the web reaches into it)
      const nx = Math.max(tx, Math.min(x, tx + 1)), nz = Math.max(tz, Math.min(z, tz + 1));
      if (Math.hypot(nx - x, nz - z) <= r && tileAt(m, tx, tz) !== Tile.Floor) return false;
    }
  return true;
}

/**
 * Spins a web at `pos`, or as near to it as one fits: a web lies on open floor inside the map, whole. Where
 * there is no room for a big one a smaller one is spun; where there is none at all, none.
 */
export function spinWeb(s: SimState, pos: Vec2, radius = WEB.radius): void {
  const webs = (s.webs ??= []);
  for (const r of [radius, radius * 0.75, radius * 0.55])
    for (let ring = 0; ring <= 4; ring++)
      for (let i = 0; i < (ring === 0 ? 1 : 8); i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = pos.x + Math.cos(a) * ring, z = pos.z + Math.sin(a) * ring;
        if (!fits(s.map, x, z, r)) continue;
        if (webs.length >= WEB.max) webs.shift();
        webs.push({ id: s.nextId++, pos: { x, z }, radius: r, from: s.tick + WEB.setTicks, until: s.tick + WEB.setTicks + WEB.ticks });
        return;
      }
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
