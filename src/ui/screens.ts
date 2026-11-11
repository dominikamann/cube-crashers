import { t } from '../i18n';

export interface Settings {
  music: number;
  sfx: number;
}

const SETTINGS_KEY = 'cube-crashers.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { music: 0.8, sfx: 0.9, ...JSON.parse(raw) };
  } catch {
    // storage unavailable: use defaults
  }
  return { music: 0.8, sfx: 0.9 };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: settings only last for this session
  }
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
  won(score: number, seconds: number): void;
  lost(): void;
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
  }

  function text(parent: HTMLElement, tag: string, cls: string, value: string) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.classList.add('txt');
    e.textContent = value;
    parent.append(e);
    return e;
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
          saveSettings(settings);
          actions.settingsChanged(settings);
        });
        row.append(input);
        s.append(row);
      }
      button(s, t('menu.back'), () => back());
    });
  }

  const api: Screens = {
    title() {
      back = api.title;
      show('title', s => {
        text(s, 'div', 'logo', t('title'));
        text(s, 'p', '', t('tagline'));
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
    won(score, seconds) {
      show('', s => {
        text(s, 'h2', '', t('won.title'));
        const m = Math.floor(seconds / 60), sec = String(Math.floor(seconds % 60)).padStart(2, '0');
        text(s, 'p', '', t('won.stats', { score, time: `${m}:${sec}` }));
        button(s, t('menu.playAgain'), actions.play, true);
        button(s, t('menu.mainMenu'), actions.mainMenu);
      });
    },
    lost() {
      show('', s => {
        text(s, 'h2', '', t('lost.title'));
        text(s, 'p', '', t('lost.subtitle'));
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
