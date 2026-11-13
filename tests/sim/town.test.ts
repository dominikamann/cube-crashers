import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { betweenOf, floorCleared, INTERMISSIONS, runProgress } from '../../src/sim/systems/run';
import { ladders } from '../../src/sim/map/ladders';
import { logoSpots } from '../../src/sim/map/logo-spots';
import { FLOORS } from '../../src/sim/config/floors';

describe('the games between the floors of a run', () => {
  it('are all different within a run, and not the same from run to run', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const list = betweenOf(seed, 5);
      expect(list).toHaveLength(4);
      expect(new Set(list).size, `seed ${seed}`).toBe(4);
      for (const g of list) expect(INTERMISSIONS).toContain(g);
      orders.add(list.join());
    }
    expect(orders.size).toBeGreaterThan(8);
    expect(betweenOf(7, 5)).toEqual(betweenOf(7, 5));
  });

  it('a run gets its order from its seed, or the one it is given', () => {
    expect(createSim(floor01, 7, { mode: 'run' }).run.between).toEqual(betweenOf(7, 5));
    expect(createSim(floor01, 7, { mode: 'run', between: ['town', 'race', 'lane', 'maze'] }).run.between).toEqual(['town', 'race', 'lane', 'maze']);
  });
});

describe('the Town as the game between two floors', () => {
  const town = () => {
    const s = createSim(floor01, 4, { mode: 'run', between: ['town', 'race', 'lane', 'maze'] });
    for (const n of s.nests) n.state = 'destroyed';
    s.enemies = [];
    floorCleared(s);
    return s;
  };

  it('is a boss fight on its own map, counted as a game in between, not as a floor', () => {
    const s = town();
    expect(s.map.id).toBe('waldsee');
    expect(s.run.stage).toBe('floor');
    expect(s.run.floor).toBe(0);
    expect(s.boss).not.toBeNull();
    expect(s.nests).toHaveLength(0);
    expect(runProgress(s)).toEqual({ stage: 'between', n: 1, total: 4 });
  });

  it('ends at its elevator once the boss has fallen: the shop opens, and the next floor of the run follows', () => {
    const s = town();
    for (const p of s.players) p.invulnUntil = 1e9;
    for (const e of s.enemies) e.hp = 0;
    for (let i = 0; i < 600 && !s.elevatorOpen; i++) stepSim(s, []);
    expect(s.elevatorOpen).toBe(true);
    for (const p of s.players) p.pos = { ...s.map.elevator };
    stepSim(s, []);
    expect(s.run.stage).toBe('shop');
    expect(s.run.floor).toBe(0);
    s.run.stageUntil = s.tick;
    for (let i = 0; i < 5 && s.run.stage === 'shop'; i++) stepSim(s, []);
    expect(s.run.stage).toBe('floor');
    expect(s.run.floor).toBe(1);
    expect(s.map.id).not.toBe('waldsee');
  });

  it('has no karts, no build pads, no ladders and no logos', () => {
    const m = FLOORS.waldsee.map;
    expect(m.vehicleSpots).toHaveLength(0);
    expect(m.pads).toHaveLength(0);
    expect(ladders(m)).toHaveLength(0);
    expect(logoSpots(m)).toHaveLength(0);
  });
});
