import { describe, expect, it } from 'vitest';
import { PadControls, type PadSnapshot } from '../src/input/gamepad';
import { Keyboard } from '../src/input/keyboard';
import { aimDistance, EYE_HEIGHT, FP_MAX_AIM } from '../src/input/first-person';
import { createSim } from '../src/sim/sim';
import { floor01 } from '../src/sim/config/floor01';

function pad(opts: { axes?: number[]; down?: number[]; rt?: number } = {}): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: opts.down?.includes(i) ?? false, value: opts.down?.includes(i) ? 1 : 0 }));
  if (opts.rt !== undefined) buttons[7] = { pressed: opts.rt > 0.5, value: opts.rt };
  return { axes: opts.axes ?? [0, 0, 0, 0], buttons };
}
const BACK = 8;
const moveOf = (cmds: ReturnType<Keyboard['commands']>) => {
  const m = cmds.find(c => c.type === 'move');
  return m?.type === 'move' ? m.dir : { x: NaN, z: NaN };
};
const aimOf = (cmds: ReturnType<Keyboard['commands']>) => {
  const a = cmds.find(c => c.type === 'aim');
  return a?.type === 'aim' ? a.point : { x: NaN, z: NaN };
};

describe('first-person view, keyboard and mouse', () => {
  it('V switches it on, looking where the player aimed; V again switches it off', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    p.aim = { x: 1, z: 0 };
    const k = new Keyboard();
    k.keyDown('KeyV', 0);
    k.commands(s, 0, 10);
    expect(k.firstPerson).toBe(true);
    expect(Math.sin(k.yaw)).toBeCloseTo(-1);
    k.keyUp('KeyV', 20);
    k.keyDown('KeyV', 30);
    k.commands(s, 0, 40);
    expect(k.firstPerson).toBe(false);
  });

  it('W walks where the view looks, the mouse turns it, and the aim sits straight ahead', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    p.aim = { x: 0, z: -1 };
    const k = new Keyboard();
    k.keyDown('KeyV', 0);
    k.commands(s, 0, 10);
    k.keyDown('KeyW', 20);
    let cmds = k.commands(s, 0, 30);
    expect(moveOf(cmds).z).toBeCloseTo(-1);
    expect(aimOf(cmds).z).toBeLessThan(p.pos.z - 3);
    // turn a quarter to the right
    k.look(Math.PI / 2 / 0.0025, 0);
    cmds = k.commands(s, 0, 40);
    expect(moveOf(cmds).x).toBeCloseTo(1);
    expect(aimOf(cmds).x).toBeGreaterThan(p.pos.x + 3);
  });
});

describe('first-person view, controller', () => {
  it('View switches it on; the right stick turns instead of firing; up walks ahead', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    p.aim = { x: 0, z: -1 };
    const c = new PadControls();
    c.commands(pad({ down: [BACK] }), s, 0, 0);
    expect(c.firstPerson).toBe(true);
    c.commands(pad(), s, 0, 16);
    const before = c.yaw;
    const turned = c.commands(pad({ axes: [0, 0, 1, 0] }), s, 0, 516);
    expect(c.yaw).not.toBeCloseTo(before);
    expect(turned).not.toContainEqual({ type: 'fire', playerId: 0 });
    c.yaw = 0;
    const walk = c.commands(pad({ axes: [0, -1, 0, 0] }), s, 0, 532);
    expect(moveOf(walk).z).toBeCloseTo(-1);
    expect(aimOf(walk).z).toBeLessThan(p.pos.z - 3);
    c.commands(pad({ down: [BACK] }), s, 0, 548);
    expect(c.firstPerson).toBe(false);
  });
});

describe('first-person view as a default', () => {
  it('can be switched on from outside, looking where the player aims', () => {
    const k = new Keyboard();
    k.setFirstPerson(true, { x: 1, z: 0 });
    expect(k.firstPerson).toBe(true);
    expect(Math.sin(k.yaw)).toBeCloseTo(-1);
    const c = new PadControls();
    c.setFirstPerson(true, { x: 0, z: 1 });
    expect(Math.cos(c.yaw)).toBeCloseTo(-1);
    c.setFirstPerson(false, { x: 0, z: 1 });
    expect(c.firstPerson).toBe(false);
  });
});

describe('looking up and down in first person', () => {
  it('looking down brings the aim point closer, the mouse tilts the view', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    p.aim = { x: 0, z: -1 };
    const k = new Keyboard();
    k.setFirstPerson(true, p.aim);
    const far = aimOf(k.commands(s, 0, 10));
    k.look(0, 200);
    const near = aimOf(k.commands(s, 0, 20));
    expect(p.pos.z - near.z).toBeLessThan(p.pos.z - far.z);
    expect(p.pos.z - near.z).toBeGreaterThan(1);
    expect(k.pitch).toBeLessThan(0);
  });

  it('the aim distance follows where the view meets the ground', () => {
    expect(aimDistance(-Math.atan(EYE_HEIGHT / 5))).toBeCloseTo(5);
    expect(aimDistance(0.2)).toBe(FP_MAX_AIM);
  });
});
