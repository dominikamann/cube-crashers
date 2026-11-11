import { en } from './en';

export type StringKey = keyof typeof en;

export function t(key: StringKey, params?: Record<string, string | number>): string {
  let text: string = en[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
