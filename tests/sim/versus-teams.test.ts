import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { balanceTeams } from '../../src/sim/systems/versus';

describe('team balance', () => {
  it('wishes first, then auto players to the smaller team, then bots evening it out', () => {
    const teams = balanceTeams([
      { id: 0, wish: 0 },
      { id: 1, wish: 0 },
      { id: 1000, bot: true },
      { id: 1001, bot: true },
    ]);
    expect(teams).toEqual({ 0: 0, 1: 0, 1000: 1, 1001: 1 });
  });

  it('players without a wish are spread evenly', () => {
    const teams = balanceTeams([{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }]);
    const red = Object.values(teams).filter(t => t === 0).length;
    expect(red).toBe(2);
  });

  it('two humans can play against each other', () => {
    const teams = balanceTeams([{ id: 0, wish: 0 }, { id: 1, wish: 1 }, { id: 1000, bot: true }, { id: 1001, bot: true }]);
    expect(teams[0]).not.toBe(teams[1]);
    expect(Object.values(teams).filter(t => t === 0)).toHaveLength(2);
  });

  it('a versus match uses the given teams', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 4, versus: { mode: 'team', rule: 'score', teams: { 0: 0, 1: 0, 2: 1, 3: 1 } } });
    expect(s.players.map(p => p.team)).toEqual([0, 0, 1, 1]);
  });
});
