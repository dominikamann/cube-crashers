import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { FLOORS } from '../../src/sim/config/floors';
import { perchable } from '../../src/sim/map/perch';
import { createSim, stepSim } from '../../src/sim/sim';
import { HEART, heartSpot, placeHiddenHeart } from '../../src/sim/systems/heart';
import { dist } from '../../src/sim/util';
import { floorCleared } from '../../src/sim/systems/run';

describe('the hidden heart', () => {
  it('sits on top of a block you have to climb, far from the start, on every nest floor that has ladders', () => {
    for (const [id, def] of Object.entries(FLOORS)) {
      if (def.kind !== 'nests') continue;
      const at = heartSpot(def.map);
      expect(at, id).not.toBeNull();
      expect(perchable(def.map, at!.x, at!.z), id).toBe(true);
      expect(dist(at!, def.map.spawn), id).toBeGreaterThan(15);
    }
  });

  it('turns up only now and then in a Tower Run, never in a single floor or versus', () => {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) if (createSim(floor01, seed, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'] }).heart) seen++;
    expect(seen).toBeGreaterThan(40 * HEART.chance * 0.5);
    expect(seen).toBeLessThan(40 * HEART.chance * 1.6);
    expect(createSim(floor01, 3, { mode: 'quick' }).heart ?? null).toBeNull();
  });

  it('a heart nobody found is gone when the floor is cleared', () => {
    const s = createSim(floor01, 3, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'] });
    placeHiddenHeart(s, true);
    for (const n of s.nests) n.state = 'destroyed';
    s.enemies = [];
    floorCleared(s);
    expect(s.heart ?? null).toBeNull();
  });

  it('whoever stands on it gives everyone a life (never more than you start with) and brings back who was out', () => {
    const s = createSim(floor01, 3, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], players: 3 });
    placeHiddenHeart(s, true);
    const [a, b, c] = s.players;
    a.lives = 3;
    b.lives = 1;
    c.lives = 0;
    c.out = true;
    c.downUntil = Number.MAX_SAFE_INTEGER;
    a.invulnUntil = 1e9;
    // walking past below it does nothing: you have to be up there
    a.pos = { ...s.heart!.pos };
    stepSim(s, []);
    expect(s.heart).not.toBeNull();
    a.perched = true;
    stepSim(s, []);
    expect(s.heart).toBeNull();
    expect(s.events).toContainEqual({ type: 'heartFound', playerId: a.id });
    expect([a.lives, b.lives, c.lives]).toEqual([3, 2, 1]);
    expect(c.out).toBe(false);
    stepSim(s, []);
    stepSim(s, []);
    expect(c.downUntil).toBeNull();
    expect(s.credits).toBe(6);
  });
});
