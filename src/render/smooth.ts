import type { SimState, Vec2 } from '../sim/types';

/** a jump further than this in one tick is a teleport (a respawn, a new floor): it is not smoothed */
const TELEPORT = 3;

/**
 * The game's rules run in fixed ticks, the screen draws as fast as it can: without help a fast kart moves in
 * steps while the camera glides, and looks as if it hops. This draws players and vehicles between where they
 * were a tick ago and where they are now. It writes the in-between positions into the state for the length of
 * one frame; call what it returns to put the real ones back.
 */
export function createSmoother(): (s: SimState, alpha: number) => () => void {
  let of: SimState | null = null;
  let tick = -1;
  let lastAlpha = 0;
  const prev = new Map<string, Vec2>(), cur = new Map<string, Vec2>();
  return (s, alpha) => {
    const things: { key: string; pos: Vec2 }[] = [...s.players.map(p => ({ key: `p${p.id}`, pos: p.pos })), ...s.vehicles.map(v => ({ key: `v${v.id}`, pos: v.pos }))];
    if (s !== of) {
      of = s;
      tick = -1;
      prev.clear();
      cur.clear();
    }
    if (s.tick !== tick) {
      tick = s.tick;
      for (const { key, pos } of things) {
        prev.set(key, cur.get(key) ?? { ...pos });
        cur.set(key, { ...pos });
      }
    } else if (alpha < lastAlpha) {
      // no new tick since the last frame's clock ran out (a pause, the countdown): everything has arrived
      for (const [key, pos] of cur) prev.set(key, pos);
    }
    lastAlpha = alpha;
    const real = things.map(t => ({ pos: t.pos, x: t.pos.x, z: t.pos.z }));
    for (const { key, pos } of things) {
      const a = prev.get(key);
      if (!a || Math.hypot(pos.x - a.x, pos.z - a.z) > TELEPORT) continue;
      const k = Math.max(0, Math.min(1, alpha));
      const x = a.x + (pos.x - a.x) * k, z = a.z + (pos.z - a.z) * k;
      pos.x = x;
      pos.z = z;
    }
    return () => {
      for (const r of real) {
        r.pos.x = r.x;
        r.pos.z = r.z;
      }
    };
  };
}
