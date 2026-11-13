/**
 * Finds the graphics setting a machine can run smoothly: it tries the settings from the best down, measures the
 * frames a second for a moment each, and keeps the first one that is fast enough. While it runs the picture is
 * drawn twice per frame (see main.ts): the title scene it measures on is far quieter than a fight, so half the
 * headroom is held back for the hordes.
 */
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export const GFX_TEST = {
  /** from the best down */
  order: ['ultra', 'high', 'medium', 'low'] as Quality[],
  /** after a switch the picture needs a moment (shaders, buffers): not measured */
  settleMs: 500,
  measureMs: 1200,
  /** frames a second that count as smooth, with the picture drawn twice */
  smooth: 45,
};

export interface GraphicsTest {
  /** the setting to show right now */
  readonly quality: Quality;
  /** set once it is done: the setting to keep, and the frames a second measured on it */
  readonly result: { quality: Quality; fps: number } | null;
  /** how far along it is, 0 to 1 */
  readonly progress: number;
  /** call once per frame drawn, with the time in milliseconds */
  frame(nowMs: number): void;
}

export function createGraphicsTest(nowMs: number): GraphicsTest {
  let step = 0;
  let since = nowMs;
  let frames = 0;
  let measuringFrom = -1;
  let result: GraphicsTest['result'] = null;
  return {
    get quality() {
      return result?.quality ?? GFX_TEST.order[step];
    },
    get result() {
      return result;
    },
    get progress() {
      return result ? 1 : step / GFX_TEST.order.length;
    },
    frame(now) {
      if (result) return;
      if (now - since < GFX_TEST.settleMs) return;
      if (measuringFrom < 0) {
        measuringFrom = now;
        frames = 0;
        return;
      }
      frames++;
      if (now - measuringFrom < GFX_TEST.measureMs) return;
      const fps = (frames * 1000) / (now - measuringFrom);
      const last = step === GFX_TEST.order.length - 1;
      if (fps >= GFX_TEST.smooth || last) {
        result = { quality: GFX_TEST.order[step], fps };
        return;
      }
      step++;
      since = now;
      measuringFrom = -1;
    },
  };
}
