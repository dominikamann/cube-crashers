import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { WILD_WAKE } from '../../src/sim/systems/boss';
import { WILD, planWildBoss, releaseWildBoss } from '../../src/sim/systems/wild-boss';
import { enterFloor } from '../../src/sim/systems/run';
import type { SimState } from '../../src/sim/types';

/** a Tower Run on its second floor (the first one never has a wild boss) */
function secondFloor(seed: number): SimState {
  const s = createSim(floor01, seed, { mode: 'run', players: 1 });
  enterFloor(s, 1);
  return s;
}

describe('a wild boss in the Tower Run', () => {
  it('never shows up on the first floor', () => {
    for (let seed = 1; seed <= 20; seed++) expect(createSim(floor01, seed, { mode: 'run', players: 1 }).wild ?? null).toBeNull();
  });

  it('is planned on some nest floors, not on all, and is King Rex or the Rhino', () => {
    const kinds = new Set<string>();
    let none = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = secondFloor(seed);
      expect(s.run.floor).toBe(1);
      if (s.wild) kinds.add(s.wild.kind);
      else none++;
    }
    expect([...kinds].sort()).toEqual(['rex', 'rhino']);
    expect(none).toBeGreaterThan(5);
  });

  it('waits by the elevator once the last nest has fallen, until someone comes near; beating it leaves a crate', () => {
    const s = secondFloor(1);
    planWildBoss(s, true);
    expect(s.boss).toBeNull();
    // the team is at its last nest, far from the elevator
    const p = s.players[0];
    const far = (w: { x: number; z: number }) => Math.hypot(w.x - s.map.elevator.x, w.z - s.map.elevator.z);
    p.pos = { ...[...s.map.waypoints].sort((a, b) => far(b) - far(a))[0] };
    s.enemies = [];
    expect(releaseWildBoss(s)).toBe(true);
    expect(s.boss?.wild).toBe(true);
    expect(s.wild).toBeNull();
    const body = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    expect(body.maxHp).toBeLessThan(1600 * WILD.hp + 1);
    expect(Math.hypot(body.pos.x - s.map.elevator.x, body.pos.z - s.map.elevator.z)).toBeLessThan(10);
    // far away: it stands still and does not attack
    p.invulnUntil = 1e9;
    const at = { ...body.pos };
    for (let i = 0; i < 300; i++) stepSim(s, []);
    // (other monsters may nudge it a little)
    expect(Math.hypot(body.pos.x - at.x, body.pos.z - at.z)).toBeLessThan(1.5);
    expect(s.events.some(e => e.type === 'bossAttack')).toBe(false);
    expect(s.boss!.waiting).toBeDefined();
    // someone comes near: it goes for them
    p.pos = { x: body.pos.x, z: body.pos.z + WILD_WAKE - 1 };
    for (let i = 0; i < 120; i++) stepSim(s, []);
    expect(s.boss!.waiting).toBeUndefined();
    expect(body.speed).toBeGreaterThan(0);
    const crates = s.crates.length;
    body.hp = 0;
    stepSim(s, []);
    expect(s.boss).toBeNull();
    expect(s.crates.length).toBe(crates + 1);
  });

  it('without one the elevator opens with the last nest, as always', () => {
    const s = secondFloor(1);
    s.wild = null;
    expect(releaseWildBoss(s)).toBe(false);
  });
});
