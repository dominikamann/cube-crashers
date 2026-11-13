import { APP_VERSION } from '../version';
import { dailyBest, dailyDate } from '../daily';
import { t } from '../i18n';
import type { LobbyPlayer, LobbyVote, ServerMode, ServerStatus, VersusOption as VersusChoice } from '../net/protocol';
import { isCoop } from '../net/protocol';
import { normalizeAddress, playerCount, type ServerRow } from '../net/server-list';
import { cssColor, playerColor } from '../render/palette';
import { GRAPHICS_QUALITIES, type GraphicsQuality } from '../render/renderer';
import { DIFFICULTIES } from '../sim/config/difficulty';
import { ALL_RARE } from '../sim/config/rare';
import { FLOORS, RUN_FLOORS } from '../sim/config/floors';
import { TOWERS } from '../sim/config/towers';
import { WEAPONS } from '../sim/config/weapons';
import { MAX_PLAYERS } from '../sim/config/balance';
import { browserStore, buyUnlock, claimBonus, UNLOCKS, type BonusId, type Profile } from '../profile';
import type { Difficulty } from '../sim/types';
import { ACTIONS, assignKey, canBind, DEFAULT_BINDINGS, keyLabel, validBindings, type Action, type Bindings } from '../input/bindings';

export interface Settings {
  music: number;
  sfx: number;
  name: string;
  difficulty: Difficulty;
  /** versus: how well the bots play */
  versusBots: Difficulty;
  /** the LAN host's pick in the lobby: which game Start begins */
  lanGame: 'run' | 'quick' | 'bossrush' | 'brawl' | 'endless' | 'versus';
  /** where the Boss Brawl is fought: a map id, or the random choice */
  brawlMap: string;
  /** where the Boss Rush is fought: 'own' (each boss on its own floor), a map id, or the random choice */
  rushMap: string;
  /** on foot, W walks toward the crosshair instead of up the screen (karts never steer with the mouse) */
  steerWithMouse: boolean;
  /** first person: how fast the mouse (or touchpad) turns the view */
  mouseSensitivity: number;
  /** the minimap in the corner (the map key switches it) */
  showMap: boolean;
  graphics: GraphicsQuality;
  damageNumbers: boolean;
  /** versus: watch the last seconds again when you are knocked out */
  killCam: boolean;
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
  versusRule: 'score' | 'rounds' | 'king' | 'capture' | 'gungame' | 'coinop';
  /** versus: monster hordes join in */
  /** monsters in a versus match: none, hordes, or hordes and now and then a boss */
  versusChaos: boolean | 'boss';
  /** versus: discovery, a rotation through every mode instead of one fixed match */
  versusDiscovery: boolean;
  /** set once discovery became the versus default */
  discoveryDefault?: boolean;
  /** High became everyone's graphics once (Ultra had grown too heavy for most machines) */
  graphicsHighDefault?: boolean;
  versusMap: string;
  /** versus on this computer: players in the match, bots fill up the rest */
  versusSize: number;
  /** online servers the player added by address (host:port) */
  servers: string[];
  /** which key does what (Settings → Controls) */
  bindings: Bindings;
  /** colours and shapes that do not rely on telling red from green */
  colorBlind: boolean;
}

const TIP_COUNT = 16;
const FP_TIP_KEY = 'cube-crashers.fpTipSeen';
const seen = (key: string) => {
  try {
    return browserStore().getItem(key) === '1';
  } catch {
    return false;
  }
};
const markSeen = (key: string) => {
  try {
    browserStore().setItem(key, '1');
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
const DEFAULTS: Settings = { music: 0.8, sfx: 0.9, name: '', difficulty: 'ultraLow', versusBots: 'low', lanGame: 'run', brawlMap: 'arena', rushMap: 'own', steerWithMouse: false, mouseSensitivity: 1, showMap: true, graphics: 'high', damageNumbers: true, killCam: true, color: null, localPlayers: 1, quickMap: 'floor01', versusMode: 'ffa', versusRule: 'score', versusMap: 'neon', versusSize: 4, versusChaos: false, splitTogether: true, versusDiscovery: true, servers: [], bindings: { ...DEFAULT_BINDINGS }, colorBlind: false };

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
    color: s.color ?? Math.floor(rnd() * 10) % 10,
  };
}

/** arenas for versus: the floors with room to fight */
export const VERSUS_MAPS = ['neon', 'highway', 'floor01', 'candy', 'arena', 'rooftop'];
/** the map choice "rotation": a random arena for every match, a new one after each */
export const MAP_ROTATION = 'random';

/** where a Boss Brawl can be fought: the arena first (the default), then every other floor with room for it */
export const BRAWL_MAPS = ['arena', 'floor01', 'candy', 'neon', 'highway', 'rooftop', 'jungle', 'servers', 'underwater'];

/** The map of a Boss Brawl: the chosen one, or a random one. */
export function brawlMapFor(choice: string, random: () => number = Math.random): string {
  if (choice === MAP_ROTATION) return BRAWL_MAPS[Math.floor(random() * BRAWL_MAPS.length)];
  return BRAWL_MAPS.includes(choice) ? choice : BRAWL_MAPS[0];
}

/** the Boss Rush's map choice "each boss on its own floor" (the default) */
export const RUSH_OWN = 'own';

/** The maps of a Boss Rush, one per boss: undefined for their own floors, else the chosen map or a random one each. */
export function rushMapsFor(choice: string, bosses: number, random: () => number = Math.random): string[] | undefined {
  if (choice === MAP_ROTATION) return Array.from({ length: bosses }, () => BRAWL_MAPS[Math.floor(random() * BRAWL_MAPS.length)]);
  return BRAWL_MAPS.includes(choice) ? Array.from({ length: bosses }, () => choice) : undefined;
}

/** The arena to play on: the chosen one, or with the rotation a random one that is not `last`. */
export function versusMapFor(choice: string, last: string | null, random: () => number = Math.random): string {
  if (choice !== MAP_ROTATION) return choice;
  const pool = VERSUS_MAPS.filter(m => m !== last);
  return pool[Math.floor(random() * pool.length)];
}

export function loadSettings(): Settings {
  let loaded: Settings = { ...DEFAULTS };
  try {
    const raw = browserStore().getItem(SETTINGS_KEY);
    if (raw) loaded = { ...DEFAULTS, ...JSON.parse(raw) };
    // a fresh start is always one player: split screen is chosen again each time
    loaded.localPlayers = 1;
    if (![0.5, 1, 1.5, 2, 3].includes(loaded.mouseSensitivity)) loaded.mouseSensitivity = 1;
    loaded.bindings = validBindings(loaded.bindings);
    loaded.colorBlind = loaded.colorBlind === true;
    if (!DIFFICULTIES.includes(loaded.versusBots)) loaded.versusBots = 'low';
    if (!['run', 'quick', 'bossrush', 'brawl', 'endless', 'versus'].includes(loaded.lanGame)) loaded.lanGame = 'run';
    if (!BRAWL_MAPS.includes(loaded.brawlMap) && loaded.brawlMap !== MAP_ROTATION) loaded.brawlMap = 'arena';
    if (!BRAWL_MAPS.includes(loaded.rushMap) && loaded.rushMap !== MAP_ROTATION) loaded.rushMap = RUSH_OWN;
    loaded.servers = Array.isArray(loaded.servers) ? loaded.servers.map(a => (typeof a === 'string' ? normalizeAddress(a) : null)).filter((a): a is string => !!a).slice(0, 50) : [];
    // settings saved before discovery was the versus default get it once
    if (!loaded.discoveryDefault) loaded = { ...loaded, versusDiscovery: true, discoveryDefault: true };
    // once: whoever had Ultra goes back to High (choosing Ultra again afterwards sticks); Low and Medium were
    // chosen for a reason and stay
    if (!loaded.graphicsHighDefault) loaded = { ...loaded, graphics: loaded.graphics === 'ultra' ? 'high' : loaded.graphics, graphicsHighDefault: true };
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
    browserStore().setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: settings only last for this session
  }
}

/** Adds a score to the local top 5 of this difficulty and returns the list (highest first). */
export function recordScore(score: number, difficulty: Difficulty | 'endless' | 'bossrush' | 'brawl'): number[] {
  let all: Partial<Record<Difficulty | 'endless' | 'bossrush' | 'brawl', number[]>> = {};
  try {
    const raw = JSON.parse(browserStore().getItem(SCORES_KEY) ?? '{}');
    // version 0.1 kept a single list: it becomes the Medium list
    if (Array.isArray(raw)) all = { medium: raw.filter(x => typeof x === 'number') };
    else if (raw) all = raw;
  } catch {
    // storage unavailable
  }
  const scores = [...(all[difficulty] ?? []), score].sort((a, b) => b - a).slice(0, 5);
  all[difficulty] = scores;
  try {
    browserStore().setItem(SCORES_KEY, JSON.stringify(all));
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
  /** a Daily Run: its date */
  daily?: string;
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
  /** today's Daily Run */
  daily(): void;
  /** every boss in a row */
  bossRush(): void;
  /** every boss in one arena, one or two at a time */
  bossBrawl(): void;
  /** the online server list */
  online(): void;
  resume(): void;
  mainMenu(): void;
  /** missing where the game cannot close itself (a web page) */
  quit?: () => void;
  settingsChanged(s: Settings): void;
  click(): void;
}

export interface OnlineHandlers {
  /** on a web page: only servers that take browser players are listed */
  web: boolean;
  /** the port of an address typed without one */
  defaultPort: number;
  join(address: string): void;
  /** a server the player typed in (already checked to be an address) */
  add(address: string): void;
  remove(address: string): void;
  back(): void;
}

export interface JoinEntry {
  /** what to connect to (room name or address) */
  target: string;
  label: string;
  players: number;
}

export interface LanActions {
  start(): void;
  /** another co-op game with everyone in the lobby: the Boss Brawl, the Boss Rush, Endless */
  startMode(mode: 'quick' | 'brawl' | 'bossrush' | 'endless'): void;
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
  /** on a dedicated server: ready for the next match */
  setReady(ready: boolean): void;
  /** back to the lobby from the versus page */
  backToLobby(): void;
  vote(choice: 0 | 1): void;
  /** versus: fill matches up with bots to this many players (0 = off) */
  setAutoFill(n: number): void;
  autoFill(): number;
  /** how everyone may watch: first person only, from above only, or either */
  setViewMode(v: 'both' | 'fp' | 'top'): void;
  viewMode(): 'both' | 'fp' | 'top';
}

export interface Screens {
  title(): void;
  pause(): void;
  result(won: boolean, summary: RunSummary, again?: { label: string; action: () => void }): void;
  /** the lobby; `isHost` shows Start and the difficulty switch */
  lobby(players: LobbyPlayer[], difficulty: Difficulty, isHost: boolean, me: number, lan: LanActions, vote?: LobbyVote | null, server?: ServerStatus | null): void;
  /** the online server list; update() fills it in as servers answer */
  online(h: OnlineHandlers): { update(rows: ServerRow[]): void };
  /** a dedicated server's countdown, changed in place (redrawing the lobby every second would take the controller's focus) */
  lobbyCountdown(server: ServerStatus): void;
  /** the list of games found on the network; call again to refresh */
  joinList(games: JoinEntry[], canEnterAddress: boolean, lan: LanActions): void;
  /** `back`: a Back button to where the player came from instead of one to the main menu */
  notice(text: string, back?: () => void): void;
  /** the LAN party page: host or join */
  lanMenu(): void;
  hide(): void;
  readonly visible: boolean;
}

export function createScreens(root: HTMLElement, actions: ScreenActions, settings: Settings, profile: Profile, saveProfile: () => void): Screens {
  const layer = document.createElement('div');
  layer.className = 'ui-layer ui-scaled';
  root.append(layer);
  let back: () => void = () => {};

  /** set while the Controls page waits for a key: called when the page goes away */
  let stopListening: (() => void) | null = null;

  function show(cls: string, build: (screen: HTMLElement) => void) {
    stopListening?.();
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

  /** "10/10 players (6 bots)" */
  const seats = (r: ServerRow) => {
    const c = playerCount(r.info!);
    return c.bots > 0 ? t('online.playersBots', { n: c.players, max: c.max, b: c.bots }) : t('online.players', { n: c.players, max: c.max });
  };
  let countdown: HTMLElement | null = null;
  const countdownText = (server: ServerStatus) => (server.running ? t('lobby.running') : server.startsIn === null ? t('lobby.waitingPlayers') : t('lobby.startsIn', { s: server.startsIn }));
  const modeName = (m: ServerMode | 'lan') => (m === 'lan' || isCoop(m) ? t(`server.mode.${m}` as 'server.mode.coop') : t(`versus.${m}` as 'versus.score'));
  const diffLabel = (d: Difficulty) => `${t('settings.difficulty')}: ${t(`difficulty.${d}`)}`;
  /** a kill source as players know it: weapon, rare weapon, tower or move */
  const sourceName = (k: string | null) => {
    if (!k) return '–';
    if (k in WEAPONS) return t(`weapon.${k}` as 'weapon.pixelBlaster');
    if ((ALL_RARE as readonly string[]).includes(k)) return t(`rare.${k}` as 'rare.slushMachine');
    if (k in TOWERS) return t(`tower.${k}` as 'tower.laser');
    return t(`source.${k}` as 'source.stomp');
  };
  const hex = (c: number) => cssColor(playerColor(c));

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

  /** the pinned first-person tip closes itself after this long */
  const FP_TIP_SKIP_MS = 120_000;
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
      const dismiss = () => {
        if (!close.isConnected) return;
        markSeen(FP_TIP_KEY);
        close.remove();
        box.classList.remove('pinned');
        rotate();
      };
      close.addEventListener('click', e => {
        e.stopPropagation();
        actions.click();
        dismiss();
      });
      box.append(close);
      // nobody closed it: after two minutes it moves on by itself
      window.setTimeout(() => box.isConnected && dismiss(), FP_TIP_SKIP_MS);
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
      link(s, 'credits-mail', t('credits.mail'), 'mailto:hello@amannlabs.eu');
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
      // two cards side by side (one above the other on a narrow screen), so nothing needs scrolling:
      // the game on the left; sound, you and about on the right. In each a label on the left, its control on the right
      const columns = document.createElement('div');
      columns.className = 'settings-columns';
      s.append(columns);
      const cards = [0, 1].map(() => {
        const c = document.createElement('div');
        c.className = 'settings-card';
        columns.append(c);
        return c;
      });
      let card = cards[1];
      const row = (label: string) => {
        text(card, 'div', 'settings-label', label);
        const cell = document.createElement('div');
        cell.className = 'settings-cell';
        card.append(cell);
        return cell;
      };
      const section = (label: string, column: 0 | 1 = 1) => {
        card = cards[column];
        return text(card, 'div', 'settings-section', label);
      };
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

      // graphics sit with the sound on the right, where there is room for all four
      chips(t('settings.graphics'), GRAPHICS_QUALITIES.map(g => ({ label: t(`graphics.${g}`), value: g })), () => settings.graphics, v => (settings.graphics = v));
      section(t('settings.gameplay'), 0);
      const keys = row(t('settings.keys'));
      const change = document.createElement('button');
      change.className = 'chip small';
      change.textContent = `${t('settings.changeKeys')} ›`;
      change.addEventListener('click', () => {
        actions.click();
        controlsScreen();
      });
      keys.append(change);
      chips(t('settings.mouse'), [0.5, 1, 1.5, 2, 3].map(v => ({ label: `${v}×`, value: v })), () => settings.mouseSensitivity, v => (settings.mouseSensitivity = v));
      chips(t('settings.walk'), [{ label: t('settings.walkScreen'), value: false }, { label: t('settings.walkAim'), value: true }], () => settings.steerWithMouse, v => (settings.steerWithMouse = v));
      chips(t('settings.damageNumbers'), onOff, () => settings.damageNumbers, v => (settings.damageNumbers = v));
      chips(t('settings.killCam'), onOff, () => settings.killCam, v => (settings.killCam = v));
      chips(t('settings.colorBlind'), onOff, () => settings.colorBlind, v => (settings.colorBlind = v));
      text(card, 'div', 'settings-note', t('settings.colorBlindHint'));

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
        [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(c => {
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
      section(t('settings.about'));
      text(row(t('settings.version')), 'span', 'settings-version', `v${APP_VERSION}`);
      text(s, 'p', 'controls-help', t('menu.controls'));
      button(s, t('menu.back'), () => back(), true);
    });
  }

  /** one row per action with its key: click it, then press the new key */
  function controlsScreen() {
    show('settings controls', s => {
      text(s, 'h2', '', t('controls.title'));
      text(s, 'p', 'controls-hint', t('controls.hint'));
      const grid = document.createElement('div');
      grid.className = 'controls-grid';
      s.append(grid);
      const notice = text(s, 'p', 'controls-notice', '');
      const say = (msg: string) => {
        notice.textContent = msg;
        notice.classList.remove('pop');
        void notice.offsetWidth;
        notice.classList.add('pop');
      };
      const buttons = new Map<Action, HTMLButtonElement>();
      let listening: Action | null = null;
      const draw = () => {
        for (const [a, b] of buttons) {
          b.textContent = a === listening ? t('controls.press') : keyLabel(settings.bindings[a]);
          b.classList.toggle('listening', a === listening);
        }
      };
      const stop = () => {
        removeEventListener('keydown', onKey, true);
        listening = null;
        stopListening = null;
        draw();
      };
      // capture on the window: runs before the game's own key handler, which never sees the key
      const onKey = (e: KeyboardEvent) => {
        if (!listening) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        const action = listening;
        if (e.code === 'Escape') return stop();
        if (!canBind(e.code)) return say(t('controls.reserved', { key: keyLabel(e.code) }));
        const r = assignKey(settings.bindings, action, e.code);
        settings.bindings = r.bindings;
        changed();
        const name = (a: Action) => t(`action.${a}` as 'action.up');
        say(r.swapped ? t('controls.swapped', { a: name(action), b: name(r.swapped) }) : t('controls.set', { a: name(action), key: keyLabel(e.code) }));
        stop();
        buttons.get(action)?.focus();
      };
      const listen = (a: Action) => {
        if (!listening) addEventListener('keydown', onKey, true);
        listening = a;
        stopListening = stop;
        draw();
      };
      for (const a of ACTIONS) {
        const row = document.createElement('div');
        row.className = 'controls-row';
        text(row, 'span', 'controls-action', t(`action.${a}` as 'action.up'));
        const b = document.createElement('button');
        b.className = 'chip small key-chip';
        b.addEventListener('click', () => {
          actions.click();
          if (listening === a) stop();
          else listen(a);
        });
        buttons.set(a, b);
        row.append(b);
        grid.append(row);
      }
      // pause is not for changing: Escape must always get you out
      const pauseRow = document.createElement('div');
      pauseRow.className = 'controls-row';
      text(pauseRow, 'span', 'controls-action', t('controls.pause'));
      text(pauseRow, 'span', 'chip small key-chip fixed', 'Esc / P');
      grid.append(pauseRow);
      draw();
      text(s, 'p', 'controls-help', t('controls.fixed'));
      const foot = document.createElement('div');
      foot.className = 'row2';
      s.append(foot);
      button(foot, t('controls.reset'), () => {
        if (listening) stop();
        settings.bindings = { ...DEFAULT_BINDINGS };
        changed();
        draw();
        say(t('controls.resetDone'));
      });
      button(foot, t('menu.back'), () => settingsScreen(), true);
    });
  }

  /** maps for "Single floor": the floors of the tower in their order */
  const QUICK_MAPS = [...RUN_FLOORS.slice(0, 4), 'highway', RUN_FLOORS[4], 'jungle', 'servers', 'underwater', 'race', 'lane', 'maze'].filter(id => FLOORS[id] && FLOORS[id].kind !== 'shaft');

  function lanScreen() {
    show('', s => {
      text(s, 'h2', '', t('menu.lan'));
      text(s, 'p', 'mode-hint', t('lan.intro'));
      // two cards: what each choice does, and one button each
      const cards = document.createElement('div');
      cards.className = 'mode-cards lan-cards';
      s.append(cards);
      for (const [title, sub, label_, fn, primary] of [
        [t('lan.joinTitle'), t('lan.joinSub'), t('menu.join'), actions.join, false],
        [t('lan.hostTitle'), t('lan.hostSub'), t('menu.host'), actions.host, true],
      ] as [string, string, string, () => void, boolean][]) {
        const card = document.createElement('div');
        card.className = 'daily-box lan-box';
        text(card, 'div', 'setup-label', title);
        text(card, 'p', 'mode-hint', sub);
        button(card, label_, fn, primary).classList.add('small');
        cards.append(card);
      }
      button(s, t('menu.back'), () => api.title());
    });
  }

  /** which map list is open (they close again when another page is drawn) */
  let openMaps: string | null = null;
  /** a map as a drop-down: the button shows the choice, a click opens every map below it */
  const mapPicker = (parent: HTMLElement, redraw: () => void, key: 'brawlMap' | 'rushMap' | 'quickMap', options: string[]) => {
    const nameOf = (id: string) => (id === MAP_ROTATION ? t('setup.random') : id === RUSH_OWN ? t('setup.ownFloors') : t(FLOORS[id].name as 'floor.plaza') + (key === 'quickMap' && FLOORS[id].kind === 'boss' ? ' ☠' : ''));
    const open = openMaps === key;
    // the button and its list sit in one box, so the list hangs right under the button
    const box = document.createElement('span');
    box.className = 'map-drop';
    parent.append(box);
    const c = document.createElement('button');
    c.className = `chip small drop${open ? ' open' : ''}`;
    c.textContent = `${t('setup.map')}: ${nameOf(settings[key])}`;
    c.addEventListener('click', () => {
      actions.click();
      openMaps = open ? null : key;
      redraw();
    });
    box.append(c);
    if (!open) return;
    const list = document.createElement('div');
    list.className = 'map-list';
    for (const id of options) {
      const o = document.createElement('button');
      o.className = `chip small${id === settings[key] ? ' on' : ''}`;
      o.textContent = nameOf(id);
      o.addEventListener('click', () => {
        actions.click();
        settings[key] = id;
        openMaps = null;
        changed();
        redraw();
      });
      list.append(o);
    }
    box.append(list);
  };
  /** the Boss Brawl's map (the arena, random, then every other floor) or the Boss Rush's (their own floors first) */
  const brawlMapChip = (parent: HTMLElement, redraw: () => void, key: 'brawlMap' | 'rushMap' = 'brawlMap') =>
    mapPicker(parent, redraw, key, key === 'rushMap' ? [RUSH_OWN, MAP_ROTATION, ...BRAWL_MAPS] : [BRAWL_MAPS[0], MAP_ROTATION, ...BRAWL_MAPS.slice(1)]);
  /** the map of a Single floor */
  const quickMapChip = (parent: HTMLElement, redraw: () => void) => {
    if (!QUICK_MAPS.includes(settings.quickMap)) settings.quickMap = QUICK_MAPS[0];
    mapPicker(parent, redraw, 'quickMap', QUICK_MAPS);
  };

  /** the versus match the settings describe (the map rotation picks a random arena) */
  const versusOption = (): VersusChoice => ({ mode: settings.versusRule === 'capture' ? 'team' : settings.versusRule === 'gungame' ? 'ffa' : settings.versusMode, rule: settings.versusRule, map: versusMapFor(settings.versusMap, lastArena), chaos: settings.versusChaos !== false, boss: settings.versusChaos === 'boss' });
  /** the arena of the last match started from the lobby (the rotation picks another one) */
  let lastArena: string | null = null;
  const startOption = (): VersusChoice => {
    const o = versusOption();
    lastArena = o.map;
    return o;
  };

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
        choose(
          t('setup.rule'),
          (['score', 'rounds', 'king', 'capture', 'gungame', 'coinop'] as const).map(r => ({ label: t(`versus.${r}` as 'versus.score'), value: r })),
          settings.versusRule,
          v => {
            settings.versusRule = v;
            // capture the cube is a team game
            if (v === 'capture') settings.versusMode = 'team';
          },
          true,
        );
        text(body, 'p', 'mode-hint', t(`versus.${settings.versusRule}Hint` as 'versus.scoreHint'));
        // capture is always teams and gun game always everyone for themselves: no choice to offer there
        if (settings.versusRule !== 'capture' && settings.versusRule !== 'gungame') {
          choose(t('setup.mode'), [{ label: t('versus.ffa'), value: 'ffa' as const }, { label: t('versus.team'), value: 'team' as const }], settings.versusMode, v => (settings.versusMode = v));
        }
        choose<boolean | 'boss'>(t('setup.chaos'), [{ label: t('settings.off'), value: false }, { label: t('versus.chaosOn'), value: true }, { label: t('versus.chaosBoss'), value: 'boss' }], settings.versusChaos, v => (settings.versusChaos = v));
        if (!VERSUS_MAPS.includes(settings.versusMap) && settings.versusMap !== MAP_ROTATION) settings.versusMap = VERSUS_MAPS[0];
        // "Rotation": a random arena, and a new one after every match
        choose(t('setup.map'), [{ label: t('setup.rotation'), value: MAP_ROTATION }, ...VERSUS_MAPS.map(id => ({ label: t(FLOORS[id].name as 'floor.plaza'), value: id }))], settings.versusMap, v => (settings.versusMap = v), true);
      }
      if (mode === 'versus') {
        if (!lan) {
          // like the LAN lobby: how many players the match has, bots fill up the rest
          const humans = settings.localPlayers;
          const sizes = [humans, ...[2, 4, 6, 8, 10].filter(n => n > humans)];
          if (!sizes.includes(settings.versusSize)) settings.versusSize = sizes.find(n => n >= settings.versusSize) ?? MAX_PLAYERS;
          choose(t('setup.size'), sizes.map(n => ({ label: n === humans ? t('lobby.fillOff') : String(n), value: n })), settings.versusSize, v => (settings.versusSize = v));
        }
        // how well the bots play (on the LAN: the host's bots)
        choose(t('setup.bots'), DIFFICULTIES.map(d => ({ label: t(`difficulty.${d}` as 'difficulty.medium'), value: d })), settings.versusBots, v => (settings.versusBots = v), true);
      } else {
        choose(t('settings.difficulty'), DIFFICULTIES.map(d => ({ label: t(`difficulty.${d}` as 'difficulty.medium'), value: d })), settings.difficulty, v => (settings.difficulty = v), true);
      }
      if (lan) {
        // on the LAN: start this match now, or put it to the vote next to a surprise card
        const option = versusOption;
        const row = document.createElement('div');
        row.className = 'row2';
        s.append(row);
        // the match is only chosen here: Done goes back to the lobby, where Start begins it
        button(row, t('lobby.done'), () => lan.backToLobby(), true);
        if (!settings.versusDiscovery) button(row, t('lobby.voteThis'), () => lan.startVote(option()));
        return;
      }
      choose(t('setup.players'), [{ label: t('menu.onePlayer'), value: 1 as const }, { label: t('menu.twoPlayers'), value: 2 as const }], settings.localPlayers, v => (settings.localPlayers = v));
      if (mode === 'versus' && settings.localPlayers === 2 && settings.versusRule !== 'gungame' && (settings.versusMode === 'team' || settings.versusRule === 'capture')) {
        choose(t('setup.split'), [{ label: t('setup.together'), value: true }, { label: t('setup.against'), value: false }], settings.splitTogether, v => (settings.splitTogether = v));
      }
      if (mode === 'run') {
        // the Daily Run: same seed for everyone today, its own best list
        const date = dailyDate(new Date());
        const box = document.createElement('div');
        box.className = 'daily-box';
        text(box, 'div', 'setup-label', t('daily.title'));
        text(box, 'p', 'mode-hint', t('daily.sub', { date }));
        const best = dailyBest(browserStore(), date);
        text(box, 'p', 'daily-best', best.length ? t('daily.best', { list: best.join(' · ') }) : t('daily.none'));
        const b = button(box, t('daily.play'), actions.daily);
        b.classList.add('small');
        // the three extra games side by side, as small cards
        const cards = document.createElement('div');
        cards.className = 'mode-cards';
        s.append(cards);
        cards.append(box);
        // the Boss Rush: every boss in a row
        const rush = document.createElement('div');
        rush.className = 'daily-box rush-box';
        text(rush, 'div', 'setup-label', t('bossrush.title'));
        text(rush, 'p', 'mode-hint', t('bossrush.sub'));
        brawlMapChip(rush, () => setupScreen(mode, lan), 'rushMap');
        const rb = button(rush, t('bossrush.play'), actions.bossRush);
        rb.classList.add('small');
        cards.append(rush);
        // the Boss Brawl: every boss in one arena, one or two at a time
        const brawl = document.createElement('div');
        brawl.className = 'daily-box rush-box';
        text(brawl, 'div', 'setup-label', t('brawl.title'));
        text(brawl, 'p', 'mode-hint', t('brawl.sub'));
        brawlMapChip(brawl, () => setupScreen(mode, lan));
        const bb = button(brawl, t('brawl.play'), actions.bossBrawl);
        bb.classList.add('small');
        cards.append(brawl);
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
        button(row, t('menu.online'), actions.online);
        const row2 = document.createElement('div');
        row2.className = 'row2';
        s.append(row2);
        button(row2, t('menu.unlocks'), unlocksScreen);
        tipBox(s);
        const foot = document.createElement('div');
        foot.className = 'foot';
        s.append(foot);
        for (const [label_, icon, fn, cls] of [[t('menu.settings'), ICONS.settings, settingsScreen, ''], [t('menu.credits'), ICONS.credits, creditsScreen, ''], [t('menu.quit'), ICONS.quit, actions.quit, 'quit']] as [string, string, (() => void) | undefined, string][]) {
          if (!fn) continue;
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
        const title = r.headline ?? (won && r.mode === 'run' ? t('won.run') : won && (r.mode === 'bossrush' || r.mode === 'brawl') ? t('won.bossrush') : t(won ? 'won.title' : 'lost.title'));
        text(s, 'h2', '', title);
        if (!won) text(s, 'p', '', t('lost.subtitle'));
        const m = Math.floor(r.seconds / 60), sec = String(Math.floor(r.seconds % 60)).padStart(2, '0');
        const versus = r.mode === 'versus';
        if (r.daily) text(s, 'p', 'daily-best', t('daily.result', { date: r.daily }));
        if (!versus) text(s, 'p', '', `${t(`difficulty.${r.difficulty}`)} · ${t('result.time', { time: `${m}:${sec}` })}${r.mode === 'run' ? ` · ${t('result.floors', { n: r.floors })}` : ''}`);
        if (versus) text(s, 'p', '', t('result.time', { time: `${m}:${sec}` }));
        else text(s, 'div', 'bigscore', t('result.score', { score: r.score }));
        if (r.best[0] === r.score && r.score > 0) text(s, 'p', 'newbest', t('result.newBest'));
        for (const u of r.unlocked) text(s, 'p', 'newbest', t('result.unlocked', { name: t(`unlock.${u}` as 'unlock.endless') }));
        if (r.tickets > 0) text(s, 'p', 'newbest', t('result.tickets', { n: r.tickets }));

        const table = document.createElement('table');
        table.className = 'ranking txt';
        const head = ['', t('rank.player'), t('rank.score'), t('rank.kills'), t('rank.weapon'), t('rank.combo'), t('rank.towers'), t('rank.coins'), t('rank.revives'), t('rank.downs')];
        // versus has no towers, coins or revives: just who scored, who crashed whom, and who went down
        const cols = versus ? [0, 1, 2, 3, 9] : head.map((_h, i) => i);
        table.innerHTML = `<tr>${cols.map(i => `<th>${head[i]}</th>`).join('')}</tr>`;
        r.ranking.forEach((row, i) => {
          const tr = document.createElement('tr');
          const cells = [i === 0 && r.ranking.length > 1 ? '\u2605' : `${i + 1}.`, row.name, row.score, row.kills, sourceName(row.bestWeapon), row.bestCombo, row.towers, row.coins, row.revives, row.downs];
          cols.forEach(j => {
            const c = cells[j];
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
    lobby(players, difficulty, isHost, me, lan, vote, server) {
      countdown = null;
      show('lobby-screen', s => {
        text(s, 'h2', '', t('lobby.title', { n: players.length }));
        if (server) text(s, 'p', 'lobby-server', t('lobby.server', { name: server.name, mode: modeName(server.mode) }));
        const list = document.createElement('div');
        list.className = 'lobby txt';
        for (const p of players) {
          const row = document.createElement('div');
          row.className = 'lobby-row';
          const swatch = document.createElement('i');
          swatch.style.background = hex(p.color);
          row.append(swatch, document.createTextNode(`${p.name}${p.id === 0 ? ' ★' : ''}${p.bot ? ' 🤖' : ''}${p.id === me ? ` (${t('lobby.you')})` : ''}${p.ready ? ' \u2713' : ''}`));
          // team wish: everyone sets their own, the others see it (not on a server that never plays teams)
          const teams = !server || server.teams;
          if (!p.bot && teams) {
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
            c.innerHTML = `<div class="key">${i + 1}</div><div class="name">${t(o.mode === 'ffa' ? 'versus.ffa' : 'versus.team')}</div><div>${t(`versus.${o.rule}` as 'versus.score')}</div><div class="map">${t(FLOORS[o.map].name as 'floor.plaza')}</div>${o.chaos ? `<div class="chaos">${t(o.boss ? 'versus.chaosBossCard' : 'versus.chaosCard')}</div>` : ''}<div class="count">${'●'.repeat(n) || '–'}</div>`;
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
          // the host's card: what to play, row by row. A label on the left, the choices on the right; a click on a
          // game starts it for everyone
          text(s, 'p', 'lobby-hint', t('lobby.hostHint'));
          const card = document.createElement('div');
          card.className = 'setup-body lobby-card';
          s.append(card);
          const rowOf = (title: string) => {
            const g = document.createElement('div');
            g.className = 'setup-row';
            text(g, 'div', 'setup-label', title);
            const row = document.createElement('div');
            row.className = 'chips';
            g.append(row);
            card.append(g);
            return row;
          };
          const chip = (row: HTMLElement, label_: string, on: boolean, fn: () => void) => {
            const c = document.createElement('button');
            c.className = `chip small${on ? ' on' : ''}`;
            c.textContent = label_;
            c.addEventListener('click', () => {
              actions.click();
              fn();
            });
            row.append(c);
          };
          // pick the game here; Start (next to Leave) begins it for everyone
          const pick = (g: Settings['lanGame']) => {
            settings.lanGame = g;
            changed();
            api.lobby(players, difficulty, isHost, me, lan, vote, server);
          };
          if (settings.lanGame === 'endless' && !profile.unlocked.includes('endless')) settings.lanGame = 'run';
          // one row for every game: the co-op ones and versus
          const games = rowOf(t('lobby.gameRow'));
          chip(games, t('mode.run'), settings.lanGame === 'run', () => pick('run'));
          chip(games, t('mode.quick'), settings.lanGame === 'quick', () => pick('quick'));
          chip(games, t('bossrush.title'), settings.lanGame === 'bossrush', () => pick('bossrush'));
          chip(games, t('brawl.title'), settings.lanGame === 'brawl', () => pick('brawl'));
          if (profile.unlocked.includes('endless')) chip(games, t('mode.endless'), settings.lanGame === 'endless', () => pick('endless'));
          chip(games, t('mode.versus'), settings.lanGame === 'versus', () => pick('versus'));
          if (settings.lanGame === 'versus') {
            const vs = rowOf(t('lobby.matchRow'));
            // the match Start will begin, and the page that changes it (rule, map, or a vote)
            const o = versusOption();
            const what = settings.versusDiscovery ? t('versus.discovery') : `${t(`versus.${o.rule}` as 'versus.score')} · ${settings.versusMap === MAP_ROTATION ? t('setup.rotation') : t(FLOORS[o.map].name as 'floor.plaza')}`;
            text(vs, 'span', 'lobby-note', what);
            if (!vote) chip(vs, t('lobby.versus'), false, () => setupScreen('versus', lan));
            else text(vs, 'span', 'lobby-note', t('lobby.voteRunning'));
            // one control for the bots: how many players a versus match is topped up to (bots show up right away)
            const botsRow = rowOf(t('lobby.botsRow'));
            const sizes = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const at = Math.max(0, sizes.indexOf(lan.autoFill()));
            const stepTo = (k: number) => lan.setAutoFill(sizes[Math.max(0, Math.min(sizes.length - 1, k))]);
            chip(botsRow, '\u2212', false, () => stepTo(at - 1));
            text(botsRow, 'span', 'lobby-note', lan.autoFill() === 0 ? t('lobby.fillOff') : t('lobby.fill', { n: lan.autoFill() }));
            chip(botsRow, '+', false, () => stepTo(at + 1));
          } else {
            if (settings.lanGame === 'quick') quickMapChip(rowOf(t('setup.map')), () => api.lobby(players, difficulty, isHost, me, lan, vote, server));
            if (settings.lanGame === 'brawl') brawlMapChip(rowOf(t('setup.map')), () => api.lobby(players, difficulty, isHost, me, lan, vote, server));
            if (settings.lanGame === 'bossrush') brawlMapChip(rowOf(t('setup.map')), () => api.lobby(players, difficulty, isHost, me, lan, vote, server), 'rushMap');
            const diffRow = rowOf(t('settings.difficulty'));
            for (const d of DIFFICULTIES) chip(diffRow, t(`difficulty.${d}` as 'difficulty.medium'), d === difficulty, () => lan.setDifficulty(d));
          }
          // the view for everyone (co-op and versus)
          const viewRow = rowOf(t('lobby.view'));
          for (const v of ['both', 'fp', 'top'] as const) chip(viewRow, t(`lobby.view.${v}` as 'lobby.view.both'), lan.viewMode() === v, () => lan.setViewMode(v));
        } else if (server) {
          // a dedicated server starts by itself: the countdown, and a button to say you are ready
          if (isCoop(server.mode)) text(s, 'p', '', diffLabel(difficulty));
          countdown = text(s, 'p', 'lobby-countdown', countdownText(server));
          // ready only counts between matches
          if (!server.running) {
            const ready = !!players.find(p => p.id === me)?.ready;
            const b = button(s, ready ? t('lobby.isReady') : t('lobby.ready'), () => lan.setReady(!ready), !ready);
            if (ready) b.classList.add('on');
            text(s, 'p', 'credits-small', t('lobby.readyHint'));
          }
        } else {
          text(s, 'p', '', diffLabel(difficulty));
          text(s, 'p', 'blinking', t('lobby.waiting'));
        }
        // Leave on the left; for the host, Start on the right: now it begins, with the game picked above
        const foot = document.createElement('div');
        foot.className = 'row2';
        s.append(foot);
        button(foot, t('lobby.leave'), lan.leave);
        if (isHost && !vote) {
          button(foot, t('setup.start'), () => {
            const g = settings.lanGame;
            if (g === 'run') lan.start();
            else if (g === 'versus') settings.versusDiscovery ? lan.startDiscovery() : lan.startVersus(startOption());
            else lan.startMode(g);
          }, true);
        }
      });
    },
    lobbyCountdown(server) {
      if (countdown?.isConnected) countdown.textContent = countdownText(server);
    },
    online(h) {
      // Escape leaves through the same door as Back (which stops the checking)
      back = h.back;
      let list: HTMLElement;
      show('', s => {
        text(s, 'h2', '', t('menu.online'));
        text(s, 'p', 'credits-small', t(h.web ? 'online.introWeb' : 'online.intro'));
        list = document.createElement('div');
        list.className = 'server-list txt';
        s.append(list);
        text(list, 'p', 'blinking', t('online.checking'));
        // add a server by address: it is remembered on this computer
        const row = document.createElement('div');
        row.className = 'server-add';
        text(row, 'span', 'setup-label', t('online.addLabel'));
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'textfield';
        input.placeholder = h.web ? 'play.example.org' : '10.12.3.23:47800';
        const error = text(s, 'p', 'server-error', '');
        const add = () => {
          const address = normalizeAddress(input.value, h.defaultPort);
          if (!address) {
            error.textContent = t('online.badAddress');
            return;
          }
          error.textContent = '';
          input.value = '';
          h.add(address);
        };
        input.addEventListener('keydown', e => {
          e.stopPropagation();
          if (e.key === 'Enter') add();
        });
        row.append(input);
        const addBtn = button(row, t('online.add'), add);
        addBtn.classList.add('small');
        s.insertBefore(row, error);
        button(s, t('menu.back'), h.back);
      });
      return {
        update(rows) {
          list.replaceChildren();
          if (rows.length === 0) text(list, 'p', '', t('online.empty'));
          for (const r of rows) {
            const el = document.createElement('div');
            el.className = `server-row ${r.status}`;
            const name = document.createElement('div');
            name.className = 'server-name';
            name.textContent = r.name;
            if (r.own) {
              const tag = document.createElement('span');
              tag.className = 'server-tag';
              tag.textContent = t('online.yours');
              name.append(tag);
            }
            const sub = document.createElement('div');
            sub.className = 'server-sub';
            const bits =
              r.status === 'checking' ? [t('online.checking')]
              : r.status === 'offline' ? [t('online.offline'), r.address]
              : r.status === 'incompatible' ? [t('online.otherVersion', { v: r.info!.version }), r.address]
              : [modeName(r.info!.mode), seats(r), t('online.ping', { ms: r.ping ?? 0 }), ...(r.info!.playing ? [t('online.running')] : [])];
            sub.textContent = bits.join(' · ');
            const info = document.createElement('div');
            info.className = 'server-info';
            info.append(name, sub);
            el.append(info);
            if (r.status === 'online') {
              const b = button(el, t('online.join'), () => h.join(r.address), true);
              b.classList.add('small');
            }
            if (r.own) {
              const x = document.createElement('button');
              x.className = 'server-remove';
              x.title = t('online.remove');
              x.textContent = '\u2715';
              x.addEventListener('click', () => {
                actions.click();
                h.remove(r.address);
              });
              el.append(x);
            }
            list.append(el);
          }
        },
      };
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
    notice(textValue, goBack) {
      if (goBack) back = goBack;
      show('', s => {
        text(s, 'p', '', textValue);
        if (goBack) button(s, t('menu.back'), goBack, true);
        else button(s, t('menu.mainMenu'), actions.mainMenu, true);
      });
    },
    lanMenu: lanScreen,
    hide() {
      layer.innerHTML = '';
    },
    get visible() {
      return layer.childElementCount > 0;
    },
  };
  return api;
}
