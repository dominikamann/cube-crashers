/** Which keyboard key does what. Pure data and helpers, so settings, input and text can share them. */

export const ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'dash', 'use', 'view', 'zoom', 'map', 'emotes', 'weapon1', 'weapon2', 'weapon3', 'weapon4', 'weapon5', 'weapon6', 'rare'] as const;
export type Action = (typeof ACTIONS)[number];
/** action → KeyboardEvent.code */
export type Bindings = Record<Action, string>;

export const DEFAULT_BINDINGS: Readonly<Bindings> = Object.freeze({
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  use: 'KeyE',
  view: 'KeyV',
  zoom: 'KeyZ',
  map: 'KeyM',
  emotes: 'KeyC',
  weapon1: 'Digit1',
  weapon2: 'Digit2',
  weapon3: 'Digit3',
  weapon4: 'Digit4',
  weapon5: 'Digit5',
  weapon6: 'Digit6',
  rare: 'KeyQ',
});

/** the weapon slot actions in slot order: they also pick emotes, tower cards and shop offers */
export const WEAPON_ACTIONS = ['weapon1', 'weapon2', 'weapon3', 'weapon4', 'weapon5', 'weapon6'] as const;

/** Escape and P always pause; the Meta (Cmd) keys belong to the system */
const RESERVED = new Set(['Escape', 'KeyP', 'MetaLeft', 'MetaRight']);

/** keys that always work too, unless the player bound them to something else:
 *  the arrows walk, right Shift dashes, the number pad picks weapons */
const EXTRA: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ShiftRight: 'dash',
  ...Object.fromEntries(WEAPON_ACTIONS.map((a, i) => [`Numpad${i + 1}`, a])),
};

export function canBind(code: string): boolean {
  return /^[A-Za-z0-9]+$/.test(code) && !RESERVED.has(code);
}

/** Puts `action` on `code`. An action that had that key gets the old key of `action`, so nothing is left without one. */
export function assignKey(b: Readonly<Bindings>, action: Action, code: string): { bindings: Bindings; swapped: Action | null } {
  const bindings = { ...b };
  if (!canBind(code) || b[action] === code) return { bindings, swapped: null };
  const other = ACTIONS.find(a => b[a] === code) ?? null;
  if (other) bindings[other] = b[action];
  bindings[action] = code;
  return { bindings, swapped: other };
}

/** Bindings read from storage: a bad entry gets its default; if two actions end up on one key, all go back to the defaults. */
export function validBindings(raw: unknown): Bindings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_BINDINGS };
  for (const a of ACTIONS) {
    const v = src[a];
    if (typeof v === 'string' && canBind(v)) out[a] = v;
  }
  const codes = ACTIONS.map(a => out[a]);
  return new Set(codes).size === codes.length ? out : { ...DEFAULT_BINDINGS };
}

/** what a key does, or null */
export function actionOf(b: Readonly<Bindings>, code: string): Action | null {
  return ACTIONS.find(a => b[a] === code) ?? EXTRA[code] ?? null;
}

/** every key that triggers `action`: its own key and any extra key not bound elsewhere */
export function keysOf(b: Readonly<Bindings>, action: Action): string[] {
  return [b[action], ...Object.keys(EXTRA).filter(c => EXTRA[c] === action && actionOf(b, c) === action)];
}

const NAMES: Record<string, string> = {
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  CapsLock: 'Caps',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '<',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Insert: 'Ins',
  Delete: 'Del',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** "KeyE" → "E", "ShiftLeft" → "Shift", "Digit1" → "1", "ArrowUp" → "↑" */
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  let m = /^(?:Key|Digit)(.)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(.+)$/.exec(code);
  if (m) return `Num ${m[1]}`;
  m = /^(Shift|Control|Alt|Meta)(?:Left|Right)$/.exec(code);
  if (m) return { Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: 'Cmd' }[m[1]]!;
  return code;
}

/** a run of keys: "1–6" while they are the plain digits in order, otherwise each one */
function run(b: Readonly<Bindings>, actions: readonly Action[]): string {
  const labels = actions.map(a => keyLabel(b[a]));
  const digits = labels.every((l, i) => l === String(i + 1));
  return digits ? `1–${labels.length}` : labels.join('/');
}

/** the words the game text fills in for {key.…} */
export function keyHints(b: Readonly<Bindings>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of ACTIONS) out[`key.${a}`] = keyLabel(b[a]);
  const move = (['up', 'left', 'down', 'right'] as const).map(a => keyLabel(b[a]));
  out['key.move'] = move.every(l => /^[A-Z]$/.test(l)) ? move.join('') : move.join('/');
  out['key.weapons'] = run(b, WEAPON_ACTIONS);
  out['key.towers'] = run(b, WEAPON_ACTIONS.slice(0, 5));
  return out;
}
