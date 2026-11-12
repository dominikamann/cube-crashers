import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { GUN_LADDER, versusDeath } from '../../src/sim/systems/versus';
import type { SimState } from '../../src/sim/types';
import { run } from './helpers';

function gunGame(players = 3, mode: 'ffa' | 'team' = 'ffa'): SimState {
  return createSim(floorNeon, 7, { mode: 'versus', players, versus: { mode, rule: 'gungame' } });
}

describe('gun game', () => {
  it('everyone starts with only the first weapon of the ladder; always free for all, no crates', () => {
    const s = gunGame(3, 'team');
    expect(s.versus!.mode).toBe('ffa');
    for (const p of s.players) expect(p.weapons.map(w => w.kind)).toEqual([GUN_LADDER[0]]);
    expect(s.crates).toHaveLength(0);
    run(s, 30 * 60);
    expect(s.crates).toHaveLength(0);
    expect(GUN_LADDER[GUN_LADDER.length - 1]).toBe('flySwatter');
  });

  it('a kill moves the killer one weapon up, and only that weapon is held; they keep it after a respawn', () => {
    const s = gunGame();
    const [a, b] = s.players;
    versusDeath(s, b, a.id);
    expect(a.weapons.map(w => w.kind)).toEqual([GUN_LADDER[1]]);
    expect(s.versus!.scores[a.id]).toBe(1);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'gunLevel', playerId: a.id, level: 1 }));
    versusDeath(s, a, b.id);
    expect(a.weapons.map(w => w.kind)).toEqual([GUN_LADDER[1]]);
  });

  it('a kill with the fly swatter wins, and getting swatted costs a step', () => {
    const s = gunGame();
    const [a, b] = s.players;
    s.versus!.scores[a.id] = GUN_LADDER.length - 1;
    a.weapons = [{ kind: 'flySwatter', level: 3, cooldown: 0 }];
    s.versus!.scores[b.id] = 3;
    versusDeath(s, b, a.id);
    expect(s.versus!.scores[b.id]).toBe(2);
    run(s, 2);
    expect(s.phase).toBe('won');
  });
});
