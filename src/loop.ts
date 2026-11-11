import { DT } from './sim/types';

export const MAX_STEPS_PER_FRAME = 5;

export interface Loop {
  frame(nowMs: number): void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
}

/** Fixed-step accumulator: the sim always advances in DT steps, at most 5 per frame. */
export function createLoop(step: () => void, render: (alpha: number, frameDt: number) => void): Loop {
  let last: number | null = null;
  let acc = 0;
  let paused = false;

  return {
    frame(nowMs) {
      const frameDt = last === null ? 0 : Math.min(0.1, (nowMs - last) / 1000);
      const elapsed = last === null ? 0 : (nowMs - last) / 1000;
      last = nowMs;
      if (!paused) {
        acc += elapsed;
        let steps = 0;
        while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
          step();
          acc -= DT;
          steps++;
        }
        if (steps === MAX_STEPS_PER_FRAME) acc = 0;
      }
      render(acc / DT, frameDt);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = null;
      acc = 0;
    },
    get paused() {
      return paused;
    },
  };
}
