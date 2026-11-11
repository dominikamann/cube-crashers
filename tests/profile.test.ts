import { describe, expect, it } from 'vitest';
import { buyUnlock, defaultProfile, loadProfile, rewardForRun, saveProfile, ticketsForRun, UNLOCKS } from '../src/profile';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    data,
  };
}

describe('profile', () => {
  it('starts with nothing unlocked', () => {
    const p = loadProfile(memory());
    expect(p).toEqual(defaultProfile());
    expect(p.unlocked).toEqual([]);
  });

  it('survives corrupt or foreign data', () => {
    expect(loadProfile(memory({ 'cube-crashers.profile': 'not json' }))).toEqual(defaultProfile());
    expect(loadProfile(memory({ 'cube-crashers.profile': '{"version":99,"tickets":"x"}' }))).toEqual(defaultProfile());
    const fixed = loadProfile(memory({ 'cube-crashers.profile': '{"version":1,"tickets":7,"unlocked":["bomb","nonsense"]}' }));
    expect(fixed).toEqual({ version: 1, tickets: 7, unlocked: ['bomb'] });
  });

  it('works without any storage', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadProfile(broken)).toEqual(defaultProfile());
    expect(() => saveProfile(broken, defaultProfile())).not.toThrow();
  });

  it('pays tickets for score, floors and difficulty', () => {
    expect(ticketsForRun({ score: 0, floors: 0, difficulty: 'medium' })).toBe(0);
    expect(ticketsForRun({ score: 10000, floors: 2, difficulty: 'medium' })).toBe(9);
    expect(ticketsForRun({ score: 10000, floors: 2, difficulty: 'ultraHigh' })).toBe(18);
    expect(ticketsForRun({ score: 500, floors: 1, difficulty: 'ultraLow' })).toBe(1);
  });

  it('spends tickets on unlocks, once', () => {
    const p = { version: 1 as const, tickets: 20, unlocked: [] as string[] };
    const cost = UNLOCKS.find(u => u.id === 'bomb')!.cost;
    expect(buyUnlock(p, 'bomb')).toBe(true);
    expect(p.tickets).toBe(20 - cost);
    expect(buyUnlock(p, 'bomb')).toBe(false);
    p.tickets = 0;
    expect(buyUnlock(p, 'endless')).toBe(false);
    expect(p.unlocked).toEqual(['bomb']);
  });
});

describe('rewards', () => {
  it('winning the Tower Run unlocks Endless once; other results do not', () => {
    const p = defaultProfile();
    expect(rewardForRun(p, { mode: 'quick', won: true })).toEqual([]);
    expect(rewardForRun(p, { mode: 'run', won: false })).toEqual([]);
    expect(rewardForRun(p, { mode: 'run', won: true })).toEqual(['endless']);
    expect(p.unlocked).toContain('endless');
    expect(rewardForRun(p, { mode: 'run', won: true })).toEqual([]);
  });
});
