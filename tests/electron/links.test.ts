import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGAL_LINKS } from '../../src/ui/screens';
import { t } from '../../src/i18n';

describe('the links in the credits', () => {
  it('open in the desktop app too: every legal page is on its list of outside links, with a label', () => {
    const main = readFileSync(new URL('../../electron/main.cjs', import.meta.url), 'utf8');
    const allowed = /const EXTERNAL_LINKS = \[([\s\S]*?)\];/.exec(main)![1];
    for (const [key, url] of LEGAL_LINKS) {
      expect(allowed).toContain(`'${url}'`);
      expect(t(key)).not.toBe(key);
    }
  });
});
