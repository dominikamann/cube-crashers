import { describe, expect, it } from 'vitest';
import { discovery } from '../../src/sim/systems/versus';

describe('discovery rotation', () => {
  it('walks through every rule, alternating teams and free for all, with a new map each time', () => {
    const first = Array.from({ length: 10 }, (_, i) => discovery(i));
    expect(new Set(first.slice(0, 5).map(o => o.rule))).toEqual(new Set(['score', 'king', 'rounds', 'capture', 'gungame']));
    for (let i = 1; i < first.length; i++) expect(first[i].map).not.toBe(first[i - 1].map);
    expect(first.some(o => o.mode === 'ffa')).toBe(true);
    expect(first.some(o => o.mode === 'team' && o.rule !== 'capture')).toBe(true);
    expect(first.filter(o => o.rule === 'capture').every(o => o.mode === 'team')).toBe(true);
    expect(first.filter(o => o.rule === 'gungame').every(o => o.mode === 'ffa')).toBe(true);
    expect(first.some(o => o.chaos)).toBe(true);
  });

  it('brings every rule in both flavours, teams and free for all, over two laps', () => {
    const steps = Array.from({ length: 14 }, (_, i) => discovery(i));
    for (const rule of ['score', 'king', 'rounds', 'coinop', 'conquest'] as const) {
      expect(new Set(steps.filter(o => o.rule === rule).map(o => o.mode))).toEqual(new Set(['team', 'ffa']));
    }
  });

  it('is the same for everyone: the same step gives the same match', () => {
    expect(discovery(5)).toEqual(discovery(5));
  });
});
