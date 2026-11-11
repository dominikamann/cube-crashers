import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n';

describe('t', () => {
  it('returns English strings', () => {
    expect(t('title')).toBe('Cube Crashers');
  });

  it('fills placeholders', () => {
    expect(t('hud.wave', { n: 3, total: 10 })).toBe('Wave 3/10');
  });
});
