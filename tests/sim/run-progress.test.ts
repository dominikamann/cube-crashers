import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim } from '../../src/sim/sim';
import { enterFloor, floorCleared, floorsCleared, runProgress } from '../../src/sim/systems/run';
import type { SimState } from '../../src/sim/types';

/** a Tower Run of its usual floors, or with `extra` more on top */
function runSim(extra = 0): SimState {
  const s = createSim(floor01, 4, { mode: 'run' });
  for (let i = 0; i < extra; i++) s.run.floors.push(s.run.floors[1]);
  return s;
}

function clearFloor(s: SimState) {
  for (const n of s.nests) n.state = 'destroyed';
  s.enemies = [];
  floorCleared(s);
}

describe('where a run stands', () => {
  it('counts the floor out of the floors this run has', () => {
    for (const extra of [0, 1, 3]) {
      const s = runSim(extra);
      expect(runProgress(s)).toEqual({ stage: 'floor', n: 1, total: s.run.floors.length });
      enterFloor(s, s.run.floors.length - 1);
      expect(runProgress(s)).toEqual({ stage: 'floor', n: s.run.floors.length, total: s.run.floors.length });
    }
  });

  it('counts a game between two floors as one of the games in between, not as a floor', () => {
    for (const extra of [0, 1]) {
      const s = runSim(extra);
      clearFloor(s);
      expect(s.run.stage).toBe('race');
      // one game after every floor but the last
      expect(runProgress(s)).toEqual({ stage: 'between', n: 1, total: s.run.floors.length - 1 });
    }
  });

  it('counts a shaft ride after a later floor the same way', () => {
    const s = runSim(1);
    enterFloor(s, s.run.floors.length - 2);
    clearFloor(s);
    expect(s.run.stage).not.toBe('floor');
    expect(runProgress(s)).toEqual({ stage: 'between', n: s.run.floors.length - 1, total: s.run.floors.length - 1 });
  });

  it('is on the floor again in the shop', () => {
    const s = runSim();
    s.run.stage = 'shop';
    expect(runProgress(s).stage).toBe('floor');
  });
});

describe('the floors cleared at the end of a run', () => {
  it('are counted out of the floors the run has, however many those are', () => {
    for (const extra of [0, 1, 2]) {
      const s = runSim(extra);
      const total = s.run.floors.length;
      enterFloor(s, 2);
      expect(floorsCleared(s)).toEqual({ cleared: 2, total });
      enterFloor(s, total - 1);
      s.phase = 'won';
      expect(floorsCleared(s)).toEqual({ cleared: total, total });
    }
  });

  it('are shown with that total on the result screen', () => {
    expect(t('result.floors', { n: 6, total: 6 })).toBe('Floors 6/6');
    expect(t('result.floors', { n: 2, total: 7 })).toBe('Floors 2/7');
  });

  it('show a game in between by its name and its own count', () => {
    expect(t('hud.between', { n: 1, total: 4, name: t('floor.race') })).toBe('Minigame 1/4 · Kart Rally');
  });
});
