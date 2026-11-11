import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { createBot } from './bot';

describe('balance with the starter loadout', () => {
  it('keeps the player moving and costs credits', () => {
    let creditsLost = 0;
    for (const seed of [1, 2, 3]) {
      const s = createSim(floor01, seed);
      const bot = createBot();
      for (let i = 0; i < 12 * 3600 && s.phase === 'playing'; i++) stepSim(s, bot(s));
      expect(s.stats.idleTicks / s.tick, `seed ${seed} idle share`).toBeLessThan(0.2);
      creditsLost += s.stats.downs;
    }
    // the scripted bot dodges better than a person, so it should still feel the pressure
    expect(creditsLost).toBeGreaterThanOrEqual(2);
  });
});
