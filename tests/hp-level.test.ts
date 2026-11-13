import { describe, expect, it } from 'vitest';
import { hpLevel } from '../src/ui/hud';

describe('health bar colour', () => {
  it('is green above half, orange above a quarter, red below', () => {
    expect(hpLevel(1)).toBe('ok');
    expect(hpLevel(0.51)).toBe('ok');
    expect(hpLevel(0.5)).toBe('warn');
    expect(hpLevel(0.26)).toBe('warn');
    expect(hpLevel(0.25)).toBe('crit');
    expect(hpLevel(0)).toBe('crit');
  });
});
