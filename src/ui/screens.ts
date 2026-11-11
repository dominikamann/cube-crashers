import { t } from '../i18n';
import type { LobbyPlayer } from '../net/protocol';
import { PLAYER_COLORS } from '../render/actors';
import { GRAPHICS_QUALITIES, type GraphicsQuality } from '../render/renderer';
import { DIFFICULTIES } from '../sim/config/difficulty';
import type { Difficulty } from '../sim/types';

export interface Settings {
  music: number;
  sfx: number;
  name: string;
  difficulty: Difficulty;
  /** on foot, W walks toward the crosshair instead of up the screen (karts never steer with the mouse) */
  steerWithMouse: boolean;
  graphics: GraphicsQuality;
  damageNumbers: boolean;
  /** suit colour 0–5, or null for automatic */
  color: number | null;
}

const SETTINGS_KEY = 'cube-crashers.settings';
const SCORES_KEY = 'cube-crashers.scores';
const DEFAULTS: Settings = { music: 0.8, sfx: 0.9, name: '', difficulty: 'medium', steerWithMouse: true, graphics: 'high', damageNumbers: true, color: null };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // storage unavailable: use defaults
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: settings only last for this session
  }
}

/** Adds a score to the local top 5 of this difficulty and returns the list (highest first). */
export function recordScore(score: number, difficulty: Difficulty): number[] {
  let all: Partial<Record<Difficulty, number[]>> = {};
  try {
    const raw = JSON.parse(localStorage.getItem(SCORES_KEY) ?? '{}');
    // version 0.1 kept a single list: it becomes the Medium list
    if (Array.isArray(raw)) all = { medium: raw.filter(x => typeof x === 'number') };
    else if (raw) all = raw;
  } catch {
    // storage unavailable
  }
  const scores = [...(all[difficulty] ?? []), score].sort((a, b) => b - a).slice(0, 5);
  all[difficulty] = scores;
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable
  }
  return scores;
}

export interface RunSummary {
  score: number;
  seconds: number;
  kills: number;
  maxCombo: number;
  credits: number;
  nestsDestroyed: number;
  nests: number;
  /** local top scores of this difficulty, including this run */
  best: number[];
  difficulty: Difficulty;
  /** co-op: one row per player, best first */
  ranking?: { name: string; color: number; score: number; kills: number; revives: number; downs: number; bestCombo: number }[];
}

export interface ScreenActions {
  play(): void;
  host(): void;
  join(): void;
  resume(): void;
  mainMenu(): void;
  quit(): void;
  settingsChanged(s: Settings): void;
  click(): void;
}

export interface JoinEntry {
  /** what to connect to (room name or address) */
  target: string;
  label: string;
  players: number;
}

export interface LanActions {
  start(): void;
  leave(): void;
  setDifficulty(d: Difficulty): void;
  connect(target: string): void;
}

export interface Screens {
  title(): void;
  pause(): void;
  result(won: boolean, summary: RunSummary, again?: { label: string; action: () => void }): void;
  /** the lobby; `isHost` shows Start and the difficulty switch */
  lobby(players: LobbyPlayer[], difficulty: Difficulty, isHost: boolean, me: number, lan: LanActions): void;
  /** the list of games found on the network; call again to refresh */
  joinList(games: JoinEntry[], canEnterAddress: boolean, lan: LanActions): void;
  notice(text: string): void;
  hide(): void;
  readonly visible: boolean;
}

export function createScreens(root: HTMLElement, actions: ScreenActions, settings: Settings): Screens {
  const layer = document.createElement('div');
  layer.className = 'ui-layer';
  root.append(layer);
  let back: () => void = () => {};

  function show(cls: string, build: (screen: HTMLElement) => void) {
    layer.innerHTML = '';
    const screen = document.createElement('div');
    screen.className = `screen ${cls}`;
    build(screen);
    layer.append(screen);
    screen.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function button(parent: HTMLElement, label: string, onClick: () => void, alt = false) {
    const b = document.createElement('button');
    b.className = `btn${alt ? ' alt' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      actions.click();
      onClick();
    });
    parent.append(b);
    return b;
  }

  function text(parent: HTMLElement, tag: string, cls: string, value: string) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.classList.add('txt');
    e.textContent = value;
    parent.append(e);
    return e;
  }

  const diffLabel = (d: Difficulty) => `${t('settings.difficulty')}: ${t(`difficulty.${d}`)}`;
  const nextDiff = (d: Difficulty) => DIFFICULTIES[(DIFFICULTIES.indexOf(d) + 1) % DIFFICULTIES.length];
  const hex = (c: number) => `#${PLAYER_COLORS[c % PLAYER_COLORS.length].toString(16).padStart(6, '0')}`;

  function nameField(parent: HTMLElement) {
    const row = document.createElement('label');
    row.className = 'setting txt';
    row.textContent = t('settings.name');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.className = 'textfield';
    input.value = settings.name;
    input.addEventListener('input', () => {
      settings.name = input.value.trim();
      changed();
    });
    input.addEventListener('keydown', e => e.stopPropagation());
    row.append(input);
    parent.append(row);
  }

  function changed() {
    saveSettings(settings);
    actions.settingsChanged(settings);
  }

  function creditsScreen() {
    show('title', s => {
      text(s, 'div', 'logo', t('title'));
      text(s, 'p', 'credits-by', t('credits.by'));
      text(s, 'h2', '', t('credits.author'));
      text(s, 'p', '', t('credits.helpers'));
      text(s, 'p', 'credits-small', t('credits.builtWith'));
      text(s, 'p', 'credits-small', t('credits.license'));
      button(s, t('menu.back'), () => back(), true);
    });
  }

  function settingsScreen() {
    show('', s => {
      text(s, 'h2', '', t('settings.title'));
      for (const key of ['music', 'sfx'] as const) {
        const row = document.createElement('label');
        row.className = 'setting txt';
        row.textContent = t(key === 'music' ? 'settings.music' : 'settings.sfx');
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = '1';
        input.step = '0.05';
        input.value = String(settings[key]);
        input.addEventListener('input', () => {
          settings[key] = Number(input.value);
          changed();
        });
        row.append(input);
        s.append(row);
      }
      const label = () => `${t('settings.steer')}: ${t(settings.steerWithMouse ? 'settings.on' : 'settings.off')}`;
      const steer = button(s, label(), () => {
        settings.steerWithMouse = !settings.steerWithMouse;
        steer.textContent = label();
        changed();
      });
      const toggle = (label: () => string, flip: () => void) => {
        const b = button(s, label(), () => {
          flip();
          b.textContent = label();
          changed();
        });
      };
      toggle(
        () => `${t('settings.graphics')}: ${t(`graphics.${settings.graphics}`)}`,
        () => (settings.graphics = GRAPHICS_QUALITIES[(GRAPHICS_QUALITIES.indexOf(settings.graphics) + 1) % GRAPHICS_QUALITIES.length]),
      );
      toggle(
        () => `${t('settings.damageNumbers')}: ${t(settings.damageNumbers ? 'settings.on' : 'settings.off')}`,
        () => (settings.damageNumbers = !settings.damageNumbers),
      );
      nameField(s);
      const colors = document.createElement('div');
      colors.className = 'setting txt colors';
      colors.textContent = t('settings.color');
      const drawColors = () => {
        colors.querySelectorAll('button').forEach(b => b.remove());
        [null, 0, 1, 2, 3, 4, 5].forEach(c => {
          const b = document.createElement('button');
          b.className = `swatch${settings.color === c ? ' on' : ''}`;
          if (c === null) b.textContent = 'A';
          else b.style.background = hex(c);
          b.title = c === null ? t('settings.colorAuto') : '';
          b.addEventListener('click', () => {
            actions.click();
            settings.color = c;
            changed();
            drawColors();
          });
          colors.append(b);
        });
      };
      drawColors();
      s.append(colors);
      button(s, t('menu.back'), () => back());
    });
  }

  const api: Screens = {
    title() {
      back = api.title;
      show('title', s => {
        text(s, 'div', 'logo', t('title'));
        text(s, 'p', '', t('menu.goal'));
        button(s, t('menu.play'), actions.play, true);
        const diff = button(s, diffLabel(settings.difficulty), () => {
          settings.difficulty = nextDiff(settings.difficulty);
          diff.textContent = diffLabel(settings.difficulty);
          changed();
        });
        button(s, t('menu.host'), actions.host);
        button(s, t('menu.join'), actions.join);
        button(s, t('menu.settings'), settingsScreen);
        button(s, t('menu.credits'), creditsScreen);
        button(s, t('menu.quit'), actions.quit);
        text(s, 'p', '', t('menu.controls'));
      });
    },
    pause() {
      back = api.pause;
      show('', s => {
        text(s, 'h2', '', t('pause.title'));
        button(s, t('menu.resume'), actions.resume, true);
        button(s, t('menu.settings'), settingsScreen);
        button(s, t('menu.mainMenu'), actions.mainMenu);
      });
    },
    result(won, r, again) {
      show('', s => {
        text(s, 'h2', '', t(won ? 'won.title' : 'lost.title'));
        if (!won) text(s, 'p', '', t('lost.subtitle'));
        text(s, 'p', '', t(`difficulty.${r.difficulty}`));
        text(s, 'div', 'bigscore', t('result.score', { score: r.score }));
        if (r.ranking && r.ranking.length > 1) {
          const table = document.createElement('table');
          table.className = 'ranking txt';
          table.innerHTML = `<tr><th></th><th>${t('rank.player')}</th><th>${t('rank.score')}</th><th>${t('rank.kills')}</th><th>${t('rank.combo')}</th><th>${t('rank.revives')}</th><th>${t('rank.downs')}</th></tr>`;
          r.ranking.forEach((row, i) => {
            const tr = document.createElement('tr');
            const cells = [`${i + 1}.`, row.name, row.score, row.kills, row.bestCombo, row.revives, row.downs];
            cells.forEach((c, j) => {
              const td = document.createElement('td');
              td.textContent = String(c);
              if (j === 1) td.style.color = hex(row.color);
              tr.append(td);
            });
            table.append(tr);
          });
          s.append(table);
        }
        if (r.best[0] === r.score && r.score > 0) text(s, 'p', 'newbest', t('result.newBest'));
        const m = Math.floor(r.seconds / 60), sec = String(Math.floor(r.seconds % 60)).padStart(2, '0');
        text(s, 'p', '', t('result.stats', { time: `${m}:${sec}`, kills: r.kills, combo: r.maxCombo, credits: r.credits, nests: `${r.nestsDestroyed}/${r.nests}` }));
        text(s, 'p', '', `${t('result.best')}: ${r.best.join(' · ')}`);
        if (again) button(s, again.label, again.action, true);
        else button(s, t('menu.playAgain'), actions.play, true);
        button(s, t('menu.mainMenu'), actions.mainMenu);
      });
    },
    lobby(players, difficulty, isHost, me, lan) {
      show('', s => {
        text(s, 'h2', '', t('lobby.title', { n: players.length }));
        const list = document.createElement('div');
        list.className = 'lobby txt';
        for (const p of players) {
          const row = document.createElement('div');
          row.className = 'lobby-row';
          const swatch = document.createElement('i');
          swatch.style.background = hex(p.color);
          row.append(swatch, document.createTextNode(`${p.name}${p.id === 0 ? ' ★' : ''}${p.id === me ? ` (${t('lobby.you')})` : ''}`));
          list.append(row);
        }
        s.append(list);
        if (isHost) {
          const diff = button(s, diffLabel(difficulty), () => {
            difficulty = nextDiff(difficulty);
            diff.textContent = diffLabel(difficulty);
            lan.setDifficulty(difficulty);
          });
          button(s, t('lobby.start'), lan.start, true);
        } else {
          text(s, 'p', '', diffLabel(difficulty));
          text(s, 'p', 'blinking', t('lobby.waiting'));
        }
        button(s, t('lobby.leave'), lan.leave);
      });
    },
    joinList(games, canEnterAddress, lan) {
      show('', s => {
        text(s, 'h2', '', t('join.title'));
        if (games.length === 0) text(s, 'p', 'blinking', t('join.searching'));
        for (const g of games) button(s, `${g.label} (${g.players}/6)`, () => lan.connect(g.target), true);
        if (canEnterAddress) {
          const row = document.createElement('label');
          row.className = 'setting txt';
          row.textContent = t('join.address');
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'textfield';
          input.placeholder = '192.168.1.20';
          input.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter' && input.value.trim()) lan.connect(input.value.trim());
          });
          row.append(input);
          s.append(row);
        }
        button(s, t('menu.back'), lan.leave);
      });
    },
    notice(textValue) {
      show('', s => {
        text(s, 'p', '', textValue);
        button(s, t('menu.mainMenu'), actions.mainMenu, true);
      });
    },
    hide() {
      layer.innerHTML = '';
    },
    get visible() {
      return layer.childElementCount > 0;
    },
  };
  return api;
}
