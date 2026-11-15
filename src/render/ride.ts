import type { Vec2 } from '../sim/types';

/**
 * How a vehicle feels from inside (see cockpit.ts): the steering, the lean, the jolts. All of it is read off what
 * the vehicle does on screen, tick by tick; nothing here goes back into the game.
 */
export interface Ride {
  /** where the vehicle points (yaw as in input/first-person: 0 looks up the map, left is more) */
  heading: number;
  /** the heading a moment ago: the steering is how far the two are apart */
  lagYaw: number;
  /** -1..1, left is positive */
  steer: number;
  /** how far the vehicle is turned away from the view (radians, left is positive; never far) */
  swing: number;
  speed: number;
  /** -1..1: pressed back into the seat (positive) or thrown forward */
  tilt: number;
  /** a jolt up and down, on a spring, and one that nods the nose */
  bump: number;
  bumpVel: number;
  nod: number;
  nodVel: number;
  /** 0..1: how much of a boost is on */
  boost: number;
  /** the ground covered (turns the wheels and the drum) */
  roll: number;
  /** the gallop's step */
  stride: number;
  /** 1 right after ramming something, fading: the drum hops, the horn stabs */
  thump: number;
}

export interface RideInput {
  vel: Vec2;
  /** the vehicle's top speed without a boost */
  top: number;
  viewYaw: number;
  boosting: boolean;
}

/** the most a cockpit turns away from the view (radians) */
export const SWING = 0.15;
/** losing speed faster than this (tiles per second squared) is a crash, not braking: friction alone is 10 */
export const CRASH = 70;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/**
 * A turn of the heading, with backing up counted as going straight: a vehicle here drives backwards by turning
 * its speed round, and the cockpit must not spin with it.
 */
export function foldHeading(off: number): number {
  const a = wrap(off);
  return a > Math.PI / 2 ? a - Math.PI : a < -Math.PI / 2 ? a + Math.PI : a;
}

export const headingOf = (vel: Vec2): number => Math.atan2(-vel.x, -vel.z);

export function newRide(vel: Vec2, viewYaw: number): Ride {
  const speed = Math.hypot(vel.x, vel.z);
  const heading = speed > 0.5 ? headingOf(vel) : viewYaw;
  return { heading, lagYaw: heading, steer: 0, swing: 0, speed, tilt: 0, bump: 0, bumpVel: 0, nod: 0, nodVel: 0, boost: 0, roll: 0, stride: 0, thump: 0 };
}

/** a knock: `up` throws the cockpit up (or down), `nod` the nose down (or up) */
export function jolt(r: Ride, up: number, nod = 0): void {
  r.bumpVel += up;
  r.nodVel += nod;
}

/** One frame further. */
export function stepRide(r: Ride, input: RideInput, frameDt: number): void {
  // (a long frame is cut short, or the springs would fly off)
  const dt = Math.max(1e-3, Math.min(1 / 30, frameDt));
  const speed = Math.hypot(input.vel.x, input.vel.z);
  if (speed > 0.5) r.heading = headingOf(input.vel);
  // a vehicle turns on the spot, so the wheel follows a heading that lags a little behind the real one and is
  // turned by how far the two are apart: the turn shows for a moment
  const off = foldHeading(r.heading - r.lagYaw);
  r.lagYaw = wrap(r.lagYaw + off * Math.min(1, dt * 5));
  r.steer += (clamp(off / 0.7) - r.steer) * Math.min(1, dt * 14);
  // driving across the view (A and D) turns the cockpit a little that way
  const across = speed > 0.5 ? foldHeading(r.heading - input.viewYaw) : 0;
  r.swing += (SWING * Math.tanh(across / 0.6) - r.swing) * Math.min(1, dt * 8);
  const accel = (speed - r.speed) / dt;
  r.speed = speed;
  // into a wall: thrown forward, the harder the faster it was
  if (accel < -CRASH) jolt(r, -0.25 * Math.min(1, -accel / 400), 1.2 * Math.min(1, -accel / 400));
  r.tilt += (clamp(accel / 40) - r.tilt) * Math.min(1, dt * 6);
  r.bumpVel += (-260 * r.bump - 18 * r.bumpVel) * dt;
  r.bump = clamp(r.bump + r.bumpVel * dt, -0.2, 0.2);
  r.nodVel += (-200 * r.nod - 16 * r.nodVel) * dt;
  r.nod = clamp(r.nod + r.nodVel * dt, -0.2, 0.2);
  r.boost += ((input.boosting ? 1 : 0) - r.boost) * Math.min(1, dt * (input.boosting ? 10 : 3));
  r.roll += speed * dt;
  r.stride += dt * (6 + speed * 1.4);
  r.thump = Math.max(0, r.thump - dt * 3.5);
}
