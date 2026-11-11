import { describe, expect, it } from 'vitest';
import { Keyboard } from '../src/input/keyboard';
import { createSim } from '../src/sim/sim';
import { map01 } from '../src/sim/config/map01';

function onPad() {
  const s = createSim(map01, 1);
  s.players[0].pos = { ...map01.pads[2].pos };
  return s;
}

describe('Keyboard', () => {
  it('normalizes diagonal movement', () => {
    const k = new Keyboard();
    k.keyDown('KeyW', 0);
    k.keyDown('KeyD', 0);
    const [move] = k.commands(createSim(map01, 1), 0, 10);
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
    expect(cmds.filter(c => c.type === 'build')).toEqual([{ type: 'build', playerId: 0, padId: 2, tower: 'popcorn' }]);
    expect(k.commands(s, 0, 240).filter(c => c.type === 'build')).toHaveLength(0);
    expect(k.buildMenuOpen).toBe(false);
  });

  it('does not open the build menu away from a pad', () => {
    const s = createSim(map01, 1);
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
    expect(k.commands(s, 0, 210).filter(c => c.type === 'build')).toEqual([{ type: 'build', playerId: 0, padId: 2, tower: 'frost' }]);
  });
});
