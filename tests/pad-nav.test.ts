import { describe, expect, it } from 'vitest';
import { PAD, PadMenu, type PadSnapshot } from '../src/input/gamepad';
import { nextInDirection } from '../src/input/pad-nav';

/** a 3 × 2 grid of buttons (like the map chips) and a wide button under it (like Start) */
const boxes = [
  { x: 0, y: 0, w: 100, h: 30 },
  { x: 120, y: 0, w: 100, h: 30 },
  { x: 240, y: 0, w: 100, h: 30 },
  { x: 0, y: 50, w: 100, h: 30 },
  { x: 120, y: 50, w: 100, h: 30 },
  { x: 240, y: 50, w: 100, h: 30 },
  { x: 0, y: 120, w: 340, h: 40 },
];

describe('controller in menus', () => {
  it('moves to the button that lies in the direction pressed', () => {
    expect(nextInDirection(boxes, 0, 'right')).toBe(1);
    expect(nextInDirection(boxes, 1, 'down')).toBe(4);
    expect(nextInDirection(boxes, 4, 'up')).toBe(1);
    expect(nextInDirection(boxes, 5, 'left')).toBe(4);
    expect(nextInDirection(boxes, 4, 'down')).toBe(6);
    expect(nextInDirection(boxes, 6, 'up')).toBe(4);
  });

  it('stays put at the edge instead of jumping somewhere unexpected', () => {
    expect(nextInDirection(boxes, 2, 'right')).toBe(2);
    expect(nextInDirection(boxes, 0, 'up')).toBe(0);
  });

  it('nothing chosen yet: any direction picks the first button', () => {
    expect(nextInDirection(boxes, -1, 'down')).toBe(0);
  });

  it('holding a direction repeats it after a moment', () => {
    const pad = (down: boolean): PadSnapshot => ({ axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down && i === PAD.DOWN, value: 0 })) });
    const m = new PadMenu();
    expect(m.read(pad(true), 0).down).toBe(true);
    expect(m.read(pad(true), 200).down).toBe(false);
    expect(m.read(pad(true), 500).down).toBe(true);
    expect(m.read(pad(true), 560).down).toBe(false);
    expect(m.read(pad(true), 660).down).toBe(true);
    expect(m.read(pad(false), 700).down).toBe(false);
    expect(m.read(pad(true), 710).down).toBe(true);
  });
});
