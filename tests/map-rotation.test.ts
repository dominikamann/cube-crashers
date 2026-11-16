import { describe, expect, it } from 'vitest';
import { MAP_ROTATION, VERSUS_MAPS, quickMapFor, versusMapFor } from '../src/maps';

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

  it('a list of maps takes turns in its order, from the start again after the last', () => {
    expect(versusMapFor('waldsee,jungle', null)).toBe('waldsee');
    expect(versusMapFor('waldsee,jungle', 'waldsee')).toBe('jungle');
    expect(versusMapFor('waldsee,jungle', 'jungle')).toBe('waldsee');
    expect(quickMapFor('waldsee,jungle,arena', 'jungle')).toBe('arena');
    // (one played before that is not on the list: the list starts at its beginning)
    expect(quickMapFor('waldsee,jungle', 'neon')).toBe('waldsee');
  });
});
