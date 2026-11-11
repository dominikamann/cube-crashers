import { describe, expect, it } from 'vitest';
import { buildRunLog } from '../src/runlog';
import { floor01 } from '../src/sim/config/floor01';
import { createSim, stepSim } from '../src/sim/sim';
import type { WeaponKind } from '../src/sim/types';
import { createBot } from './sim/bot';

describe('run log', () => {
  it('summarises a finished run with one sample per 10 seconds', () => {
    const s = createSim(floor01, 1);
    const kinds: WeaponKind[] = ['pixelBlaster', 'laserSword', 'candyCannon', 'bomb', 'discoBall', 'joystickBoomerang'];
    s.players[0].weapons = kinds.map(kind => ({ kind, level: 5, cooldown: 0 }));
    const bot = createBot();
    for (let i = 0; i < 12 * 3600 && s.phase === 'playing'; i++) stepSim(s, bot(s));
    const log = buildRunLog(s);
    expect(log).toMatchObject({ version: 1, seed: 1, map: 'floor01', result: 'won', score: s.score, credits: 3, nestsDestroyed: 4 });
    expect(log.durationSeconds).toBeCloseTo(s.tick / 60, 1);
    expect(log.samples).toHaveLength(Math.floor(s.tick / 600));
    const moved = log.samples.reduce((sum, x) => sum + x.distance, 0);
    expect(moved).toBeCloseTo(s.stats.samples[s.stats.samples.length - 1].distance, 3);
    expect(log.idleShare).toBeGreaterThanOrEqual(0);
    expect(log.idleShare).toBeLessThan(1);
    expect(log.kills.weapon).toBe(s.stats.kills.weapon);
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
  }, 60_000);
});
