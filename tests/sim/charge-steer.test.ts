import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { CHARGE_STEER, spawnEnemy } from '../../src/sim/systems/enemies';

describe('a charge follows its target a little', () => {
  it('turns toward a player who steps aside, but only slowly', () => {
    const s = createSim(FLOORS.arena.map, 2, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.boss = null;
    const p = s.players[0];
    const e = spawnEnemy(s, 'rammer', { x: p.pos.x - 8, z: p.pos.z });
    // the player stands off to one side of the lane
    p.pos.z += 3;
    e.state = 'charge';
    e.dir = { x: 1, z: 0 };
    e.chargeLeft = 12;
    const ticks = 20;
    for (let i = 0; i < ticks; i++) stepSim(s, []);
    const turned = Math.atan2(e.dir.z, e.dir.x);
    expect(turned).toBeGreaterThan(0.05);
    expect(turned).toBeLessThanOrEqual((CHARGE_STEER * ticks) / 60 + 1e-6);
  });
});
