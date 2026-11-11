import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/rng';
import { stepSim } from '../../src/sim/sim';
import { move, quietSim, run } from './helpers';

describe('Rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42), b = new Rng(42), c = new Rng(43);
    const seqA = [1, 2, 3, 4, 5].map(() => a.next());
    const seqB = [1, 2, 3, 4, 5].map(() => b.next());
    const seqC = [1, 2, 3, 4, 5].map(() => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    seqA.forEach(v => expect(v >= 0 && v < 1).toBe(true));
  });
});

describe('player movement', () => {
  it('moves 6 tiles per second on open floor', () => {
    const s = quietSim();
    const x0 = s.players[0].pos.x;
    run(s, 60, () => [move(1, 0)]);
    expect(s.players[0].pos.x - x0).toBeCloseTo(6, 3);
  });

  it('stops at a wall', () => {
    const s = quietSim();
    s.players[0].pos.z = 60.5;
    run(s, 600, () => [move(1, 0)]);
    // spawn room ends at the wall x = 44
    expect(s.players[0].pos.x).toBeGreaterThan(43.3);
    expect(s.players[0].pos.x).toBeLessThanOrEqual(43.6 + 1e-6);
  });
});

describe('stepSim', () => {
  it('advances the tick and clears last tick events', () => {
    const s = quietSim();
    s.events.push({ type: 'elevatorOpen' });
    stepSim(s, []);
    expect(s.tick).toBe(1);
    expect(s.events).toEqual([]);
  });
});

describe('sim purity', () => {
  it('does not use three, DOM, Math.random or Date', () => {
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(dir).forEach((f: string) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p); else files.push(p);
    });
    walk('src/sim');
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from 'three'|Math\.random|Date\.|\bwindow\b|\bdocument\b/);
    }
  });
});
