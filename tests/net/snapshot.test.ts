import { describe, expect, it } from 'vitest';
import { applySnapshot, encodeSnapshot } from '../../src/net/snapshot';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';

describe('snapshots', () => {
  it('carry everything the client draws, rounded, through JSON', () => {
    const host = createSim(floor01, 3, { players: 2 });
    for (let i = 0; i < 400; i++) stepSim(host, [{ type: 'move', playerId: 1, dir: { x: 1, z: 0 } }]);
    const wire = JSON.parse(JSON.stringify(encodeSnapshot(host)));
    const view = createSim(floor01, 3, { players: 2 });
    expect(applySnapshot(view, wire)).toBe(true);
    expect(view.tick).toBe(host.tick);
    expect(view.enemies).toHaveLength(host.enemies.length);
    expect(view.players[1].pos.x).toBeCloseTo(host.players[1].pos.x, 2);
    expect(view.enemies[5].pos.z).toBeCloseTo(host.enemies[5].pos.z, 2);
    expect(view.nests.map(n => n.state)).toEqual(host.nests.map(n => n.state));
    expect(view.credits).toBe(host.credits);
    expect(view.alarm.level).toBe(host.alarm.level);
  });

  it('are ignored when they are older than what the client already shows', () => {
    const host = createSim(floor01, 3);
    stepSim(host, []);
    const older = JSON.parse(JSON.stringify(encodeSnapshot(host)));
    stepSim(host, []);
    const newer = JSON.parse(JSON.stringify(encodeSnapshot(host)));
    const view = createSim(floor01, 3);
    expect(applySnapshot(view, newer)).toBe(true);
    expect(applySnapshot(view, older)).toBe(false);
    expect(view.tick).toBe(newer.tick);
  });

  it('stay small enough for the LAN with a full map', () => {
    const host = createSim(floor01, 3, { players: 6 });
    host.alarm.level = 5;
    for (let i = 0; i < 3000; i++) stepSim(host, []);
    const bytes = JSON.stringify(encodeSnapshot(host)).length;
    expect(bytes).toBeLessThan(60_000);
  });
});
