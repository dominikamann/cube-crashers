import { t } from '../i18n';

export interface Settings {
  music: number;
  sfx: number;
  /** on foot, W walks toward the crosshair instead of up the screen (karts never steer with the mouse) */
  steerWithMouse: boolean;
}

const SETTINGS_KEY = 'cube-crashers.settings';
const SCORES_KEY = 'cube-crashers.scores';
const DEFAULTS: Settings = { music: 0.8, sfx: 0.9, steerWithMouse: false };

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

/** Adds a score to the local top 5 and returns the list (highest first). */
export function recordScore(score: number): number[] {
  let scores: number[] = [];
  try {
    scores = JSON.parse(localStorage.getItem(SCORES_KEY) ?? '[]');
  } catch {
    // storage unavailable
  }
  scores = [...scores, score].sort((a, b) => b - a).slice(0, 5);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
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
  /** local top scores including this run */
  best: number[];
}

export interface ScreenActions {
  play(): void;
  resume(): void;
  mainMenu(): void;
  quit(): void;
  settingsChanged(s: Settings): void;
  click(): void;
}

export interface Screens {
  title(): void;
  pause(): void;
  result(won: boolean, summary: RunSummary): void;
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

  function changed() {
    saveSettings(settings);
    actions.settingsChanged(settings);
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
        button(s, t('menu.settings'), settingsScreen);
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
    result(won, r) {
      show('', s => {
        text(s, 'h2', '', t(won ? 'won.title' : 'lost.title'));
        if (!won) text(s, 'p', '', t('lost.subtitle'));
        text(s, 'div', 'bigscore', t('result.score', { score: r.score }));
        if (r.best[0] === r.score && r.score > 0) text(s, 'p', 'newbest', t('result.newBest'));
        const m = Math.floor(r.seconds / 60), sec = String(Math.floor(r.seconds % 60)).padStart(2, '0');
        text(s, 'p', '', t('result.stats', { time: `${m}:${sec}`, kills: r.kills, combo: r.maxCombo, credits: r.credits, nests: `${r.nestsDestroyed}/${r.nests}` }));
        text(s, 'p', '', `${t('result.best')}: ${r.best.join(' · ')}`);
        button(s, t('menu.playAgain'), actions.play, true);
        button(s, t('menu.mainMenu'), actions.mainMenu);
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
