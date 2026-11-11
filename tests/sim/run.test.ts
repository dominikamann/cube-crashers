import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import type { WeaponKind } from '../../src/sim/types';
import { createBot } from './bot';

const MINUTES_12 = 12 * 60 * 60;

describe('a whole floor', () => {
  it('can be cleared by a well-armed bot', () => {
    for (const seed of [1, 2, 3]) {
      const s = createSim(floor01, seed);
      const kinds: WeaponKind[] = ['pixelBlaster', 'laserSword', 'candyCannon', 'bomb', 'discoBall', 'joystickBoomerang'];
      s.players[0].weapons = kinds.map(kind => ({ kind, level: 5, cooldown: 0 }));
      const bot = createBot();
      for (let i = 0; i < MINUTES_12 && s.phase === 'playing'; i++) stepSim(s, bot(s));
      expect(s.phase, `seed ${seed} after ${(s.tick / 3600).toFixed(1)} min`).toBe('won');
    }
  });

  it('cannot be won by standing still', () => {
    const s = createSim(floor01, 1);
    for (let i = 0; i < MINUTES_12 && s.phase === 'playing'; i++) stepSim(s, []);
    expect(s.phase).toBe('lost');
  });
});
