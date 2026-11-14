import { describe, expect, it } from 'vitest';
import { applySnapshot, encodeSnapshot, serializeSnapshot } from '../../src/net/snapshot';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { FLOORS } from '../../src/sim/config/floors';
import { witchPounce } from '../../src/sim/systems/witch';

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
    const bytes = serializeSnapshot(host, []).length;
    expect(bytes).toBeLessThan(60_000);
  }, 30_000);
});

describe('floor changes over the network', () => {
  it('switch the client to the map of the new floor', async () => {
    const { enterFloor } = await import('../../src/sim/systems/run');
    const host = createSim(floor01, 3, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'] });
    const view = createSim(floor01, 3, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'] });
    stepSim(host, []);
    enterFloor(host, 1);
    stepSim(host, []);
    applySnapshot(view, JSON.parse(serializeSnapshot(host, [])).state);
    expect(view.map.id).toBe(host.map.id);
    expect(view.theme).toBe(host.theme);
    expect(view.run.floor).toBe(1);
  });

  it("carry the witch: her fire, her dance with the small ones, the player she presses and the twigs burning", () => {
    const host = createSim(FLOORS.waldsee.map, 4, { mode: 'quick', players: 2 });
    const body = host.enemies.find(e => e.id === host.boss!.enemyId)!;
    host.boss!.nextAttackAt = Number.MAX_SAFE_INTEGER;
    const roundTrip = () => {
      const view = createSim(floor01, 3, { players: 2 });
      expect(applySnapshot(view, JSON.parse(serializeSnapshot(host, [])).state)).toBe(true);
      return view;
    };
    // pressing a player
    host.players[0].pos = { x: body.pos.x + 4, z: body.pos.z };
    witchPounce(host, host.players[0]);
    for (let i = 0; i < 70; i++) stepSim(host, []);
    host.boss!.witch!.embers.push({ id: 900, pos: { x: 40, z: 50 }, radius: 1.1, from: host.tick, until: host.tick + 100 });
    let view = roundTrip();
    expect(view.map.id).toBe('waldsee');
    expect(view.boss!.kind).toBe('witch');
    expect(view.boss!.witch!.press?.playerId).toBe(0);
    expect(view.boss!.witch!.embers).toHaveLength(1);
    expect(view.boss!.witch!.fire).toEqual(host.boss!.witch!.fire);
    // dancing round the fire
    body.hp = body.maxHp * 0.6;
    for (let i = 0; i < 30; i++) stepSim(host, []);
    view = roundTrip();
    const w = view.boss!.witch!;
    expect(w.dance?.helpers).toEqual(host.boss!.witch!.dance!.helpers);
    expect(w.heat).toBeCloseTo(host.boss!.witch!.heat, 2);
    expect(view.enemies.filter(e => e.kind === 'witchling').map(e => e.id)).toEqual(host.boss!.witch!.dance!.helpers);
  });
});
