import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { addVehicle, UNICORN, VEHICLES } from '../../src/sim/systems/vehicles';
import { move, quietSim, rel, run } from './helpers';

describe('the unicorn', () => {
  it('turns up now and then on its own, rarely, and says so', () => {
    const s = quietSim();
    s.vehicles = [];
    let seen = 0;
    for (let i = 0; i < 20; i++) {
      run(s, UNICORN.checkTicks);
      if (s.vehicles.some(v => v.kind === 'unicorn')) {
        seen++;
        s.vehicles = s.vehicles.filter(v => v.kind !== 'unicorn');
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(15);
  }, 90_000);

  it('is ridden like a kart, faster than one, and spears monsters with its horn', () => {
    expect(VEHICLES.unicorn.speed).toBeGreaterThan(VEHICLES.kart.speed);
    const s = quietSim();
    const p = s.players[0];
    const u = addVehicle(s, 'unicorn', rel(p.pos, 0.5, 0), 0);
    stepSim(s, [{ type: 'use', playerId: 0 }]);
    expect(p.vehicleId).toBe(u.id);
    const e = spawnEnemy(s, 'tank', rel(p.pos, 0, -4));
    e.speed = 0;
    const hp = e.hp;
    run(s, 40, () => [move(0, -1)]);
    expect(e.hp).toBeLessThan(hp);
  });

  it('a wrecked unicorn does not come back at a kart spot', () => {
    const s = quietSim();
    const u = addVehicle(s, 'unicorn', s.map.vehicleSpots[0], 0);
    u.hp = 0;
    stepSim(s, []);
    expect(s.vehicleRespawns.some(r => r.kind === 'unicorn')).toBe(false);
  });
});
