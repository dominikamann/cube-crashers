import { describe, expect, it } from 'vitest';
import { createLoop } from '../src/loop';

function counter() {
  let steps = 0;
  const loop = createLoop(() => steps++, () => {});
  return { loop, steps: () => steps };
}

describe('createLoop', () => {
  it('runs one sim step per 1/60 s', () => {
    const { loop, steps } = counter();
    loop.frame(0);
    loop.frame(1000 / 60 + 0.01);
    expect(steps()).toBe(1);
  });

  it('runs at most 5 steps after a long gap and drops the rest', () => {
    const { loop, steps } = counter();
    loop.frame(0);
    loop.frame(10_000);
    expect(steps()).toBe(5);
    loop.frame(10_000 + 1000 / 60 + 0.01);
    expect(steps()).toBe(6);
  });

  it('does not step while paused and does not catch up after resume', () => {
    const { loop, steps } = counter();
    loop.frame(0);
    loop.pause();
    loop.frame(500);
    expect(steps()).toBe(0);
    loop.resume();
    loop.frame(5000);
    loop.frame(5000 + 1000 / 60 + 0.01);
    expect(steps()).toBe(1);
  });
});
