import { describe, expect, it } from 'vitest';
import { ACTIONS, actionOf, assignKey, canBind, DEFAULT_BINDINGS, keyHints, keyLabel, validBindings } from '../src/input/bindings';

describe('key bindings', () => {
  it('the defaults are the keys the game always used, each once', () => {
    expect(DEFAULT_BINDINGS.use).toBe('KeyE');
    expect(DEFAULT_BINDINGS.jump).toBe('Space');
    expect(DEFAULT_BINDINGS.weapon1).toBe('Digit1');
    expect(DEFAULT_BINDINGS.rare).toBe('KeyQ');
    const codes = ACTIONS.map(a => DEFAULT_BINDINGS[a]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('assigning a free key moves the action there', () => {
    const r = assignKey(DEFAULT_BINDINGS, 'use', 'KeyF');
    expect(r.bindings.use).toBe('KeyF');
    expect(r.swapped).toBeNull();
    // the defaults themselves stay untouched
    expect(DEFAULT_BINDINGS.use).toBe('KeyE');
  });

  it('assigning a key another action uses swaps the two', () => {
    const r = assignKey(DEFAULT_BINDINGS, 'use', 'Space');
    expect(r.bindings.use).toBe('Space');
    expect(r.bindings.jump).toBe('KeyE');
    expect(r.swapped).toBe('jump');
  });

  it('the pause keys and Escape cannot be bound', () => {
    expect(canBind('Escape')).toBe(false);
    expect(canBind('KeyP')).toBe(false);
    expect(canBind('KeyF')).toBe(true);
    expect(assignKey(DEFAULT_BINDINGS, 'use', 'Escape').bindings).toEqual(DEFAULT_BINDINGS);
  });

  it('loading keeps valid bindings and fixes broken ones', () => {
    expect(validBindings({ ...DEFAULT_BINDINGS, use: 'KeyF' }).use).toBe('KeyF');
    expect(validBindings(undefined)).toEqual(DEFAULT_BINDINGS);
    expect(validBindings('nonsense')).toEqual(DEFAULT_BINDINGS);
    // an unknown action is dropped, a bad value falls back to its default
    const odd = validBindings({ jump: 42, dance: 'KeyX', use: 'Escape' }) as unknown as Record<string, string>;
    expect(odd.jump).toBe('Space');
    expect(odd.use).toBe('KeyE');
    expect(odd.dance).toBeUndefined();
  });

  it('two actions on one key fall back to the defaults', () => {
    expect(validBindings({ ...DEFAULT_BINDINGS, use: 'Space' })).toEqual(DEFAULT_BINDINGS);
  });

  it('finds the action of a key, with arrows, right Shift and the number pad as extra keys', () => {
    expect(actionOf(DEFAULT_BINDINGS, 'KeyE')).toBe('use');
    expect(actionOf(DEFAULT_BINDINGS, 'ArrowUp')).toBe('up');
    expect(actionOf(DEFAULT_BINDINGS, 'ShiftRight')).toBe('dash');
    expect(actionOf(DEFAULT_BINDINGS, 'Numpad3')).toBe('weapon3');
    expect(actionOf(DEFAULT_BINDINGS, 'KeyK')).toBeNull();
    // a bound key wins over an extra key
    const b = assignKey(DEFAULT_BINDINGS, 'jump', 'ArrowUp').bindings;
    expect(actionOf(b, 'ArrowUp')).toBe('jump');
  });

  it('shows key names the way players know them', () => {
    expect(keyLabel('KeyE')).toBe('E');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('Numpad4')).toBe('Num 4');
    expect(keyLabel('ControlRight')).toBe('Ctrl');
    expect(keyLabel('Semicolon')).toBe(';');
    expect(keyLabel('F5')).toBe('F5');
  });

  it('builds the hint words for the text', () => {
    const h = keyHints(DEFAULT_BINDINGS);
    expect(h['key.use']).toBe('E');
    expect(h['key.move']).toBe('WASD');
    expect(h['key.weapons']).toBe('1–6');
    expect(h['key.towers']).toBe('1–5');
    const moved = keyHints({ ...DEFAULT_BINDINGS, up: 'KeyI', left: 'KeyJ', down: 'KeyK', right: 'KeyL', weapon2: 'KeyX' });
    expect(moved['key.move']).toBe('IJKL');
    expect(moved['key.weapons']).toBe('1/X/3/4/5/6');
    expect(keyHints({ ...DEFAULT_BINDINGS, up: 'ArrowUp' })['key.move']).toBe('↑/A/S/D');
  });
});

describe('the map key', () => {
  it('M shows or hides the minimap, and it can be rebound like the others', () => {
    expect(DEFAULT_BINDINGS.map).toBe('KeyM');
    const { bindings } = assignKey(DEFAULT_BINDINGS, 'map', 'KeyN');
    expect(bindings.map).toBe('KeyN');
  });
});
