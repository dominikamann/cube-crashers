import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/rng';
import { createSim, stepSim } from '../../src/sim/sim';
import { map01 } from '../../src/sim/config/map01';
import type { Command } from '../../src/sim/types';

const move = (x: number, z: number): Command => ({ type: 'move', playerId: 0, dir: { x, z } });

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
  it('moves 6 units per second', () => {
    const s = createSim(map01, 1);
    const x0 = s.players[0].pos.x;
    for (let i = 0; i < 60; i++) stepSim(s, [move(1, 0)]);
    expect(s.players[0].pos.x - x0).toBeCloseTo(6, 3);
  });

  it('is clamped to the player area', () => {
    const s = createSim(map01, 1);
    for (let i = 0; i < 600; i++) stepSim(s, [move(1, 0)]);
    expect(s.players[0].pos.x).toBe(6);
  });
});

describe('stepSim', () => {
  it('advances the tick and clears last tick events', () => {
    const s = createSim(map01, 1);
    s.events.push({ type: 'waveCleared', wave: 99 });
    stepSim(s, []);
    expect(s.tick).toBe(1);
    expect(s.events.find(e => e.type === 'waveCleared' && e.wave === 99)).toBeUndefined();
  });
});

describe('sim purity', () => {
  it('does not use three, DOM, Math.random or Date', () => {
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(dir).forEach(f => {
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

describe('player area', () => {
  it('reaches every build pad, including the forward ones', () => {
    for (const pad of map01.pads) {
      const s = createSim(map01, 1);
      s.players[0].weapons = [];
      for (let i = 0; i < 600; i++) {
        const p = s.players[0].pos;
        const dx = pad.pos.x - p.x, dz = pad.pos.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) break;
        stepSim(s, [move(dx / Math.max(d, 1), dz / Math.max(d, 1))]);
      }
      const p = s.players[0].pos;
      expect(Math.hypot(pad.pos.x - p.x, pad.pos.z - p.z), `pad ${pad.id}`).toBeLessThan(1.2);
    }
  });
});
