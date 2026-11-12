import { describe, expect, it } from 'vitest';
import { uiZoom } from '../src/ui/scale';

describe('interface size on big screens', () => {
  it('stays as it is on a laptop and grows evenly on a TV', () => {
    expect(uiZoom(1280, 760)).toBe(1);
    expect(uiZoom(1024, 700)).toBe(1);
    expect(uiZoom(1920, 1080)).toBe(1.42);
    expect(uiZoom(3840, 2160)).toBe(2.84);
    // a very wide window grows by its height, so nothing runs off the bottom
    expect(uiZoom(5000, 900)).toBe(1.18);
    expect(uiZoom(8000, 5000)).toBe(3);
  });
});
