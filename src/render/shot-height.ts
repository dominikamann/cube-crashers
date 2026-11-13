import type { Vec2 } from '../sim/types';

/**
 * Shots from above. In the rules a shot only has a place on the floor, so one fired from a jetpack or from the
 * top of a wall used to fly along the ground under the shooter. It is drawn from where it was fired instead:
 * it starts at the shooter's height and comes down in a straight line onto what it was aimed at.
 */
export const SHOT_HEIGHT = {
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
