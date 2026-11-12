import { describe, expect, it } from 'vitest';
import { setColorBlindWords, setKeyBindings, t } from '../src/i18n';
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

describe('team names', () => {
  it('say Red and Blue, and in colour-blind mode Orange and Blue with their shapes', () => {
    expect(t('versus.hudTeam', { red: 2, blue: 3, time: '1:00' })).toBe('Red 2 : 3 Blue · 1:00');
    setColorBlindWords(true);
    expect(t('versus.hudTeam', { red: 2, blue: 3, time: '1:00' })).toBe('▲ Orange 2 : 3 Blue ● · 1:00');
    expect(t('versus.team')).toBe('▲ Orange vs Blue ●');
    setColorBlindWords(false);
    expect(t('versus.red')).toBe('Red');
  });
});
