import { t } from '../i18n';
import type { LobbyPlayer } from '../net/protocol';
import { PLAYER_COLORS } from '../render/actors';
import { GRAPHICS_QUALITIES, type GraphicsQuality } from '../render/renderer';
import { DIFFICULTIES } from '../sim/config/difficulty';
import { ALL_RARE } from '../sim/config/rare';
import { FLOORS, RUN_FLOORS } from '../sim/config/floors';
import { TOWERS } from '../sim/config/towers';
import { WEAPONS } from '../sim/config/weapons';
import { buyUnlock, UNLOCKS, type Profile } from '../profile';
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
  /** players on this computer: 2 = split screen */
  localPlayers: 1 | 2;
  /** the map of a "Single floor" game (a floor id) */
  quickMap: string;
}

const SETTINGS_KEY = 'cube-crashers.settings';
const SCORES_KEY = 'cube-crashers.scores';
const DEFAULTS: Settings = { music: 0.8, sfx: 0.9, name: '', difficulty: 'ultraLow', steerWithMouse: true, graphics: 'high', damageNumbers: true, color: null, localPlayers: 1, quickMap: 'floor01' };

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
export function recordScore(score: number, difficulty: Difficulty | 'endless'): number[] {
  let all: Partial<Record<Difficulty | 'endless', number[]>> = {};
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
  /** tickets earned for unlocks */
  tickets: number;
  /** unlocks earned by this run (e.g. Endless for beating the Tower Run) */
  unlocked: string[];
  won: boolean;
  mode: string;
  /** floors cleared */
  floors: number;
  /** one row per player, best first */
  ranking: { name: string; color: number; score: number; kills: number; revives: number; downs: number; bestCombo: number; bestWeapon: string | null; coins: number; towers: number }[];
}

export interface ScreenActions {
  play(): void;
  quick(): void;
  endless(): void;
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

export function createScreens(root: HTMLElement, actions: ScreenActions, settings: Settings, profile: Profile, saveProfile: () => void): Screens {
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
  /** a kill source as players know it: weapon, rare weapon, tower or move */
  const sourceName = (k: string | null) => {
    if (!k) return '–';
    if (k in WEAPONS) return t(`weapon.${k}` as 'weapon.pixelBlaster');
    if ((ALL_RARE as readonly string[]).includes(k)) return t(`rare.${k}` as 'rare.slushMachine');
    if (k in TOWERS) return t(`tower.${k}` as 'tower.laser');
    return t(`source.${k}` as 'source.stomp');
  };
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

  function unlocksScreen() {
    show('', s => {
      text(s, 'h2', '', t('unlocks.title'));
      text(s, 'div', 'bigscore', t('unlocks.tickets', { n: profile.tickets }));
      text(s, 'p', '', t('unlocks.hint'));
      const grid = document.createElement('div');
      grid.className = 'unlocks';
      for (const u of UNLOCKS) {
        const owned = profile.unlocked.includes(u.id);
        const name = u.kind === 'weapon' ? t(`weapon.${u.id}` as 'weapon.bomb') : t(`unlock.${u.id}` as 'unlock.roller');
        const b = button(grid, owned ? `${name} ✓` : t('unlocks.buy', { name, cost: u.cost }), () => {
          if (owned) return;
          if (buyUnlock(profile, u.id)) {
            saveProfile();
            unlocksScreen();
          }
        });
        if (owned) b.classList.add('alt');
        else if (profile.tickets < u.cost) b.disabled = true;
      }
      s.append(grid);
      button(s, t('menu.back'), () => back(), true);
    });
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
      text(s, 'p', 'controls-help', t('menu.controls'));
      button(s, t('menu.back'), () => back());
    });
  }

  let titleMode: 'run' | 'quick' | 'endless' = 'run';
  /** maps for "Single floor": the floors of the tower in their order */
  const QUICK_MAPS = [...RUN_FLOORS.slice(0, 4), 'highway', RUN_FLOORS[4], 'race', 'lane', 'maze'].filter(id => FLOORS[id] && FLOORS[id].kind !== 'shaft');

  function lanScreen() {
    show('', s => {
      text(s, 'h2', '', t('menu.lan'));
      text(s, 'p', '', t('lan.intro'));
      button(s, t('menu.host'), actions.host, true);
      button(s, t('menu.join'), actions.join);
      button(s, t('menu.back'), () => api.title());
    });
  }

  const api: Screens = {
    title() {
      back = api.title;
      show('title', s => {
        text(s, 'div', 'logo', t('title'));
        const main = document.createElement('div');
        main.className = 'title-main';
        s.append(main);
        const modes: { id: 'run' | 'quick' | 'endless'; label: string; hint: string; locked: boolean }[] = [
          { id: 'run', label: t('mode.run'), hint: t('mode.runHint'), locked: false },
          { id: 'quick', label: t('mode.quick'), hint: t('mode.quickHint'), locked: false },
          { id: 'endless', label: t('mode.endless'), hint: t('mode.endlessHint'), locked: !profile.unlocked.includes('endless') },
        ];
        if (modes.find(m => m.id === titleMode)?.locked) titleMode = 'run';
        const play = button(main, t('menu.play'), () => (titleMode === 'quick' ? actions.quick : titleMode === 'endless' ? actions.endless : actions.play)(), true);
        play.classList.add('play');
        const chips = document.createElement('div');
        chips.className = 'chips';
        const hint = text(main, 'p', 'mode-hint', '');
        main.insertBefore(chips, hint);
        const drawChips = () => {
          chips.innerHTML = '';
          for (const m of modes) {
            const c = document.createElement('button');
            c.className = `chip${m.id === titleMode ? ' on' : ''}`;
            c.textContent = m.locked ? `${m.label} \u{1F512}` : m.label;
            c.disabled = m.locked;
            if (m.locked) c.title = t('mode.locked');
            c.addEventListener('click', () => {
              actions.click();
              titleMode = m.id;
              drawChips();
            });
            chips.append(c);
          }
          hint.textContent = modes.find(m => m.id === titleMode)!.hint;
          // "Single floor": pick any floor of the tower, bosses included
          maps.innerHTML = '';
          maps.style.display = titleMode === 'quick' ? '' : 'none';
          if (titleMode !== 'quick') return;
          if (!QUICK_MAPS.includes(settings.quickMap)) settings.quickMap = QUICK_MAPS[0];
          for (const id of QUICK_MAPS) {
            const c = document.createElement('button');
            c.className = `chip small${id === settings.quickMap ? ' on' : ''}`;
            c.textContent = t(FLOORS[id].name as 'floor.plaza') + (FLOORS[id].kind === 'boss' ? ' \u2620' : '');
            c.addEventListener('click', () => {
              actions.click();
              settings.quickMap = id;
              changed();
              drawChips();
            });
            maps.append(c);
          }
        };
        const maps = document.createElement('div');
        maps.className = 'chips maps';
        main.insertBefore(maps, hint.nextSibling);
        drawChips();
        const diff = document.createElement('div');
        diff.className = 'stepper txt';
        const prev = document.createElement('button');
        prev.className = 'chip';
        prev.textContent = '\u25C0';
        const label = document.createElement('span');
        const next = document.createElement('button');
        next.className = 'chip';
        next.textContent = '\u25B6';
        const step = (dir: number) => {
          actions.click();
          settings.difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(settings.difficulty) + dir + DIFFICULTIES.length) % DIFFICULTIES.length];
          label.textContent = diffLabel(settings.difficulty);
          changed();
        };
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        label.textContent = diffLabel(settings.difficulty);
        diff.append(prev, label, next);
        main.append(diff);
        // one or two players on this computer (two = split screen, player 2 needs a controller)
        const who = document.createElement('div');
        who.className = 'chips players';
        const drawWho = () => {
          who.innerHTML = '';
          for (const n of [1, 2] as const) {
            const c = document.createElement('button');
            c.className = `chip${settings.localPlayers === n ? ' on' : ''}`;
            c.textContent = t(n === 1 ? 'menu.onePlayer' : 'menu.twoPlayers');
            c.addEventListener('click', () => {
              actions.click();
              settings.localPlayers = n;
              changed();
              drawWho();
            });
            who.append(c);
          }
        };
        drawWho();
        main.append(who);
        const row = document.createElement('div');
        row.className = 'row2';
        main.append(row);
        button(row, t('menu.lan'), lanScreen);
        button(row, t('menu.unlocks'), unlocksScreen);
        const foot = document.createElement('div');
        foot.className = 'foot';
        s.append(foot);
        for (const [label_, fn] of [[t('menu.settings'), settingsScreen], [t('menu.credits'), creditsScreen], [t('menu.quit'), actions.quit]] as [string, () => void][]) {
          button(foot, label_, fn).classList.add('small');
        }
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
      show('result', s => {
        // a won Tower Run gets its own headline: the whole tower is done
        const title = won && r.mode === 'run' ? t('won.run') : t(won ? 'won.title' : 'lost.title');
        text(s, 'h2', '', title);
        if (!won) text(s, 'p', '', t('lost.subtitle'));
        const m = Math.floor(r.seconds / 60), sec = String(Math.floor(r.seconds % 60)).padStart(2, '0');
        text(s, 'p', '', `${t(`difficulty.${r.difficulty}`)} · ${t('result.time', { time: `${m}:${sec}` })}${r.mode === 'run' ? ` · ${t('result.floors', { n: r.floors })}` : ''}`);
        text(s, 'div', 'bigscore', t('result.score', { score: r.score }));
        if (r.best[0] === r.score && r.score > 0) text(s, 'p', 'newbest', t('result.newBest'));
        for (const u of r.unlocked) text(s, 'p', 'newbest', t('result.unlocked', { name: t(`unlock.${u}` as 'unlock.endless') }));
        if (r.tickets > 0) text(s, 'p', 'newbest', t('result.tickets', { n: r.tickets }));

        const table = document.createElement('table');
        table.className = 'ranking txt';
        const head = ['', t('rank.player'), t('rank.score'), t('rank.kills'), t('rank.weapon'), t('rank.combo'), t('rank.towers'), t('rank.coins'), t('rank.revives'), t('rank.downs')];
        table.innerHTML = `<tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>`;
        r.ranking.forEach((row, i) => {
          const tr = document.createElement('tr');
          const cells = [i === 0 && r.ranking.length > 1 ? '\u2605' : `${i + 1}.`, row.name, row.score, row.kills, sourceName(row.bestWeapon), row.bestCombo, row.towers, row.coins, row.revives, row.downs];
          cells.forEach((c, j) => {
            const td = document.createElement('td');
            td.textContent = String(c);
            if (j === 1) td.style.color = hex(row.color);
            tr.append(td);
          });
          table.append(tr);
        });
        s.append(table);
        text(s, 'p', '', t('result.team', { kills: r.kills, combo: r.maxCombo, credits: r.credits }));
        text(s, 'p', '', `${t('result.best')}: ${r.best.join(' · ')}`);
        const row = document.createElement('div');
        row.className = 'row2';
        s.append(row);
        if (again) button(row, again.label, again.action, true);
        else button(row, t('menu.playAgain'), actions.play, true);
        button(row, t('menu.mainMenu'), actions.mainMenu);
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
