import { describe, expect, it } from 'vitest';
import { createSim, stepSim } from '../../src/sim/sim';
import { map01 } from '../../src/sim/config/map01';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { WAVES } from '../../src/sim/config/waves';
import type { SimEvent, SimState } from '../../src/sim/types';

function unarmed(): SimState {
  const s = createSim(map01, 7);
  s.players[0].weapons = [];
  return s;
}

function collect(s: SimState, ticks: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    stepSim(s, []);
    all.push(...s.events);
  }
  return all;
}

describe('waves', () => {
  it('has 10 waves with mini-boss in 5 and worm in 10', () => {
    expect(WAVES).toHaveLength(10);
    expect(WAVES[4].boss).toBe('miniboss');
    expect(WAVES[9].boss).toBe('worm');
  });

  it('starts wave 1 on the first tick', () => {
    const s = unarmed();
    stepSim(s, []);
    expect(s.events).toContainEqual({ type: 'waveStart', wave: 1 });
  });

  it('starts the next wave 300 ticks after a wave is cleared', () => {
    const s = unarmed();
    stepSim(s, []);
    s.wave.spawnQueue = [];
    s.enemies = [];
    s.crates = [];
    stepSim(s, []);
    expect(s.events).toContainEqual({ type: 'waveCleared', wave: 1 });
    const clearedAt = s.tick;
    let startedAt = -1;
    for (let i = 0; i < 400 && startedAt < 0; i++) {
      stepSim(s, []);
      if (s.events.some(e => e.type === 'waveStart' && e.wave === 2)) startedAt = s.tick;
    }
    expect(startedAt - clearedAt).toBe(300);
  });
});

describe('base', () => {
  it('loses 1 hp when a blob reaches it', () => {
    const s = unarmed();
    stepSim(s, []);
    s.wave.spawnQueue = [];
    spawnEnemy(s, 'blob', { x: -4, z: 6 });
    const events = collect(s, 120);
    expect(s.base.hp).toBe(19);
    expect(events).toContainEqual({ type: 'baseHit', hp: 19 });
  });

  it('is lost after 20 leaks, exactly once, and the sim then freezes', () => {
    const s = unarmed();
    stepSim(s, []);
    s.wave.spawnQueue = [];
    for (let i = 0; i < 20; i++) spawnEnemy(s, 'blob', { x: -4 + i * 0.1, z: 7 });
    const events = collect(s, 120);
    expect(s.phase).toBe('lost');
    expect(events.filter(e => e.type === 'gameLost')).toHaveLength(1);
    const tick = s.tick;
    stepSim(s, []);
    expect(s.tick).toBe(tick);
    expect(s.events).toEqual([]);
  });
});
