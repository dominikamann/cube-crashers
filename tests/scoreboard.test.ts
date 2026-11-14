import { describe, expect, it } from 'vitest';
import { FLOORS } from '../src/sim/config/floors';
import { floor01 } from '../src/sim/config/floor01';
import { createSim } from '../src/sim/sim';
import { scoreBoard } from '../src/ui/scoreboard';

describe('the board on Tab', () => {
  it('a co-op game: everyone by score, with kills, coins, helping up and falls', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 3, names: ['Ann', 'Ben', 'Cy'] });
    s.players[1].stats.score = 500;
    s.players[1].stats.kills = 9;
    s.players[2].stats.score = 500;
    s.players[2].stats.kills = 12;
    s.players[0].stats.coins = 40;
    const b = scoreBoard(s);
    expect(b.columns).toEqual(['board.score', 'board.kills', 'board.coins', 'board.revives', 'board.downs']);
    expect(b.groups).toHaveLength(1);
    // (the same score: who has more kills stands higher)
    expect(b.groups[0].rows.map(r => r.name)).toEqual(['Cy', 'Ben', 'Ann']);
    expect(b.groups[0].rows[2].cells).toEqual([0, 0, 40, 0, 0]);
  });

  it('free for all: by points, with kills and falls; a bot is marked and who is down too', () => {
    const s = createSim(FLOORS.neon.map, 1, { mode: 'versus', versus: { mode: 'ffa', rule: 'score' }, players: 3, ids: [1, 2, 1000], names: ['Ann', 'Ben', 'Bot'], bots: [false, false, true] });
    s.versus!.scores = { 1: 2, 2: 5, 1000: 3 };
    s.players[0].stats.downs = 4;
    s.players[0].downUntil = 99;
    const b = scoreBoard(s);
    expect(b.columns).toEqual(['board.points', 'board.kills', 'board.downs']);
    expect(b.groups[0].rows.map(r => [r.name, r.cells[0]])).toEqual([['Ben', 5], ['Bot', 3], ['Ann', 2]]);
    expect(b.groups[0].rows[1].bot).toBe(true);
    expect(b.groups[0].rows[2]).toMatchObject({ down: true, cells: [2, 0, 4] });
  });

  it('teams: red and blue apart, each with its score', () => {
    const s = createSim(FLOORS.neon.map, 1, { mode: 'versus', versus: { mode: 'team', rule: 'score', teams: { 0: 0, 1: 1, 2: 0, 3: 1 } }, players: 4 });
    s.versus!.teamScores = [7, 4];
    s.versus!.scores = { 0: 3, 1: 1, 2: 4, 3: 3 };
    const b = scoreBoard(s);
    expect(b.groups.map(g => [g.team, g.score, g.rows.map(r => r.id)])).toEqual([[0, 7, [2, 0]], [1, 4, [3, 1]]]);
  });

  it('gun game counts levels, last cube standing rounds won', () => {
    const gun = createSim(FLOORS.neon.map, 1, { mode: 'versus', versus: { mode: 'ffa', rule: 'gungame' }, players: 2 });
    expect(scoreBoard(gun).columns[0]).toBe('board.level');
    const rounds = createSim(FLOORS.neon.map, 1, { mode: 'versus', versus: { mode: 'ffa', rule: 'rounds' }, players: 2 });
    rounds.versus!.roundWins = { 1: 2 };
    const b = scoreBoard(rounds);
    expect(b.columns[0]).toBe('board.rounds');
    expect(b.groups[0].rows[0]).toMatchObject({ id: 1, cells: [2, 0, 0] });
  });
});
