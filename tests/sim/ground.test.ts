import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim } from '../../src/sim/sim';
import { clearSpot, groundItems, ITEM_GAP } from '../../src/sim/systems/ground';
import { damageEnemy } from '../../src/sim/systems/combat';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { dist } from '../../src/sim/util';

describe('things on the floor lie apart', () => {
  it('a free spot stays where it is', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
    s.crates = [];
    s.powerups = [];
    s.jetpacks = [];
    const at = { ...s.map.spawn };
    expect(clearSpot(s, at)).toEqual(at);
  });

  it('a spot that is taken moves next to it, onto free floor', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
    s.crates = [];
    s.powerups = [];
    const at = { ...s.map.spawn };
    s.jetpacks = [{ id: s.nextId++, pos: { ...at } }];
    const moved = clearSpot(s, at);
    expect(dist(moved, at)).toBeGreaterThanOrEqual(ITEM_GAP);
    expect(dist(moved, at)).toBeLessThan(4);
  });

  it('the crate of an elite does not land on a jetpack', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
    s.crates = [];
    const at = { ...s.map.spawn };
    s.jetpacks = [{ id: s.nextId++, pos: { ...at } }];
    const e = spawnEnemy(s, 'blob', at);
    e.elite = true;
    damageEnemy(s, e, 1e6, 'pixelBlaster');
    expect(s.crates).toHaveLength(1);
    const all = groundItems(s);
    for (const a of all) for (const b of all) if (a !== b) expect(dist(a, b)).toBeGreaterThanOrEqual(ITEM_GAP);
  });
});
