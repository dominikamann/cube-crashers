import { describe, expect, it } from 'vitest';
import { CRASH, foldHeading, jolt, newRide, stepRide, SWING, type Ride } from '../../src/render/ride';

const DT = 1 / 60;
/** the speed of a vehicle that drives along `yaw` (0 looks up the map, left is more) */
const along = (yaw: number, speed: number) => ({ x: -Math.sin(yaw) * speed, z: -Math.cos(yaw) * speed });
const drive = (r: Ride, yaw: number, speed: number, seconds: number, viewYaw = yaw, boosting = false) => {
  for (let t = 0; t < seconds; t += DT) stepRide(r, { vel: along(yaw, speed), top: 12, viewYaw, boosting }, DT);
};

describe('the ride of a vehicle seen from inside', () => {
  it('counts backing up as going straight', () => {
    expect(foldHeading(0.3)).toBeCloseTo(0.3);
    expect(foldHeading(-0.3)).toBeCloseTo(-0.3);
    expect(foldHeading(Math.PI)).toBeCloseTo(0);
    expect(foldHeading(Math.PI - 0.2)).toBeCloseTo(-0.2);
    expect(foldHeading(-Math.PI + 0.2)).toBeCloseTo(0.2);
    expect(foldHeading(2 * Math.PI + 0.1)).toBeCloseTo(0.1);
  });

  it('stands still without a shake', () => {
    const r = newRide({ x: 0, z: 0 }, 1.2);
    drive(r, 0, 0, 2, 1.2);
    expect(r.steer).toBe(0);
    expect(r.swing).toBe(0);
    expect(r.bump).toBe(0);
    expect(r.nod).toBe(0);
    expect(r.roll).toBe(0);
  });

  it('turns the wheel the way the vehicle turns, and lets it come back', () => {
    const r = newRide(along(0, 10), 0);
    drive(r, 0, 10, 0.5);
    expect(r.steer).toBeCloseTo(0);
    // a turn to the left: the heading grows
    for (let yaw = 0; yaw < 0.8; yaw += 0.04) drive(r, yaw, 10, DT);
    expect(r.steer).toBeGreaterThan(0.3);
    drive(r, 0.8, 10, 1.5);
    expect(Math.abs(r.steer)).toBeLessThan(0.02);
    for (let yaw = 0.8; yaw > 0; yaw -= 0.04) drive(r, yaw, 10, DT);
    expect(r.steer).toBeLessThan(-0.3);
    expect(Math.abs(r.steer)).toBeLessThanOrEqual(1);
  });

  it('does not spin the wheel when the vehicle backs up', () => {
    const r = newRide(along(0, 10), 0);
    drive(r, 0, 10, 0.5);
    let most = 0;
    for (let t = 0; t < 1; t += DT) {
      stepRide(r, { vel: along(Math.PI, 8), top: 12, viewYaw: 0, boosting: false }, DT);
      most = Math.max(most, Math.abs(r.steer), Math.abs(r.swing));
    }
    expect(most).toBeLessThan(0.01);
  });

  it('turns the cockpit a little toward where it drives across the view, never far', () => {
    const r = newRide(along(0, 10), 0);
    // to the right of the view
    drive(r, -Math.PI / 4, 10, 1, 0);
    expect(r.swing).toBeLessThan(-0.08);
    expect(Math.abs(r.swing)).toBeLessThanOrEqual(SWING);
    drive(r, 0, 10, 1, 0);
    expect(Math.abs(r.swing)).toBeLessThan(0.01);
  });

  it('is pressed back when it pulls away and thrown forward into a wall', () => {
    const r = newRide({ x: 0, z: 0 }, 0);
    for (let v = 0; v < 12; v += 30 * DT) drive(r, 0, v, DT);
    expect(r.tilt).toBeGreaterThan(0.3);
    drive(r, 0, 12, 1);
    expect(Math.abs(r.tilt)).toBeLessThan(0.02);
    expect(r.nod).toBeCloseTo(0);
    // a wall: all the speed gone in one tick
    expect(12 / DT).toBeGreaterThan(CRASH);
    let most = 0;
    for (let t = 0; t < 0.3; t += DT) {
      stepRide(r, { vel: { x: 0, z: 0 }, top: 12, viewYaw: 0, boosting: false }, DT);
      most = Math.max(most, r.nod);
    }
    expect(most).toBeGreaterThan(0.02);
    // (braking by letting go is no crash)
    const b = newRide(along(0, 12), 0);
    for (let v = 12; v > 0; v -= 10 * DT) drive(b, 0, v, DT);
    expect(Math.abs(b.nod)).toBeLessThan(1e-6);
  });

  it('settles after a jolt, and a long frame does not throw it off', () => {
    const r = newRide(along(0, 10), 0);
    jolt(r, -1.7, 0.9);
    let low = 0;
    for (let t = 0; t < 0.2; t += DT) {
      stepRide(r, { vel: along(0, 10), top: 12, viewYaw: 0, boosting: false }, DT);
      low = Math.min(low, r.bump);
    }
    expect(low).toBeLessThan(-0.03);
    drive(r, 0, 10, 2);
    expect(Math.abs(r.bump)).toBeLessThan(0.002);
    expect(Math.abs(r.nod)).toBeLessThan(0.002);
    jolt(r, 3, 3);
    for (let k = 0; k < 60; k++) {
      stepRide(r, { vel: along(0, 10), top: 12, viewYaw: 0, boosting: false }, 0.25);
      expect(Math.abs(r.bump)).toBeLessThanOrEqual(0.2);
      expect(Math.abs(r.nod)).toBeLessThanOrEqual(0.2);
    }
    expect(Math.abs(r.bump)).toBeLessThan(0.01);
  });

  it('fades a boost in fast and out slowly, and covers ground only while it moves', () => {
    const r = newRide(along(0, 10), 0);
    drive(r, 0, 10, 0.3, 0, true);
    expect(r.boost).toBeGreaterThan(0.9);
    drive(r, 0, 10, 0.3, 0, false);
    expect(r.boost).toBeGreaterThan(0.2);
    drive(r, 0, 10, 3, 0, false);
    expect(r.boost).toBeLessThan(0.01);
    expect(r.roll).toBeGreaterThan(35);
    expect(r.roll).toBeLessThan(37);
  });
});
