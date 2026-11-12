import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import { addVehicle } from '../../src/sim/systems/vehicles';
import { quietSim, rel } from './helpers';

describe('picking things up from a kart or unicorn', () => {
  for (const kind of ['kart', 'unicorn'] as const) {
    it(`${kind}: driving over a crate opens it, and over a jetpack, a coin and a power-up takes them`, () => {
      const s = quietSim();
      const p = s.players[0];
      const v = addVehicle(s, kind, { ...p.pos }, 0);
      v.driverId = p.id;
      p.vehicleId = v.id;
      const put = (dx: number) => rel(p.pos, dx, 0);
      s.crates.push({ id: s.nextId++, pos: put(1.5) });
      s.jetpacks.push({ id: s.nextId++, pos: put(3) });
      s.coins.push({ id: s.nextId++, pos: put(4.5), value: 5, expiresAt: s.tick + 6000 });
      s.powerups.push({ id: s.nextId++, kind: 'heart', pos: put(6), expiresAt: s.tick + 6000 });
      p.hp = 50;
      const coins = p.coins;
      for (let i = 0; i < 90; i++) stepSim(s, [{ type: 'move', playerId: p.id, dir: { x: 1, z: 0 } }]);
      expect(s.crates, 'crate').toHaveLength(0);
      expect(p.jetpack, 'jetpack').toBe(true);
      expect(p.coins, 'coin').toBeGreaterThan(coins);
      expect(s.powerups, 'power-up').toHaveLength(0);
    });
  }
});
