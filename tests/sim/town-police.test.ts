import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { BLOCKS_KART, isFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { SIREN_TICKS, UNICORN, VEHICLES } from '../../src/sim/systems/vehicles';
import type { Command, SimState } from '../../src/sim/types';
import { move } from './helpers';

const use: Command = { type: 'use', playerId: 0 };

/** the Town with nobody in it but the player, who stands by the police car */
function town(): SimState {
  const s = createSim(FLOORS.waldsee.map, 4, { mode: 'quick' });
  s.enemies = [];
  s.hordes = [];
  s.boss = null;
  s.players[0].pos = { x: 62.3, z: 46.5 };
  return s;
}

describe('the police car of the Town', () => {
  it('stands in front of the station, the only vehicle there, with room to pull away', () => {
    const s = town();
    expect(s.vehicles.map(v => v.kind)).toEqual(['police']);
    expect(s.vehicles[0].pos).toEqual({ x: 63.5, z: 46.5 });
    expect(isFree(s.map, s.vehicles[0].pos, VEHICLES.police.radius, BLOCKS_KART)).toBe(true);
    // (where it used to be parked for good one can walk and drive now)
    expect(isFree(s.map, { x: 64.5, z: 47 }, 0.4, BLOCKS_KART)).toBe(true);
  });

  it('is driven like a kart: get in with the use key, drive off, get out again', () => {
    const s = town();
    const p = s.players[0], car = s.vehicles[0];
    stepSim(s, [use]);
    expect(p.vehicleId).toBe(car.id);
    for (let i = 0; i < 60; i++) stepSim(s, [move(-1, 0)]);
    expect(car.pos.x).toBeLessThan(60);
    expect(p.pos).toEqual(car.pos);
    stepSim(s, [use]);
    expect(p.vehicleId).toBeNull();
    expect(car.driverId).toBeNull();
  });

  it('its siren sounds as soon as someone is in it, again and again, and is quiet when they get out', () => {
    const s = town();
    const sirens = (ticks: number, cmds: () => Command[] = () => []) => {
      let n = 0;
      for (let i = 0; i < ticks; i++) {
        stepSim(s, cmds());
        n += s.events.filter(e => e.type === 'siren').length;
      }
      return n;
    };
    expect(sirens(SIREN_TICKS)).toBe(0);
    stepSim(s, [use]);
    expect(s.events.some(e => e.type === 'siren')).toBe(true);
    expect(sirens(SIREN_TICKS * 3)).toBe(3);
    stepSim(s, [use]);
    expect(sirens(SIREN_TICKS * 2)).toBe(0);
  });

  it('no unicorn takes its place while it is out', () => {
    const s = town();
    s.vehicles[0].pos = { x: 50.5, z: 55.5 };
    for (let i = 0; i < 12; i++) {
      s.nextUnicornAt = s.tick;
      stepSim(s, []);
    }
    expect(UNICORN.chance).toBeGreaterThan(0);
    expect(s.vehicles.map(v => v.kind)).toEqual(['police']);
  });
});
