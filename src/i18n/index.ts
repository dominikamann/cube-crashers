import { en } from './en';
import { DEFAULT_BINDINGS, keyHints, type Action, type Bindings } from '../input/bindings';

export type StringKey = keyof typeof en;

/** {key.use}, {key.jump} … in the text show the keys the player chose */
let keys = keyHints(DEFAULT_BINDINGS);

export function setKeyBindings(b: Readonly<Bindings>): void {
  keys = keyHints(b);
}

/** the name of the key the player uses for `action`, e.g. "E" */
export function keyName(action: Action): string {
  return keys[`key.${action}`];
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  let text: string = en[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  // after the params, so a caller can still name a controller button instead
  if (text.includes('{key.')) text = text.replace(/\{(key\.\w+)\}/g, (m, k: string) => keys[k] ?? m);
  return text;
}
