import { describe, expect, it } from 'vitest';
import { blendTheme, THEMES } from '../../src/render/theme';

describe('blendTheme', () => {
  it('returns day at 0 and night at 1', () => {
    expect(blendTheme(THEMES.day, THEMES.night, 0)).toEqual(THEMES.day);
    expect(blendTheme(THEMES.day, THEMES.night, 1)).toEqual(THEMES.night);
  });

  it('interpolates numbers and colours', () => {
    const mid = blendTheme(THEMES.day, THEMES.night, 0.5);
    expect(mid.bloomStrength).toBeCloseTo(0.275);
    expect(mid.bloomThreshold).toBeCloseTo(0.835);
    const r = (c: number) => (c >> 16) & 255;
    expect(r(mid.background)).toBe(Math.round((r(THEMES.day.background) + r(THEMES.night.background)) / 2));
  });

  it('uses the agreed bloom values and a non-black night', () => {
    expect(THEMES.day).toMatchObject({ bloomStrength: 0.25, bloomRadius: 0.15, bloomThreshold: 0.95 });
    expect(THEMES.night).toMatchObject({ bloomStrength: 0.3, bloomRadius: 0.15, bloomThreshold: 0.72, background: 0x1a1840 });
  });
});
