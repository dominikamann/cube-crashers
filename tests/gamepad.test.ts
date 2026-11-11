import { describe, expect, it } from 'vitest';
import { PadControls, type PadSnapshot } from '../src/input/gamepad';
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

const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

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

  it('holding X on a pad opens the build menu, the d-pad picks a tower', () => {
    const s = createSim(floor01, 1);
    s.players[0].pos = { ...floor01.pads[PAD].pos };
    const c = new PadControls();
    c.commands(pad({ down: [X] }), s, 0, 0);
    c.commands(pad({ down: [X] }), s, 0, 200);
    expect(c.buildMenuOpen).toBe(true);
    expect(c.commands(pad({ down: [X, UP] }), s, 0, 250)).toContainEqual({ type: 'build', playerId: 0, padId: PAD, tower: 'popcorn' });
  });

  it('in the shop the d-pad buys and A says ready', () => {
    const s = createSim(floor01, 1, { mode: 'run' });
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
});
