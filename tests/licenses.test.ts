import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { licensesText, OWN, THIRD_PARTY } from '../src/ui/licenses';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')) as { packages: Record<string, { version: string; dev?: boolean }> };

describe('the licenses the game names', () => {
  it('list every package it ships, at the version in package-lock.json (else run npm run licenses)', () => {
    const shipped = Object.entries(lock.packages)
      .filter(([path, p]) => path && !p.dev)
      .map(([path, p]) => `${path.replace(/^.*node_modules\//, '')} ${p.version}`)
      .sort();
    const listed = THIRD_PARTY.filter(e => e.version && e.name !== 'Electron').map(e => `${e.name} ${e.version}`).sort();
    expect(listed).toEqual(shipped);
  });

  it('carry a license text for each, and name Electron, the font and the Town’s open data', () => {
    for (const e of THIRD_PARTY) expect(e.text.length, e.name).toBeGreaterThan(100);
    const names = THIRD_PARTY.map(e => e.name).join(' | ');
    for (const part of ['Electron', '@fontsource/press-start-2p', 'three', 'LGL', 'OpenStreetMap']) expect(names + THIRD_PARTY.map(e => e.copyright).join(' | ')).toContain(part);
  });

  it('start with the game’s own license, its full text as in LICENSE', () => {
    const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').replace(/\r\n?/g, '\n').trim();
    expect(OWN.text.startsWith(license)).toBe(true);
  });

  it('come out as plain text for the server, the game’s own license first', () => {
    const out = licensesText();
    expect(out.startsWith('Cube Crashers')).toBe(true);
    expect(out).toContain('PolyForm Noncommercial License 1.0.0');
    expect(out).toContain('ODbL');
  });
});
