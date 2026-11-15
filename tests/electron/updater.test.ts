import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, shell: {} }));
const require = createRequire(import.meta.url);

describe('the updater', () => {
  it('compares versions by their numbers, not as text', async () => {
    const { compareVersions } = require('../../electron/updater.cjs');
    expect(compareVersions('1.6.10', '1.6.9')).toBeGreaterThan(0);
    expect(compareVersions('1.6.1', '1.6.1')).toBe(0);
    expect(compareVersions('1.5.9', '1.6.0')).toBeLessThan(0);
  });

  it('links straight to the file for this computer, named as the release names it', async () => {
    const { downloadUrl } = require('../../electron/updater.cjs');
    const base = 'https://github.com/dominikamann/cube-crashers/releases';
    expect(downloadUrl('1.6.2', 'win32', 'x64')).toBe(`${base}/download/v1.6.2/CubeCrashers-1.6.2-win-x64.exe`);
    expect(downloadUrl('1.6.2', 'darwin', 'arm64')).toBe(`${base}/download/v1.6.2/CubeCrashers-1.6.2-mac-arm64.dmg`);
    expect(downloadUrl('1.6.2', 'darwin', 'x64')).toBe(`${base}/download/v1.6.2/CubeCrashers-1.6.2-mac-x64.dmg`);
    // (no build for Linux, no version known: the release page)
    expect(downloadUrl('1.6.2', 'linux', 'x64')).toBe(`${base}/latest`);
    expect(downloadUrl(null, 'win32', 'x64')).toBe(`${base}/latest`);
  });
});
