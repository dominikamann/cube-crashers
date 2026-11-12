import { describe, expect, it } from 'vitest';
import { MAP_ROTATION, VERSUS_MAPS, versusMapFor } from '../src/ui/screens';

describe('the versus map rotation', () => {
  it('a chosen arena stays', () => {
    expect(versusMapFor('neon', 'neon')).toBe('neon');
  });

  it('the rotation picks a random arena, never the one just played', () => {
    for (let i = 0; i < 50; i++) {
      const last = VERSUS_MAPS[i % VERSUS_MAPS.length];
      const next = versusMapFor(MAP_ROTATION, last, () => (i * 0.137) % 1);
      expect(VERSUS_MAPS).toContain(next);
      expect(next).not.toBe(last);
    }
    expect(VERSUS_MAPS).toContain(versusMapFor(MAP_ROTATION, null));
  });
});
