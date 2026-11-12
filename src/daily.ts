import type { Difficulty } from './sim/types';

/**
 * The Daily Run: once a day the same Tower Run for everyone (same seed, so the same floors, crates and rare
 * weapons), on Medium with every weapon unlocked, and its own list of the day's best scores.
 */
export const DAILY_DIFFICULTY: Difficulty = 'medium';
const KEY = 'cube-crashers.daily';

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** today's date in UTC as YYYY-MM-DD: the same day for everyone, wherever they are */
export function dailyDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** the seed for a day (a hash of the date, never 0) */
export function dailySeed(date: string): number {
  let h = 2166136261;
  for (const ch of `cube-crashers-daily-${date}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 2147483646) + 1;
}

function read(store: Store): { date: string; best: number[] } | null {
  try {
    const raw = JSON.parse(store.getItem(KEY) ?? 'null');
    return raw && typeof raw.date === 'string' && Array.isArray(raw.best) ? { date: raw.date, best: raw.best.filter((n: unknown) => typeof n === 'number') } : null;
  } catch {
    return null;
  }
}

/** the best scores of `date` on this computer, highest first */
export function dailyBest(store: Store, date: string): number[] {
  const d = read(store);
  return d && d.date === date ? d.best : [];
}

/** adds a score to the day's top five and returns the list */
export function recordDaily(store: Store, date: string, score: number): number[] {
  const best = [...dailyBest(store, date), score].sort((a, b) => b - a).slice(0, 5);
  try {
    store.setItem(KEY, JSON.stringify({ date, best }));
  } catch {
    // storage unavailable: the list only lasts for this session
  }
  return best;
}
