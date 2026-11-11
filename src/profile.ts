import type { Difficulty } from './sim/types';

/** Things that can be unlocked with tickets. The other four weapons and the kart are always there. */
export const UNLOCKS = [
  { id: 'joystickBoomerang', kind: 'weapon', cost: 4 },
  { id: 'discoBall', kind: 'weapon', cost: 5 },
  { id: 'bananaMine', kind: 'weapon', cost: 5 },
  { id: 'bomb', kind: 'weapon', cost: 6 },
  { id: 'roller', kind: 'vehicle', cost: 8 },
  { id: 'hoverboard', kind: 'vehicle', cost: 8 },
  { id: 'endless', kind: 'mode', cost: 12 },
] as const;

export type UnlockId = (typeof UNLOCKS)[number]['id'];

export interface Profile {
  version: 1;
  tickets: number;
  unlocked: string[];
  /** one-off thank-you bonuses already paid out */
  bonuses: string[];
}

/** tickets for a one-off thank-you: looking at the credits, clicking the sponsor button */
export const BONUSES = { credits: 1, sponsor: 10 } as const;
export type BonusId = keyof typeof BONUSES;

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'cube-crashers.profile';
const KNOWN = new Set<string>(UNLOCKS.map(u => u.id));

export const defaultProfile = (): Profile => ({ version: 1, tickets: 0, unlocked: [], bonuses: [] });

/** Local progress; anything missing, broken or from another version gives a fresh profile. */
export function loadProfile(store: Store): Profile {
  try {
    const raw = JSON.parse(store.getItem(KEY) ?? 'null');
    if (!raw || raw.version !== 1 || typeof raw.tickets !== 'number' || !Array.isArray(raw.unlocked)) return defaultProfile();
    const bonuses = Array.isArray(raw.bonuses) ? raw.bonuses.filter((x: unknown) => typeof x === 'string' && Object.hasOwn(BONUSES, x)) : [];
    return { version: 1, tickets: Math.max(0, Math.floor(raw.tickets)), unlocked: raw.unlocked.filter((x: unknown) => typeof x === 'string' && KNOWN.has(x)), bonuses };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(store: Store, p: Profile): void {
  try {
    store.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable: progress only lasts this session
  }
}

const DIFF_FACTOR: Record<Difficulty, number> = { ultraLow: 0.5, low: 0.75, medium: 1, high: 1.5, ultraHigh: 2 };

/** One ticket per 2000 points plus two per floor cleared, scaled by the difficulty. */
export function ticketsForRun(r: { score: number; floors: number; difficulty: Difficulty }): number {
  const base = Math.floor(r.score / 2000) + r.floors * 2;
  if (base === 0) return 0;
  return Math.max(1, Math.round(base * DIFF_FACTOR[r.difficulty]));
}

/** Rewards beyond tickets: beating the Tower Run unlocks Endless. Returns what was newly unlocked. */
export function rewardForRun(p: Profile, r: { mode: string; won: boolean }): UnlockId[] {
  if (r.mode !== 'run' || !r.won || p.unlocked.includes('endless')) return [];
  p.unlocked.push('endless');
  return ['endless'];
}

export function buyUnlock(p: Profile, id: UnlockId): boolean {
  const u = UNLOCKS.find(x => x.id === id);
  if (!u || p.unlocked.includes(id) || p.tickets < u.cost) return false;
  p.tickets -= u.cost;
  p.unlocked.push(id);
  return true;
}

/** Pays a thank-you bonus the first time; returns the tickets granted (0 if it was paid before). */
export function claimBonus(p: Profile, id: BonusId): number {
  if (p.bonuses.includes(id)) return 0;
  p.bonuses.push(id);
  p.tickets += BONUSES[id];
  return BONUSES[id];
}
