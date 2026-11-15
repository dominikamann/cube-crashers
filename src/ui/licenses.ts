// The third-party parts the game ships with (fonts, libraries, Electron, the Town's open data), with their license
// texts: the Licenses screen under Credits & Legal shows them, the dedicated server prints them with --licenses.
// licenses.json is written by `npm run licenses` from package-lock.json; tests/licenses.test.ts keeps it current.
import LICENSES from './licenses.json';

export interface LicenseEntry {
  name: string;
  version?: string;
  license: string;
  copyright: string;
  text: string;
}

export const THIRD_PARTY: readonly LicenseEntry[] = LICENSES;

/** the game's own license, named before the others */
export const OWN_LICENSE = 'PolyForm Noncommercial License 1.0.0';

/** all of them as plain text, for a terminal */
export function licensesText(): string {
  const rule = '-'.repeat(72);
  const parts = THIRD_PARTY.map(e => [`${e.name}${e.version ? ` ${e.version}` : ''} (${e.license})`, e.copyright, '', e.text].filter((l, i) => i !== 1 || l).join('\n'));
  return `Cube Crashers: ${OWN_LICENSE}, https://github.com/dominikamann/cube-crashers/blob/main/LICENSE\n\nBuilt with:\n\n${rule}\n\n` + parts.join(`\n\n${rule}\n\n`) + '\n';
}
