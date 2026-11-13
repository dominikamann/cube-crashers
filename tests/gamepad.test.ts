import { describe, expect, it } from 'vitest';
import { normalizePad, PadControls, padFamily, type PadSnapshot } from '../src/input/gamepad';
import { createSim } from '../src/sim/sim';
import { floor01 } from '../src/sim/config/floor01';
import { openShop } from '../src/sim/systems/shop';

const PAD = floor01.pads.findIndex(p => p.pos.x === 31.5 && p.pos.z === 56.5);

/** an Xbox pad in the standard mapping: buttons by index, axes LX LY RX RY */
function pad(opts: { axes?: number[]; down?: number[]; rt?: number } = {}): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: opts.down?.includes(i) ?? false, value: opts.down?.includes(i) ? 1 : 0 }));
  if (opts.rt !== undefined) buttons[7] = { pressed: opts.rt > 0.5, value: opts.rt };
  return { axes: opts.axes ?? [0, 0, 0, 0], buttons };
}

const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, DOWN = 13, LEFT = 14, RIGHT = 15;

describe('PadControls', () => {
  it('moves with the left stick and ignores a small drift', () => {
    const s = createSim(floor01, 1);
    const c = new PadControls();
    const [drift] = c.commands(pad({ axes: [0.1, -0.12, 0, 0] }), s, 0, 0);
    expect(drift).toEqual({ type: 'move', playerId: 0, dir: { x: 0, z: 0 } });
    const [full] = c.commands(pad({ axes: [1, 0, 0, 0] }), s, 0, 16);
    if (full.type === 'move') expect(full.dir.x).toBeCloseTo(1);
  });

  it('aims with the right stick and fires with the right trigger', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    const c = new PadControls();
    const cmds = c.commands(pad({ axes: [0, 0, 1, 0], rt: 0.9 }), s, 0, 0);
    const aim = cmds.find(x => x.type === 'aim');
    expect(aim?.type === 'aim' && aim.point.x > p.pos.x + 3 && Math.abs(aim.point.z - p.pos.z) < 0.01).toBe(true);
    expect(cmds).toContainEqual({ type: 'fire', playerId: 0 });
  });

  it('keeps the aim when the right stick springs back to the centre (no jump from the overshoot)', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    const c = new PadControls();
    c.commands(pad({ axes: [0, 0, 1, 0] }), s, 0, 0);
    c.commands(pad({ axes: [0, 0, 0.6, 0] }), s, 0, 16);
    // the stick overshoots a little past the centre on its way back
    const back = c.commands(pad({ axes: [0, 0, 0.1, 0.45] }), s, 0, 32).find(x => x.type === 'aim');
    if (back?.type !== 'aim') throw new Error('no aim');
    expect(back.point.x).toBeGreaterThan(p.pos.x + 2);
    expect(Math.abs(back.point.z - p.pos.z)).toBeLessThan(0.01);
  });

  it('fires when the right stick is pushed far, without the trigger', () => {
    const s = createSim(floor01, 1);
    const c = new PadControls();
    expect(c.commands(pad({ axes: [0, 0, 0, -0.95] }), s, 0, 0)).toContainEqual({ type: 'fire', playerId: 0 });
    expect(c.commands(pad({ axes: [0, 0, 0, -0.4] }), s, 0, 16)).not.toContainEqual({ type: 'fire', playerId: 0 });
  });

  it('A jumps once per press and flies while held; B dashes', () => {
    const s = createSim(floor01, 1);
    const c = new PadControls();
    const first = c.commands(pad({ down: [A, B] }), s, 0, 0);
    expect(first).toContainEqual({ type: 'jump', playerId: 0 });
    expect(first).toContainEqual({ type: 'dash', playerId: 0 });
    const held = c.commands(pad({ down: [A, B] }), s, 0, 16);
    expect(held).not.toContainEqual({ type: 'jump', playerId: 0 });
    expect(held).not.toContainEqual({ type: 'dash', playerId: 0 });
    expect(held).toContainEqual({ type: 'fly', playerId: 0 });
  });

  it('X works like E: a tap is use, holding is hold', () => {
    const s = createSim(floor01, 1);
    const c = new PadControls();
    c.commands(pad({ down: [X] }), s, 0, 0);
    expect(c.commands(pad(), s, 0, 50)).toContainEqual({ type: 'use', playerId: 0 });
    c.commands(pad({ down: [X] }), s, 0, 100);
    const held = c.commands(pad({ down: [X] }), s, 0, 400);
    expect(held).toContainEqual({ type: 'hold', playerId: 0 });
    expect(c.commands(pad(), s, 0, 450)).not.toContainEqual({ type: 'use', playerId: 0 });
  });

  it('LB and RB switch weapons, Y picks the rare weapon', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    p.weapons = [
      { kind: 'pixelBlaster', level: 1, cooldown: 0 },
      { kind: 'laserSword', level: 1, cooldown: 0 },
    ];
    const c = new PadControls();
    expect(c.commands(pad({ down: [RB] }), s, 0, 0)).toContainEqual({ type: 'select', playerId: 0, slot: 1 });
    c.commands(pad(), s, 0, 16);
    expect(c.commands(pad({ down: [LB] }), s, 0, 32)).toContainEqual({ type: 'select', playerId: 0, slot: 1 });
    c.commands(pad(), s, 0, 48);
    expect(c.commands(pad({ down: [Y] }), s, 0, 64)).toContainEqual({ type: 'select', playerId: 0, slot: -1 });
  });

  it('X on a pad opens the build menu right away with the first tower selected; X again builds it', () => {
    const s = createSim(floor01, 1);
    s.players[0].pos = { ...floor01.pads[PAD].pos };
    const c = new PadControls();
    const opened = c.commands(pad({ down: [X] }), s, 0, 0);
    expect(c.buildMenuOpen).toBe(true);
    expect(c.selected).toBe('laser');
    expect(opened.some(x => x.type === 'build')).toBe(false);
    expect(c.commands(pad(), s, 0, 60)).not.toContainEqual({ type: 'use', playerId: 0 });
    expect(c.commands(pad({ down: [X] }), s, 0, 300)).toContainEqual({ type: 'build', playerId: 0, padId: PAD, tower: 'laser' });
  });

  it('left and right (d-pad or LB/RB) switch the selection without building; X builds the selected tower', () => {
    const s = createSim(floor01, 1);
    s.players[0].pos = { ...floor01.pads[PAD].pos };
    const c = new PadControls();
    c.commands(pad({ down: [X] }), s, 0, 0);
    c.commands(pad(), s, 0, 50);
    expect(c.commands(pad({ down: [RIGHT] }), s, 0, 100).some(x => x.type === 'build')).toBe(false);
    expect(c.selected).toBe('popcorn');
    c.commands(pad(), s, 0, 150);
    c.commands(pad({ down: [RB] }), s, 0, 200);
    expect(c.selected).toBe('frost');
    c.commands(pad(), s, 0, 250);
    c.commands(pad({ down: [LEFT] }), s, 0, 300);
    expect(c.selected).toBe('popcorn');
    c.commands(pad(), s, 0, 350);
    expect(c.commands(pad({ down: [X] }), s, 0, 400)).toContainEqual({ type: 'build', playerId: 0, padId: PAD, tower: 'popcorn' });
  });

  it('holding X builds the selected tower right away', () => {
    const s = createSim(floor01, 1);
    s.players[0].pos = { ...floor01.pads[PAD].pos };
    const c = new PadControls();
    c.commands(pad({ down: [X] }), s, 0, 0);
    expect(c.commands(pad({ down: [X] }), s, 0, 400).some(x => x.type === 'build')).toBe(false);
    expect(c.commands(pad({ down: [X] }), s, 0, 710)).toContainEqual({ type: 'build', playerId: 0, padId: PAD, tower: 'laser' });
  });

  it('the build menu stays open after letting go of X; B closes it without dashing', () => {
    const s = createSim(floor01, 1);
    s.players[0].pos = { ...floor01.pads[PAD].pos };
    const c = new PadControls();
    c.commands(pad({ down: [X] }), s, 0, 0);
    c.commands(pad(), s, 0, 250);
    expect(c.buildMenuOpen).toBe(true);
    expect(c.commands(pad({ down: [B] }), s, 0, 340)).not.toContainEqual({ type: 'dash', playerId: 0 });
    expect(c.buildMenuOpen).toBe(false);
  });

  it('on a finished tower X opens the upgrade and X again upgrades', () => {
    const s = createSim(floor01, 1);
    s.players[0].pos = { ...floor01.pads[PAD].pos };
    s.towers.push({ id: 1, kind: 'laser', padId: PAD, pos: { ...floor01.pads[PAD].pos }, hp: 40, maxHp: 40, cooldown: 0, level: 1, buildLeft: 0, upgrading: false });
    const c = new PadControls();
    c.commands(pad({ down: [X] }), s, 0, 0);
    expect(c.buildMenuOpen).toBe(true);
    c.commands(pad(), s, 0, 50);
    expect(c.commands(pad({ down: [X] }), s, 0, 100)).toContainEqual({ type: 'upgrade', playerId: 0, padId: PAD });
  });

  it('in the shop the d-pad buys and A says ready', () => {
    const s = createSim(floor01, 1, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'] });
    openShop(s);
    const c = new PadControls();
    expect(c.commands(pad({ down: [LEFT] }), s, 0, 0)).toEqual([{ type: 'buy', playerId: 0, offer: 0 }]);
    c.commands(pad(), s, 0, 16);
    expect(c.commands(pad({ down: [DOWN] }), s, 0, 32)).toEqual([{ type: 'buy', playerId: 0, offer: 3 }]);
    c.commands(pad(), s, 0, 48);
    expect(c.commands(pad({ down: [RIGHT] }), s, 0, 64)).toEqual([{ type: 'buy', playerId: 0, offer: 2 }]);
    c.commands(pad(), s, 0, 80);
    expect(c.commands(pad({ down: [A] }), s, 0, 96)).toEqual([{ type: 'ready', playerId: 0 }]);
  });

  it('R3 toggles the zoomed-out view; pushing the right stick further aims further ahead', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    const c = new PadControls();
    c.commands(pad({ down: [11] }), s, 0, 0);
    expect(c.zoomedOut).toBe(true);
    c.commands(pad(), s, 0, 16);
    c.commands(pad({ down: [11] }), s, 0, 32);
    expect(c.zoomedOut).toBe(false);
    const near = c.commands(pad({ axes: [0, 0, 0.45, 0] }), s, 0, 48).find(x => x.type === 'aim');
    const far = c.commands(pad({ axes: [0, 0, 1, 0] }), s, 0, 64).find(x => x.type === 'aim');
    if (near?.type === 'aim' && far?.type === 'aim') expect(far.point.x - p.pos.x).toBeGreaterThan(near.point.x - p.pos.x + 2);
    else throw new Error('no aim');
  });
});

describe('normalizePad', () => {
  it('passes standard pads through', () => {
    const g = { mapping: 'standard', id: 'Xbox Wireless Controller', axes: [0.1, 0.2, 0.3, 0.4], buttons: pad().buttons };
    expect(normalizePad(g).axes).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('remaps a pad without standard mapping (sticks on axes 0,1 and 3,4, triggers as axes 2 and 5)', () => {
    const g = { mapping: '', id: '045e-0b13-Xbox Wireless Controller', axes: [0.1, 0.2, -1, 0.7, -0.3, 1], buttons: pad().buttons };
    const n = normalizePad(g);
    expect(n.axes).toEqual([0.1, 0.2, 0.7, -0.3]);
    expect(n.buttons[7].value).toBe(1);
    expect(n.buttons[7].pressed).toBe(true);
  });

  it('tells PlayStation pads apart for the button labels', () => {
    expect(padFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(padFamily('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
  });
});

describe('PadControls after a pause', () => {
  it('a button still held after resuming is not a new press (no jump from resuming with A)', () => {
    const s = createSim(floor01, 1);
    const c = new PadControls();
    c.commands(pad({ down: [0] }), s, 0, 0);
    c.releaseAll(pad({ down: [0] }));
    expect(c.commands(pad({ down: [0] }), s, 0, 16)).not.toContainEqual({ type: 'jump', playerId: 0 });
  });

  it('auto-build sends one build command, not one per frame', () => {
    const s = createSim(floor01, 1);
    s.players[0].pos = { ...floor01.pads[PAD].pos };
    const c = new PadControls();
    let builds = 0;
    for (let t = 0; t <= 1000; t += 16) builds += c.commands(pad({ down: [2] }), s, 0, t).filter(x => x.type === 'build').length;
    expect(builds).toBe(1);
  });
});
