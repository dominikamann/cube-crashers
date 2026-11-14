import { t } from '../i18n';
import { cssColor, playerColor } from '../render/palette';
import { FLOORS } from '../sim/config/floors';
import { TICK_RATE, type Player, type SimState } from '../sim/types';

/** one line of the board: a player and what the columns say of them */
export interface ScoreRow {
  id: number;
  name: string;
  color: number;
  bot: boolean;
  team?: 0 | 1;
  /** down, out of lives, or waiting for the next round */
  down: boolean;
  cells: number[];
}

export interface ScoreBoard {
  /** what the columns are called (i18n keys) */
  columns: string[];
  /** in a team match: red first, then blue, each with its score; else one group */
  groups: { team?: 0 | 1; score?: number; rows: ScoreRow[] }[];
}

/**
 * Who stands where, as the board shows it: in versus by points (in a round match by rounds won), with kills and
 * falls; in a co-op game by score, with kills, coins, how often someone helped another up and how often they fell.
 * The best first; in a team match red and blue apart.
 */
export function scoreBoard(s: SimState): ScoreBoard {
  const v = s.versus;
  const row = (p: Player, cells: number[]): ScoreRow => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot, team: p.team, down: p.downUntil !== null || !!p.out, cells });
  const sorted = (rows: ScoreRow[]) => rows.sort((a, b) => b.cells[0] - a.cells[0] || b.cells[1] - a.cells[1] || a.id - b.id);
  if (!v) {
    return { columns: ['board.score', 'board.kills', 'board.coins', 'board.revives', 'board.downs'], groups: [{ rows: sorted(s.players.map(p => row(p, [p.stats.score, p.stats.kills, p.stats.coins, p.stats.revives, p.stats.downs]))) }] };
  }
  const rounds = v.rule === 'rounds';
  const points = (p: Player) => (rounds ? (v.mode === 'team' ? 0 : (v.roundWins[p.id] ?? 0)) : (v.scores[p.id] ?? 0));
  // (in a team round match the rounds are the team's: its players are listed by their kills)
  const columns = rounds && v.mode === 'team' ? ['board.kills', 'board.downs'] : [rounds ? 'board.rounds' : v.rule === 'gungame' ? 'board.level' : 'board.points', 'board.kills', 'board.downs'];
  const cells = (p: Player) => (columns.length === 2 ? [p.stats.kills, p.stats.downs] : [points(p), p.stats.kills, p.stats.downs]);
  const rows = s.players.map(p => row(p, cells(p)));
  if (v.mode !== 'team') return { columns, groups: [{ rows: sorted(rows) }] };
  const teamScore = (team: 0 | 1) => (rounds ? (v.roundWins[team] ?? 0) : v.teamScores[team]);
  return { columns, groups: ([0, 1] as const).map(team => ({ team, score: teamScore(team), rows: sorted(rows.filter(r => r.team === team)) })) };
}

/**
 * The board on Tab, as in the shooters of old: held, it shows everyone in the game with their points, kills and
 * falls (in a co-op game their score, kills, coins and so on), the game and the map above it.
 */
export function createScoreboard(root: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'ui-layer scoreboard';
  layer.style.display = 'none';
  root.append(layer);
  const panel = document.createElement('div');
  panel.className = 'score-panel txt';
  layer.append(panel);
  let drawn = '';
  return {
    update(s: SimState, shown: boolean, me: number, title: string): void {
      layer.style.display = shown ? '' : 'none';
      if (!shown) {
        drawn = '';
        return;
      }
      const board = scoreBoard(s);
      const v = s.versus;
      const left = v && v.rule !== 'rounds' ? Math.max(0, Math.ceil((v.endsAt - s.tick) / TICK_RATE)) : null;
      const clock = left === null ? '' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      // (drawn anew only when something on it changed: it is held for seconds at a time)
      const key = JSON.stringify([board, title, s.map.id, clock, me]);
      if (key === drawn) return;
      drawn = key;
      panel.replaceChildren();
      const head = document.createElement('div');
      head.className = 'score-head';
      const add = (parent: HTMLElement, tag: string, cls: string, text: string) => {
        const e = document.createElement(tag);
        e.className = cls;
        e.textContent = text;
        parent.append(e);
        return e;
      };
      add(head, 'span', 'badge mode', title);
      add(head, 'span', 'badge map', t(FLOORS[s.map.id]?.name as 'floor.plaza'));
      if (v?.limit && v.rule !== 'rounds') add(head, 'span', 'badge', t('board.goal', { n: v.limit }));
      if (clock) add(head, 'span', 'badge live', clock);
      panel.append(head);
      for (const g of board.groups) {
        const table = document.createElement('div');
        table.className = `score-table${g.team === undefined ? '' : ` team${g.team}`}`;
        table.style.gridTemplateColumns = `minmax(0, 1fr) repeat(${board.columns.length}, minmax(64px, max-content))`;
        add(table, 'div', 'score-th name', g.team === undefined ? t('board.player') : `${t(g.team === 0 ? 'board.red' : 'board.blue')} · ${g.score ?? 0}`);
        for (const c of board.columns) add(table, 'div', 'score-th', t(c as 'board.kills'));
        for (const r of g.rows) {
          const cls = `${r.id === me ? ' me' : ''}${r.down ? ' down' : ''}`;
          const name = add(table, 'div', `score-td name${cls}`, '');
          const dot = add(name, 'i', 'score-dot', '');
          dot.style.background = cssColor(playerColor(r.color));
          add(name, 'span', '', r.name + (r.bot ? ' \u{1F916}' : ''));
          if (r.id === me) add(name, 'span', 'score-you', t('board.you'));
          r.cells.forEach((n, i) => add(table, 'div', `score-td${i === 0 ? ' first' : ''}${cls}`, String(Math.round(n))));
        }
        if (g.rows.length === 0) add(table, 'div', 'score-td name', '–');
        panel.append(table);
      }
    },
  };
}
