import { describe, expect, it } from 'vitest';
import { KILLCAM, KillCamRecorder } from '../src/killcam';
import { floorNeon } from '../src/sim/config/floor-neon';
import { createSim, stepSim } from '../src/sim/sim';
import { TICK_RATE } from '../src/sim/types';

function match() {
  return createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
}

describe('the kill cam', () => {
  it('keeps only the last few seconds', () => {
    const s = match();
    const rec = new KillCamRecorder();
    for (let i = 0; i < 10 * TICK_RATE; i++) {
      stepSim(s, [{ type: 'move', playerId: 1, dir: { x: 1, z: 0 } }]);
      rec.record(s, s.events);
    }
    expect(rec.seconds()).toBeLessThanOrEqual(KILLCAM.seconds + 0.05);
    expect(rec.seconds()).toBeGreaterThan(KILLCAM.seconds - 0.1);
  });

  it('plays the recorded seconds back: the replay moves like the match did, and then ends', () => {
    const s = match();
    const rec = new KillCamRecorder();
    const b = s.players[1];
    const start = { ...b.pos };
    for (let i = 0; i < 3 * TICK_RATE; i++) {
      stepSim(s, [{ type: 'move', playerId: 1, dir: { x: 1, z: 0 } }]);
      rec.record(s, s.events);
    }
    const play = rec.start(b.id)!;
    expect(play.killerId).toBe(b.id);
    const first = { ...play.state.players.find(p => p.id === b.id)!.pos };
    let steps = 0;
    while (play.advance(1 / 60)) steps++;
    const last = play.state.players.find(p => p.id === b.id)!.pos;
    // the replay starts near where the recording began and ends where the match was
    expect(Math.abs(first.x - start.x)).toBeLessThan(Math.abs(last.x - start.x));
    expect(last.x).toBeCloseTo(b.pos.x, 1);
    // at the speed of the match (it lasts as long as the wait to come back)
    expect(steps / 60).toBeGreaterThan(rec.seconds() / KILLCAM.speed - 0.1);
    expect(steps / 60).toBeLessThan(rec.seconds() / KILLCAM.speed + 0.1);
  });

  it('hands the shots and blasts of each moment to the screen', () => {
    const s = match();
    const rec = new KillCamRecorder();
    rec.record(s, [{ type: 'explosion', pos: { x: 3, z: 3 }, radius: 2 }]);
    stepSim(s, []);
    rec.record(s, []);
    const play = rec.start(0)!;
    play.advance(1 / 60);
    expect(play.takeEvents()).toContainEqual({ type: 'explosion', pos: { x: 3, z: 3 }, radius: 2 });
  });

  it('nothing to show without a recording', () => {
    expect(new KillCamRecorder().start(1)).toBeNull();
  });
});
