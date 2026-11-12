import { describe, expect, it } from 'vitest';
import { dailyBest, dailyDate, dailySeed, recordDaily } from '../src/daily';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('the Daily Run', () => {
  it('the day is the same everywhere in the world (UTC)', () => {
    expect(dailyDate(new Date('2026-11-12T23:30:00-05:00'))).toBe('2026-11-13');
    expect(dailyDate(new Date('2026-11-12T00:10:00Z'))).toBe('2026-11-12');
  });

  it('one seed per day: the same for everyone, a different one tomorrow', () => {
    expect(dailySeed('2026-11-12')).toBe(dailySeed('2026-11-12'));
    expect(dailySeed('2026-11-12')).not.toBe(dailySeed('2026-11-13'));
    expect(dailySeed('2026-11-12')).toBeGreaterThan(0);
    expect(Number.isInteger(dailySeed('2026-11-12'))).toBe(true);
  });

  it('keeps the best five scores of the day, and starts fresh the next day', () => {
    const store = memory();
    for (const n of [50, 300, 120, 80, 900, 10]) recordDaily(store, '2026-11-12', n);
    expect(dailyBest(store, '2026-11-12')).toEqual([900, 300, 120, 80, 50]);
    expect(dailyBest(store, '2026-11-13')).toEqual([]);
    recordDaily(store, '2026-11-13', 70);
    expect(dailyBest(store, '2026-11-13')).toEqual([70]);
  });

  it('broken storage does not break the game', () => {
    const broken = { getItem: () => '{nope', setItem: () => { throw new Error('full'); } };
    expect(dailyBest(broken, '2026-11-12')).toEqual([]);
    expect(recordDaily(broken, '2026-11-12', 5)).toEqual([5]);
  });
});
