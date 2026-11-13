import { describe, expect, it } from 'vitest';
import { bossToBeat, browserStore, buyUnlock, claimBonus, defaultProfile, loadProfile, ownedCharacter, recordBossBeaten, rewardForRun, saveProfile, ticketsForRun, UNLOCKS } from '../src/profile';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    data,
  };
}

describe('profile', () => {
  it('a browser that keeps its storage locked does not stop the game: progress lasts for the session', () => {
    const store = browserStore(() => {
      throw new Error('SecurityError');
    });
    const p = loadProfile(store);
    p.tickets = 3;
    saveProfile(store, p);
    expect(loadProfile(store).tickets).toBe(3);
    const real = memory();
    expect(browserStore(() => real)).toBe(real);
    // the whole game shares one fallback: the title screen sees the scores the game recorded
    expect(browserStore()).toBe(browserStore());
  });

  it('starts with nothing unlocked', () => {
    const p = loadProfile(memory());
    expect(p).toEqual(defaultProfile());
    expect(p.unlocked).toEqual([]);
  });

  it('survives corrupt or foreign data', () => {
    expect(loadProfile(memory({ 'cube-crashers.profile': 'not json' }))).toEqual(defaultProfile());
    expect(loadProfile(memory({ 'cube-crashers.profile': '{"version":99,"tickets":"x"}' }))).toEqual(defaultProfile());
    const fixed = loadProfile(memory({ 'cube-crashers.profile': '{"version":1,"tickets":7,"unlocked":["bomb","nonsense"]}' }));
    expect(fixed).toEqual({ version: 1, tickets: 7, unlocked: ['bomb'], bonuses: [] });
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
    const p = { version: 1 as const, tickets: 20, unlocked: [] as string[], bonuses: [] as string[] };
    const cost = UNLOCKS.find(u => u.id === 'bomb')!.cost;
    expect(buyUnlock(p, 'bomb')).toBe(true);
    expect(p.tickets).toBe(20 - cost);
    expect(buyUnlock(p, 'bomb')).toBe(false);
    p.tickets = 0;
    expect(buyUnlock(p, 'endless')).toBe(false);
    expect(p.unlocked).toEqual(['bomb']);
  });
});

describe('characters that have to be earned', () => {
  const fresh = (tickets: number) => ({ ...defaultProfile(), tickets });

  it('cannot be bought before their boss is beaten, however many tickets there are', () => {
    const p = fresh(1000);
    expect(bossToBeat(p, 'babyDino')).toBe('rex');
    expect(bossToBeat(p, 'dominik')).toBe('dominik');
    expect(buyUnlock(p, 'babyDino')).toBe(false);
    expect(buyUnlock(p, 'dominik')).toBe(false);
    expect(p.tickets).toBe(1000);
    expect(p.unlocked).toEqual([]);
  });

  it('can be bought for tickets once the boss has fallen, and only once', () => {
    const p = fresh(1000);
    expect(recordBossBeaten(p, 'rex')).toBe(true);
    expect(recordBossBeaten(p, 'rex')).toBe(false);
    expect(bossToBeat(p, 'babyDino')).toBeNull();
    // (beating King Rex does nothing for Dominik)
    expect(buyUnlock(p, 'dominik')).toBe(false);
    const cost = UNLOCKS.find(u => u.id === 'babyDino')!.cost;
    expect(buyUnlock(p, 'babyDino')).toBe(true);
    expect(p.tickets).toBe(1000 - cost);
    expect(buyUnlock(p, 'babyDino')).toBe(false);
    expect(p.tickets).toBe(1000 - cost);
    expect(p.unlocked).toEqual(['babyDino']);
  });

  it('cannot be bought without enough tickets', () => {
    const p = fresh(UNLOCKS.find(u => u.id === 'dominik')!.cost - 1);
    recordBossBeaten(p, 'dominik');
    expect(buyUnlock(p, 'dominik')).toBe(false);
    p.tickets += 1;
    expect(buyUnlock(p, 'dominik')).toBe(true);
    expect(p.tickets).toBe(0);
  });

  it('remembers the beaten bosses across a save and a load', () => {
    const store = memory();
    const p = fresh(5);
    recordBossBeaten(p, 'rex');
    saveProfile(store, p);
    expect(loadProfile(store).beaten).toEqual(['rex']);
    expect(bossToBeat(loadProfile(store), 'babyDino')).toBeNull();
  });

  it('lets a player show only a character that is free or bought', () => {
    const p = fresh(1000);
    expect(ownedCharacter(p, 'duck')).toBe('duck');
    expect(ownedCharacter(p, null)).toBeUndefined();
    expect(ownedCharacter(p, 'dragon')).toBeUndefined();
    expect(ownedCharacter(p, 'babyDino')).toBeUndefined();
    recordBossBeaten(p, 'rex');
    expect(ownedCharacter(p, 'babyDino')).toBeUndefined();
    buyUnlock(p, 'babyDino');
    expect(ownedCharacter(p, 'babyDino')).toBe('babyDino');
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

  it('a thank-you bonus pays once: 1 ticket for the credits, 10 for the sponsor button, and survives a reload', () => {
    const p = defaultProfile();
    expect(claimBonus(p, 'credits')).toBe(1);
    expect(claimBonus(p, 'credits')).toBe(0);
    expect(claimBonus(p, 'sponsor')).toBe(10);
    expect(claimBonus(p, 'sponsor')).toBe(0);
    expect(p.tickets).toBe(11);
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveProfile(s, p);
    const back = loadProfile(s);
    expect(claimBonus(back, 'sponsor')).toBe(0);
    expect(back.tickets).toBe(11);
  });
});
