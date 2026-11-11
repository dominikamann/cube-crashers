import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { createBot } from './bot';
import { quietSim, run } from './helpers';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { damagePlayer } from '../../src/sim/systems/player';
import { ENEMIES } from '../../src/sim/config/enemies';
import { DIFFICULTY } from '../../src/sim/config/difficulty';
import { REGEN_DELAY_TICKS } from '../../src/sim/config/balance';

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
  }, 60_000);
});

describe('fair damage', () => {
  it('a crowd hurts less than the sum of its members: strongest in full, the rest at 30 %', () => {
    const s = quietSim();
    const p = s.players[0];
    for (let i = 0; i < 10; i++) spawnEnemy(s, 'blob', { ...p.pos }).speed = 0;
    run(s, 60);
    const blob = ENEMIES.blob.contactDamage;
    expect(100 - p.hp).toBeCloseTo(blob + 0.3 * 9 * blob, 0);
  });

  it('on the easy levels you heal when nothing hit you for a few seconds', () => {
    for (const [difficulty, heals] of [['ultraLow', true], ['low', true], ['medium', false]] as const) {
      const s = quietSim();
      s.difficulty = difficulty;
      const p = s.players[0];
      damagePlayer(s, p, 50, 'contact');
      const hurt = p.hp;
      run(s, REGEN_DELAY_TICKS + 60);
      if (heals) expect(p.hp).toBeCloseTo(Math.min(100, hurt + DIFFICULTY[difficulty].regen), 0);
      else expect(p.hp).toBe(hurt);
    }
  });

  it('counts damage taken by source for the run log', () => {
    const s = quietSim();
    damagePlayer(s, s.players[0], 10, 'contact');
    damagePlayer(s, s.players[0], 4, 'glitch');
    const f = DIFFICULTY[s.difficulty].enemyDamage;
    expect(s.stats.damageBy.contact).toBeCloseTo(10 * f, 5);
    expect(s.stats.damageBy.glitch).toBeCloseTo(4 * f, 5);
  });
});
