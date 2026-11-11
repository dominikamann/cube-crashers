import { createSim, stepSim } from '../../src/sim/sim';
import { map01 } from '../../src/sim/config/map01';
import type { SimEvent, SimState } from '../../src/sim/types';

/** A sim with wave spawning disabled so tests control every enemy. */
export function quietSim(seed = 7): SimState {
  const s = createSim(map01, seed);
  stepSim(s, []);
  s.wave.spawnQueue = [];
  s.wave.pauseUntil = Number.MAX_SAFE_INTEGER;
  return s;
}

export function run(s: SimState, ticks: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    stepSim(s, []);
    all.push(...s.events);
  }
  return all;
}
