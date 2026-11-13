import type { Player, Projectile, SimState, Vec2 } from '../types';
import { rivals } from './versus';

/**
 * Shots have a height. A shot starts as high as whoever fired it (on the floor, on a jetpack, on top of a wall)
 * and goes in a straight line to the height of what it was aimed at: the first monster or rival in its line of
 * fire. So a shot from a jetpack comes down onto a monster, a shot from the floor goes up to a rival on a
 * jetpack, and between two flyers it stays up. In versus that decides who is hit: a shot on its way along the
 * floor passes under a flyer, one that is up in the air passes over those on the ground. (Monsters are hit at
 * any height.)
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
};

/**
 * How far along its way a shot from `from` in direction `dir` meets the first of `targets`: the distance to the
 * nearest one standing in the line of fire, or `SHOT_HEIGHT.reach` when there is none.
 */
export function aimedReach(from: Vec2, dir: Vec2, targets: Vec2[]): number {
  const len = Math.hypot(dir.x, dir.z);
  if (len === 0) return SHOT_HEIGHT.reach;
  const dx = dir.x / len, dz = dir.z / len;
  let best = Infinity;
  for (const t of targets) {
    const along = (t.x - from.x) * dx + (t.z - from.z) * dz;
    if (along < 0.3 || along >= best) continue;
    const aside = Math.abs((t.x - from.x) * dz - (t.z - from.z) * dx);
    if (aside <= SHOT_HEIGHT.aside) best = along;
  }
  return Math.max(SHOT_HEIGHT.near, best === Infinity ? SHOT_HEIGHT.reach : best);
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
  let reach = aimedReach(from, dir, [...s.enemies.map(e => e.pos), ...foes.filter(x => !upInTheAir(x)).map(x => x.pos)]);
  let end = 0;
  const high = foes.filter(upInTheAir).map(x => x.pos);
  const toHigh = high.length ? aimedReach(from, dir, high) : Infinity;
  if (toHigh < Math.min(reach, SHOT_HEIGHT.reach)) {
    reach = toHigh;
    end = SHOT_HEIGHT.fly;
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
