import { describe, expect, it } from 'vitest';
import { FUN_NAMES, loadSettings, withDefaults } from '../src/ui/screens';
import { DEFAULT_BINDINGS } from '../src/input/bindings';

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

  it('keeps the player\'s keys and falls back to the defaults for broken ones', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(loadSettings().bindings).toEqual(DEFAULT_BINDINGS);
    store.set('cube-crashers.settings', JSON.stringify({ name: 'Dominik', color: 1, bindings: { ...DEFAULT_BINDINGS, use: 'KeyF' } }));
    expect(loadSettings().bindings.use).toBe('KeyF');
    store.set('cube-crashers.settings', JSON.stringify({ name: 'Dominik', color: 1, bindings: { ...DEFAULT_BINDINGS, use: 'Space' } }));
    expect(loadSettings().bindings).toEqual(DEFAULT_BINDINGS);
    store.set('cube-crashers.settings', JSON.stringify({ name: 'Dominik', color: 1, bindings: 'oops' }));
    expect(loadSettings().bindings).toEqual(DEFAULT_BINDINGS);
  });

  it('colour-blind mode is off until switched on, then stays on', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(loadSettings().colorBlind).toBe(false);
    store.set('cube-crashers.settings', JSON.stringify({ name: 'Dominik', color: 1, colorBlind: true }));
    expect(loadSettings().colorBlind).toBe(true);
    store.set('cube-crashers.settings', JSON.stringify({ name: 'Dominik', color: 1, colorBlind: 'yes' }));
    expect(loadSettings().colorBlind).toBe(false);
  });

  it('a saved character the game no longer has goes back to Automatic; one it has stays', () => {
    const store = new Map<string, string>([['cube-crashers.settings', JSON.stringify({ name: 'Kim', color: 1, character: 'dominik' })]]);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(loadSettings().character).toBeNull();
    store.set('cube-crashers.settings', JSON.stringify({ name: 'Kim', color: 1, character: 'babyDino' }));
    expect(loadSettings().character).toBe('babyDino');
  });

  it('Low and Medium stay as the player chose them', () => {
    const store = new Map<string, string>([['cube-crashers.settings', JSON.stringify({ name: 'Dominik', color: 1, graphics: 'low' })]]);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(loadSettings().graphics).toBe('low');
  });

  it('Ultra goes back to High once, then the own choice sticks', () => {
    const store = new Map<string, string>([['cube-crashers.settings', JSON.stringify({ name: 'Dominik', color: 1, graphics: 'ultra' })]]);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    const s = loadSettings();
    expect(s.graphics).toBe('high');
    store.set('cube-crashers.settings', JSON.stringify({ ...s, graphics: 'ultra' }));
    expect(loadSettings().graphics).toBe('ultra');
  });
});
