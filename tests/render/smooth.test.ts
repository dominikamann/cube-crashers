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
