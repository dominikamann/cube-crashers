import { describe, expect, it } from 'vitest';
import { GFX_TEST, createGraphicsTest } from '../src/graphics-test';

/** runs a test on a machine that reaches `fps[quality]` frames a second */
function run(fps: Record<string, number>) {
  const test = createGraphicsTest(0);
  let now = 0;
  const seen: string[] = [];
  for (let i = 0; i < 100000 && !test.result; i++) {
    const q = test.quality;
    if (seen[seen.length - 1] !== q) seen.push(q);
    now += 1000 / fps[q];
    test.frame(now);
  }
  return { result: test.result!, seen };
}

describe('the graphics test', () => {
  it('keeps the best setting on a fast machine, and stops there', () => {
    const { result, seen } = run({ ultra: 120, high: 120, medium: 120, low: 120 });
    expect(result.quality).toBe('ultra');
    expect(seen).toEqual(['ultra']);
    expect(Math.round(result.fps)).toBe(120);
  });

  it('steps down until the picture runs smoothly', () => {
    const { result, seen } = run({ ultra: 18, high: 30, medium: 70, low: 110 });
    expect(result.quality).toBe('medium');
    expect(seen).toEqual(['ultra', 'high', 'medium']);
  });

  it('ends on the lowest setting on a slow machine', () => {
    expect(run({ ultra: 5, high: 8, medium: 12, low: 20 }).result.quality).toBe('low');
  });

  it('does not count the first moments after a switch', () => {
    const test = createGraphicsTest(0);
    // a long hitch right after the start (shaders compile), then smooth
    test.frame(GFX_TEST.settleMs - 1);
    let now = GFX_TEST.settleMs - 1;
    while (!test.result) test.frame((now += 1000 / 100));
    expect(test.result.quality).toBe('ultra');
  });
});
