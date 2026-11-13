import { describe, expect, it } from 'vitest';
import { createSmoother } from '../../src/render/smooth';
import type { SimState } from '../../src/sim/types';

const state = () => ({ tick: 0, players: [{ id: 0, pos: { x: 0, z: 0 } }], vehicles: [{ id: 7, pos: { x: 10, z: 0 } }] }) as unknown as SimState;

describe('smooth positions between sim ticks', () => {
  it('draws a kart between where it was and where it is, and puts the state back after', () => {
    const s = state();
    const smooth = createSmoother();
    smooth(s, 0)();
    s.tick = 1;
    s.vehicles[0].pos.x = 11;
    s.players[0].pos.z = 1;
    const restore = smooth(s, 0.5);
    expect(s.vehicles[0].pos.x).toBeCloseTo(10.5);
    expect(s.players[0].pos.z).toBeCloseTo(0.5);
    restore();
    expect(s.vehicles[0].pos.x).toBe(11);
    expect(s.players[0].pos.z).toBe(1);
  });

  it('does not slide across a teleport', () => {
    const s = state();
    const smooth = createSmoother();
    smooth(s, 0)();
    s.tick = 1;
    s.players[0].pos.x = 30;
    smooth(s, 0.5);
    expect(s.players[0].pos.x).toBe(30);
  });

  it('stands still while the game does (a pause, the countdown)', () => {
    const s = state();
    const smooth = createSmoother();
    smooth(s, 0)();
    s.tick = 1;
    s.vehicles[0].pos.x = 11;
    smooth(s, 0.9)();
    // the same tick again, the frame clock has wrapped: it has arrived
    smooth(s, 0.1);
    expect(s.vehicles[0].pos.x).toBe(11);
  });
});

describe('smooth positions when frames and ticks do not line up', () => {
  /** a kart at a steady 0.2 tiles a tick, drawn after `ticks` more ticks at `alpha` */
  const drive = (s: SimState, ticks: number) => {
    s.tick += ticks;
    s.vehicles[0].pos.x += 0.2 * ticks;
  };

  it('draws a kart one tick behind when two ticks fell into one frame (not two)', () => {
    const s = state();
    const smooth = createSmoother();
    smooth(s, 0)();
    drive(s, 1);
    smooth(s, 0.9)();
    drive(s, 2);
    // tick 3 at 10.6, tick 2 at 10.4: a tenth of the way from tick 2 to tick 3
    smooth(s, 0.1);
    expect(s.vehicles[0].pos.x).toBeCloseTo(10.42);
  });

  it('moves a steadily driving kart the same distance for the same time, whatever the frames do', () => {
    const s = state();
    const smooth = createSmoother();
    smooth(s, 0)();
    // frames of 1.3 ticks each: sometimes one tick in a frame, sometimes two
    let clock = 0, done = 0;
    const drawn: number[] = [];
    for (let frame = 0; frame < 40; frame++) {
      clock += 1.3;
      const ticks = Math.floor(clock) - done;
      done += ticks;
      drive(s, ticks);
      const restore = smooth(s, clock - done);
      drawn.push(s.vehicles[0].pos.x);
      restore();
    }
    for (let i = 2; i < drawn.length; i++) expect(drawn[i] - drawn[i - 1]).toBeCloseTo(0.26, 5);
  });

  it('glides between the snapshots of a LAN game, which come every other tick and not in step with the frames', () => {
    const s = state();
    const smooth = createSmoother();
    const drawn: number[] = [];
    // 60 frames a second, a snapshot on every second frame; the frame clock sits anywhere in its tick
    for (let frame = 0; frame < 80; frame++) {
      if (frame % 2 === 0) drive(s, 2);
      const restore = smooth(s, 0.37, { frameDt: 1 / 60 });
      drawn.push(s.vehicles[0].pos.x);
      restore();
    }
    for (let i = 40; i < drawn.length; i++) expect(drawn[i] - drawn[i - 1]).toBeCloseTo(0.2, 2);
  });

  it('never draws a LAN kart ahead of the newest snapshot or back where it has been', () => {
    const s = state();
    const smooth = createSmoother();
    let last = -Infinity;
    for (let frame = 0; frame < 120; frame++) {
      // snapshots late and early by turns
      if (frame % 2 === 0 && frame % 14 !== 6) drive(s, frame % 14 === 8 ? 4 : 2);
      const restore = smooth(s, (frame * 0.618) % 1, { frameDt: 1 / 60 });
      const x = s.vehicles[0].pos.x;
      restore();
      expect(x).toBeGreaterThanOrEqual(last - 1e-9);
      expect(x).toBeLessThanOrEqual(s.vehicles[0].pos.x + 1e-9);
      last = x;
    }
  });
});
