import { describe, expect, it } from 'vitest';
import { Keyboard } from '../src/input/keyboard';
import { createSim } from '../src/sim/sim';
import { floor01 } from '../src/sim/config/floor01';

const PAD = floor01.pads.findIndex(p => p.pos.x === 31.5 && p.pos.z === 56.5);

function onPad() {
  const s = createSim(floor01, 1);
  s.players[0].pos = { ...floor01.pads[PAD].pos };
  return s;
}

describe('Keyboard', () => {
  it('normalizes diagonal movement', () => {
    const k = new Keyboard();
    k.keyDown('KeyW', 0);
    k.keyDown('KeyD', 0);
    const [move] = k.commands(createSim(floor01, 1), 0, 10);
    expect(move.type).toBe('move');
    if (move.type === 'move') expect(Math.hypot(move.dir.x, move.dir.z)).toBeCloseTo(1);
  });

  it('opens the build menu after holding E 150 ms on a pad and builds the chosen tower once', () => {
    const s = onPad();
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(s, 0, 100);
    expect(k.buildMenuOpen).toBe(false);
    k.commands(s, 0, 200);
    expect(k.buildMenuOpen).toBe(true);
    k.keyDown('Digit2', 210);
    const cmds = k.commands(s, 0, 220);
    expect(cmds.filter(c => c.type === 'build')).toEqual([{ type: 'build', playerId: 0, padId: PAD, tower: 'popcorn' }]);
    expect(k.commands(s, 0, 240).filter(c => c.type === 'build')).toHaveLength(0);
    k.onEvents([{ type: 'towerBuilt', kind: 'popcorn', padId: PAD }]);
    expect(k.buildMenuOpen).toBe(false);
  });

  it('keeps the menu open after a denied build so the cards can shake', () => {
    const s = onPad();
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(s, 0, 200);
    k.keyDown('Digit1', 210);
    k.commands(s, 0, 220);
    k.onEvents([{ type: 'buildDenied', padId: PAD, reason: 'coins' }]);
    expect(k.buildMenuOpen).toBe(true);
    expect(k.commands(s, 0, 240).filter(c => c.type === 'build')).toHaveLength(0);
  });

  it('does not open the build menu away from a pad', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(s, 0, 500);
    expect(k.buildMenuOpen).toBe(false);
  });

  it('closes the menu when E is released', () => {
    const s = onPad();
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(s, 0, 200);
    k.keyUp('KeyE');
    k.commands(s, 0, 210);
    expect(k.buildMenuOpen).toBe(false);
  });

  it('builds via a clicked card while the menu is open', () => {
    const s = onPad();
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(s, 0, 200);
    k.chooseTower('frost');
    expect(k.commands(s, 0, 210).filter(c => c.type === 'build')).toEqual([{ type: 'build', playerId: 0, padId: PAD, tower: 'frost' }]);
  });
});

describe('action keys and mouse', () => {
  const types = (k: Keyboard, s: ReturnType<typeof createSim>, now: number) => k.commands(s, 0, now).map(c => c.type);

  it('sends one jump per press of Space and one dash per press of Shift', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.keyDown('Space', 0);
    k.keyDown('ShiftLeft', 0);
    expect(types(k, s, 10)).toEqual(expect.arrayContaining(['jump', 'dash']));
    expect(types(k, s, 20)).not.toEqual(expect.arrayContaining(['jump']));
    expect(types(k, s, 20)).not.toEqual(expect.arrayContaining(['dash']));
  });

  it('sends use once when E goes down and hold on every tick while it stays down', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    expect(types(k, s, 10)).toEqual(expect.arrayContaining(['use', 'hold']));
    const second = types(k, s, 20);
    expect(second).toContain('hold');
    expect(second).not.toContain('use');
    k.keyUp('KeyE');
    expect(types(k, s, 30)).not.toContain('hold');
  });

  it('aims at the mouse point and fires while the button is held', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.setAim({ x: 3, z: 4 });
    k.mouseDown();
    const cmds = k.commands(s, 0, 10);
    expect(cmds).toContainEqual({ type: 'aim', playerId: 0, point: { x: 3, z: 4 } });
    expect(cmds).toContainEqual({ type: 'fire', playerId: 0 });
    k.mouseUp();
    expect(types(k, s, 20)).not.toContain('fire');
  });

  it('selects weapons with the number keys and the mouse wheel', () => {
    const s = createSim(floor01, 1);
    s.players[0].weapons.push({ kind: 'bomb', level: 1, cooldown: 0 }, { kind: 'laserSword', level: 1, cooldown: 0 });
    const k = new Keyboard();
    k.keyDown('Digit3', 0);
    expect(k.commands(s, 0, 10)).toContainEqual({ type: 'select', playerId: 0, slot: 2 });
    s.players[0].selected = 2;
    k.wheel(1);
    expect(k.commands(s, 0, 20)).toContainEqual({ type: 'select', playerId: 0, slot: 0 });
    s.players[0].selected = 0;
    k.wheel(-1);
    expect(k.commands(s, 0, 30)).toContainEqual({ type: 'select', playerId: 0, slot: 2 });
  });

  it('uses the number keys for towers while the build menu is open', () => {
    const s = onPad();
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(s, 0, 200);
    k.keyDown('Digit2', 210);
    const cmds = k.commands(s, 0, 220);
    expect(cmds.some(c => c.type === 'select')).toBe(false);
    expect(cmds.some(c => c.type === 'build')).toBe(true);
  });
});
