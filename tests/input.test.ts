import { describe, expect, it } from 'vitest';
import { AUTO_BUILD_MS, Keyboard } from '../src/input/keyboard';
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
    k.onEvents([{ type: 'towerBuilt', kind: 'popcorn', padId: PAD, playerId: 0 }]);
    expect(k.buildMenuOpen).toBe(false);
  });

  it('keeps the menu open after a denied build so the cards can shake', () => {
    const s = onPad();
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(s, 0, 200);
    k.keyDown('Digit1', 210);
    k.commands(s, 0, 220);
    k.onEvents([{ type: 'buildDenied', padId: PAD, reason: 'coins', playerId: 0 }]);
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

  it('keeps the menu open when E is released and closes it when leaving the pad', () => {
    const s = onPad();
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(s, 0, 200);
    k.keyUp('KeyE', 250);
    k.commands(s, 0, 260);
    expect(k.buildMenuOpen).toBe(true);
    s.players[0].pos.x += 4;
    k.commands(s, 0, 300);
    expect(k.buildMenuOpen).toBe(false);
  });

  it('on a finished tower the menu offers the upgrade; on a tower under construction it does not open', () => {
    const s = onPad();
    const tower = { id: 1, kind: 'laser' as const, padId: PAD, pos: { ...floor01.pads[PAD].pos }, hp: 40, maxHp: 40, cooldown: 0, level: 1, buildLeft: 50, upgrading: false };
    s.towers.push(tower);
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    expect(k.commands(s, 0, 300)).toContainEqual({ type: 'hold', playerId: 0 });
    expect(k.buildMenuOpen).toBe(false);
    tower.buildLeft = 0;
    k.commands(s, 0, 400);
    expect(k.buildMenuOpen).toBe(true);
    k.keyDown('Digit1', 450);
    expect(k.commands(s, 0, 500)).toContainEqual({ type: 'upgrade', playerId: 0, padId: PAD });
  });

  it('the first tower is preselected: keep holding E to build it, or tap E again', () => {
    const held = onPad();
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    k.commands(held, 0, 200);
    expect(k.buildMenuOpen).toBe(true);
    expect(k.commands(held, 0, AUTO_BUILD_MS + 10)).toContainEqual({ type: 'build', playerId: 0, padId: PAD, tower: 'laser' });

    const tapped = onPad();
    const k2 = new Keyboard();
    k2.keyDown('KeyE', 0);
    k2.commands(tapped, 0, 200);
    k2.keyUp('KeyE', 250);
    expect(k2.buildMenuOpen).toBe(true);
    k2.keyDown('KeyE', 400);
    k2.keyUp('KeyE', 450);
    const cmds = k2.commands(tapped, 0, 460);
    expect(cmds).toContainEqual({ type: 'build', playerId: 0, padId: PAD, tower: 'laser' });
    expect(cmds).not.toContainEqual({ type: 'use', playerId: 0 });
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

  it('sends use when E is tapped, and only hold while it is held down', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    expect(types(k, s, 10)).toContain('hold');
    expect(types(k, s, 10)).not.toContain('use');
    k.keyUp('KeyE', 80);
    expect(types(k, s, 90)).toContain('use');
    expect(types(k, s, 100)).not.toContain('use');
    expect(types(k, s, 100)).not.toContain('hold');
  });

  it('does not send use when E was held long (planting or building)', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    types(k, s, 100);
    k.keyUp('KeyE', 400);
    expect(types(k, s, 410)).not.toContain('use');
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

describe('mouse steering', () => {
  const moveOf = (k: Keyboard, s: ReturnType<typeof createSim>) => {
    const c = k.commands(s, 0, 10)[0];
    return c.type === 'move' ? c.dir : { x: NaN, z: NaN };
  };

  it('W walks toward the crosshair, S away from it, A and D sideways', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0].pos;
    const k = new Keyboard();
    k.steerWithMouse = true;
    k.setAim({ x: p.x + 5, z: p.z });
    k.keyDown('KeyW', 0);
    expect(moveOf(k, s).x).toBeCloseTo(1);
    expect(moveOf(k, s).z).toBeCloseTo(0);
    k.keyUp('KeyW');
    k.keyDown('KeyS', 0);
    expect(moveOf(k, s).x).toBeCloseTo(-1);
    k.keyUp('KeyS');
    k.keyDown('KeyD', 0);
    // crosshair is to the right of the player, so "right of forward" points down the screen
    expect(moveOf(k, s).z).toBeCloseTo(1);
    expect(moveOf(k, s).x).toBeCloseTo(0);
  });

  it('keeps the last direction when the crosshair sits on the player', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0].pos;
    const k = new Keyboard();
    k.steerWithMouse = true;
    k.setAim({ x: p.x, z: p.z - 5 });
    k.keyDown('KeyW', 0);
    moveOf(k, s);
    k.setAim({ x: p.x + 0.05, z: p.z });
    expect(moveOf(k, s).z).toBeCloseTo(-1);
  });

  it('uses fixed screen directions when switched off', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0].pos;
    const k = new Keyboard();
    k.steerWithMouse = false;
    k.setAim({ x: p.x + 5, z: p.z });
    k.keyDown('KeyW', 0);
    expect(moveOf(k, s).z).toBeCloseTo(-1);
  });

  it('never steers a kart with the mouse: driving keys stay fixed to the screen', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    p.vehicleId = 99;
    const k = new Keyboard();
    k.steerWithMouse = true;
    k.setAim({ x: p.pos.x + 5, z: p.pos.z });
    k.keyDown('KeyW', 0);
    expect(moveOf(k, s).z).toBeCloseTo(-1);
    expect(moveOf(k, s).x).toBeCloseTo(0);
  });

  it('sends fly on every tick while Space is held, and jump only on the press', () => {
    const types = (k: Keyboard, s: ReturnType<typeof createSim>, now: number) => k.commands(s, 0, now).map(c => c.type);
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.keyDown('Space', 0);
    expect(types(k, s, 10)).toEqual(expect.arrayContaining(['jump', 'fly']));
    const second = types(k, s, 20);
    expect(second).toContain('fly');
    expect(second).not.toContain('jump');
    k.keyUp('Space');
    expect(types(k, s, 30)).not.toContain('fly');
  });

  it('selects the rare weapon with Q', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.keyDown('KeyQ', 0);
    expect(k.commands(s, 0, 10)).toContainEqual({ type: 'select', playerId: 0, slot: -1 });
  });
});

describe('Keyboard and karts', () => {
  it('pressing E next to a free kart gets in right away, without waiting for the key to come up', () => {
    const s = createSim(floor01, 1);
    const kart = s.vehicles[0];
    s.players[0].pos = { x: kart.pos.x + 1, z: kart.pos.z };
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    expect(k.commands(s, 0, 20)).toContainEqual({ type: 'use', playerId: 0 });
    // a long press does not turn into a second "use" when the key comes up
    k.keyUp('KeyE', 400);
    expect(k.commands(s, 0, 420)).not.toContainEqual({ type: 'use', playerId: 0 });
  });

  it('pressing E while driving gets out right away', () => {
    const s = createSim(floor01, 1);
    s.players[0].vehicleId = s.vehicles[0].id;
    const k = new Keyboard();
    k.keyDown('KeyE', 0);
    expect(k.commands(s, 0, 20)).toContainEqual({ type: 'use', playerId: 0 });
  });
});
