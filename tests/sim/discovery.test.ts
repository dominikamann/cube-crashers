import { describe, expect, it } from 'vitest';
import { discovery } from '../../src/sim/systems/versus';

describe('discovery rotation', () => {
  it('walks through every rule, alternating teams and free for all, with a new map each time', () => {
    const first = Array.from({ length: 8 }, (_, i) => discovery(i));
    expect(new Set(first.slice(0, 4).map(o => o.rule))).toEqual(new Set(['score', 'king', 'rounds', 'capture']));
    for (let i = 1; i < first.length; i++) expect(first[i].map).not.toBe(first[i - 1].map);
    expect(first.some(o => o.mode === 'ffa')).toBe(true);
    expect(first.some(o => o.mode === 'team' && o.rule !== 'capture')).toBe(true);
    expect(first.filter(o => o.rule === 'capture').every(o => o.mode === 'team')).toBe(true);
    expect(first.some(o => o.chaos)).toBe(true);
  });

  it('is the same for everyone: the same step gives the same match', () => {
    expect(discovery(5)).toEqual(discovery(5));
  });
});
