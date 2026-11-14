import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from '../../src/sim/config/balance';
import { FLOORS } from '../../src/sim/config/floors';
import { JETPACK } from '../../src/sim/config/rare';
import { WALDSEE_BARRIERS, WALDSEE_EXTRA_FENCES } from '../../src/sim/config/waldsee-town';
import { BLOCKS_AIR, BLOCKS_WALKER, isFree, nearestFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import type { Command, SimState } from '../../src/sim/types';
import { move } from './helpers';

const fly: Command = { type: 'fly', playerId: 0 };

/** the Town with nobody in it but the player, who has a full jetpack */
function town(): SimState {
  const s = createSim(FLOORS.waldsee.map, 4, { mode: 'quick' });
  s.enemies = [];
  s.hordes = [];
  s.boss = null;
  s.players[0].jetpack = true;
  s.players[0].jetFuel = JETPACK.fuelTicks;
  return s;
}

/** flies one way until the tank is empty and the player is down again; not `clear` if they were ever in a house
 *  or behind the end of the map (the low things in the streets one does fly over) */
function flight(s: SimState, dx: number, dz: number): { flew: boolean; clear: boolean } {
  const p = s.players[0];
  let flew = false, clear = true;
  for (let i = 0; i < JETPACK.fuelTicks + JETPACK.takeoffTicks + JETPACK.descentTicks + 10; i++) {
    stepSim(s, [move(dx, dz), fly]);
    flew ||= p.flying;
    if (!isFree(s.map, p.pos, PLAYER_RADIUS - 0.05, BLOCKS_AIR)) clear = false;
  }
  return { flew, clear };
}

describe('the jetpack in the Town', () => {
  it('lies there like on the other floors', () => {
    const s = town();
    s.players[0].jetpack = false;
    s.nextJetpackAt = s.tick;
    stepSim(s, []);
    expect(s.jetpacks).toHaveLength(1);
  });

  it('never carries anyone into a house: the flight stops at the fronts', () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const s = town();
      const from = { ...s.players[0].pos };
      const { flew, clear } = flight(s, dx, dz);
      expect(flew, `${dx},${dz}`).toBe(true);
      expect(clear, `${dx},${dz}`).toBe(true);
      expect(Math.hypot(s.players[0].pos.x - from.x, s.players[0].pos.z - from.z), `${dx},${dz}`).toBeGreaterThan(1);
    }
  });

  it('ends at every barrier: nobody flies on down the street behind it', () => {
    for (const b of WALDSEE_BARRIERS) {
      const s = town();
      const p = s.players[0];
      p.pos = nearestFree(s.map, { x: b.at[0] - b.dir[0] * 3, z: b.at[1] - b.dir[1] * 3 }, PLAYER_RADIUS, BLOCKS_WALKER);
      const { flew, clear } = flight(s, b.dir[0], b.dir[1]);
      expect(flew, `${b.at}`).toBe(true);
      expect(clear, `${b.at}`).toBe(true);
      expect((p.pos.x - b.at[0]) * b.dir[0] + (p.pos.z - b.at[1]) * b.dir[1], `${b.at}`).toBeLessThan(0.2);
    }
  });

  it('ends at the board fences as well', () => {
    for (const f of WALDSEE_EXTRA_FENCES) {
      const mid = { x: (f[0] + f[2]) / 2, z: (f[1] + f[3]) / 2 }, len = Math.hypot(f[2] - f[0], f[3] - f[1]);
      const n = { x: -(f[3] - f[1]) / len, z: (f[2] - f[0]) / len };
      for (const side of [1, -1]) {
        const s = town();
        const p = s.players[0];
        const from = { x: mid.x + n.x * side * 1.2, z: mid.z + n.z * side * 1.2 };
        // (only from the side one can stand on)
        if (!isFree(s.map, from, PLAYER_RADIUS, BLOCKS_WALKER)) continue;
        p.pos = from;
        const { clear } = flight(s, -n.x * side, -n.z * side);
        expect(clear, `${f}`).toBe(true);
        expect(((p.pos.x - mid.x) * n.x + (p.pos.z - mid.z) * n.z) * side, `${f}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the shop window of AmannLabs', () => {
  it('is as solid as the wall behind it: nobody walks into the glass case', () => {
    const m = FLOORS.waldsee.map;
    for (const x of [24, 25.2, 26, 27, 28.2]) expect(isFree(m, { x, z: 50.35 }, 0.1, BLOCKS_WALKER), `${x}`).toBe(false);
    const s = town();
    const p = s.players[0];
    p.pos = { x: 26, z: 52.5 };
    for (let i = 0; i < 120; i++) stepSim(s, [move(0, -1)]);
    expect(p.pos.z).toBeGreaterThan(50.7 + PLAYER_RADIUS - 0.05);
    // (the street in front of it stays open)
    expect(isFree(m, { x: 26, z: 51.3 }, PLAYER_RADIUS, BLOCKS_WALKER)).toBe(true);
  });
});
