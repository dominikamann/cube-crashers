import { DT, type SimState, type Vec2 } from '../sim/types';

/** a jump further than this in one tick is a teleport (a respawn, a new floor): it is not smoothed */
const TELEPORT = 3;
/** how many of its last positions are kept of each player and vehicle (enough for the longest wait, see MAX_DELAY) */
const KEPT = 12;
/**
 * A LAN client draws this many ticks behind the snapshots as they come in: the time between two of them, and a
 * little more for one that is late.
 */
const SNAPSHOT_DELAY = 2.5;
/**
 * Over a shaky line (a weak Wi-Fi, the internet) snapshots come in bursts after a pause: the client then waits
 * as long as the newest one it had grew old lately before the next came, up to this many ticks. The wait grows at
 * once and shrinks slowly (JITTER_FADE per sixtieth of a second: by half in about ten seconds), so it does not see-saw.
 */
const MAX_DELAY = 15, JITTER_FADE = 0.999;
/** a client's clock against the host's ticks: how much of each new measurement is taken, and when it starts over */
const CLOCK_EASE = 0.1, CLOCK_RESET = 8;

interface Sample extends Vec2 {
  tick: number;
  /** a player: the angle it aims at (see `angleOf`) and the spot on the ground it aims at */
  aim?: number;
  aimPoint?: Vec2;
}

/** what is smoothed of one player or vehicle: where it is, and for a player where it aims */
interface Thing {
  key: string;
  pos: Vec2;
  aim?: Vec2;
  aimPoint?: Vec2;
}

/** a direction as an angle, and back: `aim` is a unit vector, so the two go round and round without loss */
const angleOf = (dir: Vec2) => Math.atan2(dir.x, dir.z);
/** the shortest turn from one angle to another, in -π..π */
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** where something was at `at` (in ticks, with a fraction), on the line through the positions known of it */
function where(samples: Sample[], at: number): Sample {
  const last = samples[samples.length - 1];
  if (at >= last.tick) return last;
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1], b = samples[i];
    if (at < a.tick) continue;
    const k = (at - a.tick) / (b.tick - a.tick);
    const out: Sample = { tick: at, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
    // (the aim turns the short way round, so a figure never spins through a whole circle between two ticks)
    if (a.aim !== undefined && b.aim !== undefined) out.aim = a.aim + turn(a.aim, b.aim) * k;
    if (a.aimPoint && b.aimPoint) out.aimPoint = { x: a.aimPoint.x + (b.aimPoint.x - a.aimPoint.x) * k, z: a.aimPoint.z + (b.aimPoint.z - a.aimPoint.z) * k };
    return out;
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
 * A player's aim goes the same way: which way the figure faces and where its crosshair lies on the ground are
 * taken from the aim, and the aim moves with every tick while the camera above follows the figure (the spot on the
 * ground under a still mouse pointer moves with the camera). Drawn from the newest tick alone, figure and
 * crosshair would turn and slide in tick-sized steps while the body glides: a judder, on a screen that draws
 * more frames than there are ticks, or whenever a frame holds no tick or two.
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
  /** how old the newest snapshot grew lately before the next one came, in ticks (see MAX_DELAY) */
  let jitter = 0;
  const known = new Map<string, Sample[]>();
  return (s, alpha, remote) => {
    const things: Thing[] = [...s.players.map(p => ({ key: `p${p.id}`, pos: p.pos, aim: p.aim, aimPoint: p.aimPoint })), ...s.vehicles.map(v => ({ key: `v${v.id}`, pos: v.pos }))];
    if (s !== of || s.tick < tick) {
      of = s;
      tick = -1;
      ahead = null;
      drawnAt = -Infinity;
      jitter = 0;
      known.clear();
    }
    if (remote) clock += remote.frameDt / DT;
    if (s.tick !== tick) {
      tick = s.tick;
      arrived = false;
      for (const key of known.keys()) if (!things.some(t => t.key === key)) known.delete(key);
      for (const { key, pos, aim, aimPoint } of things) {
        const samples = known.get(key) ?? [];
        const last = samples[samples.length - 1];
        if (last && Math.hypot(pos.x - last.x, pos.z - last.z) > TELEPORT) samples.length = 0;
        const sample: Sample = { tick, x: pos.x, z: pos.z };
        // (an aim that points nowhere yet is left as it is)
        if (aim && Math.hypot(aim.x, aim.z) > 0.5) sample.aim = angleOf(aim);
        if (aimPoint) sample.aimPoint = { x: aimPoint.x, z: aimPoint.z };
        samples.push(sample);
        if (samples.length > KEPT) samples.shift();
        known.set(key, samples);
      }
      if (remote) {
        const now = clock - tick;
        // (the host's ticks stood still while the clock ran on: a pause or the countdown, not a shaky line, so the
        // wait starts over too; after a stall on the line clock and ticks come back in step)
        if (ahead === null || Math.abs(now - ahead) > CLOCK_RESET) {
          ahead = now;
          jitter = 0;
        } else ahead += (now - ahead) * CLOCK_EASE;
      }
    } else if (alpha < lastAlpha) {
      // no new tick since the last frame's clock ran out (a pause, the countdown): everything has arrived
      arrived = true;
    }
    lastAlpha = alpha;
    // how far the host's clock is past the newest snapshot by now: what the client has to wait for at the most
    if (remote && ahead !== null) jitter = Math.max(Math.min(clock - ahead - tick, MAX_DELAY), jitter * JITTER_FADE ** (remote.frameDt * 60));
    // the moment to draw, in ticks; a client's never runs backwards, however its snapshots come in
    const at = remote ? Math.max(drawnAt, clock - (ahead ?? 0) - Math.min(MAX_DELAY, Math.max(SNAPSHOT_DELAY, jitter + 0.5))) : arrived ? tick : tick - 1 + Math.max(0, Math.min(1, alpha));
    drawnAt = remote ? Math.min(at, tick) : -Infinity;
    const real = things.map(t => ({ ...t, x: t.pos.x, z: t.pos.z, aimX: t.aim?.x, aimZ: t.aim?.z, pointX: t.aimPoint?.x, pointZ: t.aimPoint?.z }));
    for (const { key, pos, aim, aimPoint } of things) {
      const samples = known.get(key);
      if (!samples) continue;
      const w = where(samples, at);
      pos.x = w.x;
      pos.z = w.z;
      if (aim && w.aim !== undefined) {
        aim.x = Math.sin(w.aim);
        aim.z = Math.cos(w.aim);
      }
      if (aimPoint && w.aimPoint) {
        aimPoint.x = w.aimPoint.x;
        aimPoint.z = w.aimPoint.z;
      }
    }
    return () => {
      for (const r of real) {
        r.pos.x = r.x;
        r.pos.z = r.z;
        if (r.aim) {
          r.aim.x = r.aimX!;
          r.aim.z = r.aimZ!;
        }
        if (r.aimPoint) {
          r.aimPoint.x = r.pointX!;
          r.aimPoint.z = r.pointZ!;
        }
      }
    };
  };
}
