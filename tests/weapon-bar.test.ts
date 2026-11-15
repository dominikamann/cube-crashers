import { describe, expect, it } from 'vitest';
import { barStart } from '../src/ui/weapon-bar';

describe('the weapon bar', () => {
  it('stands still while the weapon in hand is on it', () => {
    expect(barStart(0, 0, 6, 6)).toBe(0);
    expect(barStart(0, 5, 13, 6)).toBe(0);
    expect(barStart(3, 5, 13, 6)).toBe(3);
  });

  it('slides just far enough when the weapon in hand is beyond its end, either way', () => {
    // from the sixth to the seventh: the first one leaves, the seventh comes in
    expect(barStart(0, 6, 13, 6)).toBe(1);
    expect(barStart(1, 12, 13, 6)).toBe(7);
    expect(barStart(7, 2, 13, 6)).toBe(2);
    // (round the end, from the last to the first)
    expect(barStart(7, 0, 13, 6)).toBe(0);
  });

  it('never shows empty slots where weapons could stand', () => {
    expect(barStart(7, 3, 4, 6)).toBe(0);
    expect(barStart(5, 8, 9, 6)).toBe(3);
  });
});
