import { describe, expect, it } from 'vitest';
import { mergeInputs } from '../../src/net/session';
import { applySnapshot, encodeSnapshot } from '../../src/net/snapshot';
import { createSim } from '../../src/sim/sim';
import { floor01 } from '../../src/sim/config/floor01';

describe('review fixes (net)', () => {
  it('keeps an upgrade from an earlier batch when two arrive in one host tick', () => {
    const up = { type: 'upgrade' as const, playerId: 1, padId: 3 };
    const { cmds } = mergeInputs([[up], [{ type: 'move', playerId: 1, dir: { x: 0, z: 0 } }]], []);
    expect(cmds).toContainEqual(up);
  });

  it('ignores a snapshot map id that is not a known floor (e.g. "constructor")', () => {
    const host = createSim(floor01, 1);
    const view = createSim(floor01, 1);
    const snap = { ...encodeSnapshot(host), tick: 5, mapId: 'constructor' };
    applySnapshot(view, snap);
    expect(view.map.id).toBe('floor01');
  });
});
