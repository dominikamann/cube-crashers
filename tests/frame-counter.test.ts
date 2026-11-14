import { describe, expect, it } from 'vitest';
import { createFrameCounter } from '../src/runlog';

describe('frame counter of a run', () => {
  it('has nothing to say before the first frames', () => {
    expect(createFrameCounter().stats()).toBeUndefined();
  });

  it('counts frames per second, the slow ones and the longest', () => {
    const c = createFrameCounter();
    let now = 1000;
    c.frame(now, true);
    for (let i = 0; i < 9; i++) c.frame((now += 10), true);
    c.frame((now += 110), true);
    expect(c.stats()).toEqual({ fps: 50, slowShare: 0.1, worstMs: 110 });
  });

  it('leaves out a pause and the time in a menu', () => {
    const c = createFrameCounter();
    c.frame(0, true);
    c.frame(20, true);
    c.frame(40, false);
    c.frame(5000, false);
    c.frame(5020, true);
    c.frame(5040, true);
    c.frame(9000, true);
    c.frame(9020, true);
    expect(c.stats()).toEqual({ fps: 50, slowShare: 0, worstMs: 20 });
  });
});
