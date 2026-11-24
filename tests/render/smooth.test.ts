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

  it('turns a player and slides its crosshair between the ticks as it does the body, and puts them back after', () => {
    const s = state();
    const p = s.players[0] as unknown as { aim: { x: number; z: number }; aimPoint: { x: number; z: number } };
    p.aim = { x: 0, z: 1 };
    p.aimPoint = { x: 0, z: 4 };
    const smooth = createSmoother();
    smooth(s, 0)();
    s.tick = 1;
    // a quarter turn to the right, the crosshair along with it
    p.aim = { x: 1, z: 0 };
    p.aimPoint = { x: 4, z: 0 };
    const restore = smooth(s, 0.5);
    expect(p.aim.x).toBeCloseTo(Math.SQRT1_2);
    expect(p.aim.z).toBeCloseTo(Math.SQRT1_2);
    expect(p.aimPoint.x).toBeCloseTo(2);
    expect(p.aimPoint.z).toBeCloseTo(2);
    restore();
    expect(p.aim).toEqual({ x: 1, z: 0 });
    expect(p.aimPoint).toEqual({ x: 4, z: 0 });
  });

  it('turns the short way round, not through a whole circle', () => {
    const s = state();
    const p = s.players[0] as unknown as { aim: { x: number; z: number } };
    // from a little left of straight back to a little right of it
    p.aim = { x: -0.1, z: -1 };
    const smooth = createSmoother();
    smooth(s, 0)();
    s.tick = 1;
    p.aim = { x: 0.1, z: -1 };
    smooth(s, 0.5);
    expect(p.aim.x).toBeCloseTo(0);
    expect(p.aim.z).toBeCloseTo(-1);
  });

  it('leaves a player alone that has no aim yet', () => {
    const s = state();
    const smooth = createSmoother();
    smooth(s, 0)();
    s.tick = 1;
    s.players[0].pos.z = 1;
    smooth(s, 0.5);
    expect(s.players[0].pos.z).toBeCloseTo(0.5);
    expect((s.players[0] as unknown as { aim?: unknown }).aim).toBeUndefined();
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

  it('over a shaky line waits longer, so a kart keeps moving through the pauses between bursts of snapshots', () => {
    const s = state();
    const smooth = createSmoother();
    const drawn: number[] = [];
    for (let frame = 0; frame < 600; frame++) {
      // every half second: snapshots for a third of a second, then nothing, then the missed ones all at once
      const cycle = frame % 30;
      if (cycle < 20 && cycle % 2 === 0) drive(s, 2);
      if (cycle === 29) drive(s, 10);
      const restore = smooth(s, 0.5, { frameDt: 1 / 60 });
      drawn.push(s.vehicles[0].pos.x);
      restore();
    }
    // once it has seen how the line goes, the kart never stands still
    for (let i = 300; i < drawn.length; i++) expect(drawn[i] - drawn[i - 1]).toBeGreaterThan(0.05);
  });

  it('does not take the opening countdown for a shaky line: afterwards it draws as close behind as ever', () => {
    const s = state();
    const smooth = createSmoother();
    const lag: number[] = [];
    for (let frame = 0; frame < 400; frame++) {
      // five seconds of countdown with the host's ticks standing still, then snapshots every other tick
      s.countdown = frame < 300 ? 300 - frame : 0;
      if (frame >= 300 && frame % 2 === 0) drive(s, 2);
      const restore = smooth(s, 0.5, { frameDt: 1 / 60 });
      const drawn = s.vehicles[0].pos.x;
      restore();
      lag.push(s.vehicles[0].pos.x - drawn);
    }
    // the newest snapshot is never more than a few ticks ahead of what is drawn
    for (let i = 340; i < lag.length; i++) expect(lag[i]).toBeLessThan(0.2 * 4);
  });

  it('keeps the longer wait it learned when late snapshots trickle in one by one after a stall', () => {
    const s = state();
    const smooth = createSmoother();
    const drawn: number[] = [];
    for (let frame = 0; frame < 900; frame++) {
      // every second: snapshots for two thirds of it, then a fifth of a second of nothing, then the late ones one
      // per frame until it has caught up
      const cycle = frame % 60;
      if (cycle < 40 && cycle % 2 === 0) drive(s, 2);
      if (cycle >= 52) drive(s, cycle === 59 ? 6 : 2);
      const restore = smooth(s, 0.5, { frameDt: 1 / 60 });
      drawn.push(s.vehicles[0].pos.x);
      restore();
    }
    for (let i = 600; i < drawn.length; i++) expect(drawn[i] - drawn[i - 1]).toBeGreaterThan(0.05);
  });
});
