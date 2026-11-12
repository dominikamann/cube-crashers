import { describe, expect, it } from 'vitest';
import { enterFloor } from '../../src/sim/systems/run';
import { floor01 } from '../../src/sim/config/floor01';
import { JETPACK } from '../../src/sim/config/rare';
import { BLOCKS_WALKER, isFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { addKart } from '../../src/sim/systems/vehicles';
import type { Command } from '../../src/sim/types';
import { move, quietSim, run } from './helpers';

const fly: Command = { type: 'fly', playerId: 0 };
const use: Command = { type: 'use', playerId: 0 };

function withJetpack(fuel = JETPACK.fuelTicks) {
  const s = quietSim();
  s.players[0].jetpack = true;
  s.players[0].jetFuel = fuel;
  return s;
}

describe('jetpack', () => {
  it('is picked up by walking over it', () => {
    const s = quietSim();
    s.jetpacks.push({ id: s.nextId++, pos: { ...s.players[0].pos } });
    stepSim(s, []);
    expect(s.players[0].jetFuel).toBe(JETPACK.fuelTicks);
    expect(s.jetpacks).toHaveLength(0);
    expect(s.events).toContainEqual({ type: 'jetpackPicked', playerId: 0 });
  });

  it('flies over a wall and burns fuel while flying', () => {
    const s = withJetpack();
    const p = s.players[0];
    p.pos = { x: 42.5, z: 60.5 };
    run(s, 60, () => [move(1, 0), fly]);
    expect(p.pos.x).toBeGreaterThan(46.5);
    // takes off after holding Space for takeoffTicks
    expect(p.jetFuel).toBe(JETPACK.fuelTicks - (60 - JETPACK.takeoffTicks + 1));
  });

  it('does not take contact or glitch damage while flying', () => {
    const s = withJetpack();
    const p = s.players[0];
    run(s, JETPACK.takeoffTicks, () => [fly]);
    p.pos = { x: 34.5, z: 34.5 };
    run(s, 60, () => [fly]);
    expect(p.hp).toBe(100);
  });

  it('let go of Space and you sink down gently, landing with a small stomp at the bottom', () => {
    const s = withJetpack();
    const p = s.players[0];
    run(s, 20, () => [fly]);
    expect(p.flying).toBe(true);
    stepSim(s, []);
    // still in the air, on the way down
    expect(p.flying).toBe(false);
    expect(p.descent).toBeGreaterThan(0);
    expect(s.events.some(e => e.type === 'stomp')).toBe(false);
    const events = run(s, JETPACK.descentTicks);
    expect(p.descent ?? 0).toBe(0);
    expect(events.some(e => e.type === 'stomp')).toBe(true);
  });

  it('holding Space again on the way down flies on', () => {
    const s = withJetpack();
    const p = s.players[0];
    run(s, 20, () => [fly]);
    stepSim(s, []);
    run(s, JETPACK.takeoffTicks + 1, () => [fly]);
    expect(p.flying).toBe(true);
    expect(p.descent ?? 0).toBe(0);
  });

  it('when the fuel runs out above a block, the player lands on top of it', () => {
    const s = withJetpack(8);
    const p = s.players[0];
    p.pos = { x: 43.4, z: 60.5 };
    const events = run(s, 20, () => [move(1, 0), fly]);
    // the drop down onto the block
    run(s, JETPACK.descentTicks);
    expect(events).toContainEqual({ type: 'jetpackEmpty', playerId: 0 });
    expect(p.flying).toBe(false);
    expect(p.jetFuel).toBeLessThan(JETPACK.fuelTicks / 10);
    expect(p.perched).toBe(true);
    expect(isFree(s.map, p.pos, 0.4, BLOCKS_WALKER), `${p.pos.x},${p.pos.z}`).toBe(false);
  });

  it('a tap of Space still jumps; holding it takes off', () => {
    const s = withJetpack();
    const p = s.players[0];
    stepSim(s, [{ type: 'jump', playerId: 0 }, fly]);
    expect(s.events.some(e => e.type === 'jump')).toBe(true);
    expect(p.flying).toBe(false);
    run(s, 15, () => [fly]);
    expect(p.flying).toBe(true);
  });

  it('stays on the back when the fuel runs out and refuels on the ground', () => {
    const s = withJetpack(20);
    const p = s.players[0];
    const events = run(s, 40, () => [fly]);
    expect(events).toContainEqual({ type: 'jetpackEmpty', playerId: 0 });
    expect(p.jetpack).toBe(true);
    run(s, JETPACK.descentTicks + JETPACK.rechargeTicks + 10);
    expect(p.jetFuel).toBe(JETPACK.fuelTicks);
  });

  it('is gone on the next floor', () => {
    const s = withJetpack();
    enterFloor(s, 0);
    expect(s.players[0].jetpack).toBe(false);
    expect(s.players[0].jetFuel).toBe(0);
  });

  it('cannot be used in a kart', () => {
    const s = withJetpack();
    const p = s.players[0];
    addKart(s, { ...p.pos }, 0);
    stepSim(s, [use]);
    run(s, 10, () => [fly]);
    expect(p.flying).toBe(false);
    expect(p.jetFuel).toBe(JETPACK.fuelTicks);
  });

  it('lies on a crate spot at the start and comes back later only when none is left on the map', () => {
    const fresh = createSim(floor01, 5);
    expect(fresh.jetpacks).toHaveLength(1);
    expect(fresh.map.crateSpots.some(c => c.x === fresh.jetpacks[0].pos.x && c.z === fresh.jetpacks[0].pos.z)).toBe(true);
    expect(fresh.crates.some(c => c.pos.x === fresh.jetpacks[0].pos.x && c.pos.z === fresh.jetpacks[0].pos.z)).toBe(false);

    const s = quietSim();
    s.nextJetpackAt = s.tick + 1;
    run(s, 2);
    expect(s.jetpacks).toHaveLength(1);
    s.nextJetpackAt = s.tick + 1;
    run(s, 2);
    expect(s.jetpacks).toHaveLength(1);
    expect(s.nextJetpackAt).toBeGreaterThan(s.tick + JETPACK.respawnTicks - 5);
  });
});
