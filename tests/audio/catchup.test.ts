import { describe, expect, it } from 'vitest';
import { catchUp } from '../../src/audio/music';

describe('music catch-up', () => {
  it('skips steps that were missed while the timer was throttled', () => {
    const r = catchUp(10, 1.0, 3.0, 0.1);
    expect(r.step).toBe(30);
    expect(r.nextTime).toBeGreaterThanOrEqual(3.0);
    expect(r.nextTime).toBeLessThan(3.1);
  });

  it('changes nothing when on time', () => {
    expect(catchUp(10, 1.05, 1.0, 0.1)).toEqual({ step: 10, nextTime: 1.05 });
  });
});
