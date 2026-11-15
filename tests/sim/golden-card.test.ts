import { describe, expect, it } from 'vitest';
import { ALL_RARE, EVERY_RARE, RARE } from '../../src/sim/config/rare';
import { goldenCard } from '../../src/sim/systems/offers';
import { en } from '../../src/i18n/en';

describe('golden cards', () => {
  it('are each of the usual rare weapons as often, and now and then the Lock-On Launcher or the Thunder Hammer', () => {
    const seen = new Map<string, number>();
    const n = 11000;
    for (let i = 0; i < n; i++) {
      const k = goldenCard((i + 0.5) / n);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const all = ALL_RARE.length + RARE.missileCard + RARE.hammerCard;
    expect((seen.get('missileLauncher') ?? 0) / n).toBeCloseTo(RARE.missileCard / all, 2);
    expect((seen.get('thunderHammer') ?? 0) / n).toBeCloseTo(RARE.hammerCard / all, 2);
    for (const k of ALL_RARE) expect((seen.get(k) ?? 0) / n).toBeCloseTo(1 / all, 2);
  });

  it('every rare weapon has a name: the result table names the one with the most kills', () => {
    for (const k of EVERY_RARE) expect(en[`rare.${k}` as keyof typeof en], k).toBeTruthy();
  });
});
