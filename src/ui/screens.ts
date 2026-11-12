import { t } from '../i18n';
import type { LobbyPlayer, LobbyVote, VersusOption as VersusChoice } from '../net/protocol';
import { PLAYER_COLORS } from '../render/actors';
import { GRAPHICS_QUALITIES, type GraphicsQuality } from '../render/renderer';
import { DIFFICULTIES } from '../sim/config/difficulty';
import { ALL_RARE } from '../sim/config/rare';
import { FLOORS, RUN_FLOORS } from '../sim/config/floors';
import { TOWERS } from '../sim/config/towers';
import { WEAPONS } from '../sim/config/weapons';
import { MAX_PLAYERS } from '../sim/config/balance';
import { buyUnlock, claimBonus, UNLOCKS, type BonusId, type Profile } from '../profile';
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
  /** split screen in team games: both players in one team, or against each other */
  splitTogether: boolean;
  /** the map of a "Single floor" game (a floor id) */
  quickMap: string;
  /** versus: free for all or teams, score race or last cube standing, the map and how many bots */
  versusMode: 'ffa' | 'team';
  versusRule: 'score' | 'rounds' | 'king' | 'capture' | 'gungame';
  /** versus: monster hordes join in */
  versusChaos: boolean;
  /** versus: discovery, a rotation through every mode instead of one fixed match */
  versusDiscovery: boolean;
  /** set once discovery became the versus default */
  discoveryDefault?: boolean;
  versusMap: string;
  /** versus on this computer: players in the match, bots fill up the rest */
  versusSize: number;
}

const TIP_COUNT = 16;
const FP_TIP_KEY = 'cube-crashers.fpTipSeen';
const seen = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};
const markSeen = (key: string) => {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // storage unavailable: the tip comes back next time
  }
};
const svg = (body: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  settings: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  credits: svg('<path d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z"/>'),
  quit: svg('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
};
const SETTINGS_KEY = 'cube-crashers.settings';
const SCORES_KEY = 'cube-crashers.scores';
const DEFAULTS: Settings = { music: 0.8, sfx: 0.9, name: '', difficulty: 'ultraLow', steerWithMouse: false, graphics: 'high', damageNumbers: true, color: null, localPlayers: 1, quickMap: 'floor01', versusMode: 'ffa', versusRule: 'score', versusMap: 'neon', versusSize: 4, versusChaos: false, splitTogether: true, versusDiscovery: true };

/** words for the name of a player who did not pick one */
export const FUN_NAMES = {
  adjectives: ['Turbo', 'Pixel', 'Captain', 'Sir', 'Glitchy', 'Mega', 'Sneaky', 'Wobbly', 'Neon', 'Crispy', 'Funky', 'Sparkly', 'Hyper', 'Cosmic', 'Grumpy', 'Lucky'],
  nouns: ['Toast', 'Panda', 'Noodle', 'Waffle', 'Cube', 'Pickle', 'Taco', 'Pretzel', 'Gecko', 'Muffin', 'Llama', 'Donut', 'Potato', 'Badger', 'Nugget', 'Penguin'],
};

/** fills in a fun name and a random suit colour where the player chose none (`rnd` is 0..1) */
export function withDefaults<T extends { name: string; color: number | null }>(s: T, rnd: () => number = Math.random): T {
  const pick = <V,>(list: V[]) => list[Math.floor(rnd() * list.length) % list.length];
  return {
    ...s,
    name: s.name.trim() ? s.name : `${pick(FUN_NAMES.adjectives)} ${pick(FUN_NAMES.nouns)}`,
    color: s.color ?? Math.floor(rnd() * 8) % 8,
  };
}

export function loadSettings(): Settings {
  let loaded: Settings = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) loaded = { ...DEFAULTS, ...JSON.parse(raw) };
    // a fresh start is always one player: split screen is chosen again each time
    loaded.localPlayers = 1;
    // settings saved before discovery was the versus default get it once
    if (!loaded.discoveryDefault) loaded = { ...loaded, versusDiscovery: true, discoveryDefault: true };
  } catch {
    // storage unavailable: use defaults
  }
  // no name or colour yet: give the player a fun one and keep it
  if (!loaded.name.trim() || loaded.color === null) {
    loaded = withDefaults(loaded);
    saveSettings(loaded);
  }
  return loaded;
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
  /** versus: who won, shown as the headline */
  headline?: string;
  /** one row per player, best first */
  ranking: { name: string; color: number; score: number; kills: number; revives: number; downs: number; bestCombo: number; bestWeapon: string | null; coins: number; towers: number }[];
}

export interface ScreenActions {
  play(): void;
  quick(): void;
  endless(): void;
  versus(): void;
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
  /** host: a versus vote; with an option it is one of the two cards */
  startVote(option?: VersusChoice): void;
  /** host: start this versus match right away */
  startVersus(option: VersusChoice): void;
  /** host: start a discovery rotation */
  startDiscovery(): void;
  /** wish for red, blue or no preference (null) */
  chooseTeam(team: 0 | 1 | null): void;
  /** back to the lobby from the versus page */
  backToLobby(): void;
  vote(choice: 0 | 1): void;
  /** versus: fill matches up with bots to this many players (0 = off) */
  setAutoFill(n: number): void;
  autoFill(): number;
}

export interface Screens {
  title(): void;
  pause(): void;
  result(won: boolean, summary: RunSummary, again?: { label: string; action: () => void }): void;
  /** the lobby; `isHost` shows Start and the difficulty switch */
  lobby(players: LobbyPlayer[], difficulty: Difficulty, isHost: boolean, me: number, lan: LanActions, vote?: LobbyVote | null): void;
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

  /** A link that opens in the browser (the desktop app hands it to the system browser). */
  function link(parent: HTMLElement, cls: string, label: string, url: string, onOpen?: () => void) {
    const a = document.createElement('a');
    a.className = cls;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    a.addEventListener('click', e => {
      e.preventDefault();
      actions.click();
      window.open(url, '_blank', 'noopener');
      onOpen?.();
    });
    parent.append(a);
  }

  /** A rotating tip on the title screen; it stops once the screen is gone. */
  let tipAt = Math.floor(Math.random() * TIP_COUNT);
  function tipBox(parent: HTMLElement) {
    const box = document.createElement('div');
    box.className = 'tip-box';
    const line = document.createElement('span');
    box.innerHTML = `<b>${t('tip.label')}</b>`;
    box.append(line);
    parent.append(box);
    const next = () => {
      line.textContent = t(`tip.${tipAt}` as 'tip.0');
      tipAt = (tipAt + 1) % TIP_COUNT;
    };
    const rotate = () => {
      next();
      const timer = window.setInterval(() => {
        if (!box.isConnected) return window.clearInterval(timer);
        box.classList.add('fade');
        window.setTimeout(() => {
          next();
          box.classList.remove('fade');
        }, 300);
      }, 7000);
      box.addEventListener('click', () => next());
    };
    // the first-person tip stays until it is closed once, so everyone learns about it
    if (!seen(FP_TIP_KEY)) {
      box.classList.add('pinned');
      line.textContent = t('tip.firstPerson');
      const close = document.createElement('button');
      close.className = 'tip-close';
      close.textContent = '\u2715';
      close.title = t('tip.close');
      close.addEventListener('click', e => {
        e.stopPropagation();
        actions.click();
        markSeen(FP_TIP_KEY);
        close.remove();
        box.classList.remove('pinned');
        rotate();
      });
      box.append(close);
      return;
    }
    rotate();
  }

  function creditsScreen() {
    show('title', s => {
      text(s, 'div', 'logo', t('title'));
      text(s, 'p', 'credits-by', t('credits.by'));
      text(s, 'h2', '', t('credits.author'));
      link(s, 'credits-site', t('credits.site'), 'https://www.amannlabs.eu');
      text(s, 'p', '', t('credits.helpers'));
      text(s, 'p', 'credits-small', t('credits.builtWith'));
      text(s, 'p', 'credits-small', t('credits.license'));
      link(s, 'sponsor-badge', t('credits.support'), 'https://github.com/sponsors/dominikamann', () => thank('sponsor'));
      // a one-off thank-you in tickets: for reading the credits, and for the sponsor button
      const thanks = text(s, 'p', 'credits-thanks', '');
      const thank = (id: BonusId) => {
        const n = claimBonus(profile, id);
        if (!n) return;
        saveProfile();
        thanks.textContent = t(id === 'sponsor' ? 'credits.thanksSponsor' : 'credits.thanksRead', { n });
        thanks.classList.remove('pop');
        void thanks.offsetWidth;
        thanks.classList.add('pop');
      };
      thank('credits');
      button(s, t('menu.back'), () => back(), true);
    });
  }

  function settingsScreen() {
    show('settings', s => {
      text(s, 'h2', '', t('settings.title'));
      // one card: a label on the left, its control on the right
      const card = document.createElement('div');
      card.className = 'settings-card';
      s.append(card);
      const row = (label: string) => {
        text(card, 'div', 'settings-label', label);
        const cell = document.createElement('div');
        cell.className = 'settings-cell';
        card.append(cell);
        return cell;
      };
      const section = (label: string) => text(card, 'div', 'settings-section', label);
      const chips = <V,>(label: string, items: { label: string; value: V }[], get: () => V, set: (v: V) => void) => {
        const cell = row(label);
        cell.classList.add('chips');
        const draw = () => {
          cell.replaceChildren();
          for (const it of items) {
            const c = document.createElement('button');
            c.className = `chip small${it.value === get() ? ' on' : ''}`;
            c.textContent = it.label;
            c.addEventListener('click', () => {
              actions.click();
              set(it.value);
              changed();
              draw();
            });
            cell.append(c);
          }
        };
        draw();
      };
      const onOff = [{ label: t('settings.on'), value: true }, { label: t('settings.off'), value: false }];

      section(t('settings.sound'));
      for (const key of ['music', 'sfx'] as const) {
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
        row(t(key === 'music' ? 'settings.music' : 'settings.sfx')).append(input);
      }

      section(t('settings.gameplay'));
      chips(t('settings.walk'), [{ label: t('settings.walkScreen'), value: false }, { label: t('settings.walkAim'), value: true }], () => settings.steerWithMouse, v => (settings.steerWithMouse = v));
      chips(t('settings.graphics'), GRAPHICS_QUALITIES.map(g => ({ label: t(`graphics.${g}`), value: g })), () => settings.graphics, v => (settings.graphics = v));
      chips(t('settings.damageNumbers'), onOff, () => settings.damageNumbers, v => (settings.damageNumbers = v));

      section(t('settings.player'));
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
      row(t('settings.name')).append(input);
      const colors = row(t('settings.color'));
      colors.classList.add('colors');
      const drawColors = () => {
        colors.replaceChildren();
        [null, 0, 1, 2, 3, 4, 5, 6, 7].forEach(c => {
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
      text(s, 'p', 'controls-help', t('menu.controls'));
      button(s, t('menu.back'), () => back(), true);
    });
  }

  /** arenas for versus: the floors with room to fight */
  const VERSUS_MAPS = ['neon', 'highway', 'floor01', 'candy', 'arena', 'rooftop'];
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

  /** the page behind a title tile: only the options that mode needs, then Start */
  function setupScreen(mode: 'run' | 'quick' | 'versus' | 'endless', lan?: LanActions) {
    back = () => setupScreen(mode, lan);
    show('setup', s => {
      text(s, 'h2', '', t(`mode.${mode}` as 'mode.run'));
      const hint = { run: 'mode.runHint', quick: 'mode.quickHint', versus: 'mode.versusHint', endless: 'mode.endlessHint' }[mode];
      text(s, 'p', 'mode-hint', t(hint as 'mode.runHint'));
      const body = document.createElement('div');
      body.className = 'setup-body';
      s.append(body);
      /** a labelled row of choices */
      const choose = <V,>(title: string, items: { label: string; value: V }[], current: V, pick: (v: V) => void, small = false) => {
        const group = document.createElement('div');
        group.className = 'setup-row';
        text(group, 'div', 'setup-label', title);
        const row = document.createElement('div');
        row.className = 'chips';
        for (const it of items) {
          const c = document.createElement('button');
          c.className = `chip${small ? ' small' : ''}${it.value === current ? ' on' : ''}`;
          c.textContent = it.label;
          c.addEventListener('click', () => {
            actions.click();
            pick(it.value);
            changed();
            setupScreen(mode, lan);
          });
          row.append(c);
        }
        group.append(row);
        body.append(group);
      };
      if (mode === 'quick') {
        if (!QUICK_MAPS.includes(settings.quickMap)) settings.quickMap = QUICK_MAPS[0];
        choose(t('setup.map'), QUICK_MAPS.map(id => ({ label: t(FLOORS[id].name as 'floor.plaza') + (FLOORS[id].kind === 'boss' ? ' \u2620' : ''), value: id })), settings.quickMap, v => (settings.quickMap = v), true);
      }
      if (mode === 'versus') {
        choose(t('setup.match'), [{ label: t('setup.pick'), value: false }, { label: t('versus.discovery'), value: true }], settings.versusDiscovery, v => (settings.versusDiscovery = v));
      }
      if (mode === 'versus' && settings.versusDiscovery) text(body, 'p', 'mode-hint', t('versus.discoveryHint'));
      if (mode === 'versus' && !settings.versusDiscovery) {
        choose(t('setup.mode'), [{ label: t('versus.ffa'), value: 'ffa' as const }, { label: t('versus.team'), value: 'team' as const }], settings.versusMode, v => (settings.versusMode = v));
        choose(
          t('setup.rule'),
          (['score', 'rounds', 'king', 'capture', 'gungame'] as const).map(r => ({ label: t(`versus.${r}` as 'versus.score'), value: r })),
          settings.versusRule,
          v => {
            settings.versusRule = v;
            // capture the cube is a team game
            if (v === 'capture') settings.versusMode = 'team';
          },
          true,
        );
        text(body, 'p', 'mode-hint', t(`versus.${settings.versusRule}Hint` as 'versus.scoreHint'));
        choose(t('setup.chaos'), [{ label: t('settings.off'), value: false }, { label: t('versus.chaosOn'), value: true }], settings.versusChaos, v => (settings.versusChaos = v));
        if (!VERSUS_MAPS.includes(settings.versusMap)) settings.versusMap = VERSUS_MAPS[0];
        choose(t('setup.map'), VERSUS_MAPS.map(id => ({ label: t(FLOORS[id].name as 'floor.plaza'), value: id })), settings.versusMap, v => (settings.versusMap = v), true);
      }
      if (mode === 'versus') {
        if (!lan) {
          // like the LAN lobby: how many players the match has, bots fill up the rest
          const humans = settings.localPlayers;
          const sizes = [humans, ...[2, 4, 6, 8].filter(n => n > humans)];
          if (!sizes.includes(settings.versusSize)) settings.versusSize = sizes.find(n => n >= settings.versusSize) ?? MAX_PLAYERS;
          choose(t('setup.size'), sizes.map(n => ({ label: n === humans ? t('lobby.fillOff') : String(n), value: n })), settings.versusSize, v => (settings.versusSize = v));
        }
      } else {
        choose(t('settings.difficulty'), DIFFICULTIES.map(d => ({ label: t(`difficulty.${d}` as 'difficulty.medium'), value: d })), settings.difficulty, v => (settings.difficulty = v), true);
      }
      if (lan) {
        // on the LAN: start this match now, or put it to the vote next to a surprise card
        const option = (): VersusChoice => ({ mode: settings.versusRule === 'capture' ? 'team' : settings.versusRule === 'gungame' ? 'ffa' : settings.versusMode, rule: settings.versusRule, map: settings.versusMap, chaos: settings.versusChaos });
        const row = document.createElement('div');
        row.className = 'row2';
        s.append(row);
        button(row, t('setup.start'), () => (settings.versusDiscovery ? lan.startDiscovery() : lan.startVersus(option())), true);
        if (!settings.versusDiscovery) button(row, t('lobby.voteThis'), () => lan.startVote(option()), true);
        button(s, t('menu.back'), () => lan.backToLobby());
        return;
      }
      choose(t('setup.players'), [{ label: t('menu.onePlayer'), value: 1 as const }, { label: t('menu.twoPlayers'), value: 2 as const }], settings.localPlayers, v => (settings.localPlayers = v));
      if (mode === 'versus' && settings.localPlayers === 2 && settings.versusRule !== 'gungame' && (settings.versusMode === 'team' || settings.versusRule === 'capture')) {
        choose(t('setup.split'), [{ label: t('setup.together'), value: true }, { label: t('setup.against'), value: false }], settings.splitTogether, v => (settings.splitTogether = v));
      }
      const start = { run: actions.play, quick: actions.quick, versus: actions.versus, endless: actions.endless }[mode];
      const row = document.createElement('div');
      row.className = 'row2';
      s.append(row);
      button(row, t('setup.start'), start, true);
      button(row, t('menu.back'), () => api.title());
    });
  }

  const api: Screens = {
    title() {
      back = api.title;
      show('title', s => {
        text(s, 'div', 'logo', t('title'));
        // four big tiles; each opens its own page with just the options it needs
        const tiles = document.createElement('div');
        tiles.className = 'tiles';
        s.append(tiles);
        const modes: { id: 'run' | 'quick' | 'versus' | 'endless'; label: string; sub: string; locked: boolean }[] = [
          { id: 'run', label: t('mode.run'), sub: t('tile.run'), locked: false },
          { id: 'quick', label: t('mode.quick'), sub: t('tile.quick'), locked: false },
          { id: 'versus', label: t('mode.versus'), sub: t('tile.versus'), locked: false },
          { id: 'endless', label: t('mode.endless'), sub: t('tile.endless'), locked: !profile.unlocked.includes('endless') },
        ];
        for (const m of modes) {
          const tile = document.createElement('button');
          tile.className = `tile${m.id === 'run' ? ' main' : ''}`;
          tile.disabled = m.locked;
          tile.innerHTML = `<div class="name">${m.label}${m.locked ? ' \u{1F512}' : ''}</div><div class="sub">${m.locked ? t('mode.locked') : m.sub}</div>`;
          tile.addEventListener('click', () => {
            actions.click();
            setupScreen(m.id);
          });
          tiles.append(tile);
        }
        const row = document.createElement('div');
        row.className = 'row2';
        s.append(row);
        button(row, t('menu.lan'), lanScreen);
        button(row, t('menu.unlocks'), unlocksScreen);
        tipBox(s);
        const foot = document.createElement('div');
        foot.className = 'foot';
        s.append(foot);
        for (const [label_, icon, fn, cls] of [[t('menu.settings'), ICONS.settings, settingsScreen, ''], [t('menu.credits'), ICONS.credits, creditsScreen, ''], [t('menu.quit'), ICONS.quit, actions.quit, 'quit']] as [string, string, () => void, string][]) {
          const b = button(foot, label_, fn);
          b.classList.add('small');
          if (cls) b.classList.add(cls);
          const ico = document.createElement('span');
          ico.className = 'ico';
          ico.innerHTML = icon;
          b.prepend(ico);
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
        const title = r.headline ?? (won && r.mode === 'run' ? t('won.run') : t(won ? 'won.title' : 'lost.title'));
        text(s, 'h2', '', title);
        if (!won) text(s, 'p', '', t('lost.subtitle'));
        const m = Math.floor(r.seconds / 60), sec = String(Math.floor(r.seconds % 60)).padStart(2, '0');
        const versus = r.mode === 'versus';
        if (!versus) text(s, 'p', '', `${t(`difficulty.${r.difficulty}`)} · ${t('result.time', { time: `${m}:${sec}` })}${r.mode === 'run' ? ` · ${t('result.floors', { n: r.floors })}` : ''}`);
        if (versus) text(s, 'p', '', t('result.time', { time: `${m}:${sec}` }));
        else text(s, 'div', 'bigscore', t('result.score', { score: r.score }));
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
        if (!versus) {
          text(s, 'p', '', t('result.team', { kills: r.kills, combo: r.maxCombo, credits: r.credits }));
          text(s, 'p', '', `${t('result.best')}: ${r.best.join(' · ')}`);
        }
        const row = document.createElement('div');
        row.className = 'row2';
        s.append(row);
        if (again) button(row, again.label, again.action, true);
        else button(row, t('menu.playAgain'), actions.play, true);
        button(row, t('menu.mainMenu'), actions.mainMenu);
      });
    },
    lobby(players, difficulty, isHost, me, lan, vote) {
      show('', s => {
        text(s, 'h2', '', t('lobby.title', { n: players.length }));
        const list = document.createElement('div');
        list.className = 'lobby txt';
        for (const p of players) {
          const row = document.createElement('div');
          row.className = 'lobby-row';
          const swatch = document.createElement('i');
          swatch.style.background = hex(p.color);
          row.append(swatch, document.createTextNode(`${p.name}${p.id === 0 ? ' ★' : ''}${p.bot ? ' 🤖' : ''}${p.id === me ? ` (${t('lobby.you')})` : ''}`));
          // team wish: everyone sets their own, the others see it
          if (!p.bot) {
            const wish = document.createElement('button');
            wish.className = `chip small team-wish${p.team === 0 ? ' red' : p.team === 1 ? ' blue' : ''}`;
            wish.textContent = p.team === 0 ? t('versus.red') : p.team === 1 ? t('versus.blue') : t('lobby.teamAuto');
            wish.disabled = p.id !== me;
            wish.addEventListener('click', () => {
              actions.click();
              lan.chooseTeam(p.team === undefined ? 0 : p.team === 0 ? 1 : null);
            });
            row.append(wish);
          }
          list.append(row);
        }
        s.append(list);
        // a versus vote: two cards, click (or 1 / 2) to vote, the countdown below
        if (vote) {
          const cards = document.createElement('div');
          cards.className = 'vote';
          vote.options.forEach((o, i) => {
            const n = Object.values(vote.votes).filter(c => c === i).length;
            const mine = vote.votes[me] === i;
            const c = document.createElement('button');
            c.className = `vote-card${mine ? ' on' : ''}`;
            c.innerHTML = `<div class="key">${i + 1}</div><div class="name">${t(o.mode === 'ffa' ? 'versus.ffa' : 'versus.team')}</div><div>${t(`versus.${o.rule}` as 'versus.score')}</div><div class="map">${t(FLOORS[o.map].name as 'floor.plaza')}</div>${o.chaos ? `<div class="chaos">${t('versus.chaosCard')}</div>` : ''}<div class="count">${'●'.repeat(n) || '–'}</div>`;
            c.addEventListener('click', () => {
              actions.click();
              lan.vote(i as 0 | 1);
            });
            cards.append(c);
          });
          s.append(cards);
          text(s, 'p', '', t('lobby.voteEnds', { s: vote.endsIn }));
        }
        if (isHost) {
          // two blocks, each with only its own setting: co-op with the difficulty, versus with the bots
          const group = (title: string) => {
            const g = document.createElement('div');
            g.className = 'lobby-group';
            text(g, 'div', 'setup-label', title);
            const row = document.createElement('div');
            row.className = 'lobby-group-row';
            g.append(row);
            s.append(g);
            return row;
          };
          const coop = group(t('lobby.coop'));
          button(coop, t('lobby.start'), lan.start, true);
          const diff = button(coop, diffLabel(difficulty), () => {
            difficulty = nextDiff(difficulty);
            diff.textContent = diffLabel(difficulty);
            lan.setDifficulty(difficulty);
          });
          diff.classList.add('small');
          const vs = group(t('mode.versus'));
          if (!vote) button(vs, t('lobby.versus'), () => setupScreen('versus', lan), true);
          // one control for the bots: how many players the lobby is topped up to (bots show up right away)
          const bots = document.createElement('div');
          bots.className = 'stepper txt lobby-bots';
          const sizes = [0, 2, 3, 4, 5, 6, 7, 8];
          const at = Math.max(0, sizes.indexOf(lan.autoFill()));
          const stepTo = (i: number) => {
            actions.click();
            lan.setAutoFill(sizes[Math.max(0, Math.min(sizes.length - 1, i))]);
          };
          const minus = document.createElement('button');
          minus.className = 'chip';
          minus.textContent = '\u2212';
          minus.disabled = at === 0;
          minus.addEventListener('click', () => stepTo(at - 1));
          const count = document.createElement('span');
          count.textContent = lan.autoFill() === 0 ? t('lobby.fillOff') : t('lobby.fill', { n: lan.autoFill() });
          const plus = document.createElement('button');
          plus.className = 'chip';
          plus.textContent = '+';
          plus.disabled = at === sizes.length - 1;
          plus.addEventListener('click', () => stepTo(at + 1));
          bots.append(minus, count, plus);
          vs.append(bots);
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
        for (const g of games) button(s, `${g.label} (${g.players}/${MAX_PLAYERS})`, () => lan.connect(g.target), true);
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
