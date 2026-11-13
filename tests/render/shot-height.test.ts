import { describe, expect, it } from 'vitest';
import { SHOT_HEIGHT, aimedReach, shotLift } from '../../src/render/shot-height';

describe('shots from above', () => {
  it('come down onto the nearest thing in the line of fire', () => {
    const reach = aimedReach({ x: 0, z: 0 }, { x: 0, z: 5 }, [{ x: 0.4, z: 8 }, { x: -0.3, z: 5 }, { x: 4, z: 2 }, { x: 0, z: -3 }]);
    expect(reach).toBeCloseTo(5);
  });
  it('come down over a fixed distance when nothing is aimed at', () => {
    expect(aimedReach({ x: 0, z: 0 }, { x: 1, z: 0 }, [{ x: 0, z: 6 }])).toBe(SHOT_HEIGHT.reach);
  });
  it('never dive straight down', () => {
    expect(aimedReach({ x: 0, z: 0 }, { x: 1, z: 0 }, [{ x: 0.5, z: 0 }])).toBe(SHOT_HEIGHT.near);
  });
  it('start at the shooter and are on the floor at the target, in a straight line', () => {
    expect(shotLift(2.5, 0, 5)).toBe(2.5);
    expect(shotLift(2.5, 2.5, 5)).toBeCloseTo(1.25);
    expect(shotLift(2.5, 5, 5)).toBe(0);
    expect(shotLift(2.5, 7, 5)).toBe(0);
  });
  it('go up to someone on a jetpack, and stay up there', () => {
    expect(shotLift(0, 2, 4, 2.5)).toBeCloseTo(1.25);
    expect(shotLift(0, 6, 4, 2.5)).toBe(2.5);
    expect(shotLift(2.5, 3, 4, 2.5)).toBe(2.5);
  });
});
