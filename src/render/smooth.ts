import { DT, type SimState, type Vec2 } from '../sim/types';

/** a jump further than this in one tick is a teleport (a respawn, a new floor): it is not smoothed */
const TELEPORT = 3;
/** how many of its last positions are kept of each player and vehicle */
const KEPT = 4;
/**
 * A LAN client draws this many ticks behind the snapshots as they come in: the time between two of them, and a
 * little more for one that is late.
 */
const SNAPSHOT_DELAY = 2.5;
/** a client's clock against the host's ticks: how much of each new measurement is taken, and when it starts over */
const CLOCK_EASE = 0.1, CLOCK_RESET = 8;

interface Sample extends Vec2 {
  tick: number;
}

/** where something was at `at` (in ticks, with a fraction), on the line through the positions known of it */
function where(samples: Sample[], at: number): Vec2 {
  const last = samples[samples.length - 1];
  if (at >= last.tick) return last;
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1], b = samples[i];
    if (at < a.tick) continue;
    const k = (at - a.tick) / (b.tick - a.tick);
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  }
  return samples[0];
}

/**
 * The game's rules run in fixed ticks, the screen draws as fast as it can: without help a fast kart moves in
 * steps while the camera glides, and looks as if it hops. This draws players and vehicles where they were one
 * tick before the frame's moment: `alpha` of the way from the tick before the newest one to the newest. A frame
 * does not always hold one tick: it may hold none or several, and then the way starts where the kart was one tick
 * ago, not where it was in the last frame (that drew it a whole tick too far back, every time: a wobble).
 *
 * A LAN client (`remote`, with the seconds since the last frame) gets its state in snapshots, every other tick
 * and whenever they arrive: there the time between frames says how far along the way everything is.
 *
 * It writes the in-between positions into the state for the length of one frame; call what it returns to put the
 * real ones back.
 */
export function createSmoother(): (s: SimState, alpha: number, remote?: { frameDt: number }) => () => void {
  let of: SimState | null = null;
  let tick = -1;
  let lastAlpha = 0;
  let arrived = false;
  /** a client's own clock in ticks, how far it is ahead of the host's ticks, and the moment it last drew */
  let clock = 0, ahead: number | null = null, drawnAt = -Infinity;
  const known = new Map<string, Sample[]>();
  return (s, alpha, remote) => {
    const things: { key: string; pos: Vec2 }[] = [...s.players.map(p => ({ key: `p${p.id}`, pos: p.pos })), ...s.vehicles.map(v => ({ key: `v${v.id}`, pos: v.pos }))];
    if (s !== of || s.tick < tick) {
      of = s;
      tick = -1;
      ahead = null;
      drawnAt = -Infinity;
      known.clear();
    }
    if (remote) clock += remote.frameDt / DT;
    if (s.tick !== tick) {
      tick = s.tick;
      arrived = false;
      for (const key of known.keys()) if (!things.some(t => t.key === key)) known.delete(key);
      for (const { key, pos } of things) {
        const samples = known.get(key) ?? [];
        const last = samples[samples.length - 1];
        if (last && Math.hypot(pos.x - last.x, pos.z - last.z) > TELEPORT) samples.length = 0;
        samples.push({ tick, x: pos.x, z: pos.z });
        if (samples.length > KEPT) samples.shift();
        known.set(key, samples);
      }
      if (remote) {
        const now = clock - tick;
        ahead = ahead === null || Math.abs(now - ahead) > CLOCK_RESET ? now : ahead + (now - ahead) * CLOCK_EASE;
      }
    } else if (alpha < lastAlpha) {
      // no new tick since the last frame's clock ran out (a pause, the countdown): everything has arrived
      arrived = true;
    }
    lastAlpha = alpha;
    // the moment to draw, in ticks; a client's never runs backwards, however its snapshots come in
    const at = remote ? Math.max(drawnAt, clock - (ahead ?? 0) - SNAPSHOT_DELAY) : arrived ? tick : tick - 1 + Math.max(0, Math.min(1, alpha));
    drawnAt = remote ? Math.min(at, tick) : -Infinity;
    const real = things.map(t => ({ pos: t.pos, x: t.pos.x, z: t.pos.z }));
    for (const { key, pos } of things) {
      const samples = known.get(key);
      if (!samples) continue;
      const { x, z } = where(samples, at);
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
