import { describe, expect, it } from 'vitest';
import { setKeyBindings, t } from '../src/i18n';
import { DEFAULT_BINDINGS } from '../src/input/bindings';

describe('t', () => {
  it('returns English strings', () => {
    expect(t('title')).toBe('Cube Crashers');
  });

  it('fills placeholders', () => {
    expect(t('hud.nests', { n: 3, total: 4 })).toBe('Nests 3/4');
  });
});

describe('key names in the text', () => {
  it('fills in the player\'s keys, the defaults until told otherwise', () => {
    expect(t('hud.build')).toBe('Press E to build');
    setKeyBindings({ ...DEFAULT_BINDINGS, use: 'KeyF', jump: 'ShiftLeft', dash: 'Space' });
    expect(t('hud.build')).toBe('Press F to build');
    expect(t('toast.jetpack')).toBe('Jetpack! Hold Shift to fly');
    // a placeholder passed in wins (a controller shows its button)
    expect(t('hud.build', { 'key.use': 'X' })).toBe('Press X to build');
    setKeyBindings(DEFAULT_BINDINGS);
    expect(t('hud.build')).toBe('Press E to build');
  });
});
