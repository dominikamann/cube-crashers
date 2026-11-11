import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n';

describe('t', () => {
  it('returns English strings', () => {
    expect(t('title')).toBe('Cube Crashers');
  });

  it('fills placeholders', () => {
    expect(t('hud.nests', { n: 3, total: 4 })).toBe('Nests 3/4');
  });
});
