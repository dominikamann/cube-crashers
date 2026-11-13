import type { Player, Projectile, SimState, Vec2 } from '../types';
import { rivals } from './versus';

/**
 * Shots have a height. A shot starts as high as whoever fired it (on the floor, on a jetpack, on top of a wall)
 * and goes in a straight line to the height of what it was aimed at: the first monster or rival in its line of
 * fire. So a shot from a jetpack comes down onto a monster, a shot from the floor goes up to a rival on a
 * jetpack, and between two flyers it stays up. In versus that decides who is hit: a shot on its way along the
 * floor passes under a flyer, one that is up in the air passes over those on the ground. (Monsters are hit at
 * any height.)
 *
 * In first person the view has a tilt, and it comes along with the aim (`Player.aimPitch`). A shot with nothing
 * in its line of fire then leaves along the view: up into the air, level, or into the floor ahead. So does one
 * that is on its way up and is over the heads of whoever stands in its line. Every other shot goes to its target
 * as above, wherever the view points exactly.
 */
export const SHOT_HEIGHT = {
  /** how high someone on a jetpack is, and someone on top of a wall */
  fly: 2.5,
  perch: 1.1,
  /** a shot at least this high hits those in the air; one below it, those on the floor */
  split: 1.25,
  /** how far off the line of fire something may stand and still be what the shot was aimed at */
  aside: 1.1,
  /** with nothing in the line of fire, the shot comes down over this far */
  reach: 9,
  /** nothing is aimed at closer than this (a shot does not dive straight down) */
  near: 1.5,
  /** how high above the floor a shot on the floor is, and how low one comes that is fired into the floor */
  floor: 0.6,
  low: 0.1,
  /** first person: how high the eyes are (input/first-person has the same), and how far ahead a shot meets the line of sight */
  eye: 1.3,
  sight: 14,
  /** a shot on its way up goes on in its line this far (further than any shot flies) */
  rise: 60,
  /** the most a view tilts, whoever says so (a view in this game tilts far less: see input/first-person) */
  tilt: 1.2,
};

/** the tilt of a first-person view, kept within what the game can reckon with */
export const clampAimPitch = (pitch: number): number => Math.max(-SHOT_HEIGHT.tilt, Math.min(SHOT_HEIGHT.tilt, pitch));

/**
 * The way of a shot fired `lift` up along a first-person view tilted by `pitch`. It comes from the weapon, which
 * is held below the eyes, and goes to where the line of sight is `SHOT_HEIGHT.sight` ahead, or to where that
 * line meets the floor before then: so it lands on the crosshair. Going up it keeps going up; coming down it
 * stays just above the floor from where it meets it. `slope` is how much it climbs per tile on its way.
 */
export function lookedWay(lift: number, pitch: number): { end: number; reach: number; slope: number } {
  const eye = SHOT_HEIGHT.eye + lift, from = SHOT_HEIGHT.floor + lift;
  const tan = Math.tan(clampAimPitch(pitch));
  const ahead = tan < 0 ? Math.min(SHOT_HEIGHT.sight, eye / -tan) : SHOT_HEIGHT.sight;
  const slope = (Math.max(SHOT_HEIGHT.low, eye + tan * ahead) - from) / ahead;
  if (slope >= 0) return { end: lift + slope * SHOT_HEIGHT.rise, reach: SHOT_HEIGHT.rise, slope };
  return { end: SHOT_HEIGHT.low - SHOT_HEIGHT.floor, reach: (from - SHOT_HEIGHT.low) / -slope, slope };
}

/** How far along a line from `from` in direction `dir` the first of `targets` stands in it: Infinity when none does. */
function firstInLine(from: Vec2, dir: Vec2, targets: Vec2[]): number {
  const len = Math.hypot(dir.x, dir.z);
  if (len === 0) return Infinity;
  const dx = dir.x / len, dz = dir.z / len;
  let best = Infinity;
  for (const t of targets) {
    const along = (t.x - from.x) * dx + (t.z - from.z) * dz;
    if (along < 0.3 || along >= best) continue;
    const aside = Math.abs((t.x - from.x) * dz - (t.z - from.z) * dx);
    if (aside <= SHOT_HEIGHT.aside) best = along;
  }
  return best;
}

/**
 * How far along its way a shot from `from` in direction `dir` meets the first of `targets`: the distance to the
 * nearest one standing in the line of fire, or `SHOT_HEIGHT.reach` when there is none.
 */
export function aimedReach(from: Vec2, dir: Vec2, targets: Vec2[]): number {
  const first = firstInLine(from, dir, targets);
  return Math.max(SHOT_HEIGHT.near, first === Infinity ? SHOT_HEIGHT.reach : first);
}

/**
 * How far above its usual height a shot is after `travelled` of its way of `reach`: it was fired `lift` up and
 * is `end` up where it arrives (0: down on the floor; the height of someone on a jetpack it was aimed at).
 */
export function shotLift(lift: number, travelled: number, reach: number, end = 0): number {
  return lift + (end - lift) * Math.min(1, Math.max(0, travelled / reach));
}

/** whether a player is up on a jetpack (flying, or sinking down from a flight) */
export const upInTheAir = (p: Player): boolean => p.flying || (p.descent ?? 0) > 0;

/** A player's shot is given its way through the air, once: from its shooter's height to its target's. */
export function aimShot(s: SimState, p: Projectile): void {
  if (p.arc || p.hostile || p.ownerId < 0) return;
  const o = s.players.find(x => x.id === p.ownerId);
  const from = p.from ?? p.pos;
  const lift = !o ? 0 : upInTheAir(o) ? SHOT_HEIGHT.fly : o.perched ? SHOT_HEIGHT.perch : 0;
  const foes = rivals(s, p.ownerId);
  const dir = p.target ? { x: p.target.x - from.x, z: p.target.z - from.z } : p.vel;
  // (what is thrown comes down where it lands)
  if (p.target) {
    p.arc = { x: from.x, z: from.z, lift, end: 0, reach: Math.max(0.1, Math.hypot(dir.x, dir.z)) };
    return;
  }
  // first person: the way along the view (not for a pizza cutter, which rolls along the floor)
  const looked = o?.aimPitch !== undefined && p.behavior !== 'saw' ? lookedWay(lift, o.aimPitch) : null;
  const low = firstInLine(from, dir, [...s.enemies.map(e => e.pos), ...foes.filter(x => !upInTheAir(x)).map(x => x.pos)]);
  // a shot on its way up that is over the heads of whoever stands in its line is not aimed at them
  const over = looked !== null && looked.slope >= 0 && lift + looked.slope * Math.max(SHOT_HEIGHT.near, low) >= SHOT_HEIGHT.split;
  const aimed = low !== Infinity && !over;
  let reach = aimed ? Math.max(SHOT_HEIGHT.near, low) : SHOT_HEIGHT.reach;
  let end = 0;
  const high = foes.filter(upInTheAir).map(x => x.pos);
  const toHigh = high.length ? aimedReach(from, dir, high) : Infinity;
  if (toHigh < Math.min(reach, SHOT_HEIGHT.reach)) {
    reach = toHigh;
    end = SHOT_HEIGHT.fly;
  } else if (looked && !aimed) {
    reach = looked.reach;
    end = looked.end;
  }
  p.arc = { x: from.x, z: from.z, lift, end, reach };
}

/** How high a shot is right now, above the height shots have on the floor. */
export function shotHeight(p: Projectile): number {
  const a = p.arc;
  return a ? shotLift(a.lift, Math.hypot(p.pos.x - a.x, p.pos.z - a.z), a.reach, a.end) : 0;
}

/** Whether a shot is at the height of this player: up in the air with a flyer, down on the floor with the others. */
export function atHeightOf(p: Projectile, r: Player): boolean {
  return upInTheAir(r) === shotHeight(p) >= SHOT_HEIGHT.split;
}
