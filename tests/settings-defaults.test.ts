import { describe, expect, it } from 'vitest';
import { FUN_NAMES, loadSettings, withDefaults } from '../src/ui/screens';

describe('settings defaults', () => {
  it('a player without a name gets a fun one, and without a colour a random suit colour', () => {
    const s = withDefaults({ name: '', color: null }, () => 0.5);
    expect(s.name.length).toBeGreaterThan(3);
    expect(FUN_NAMES.adjectives.some(a => s.name.startsWith(a))).toBe(true);
    expect(s.color).toBe(5);
  });

  it('keeps a name and colour the player chose', () => {
    expect(withDefaults({ name: 'Dominik', color: 1 }, () => 0.9)).toEqual({ name: 'Dominik', color: 1 });
  });

  it('starts with one player and discovery, even when split screen was saved last time', () => {
    const store = new Map<string, string>([['cube-crashers.settings', JSON.stringify({ name: 'Dominik', color: 1, localPlayers: 2, versusDiscovery: false })]]);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    const s = loadSettings();
    expect(s.localPlayers).toBe(1);
    expect(s.versusDiscovery).toBe(true);
    // once moved to discovery, a later choice of 'Pick it' sticks
    store.set('cube-crashers.settings', JSON.stringify({ ...s, versusDiscovery: false }));
    expect(loadSettings().versusDiscovery).toBe(false);
  });
});
