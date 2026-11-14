import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import type { Command } from '../../src/sim/types';
import { quietSim } from './helpers';

const rareKey: Command = { type: 'select', playerId: 0, slot: -1 };

describe('the rare weapon key', () => {
  it('goes on to the next weapon when there is no rare weapon, round and round, one step per press', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons.push({ kind: 'bomb', level: 1, cooldown: 0 }, { kind: 'laserSword', level: 1, cooldown: 0 });
    const picked: number[] = [];
    for (let i = 0; i < 4; i++) {
      stepSim(s, [rareKey]);
      picked.push(p.selected);
      expect(s.events).toContainEqual({ type: 'weaponSelected', playerId: 0, slot: p.selected });
    }
    expect(picked).toEqual([1, 2, 0, 1]);
    // (two quick presses are two steps, whatever the one who pressed has seen of the first)
    stepSim(s, [rareKey]);
    stepSim(s, [rareKey]);
    expect(p.selected).toBe(0);
  });

  it('picks the rare weapon as before when there is one, and does nothing with a single weapon', () => {
    const s = quietSim();
    const p = s.players[0];
    stepSim(s, [rareKey]);
    expect(s.events.some(e => e.type === 'weaponSelected')).toBe(false);
    p.weapons.push({ kind: 'bomb', level: 1, cooldown: 0 });
    p.rare = { kind: 'slushMachine', until: 1e9, cooldown: 0 };
    stepSim(s, [rareKey]);
    expect(p.rareSelected).toBe(true);
    expect(p.selected).toBe(0);
  });
});
