import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { versusDeath } from '../../src/sim/systems/versus';
import type { KeepWeapons, SimState, VersusRule } from '../../src/sim/types';

function match(keep: KeepWeapons | undefined, rule: VersusRule = 'score'): SimState {
  const s = createSim(floorNeon, 7, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule, keep } });
  const [a] = s.players;
  a.weapons = [
    { kind: 'pixelBlaster', level: 2, cooldown: 0 },
    { kind: 'candyCannon', level: 3, cooldown: 0 },
    { kind: 'bomb', level: 1, cooldown: 0 },
  ];
  a.jetpack = true;
  return s;
}
const held = (s: SimState) => s.players[0].weapons.map(w => [w.kind, w.level]);
const dropped = (s: SimState) => s.offers.flatMap(o => o.cards.map(c => ('weapon' in c ? c.weapon : null)));

describe('weapons after a fall in versus', () => {
  it('by default they are gone: a blaster again, the best two lie where one fell', () => {
    const s = match(undefined);
    versusDeath(s, s.players[0], s.players[1].id);
    expect(held(s)).toEqual([['pixelBlaster', 1]]);
    expect(dropped(s).sort()).toEqual(['bomb', 'candyCannon']);
  });

  it('"keep" brings every weapon back with its level, and nothing is dropped', () => {
    const s = match('all');
    const jetpacks = s.jetpacks.length;
    versusDeath(s, s.players[0], s.players[1].id);
    expect(held(s)).toEqual([['pixelBlaster', 2], ['candyCannon', 3], ['bomb', 1]]);
    expect(dropped(s)).toEqual([]);
    // (the jetpack and a rare weapon still go with the fall: the jetpack lies where one fell, for anyone)
    expect(s.players[0].jetpack).toBe(false);
    expect(s.jetpacks).toHaveLength(jetpacks + 1);
  });

  it('"one level less" brings them back a level lower; one at its first level is lost, the blaster never', () => {
    const s = match('level');
    versusDeath(s, s.players[0], s.players[1].id);
    expect(held(s)).toEqual([['pixelBlaster', 1], ['candyCannon', 2]]);
    // (the bomb, at its first level, is lost to its owner: it lies there like any dropped weapon)
    expect(dropped(s)).toEqual(['bomb']);
    const again = match('level');
    again.players[0].weapons = [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }];
    versusDeath(again, again.players[0], again.players[1].id);
    expect(held(again)).toEqual([['pixelBlaster', 1]]);
  });

  it('Last Cube Standing: what one had is there again in the next round', () => {
    const s = match('all', 'rounds');
    versusDeath(s, s.players[0], s.players[1].id);
    expect(held(s)).toEqual([['pixelBlaster', 2], ['candyCannon', 3], ['bomb', 1]]);
  });

  it('Gun Game keeps its ladder whatever is set', () => {
    const s = match('all', 'gungame');
    versusDeath(s, s.players[0], s.players[1].id);
    expect(s.players[0].weapons).toHaveLength(1);
  });
});
