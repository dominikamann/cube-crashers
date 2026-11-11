import { describe, expect, it } from 'vitest';
import { FUN_NAMES, withDefaults } from '../src/ui/screens';

describe('settings defaults', () => {
  it('a player without a name gets a fun one, and without a colour a random suit colour', () => {
    const s = withDefaults({ name: '', color: null }, () => 0.5);
    expect(s.name.length).toBeGreaterThan(3);
    expect(FUN_NAMES.adjectives.some(a => s.name.startsWith(a))).toBe(true);
    expect(s.color).toBe(4);
  });

  it('keeps a name and colour the player chose', () => {
    expect(withDefaults({ name: 'Dominik', color: 1 }, () => 0.9)).toEqual({ name: 'Dominik', color: 1 });
  });
});
