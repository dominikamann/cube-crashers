import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { BOSS, WILD_WAKE } from '../../src/sim/systems/boss';
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
  it('is rare on the first floor and more likely the higher the team is', () => {
    const share = (floor: number) => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const s = createSim(floor01, seed, { mode: 'run', players: 1 });
        if (floor > 0) enterFloor(s, floor);
        if (s.wild) n++;
      }
      return n / 300;
    };
    const [first, second, fourth] = [share(0), share(1), share(3)];
    expect(first).toBeGreaterThan(0.05);
    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(fourth);
    expect(fourth).toBeLessThan(0.75);
    expect(WILD.chance).toEqual([...WILD.chance].sort((a, b) => a - b));
  });

  it('is never a boss this run has a floor for, and only one that suits the map', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++)
      for (const floor of [0, 1, 3]) {
        const s = createSim(floor01, seed, { mode: 'run', players: 1 });
        if (floor > 0) enterFloor(s, floor);
        if (!s.wild) continue;
        const own = s.run.floors.map(id => FLOORS[id].boss).filter(Boolean);
        expect(own).not.toContain(s.wild.kind);
        expect(WILD.fits[s.map.id]).toContain(s.wild.kind);
        seen.add(s.wild.kind);
      }
    expect(seen.has('rex')).toBe(true);
    expect(seen.has('rhino')).toBe(true);
    expect(seen.has('worm')).toBe(false);
    expect(seen.has('kraken')).toBe(false);
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
    expect(body.maxHp).toBeLessThan(BOSS.rexHp * WILD.hp + 1);
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
