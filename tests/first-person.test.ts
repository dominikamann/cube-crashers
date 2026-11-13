import { describe, expect, it } from 'vitest';
import { PadControls, type PadSnapshot } from '../src/input/gamepad';
import { Keyboard } from '../src/input/keyboard';
import { aimDistance, createRaceView, EYE_HEIGHT, FP_MAX_AIM, yawOf } from '../src/input/first-person';
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

  it('the tilt of the view goes along with the aim, and only in first person', () => {
    const s = createSim(floor01, 1);
    const p = s.players[0];
    const pitchOf = (cmds: ReturnType<Keyboard['commands']>) => {
      const a = cmds.find(c => c.type === 'aim');
      return a?.type === 'aim' ? a.pitch : NaN;
    };
    const k = new Keyboard();
    k.setFirstPerson(true, p.aim);
    k.look(0, -150);
    expect(k.pitch).toBeGreaterThan(0);
    expect(pitchOf(k.commands(s, 0, 10))).toBe(k.pitch);
    k.setFirstPerson(false, p.aim);
    k.setAim({ x: p.pos.x, z: p.pos.z - 5 });
    expect(pitchOf(k.commands(s, 0, 20))).toBeUndefined();

    const c = new PadControls();
    c.commands(pad({ down: [BACK] }), s, 0, 0);
    c.commands(pad(), s, 0, 16);
    let up = c.commands(pad({ axes: [0, 0, 0, -1] }), s, 0, 116);
    for (let now = 216; now <= 516; now += 100) up = c.commands(pad({ axes: [0, 0, 0, -1] }), s, 0, now);
    expect(c.pitch).toBeGreaterThan(0);
    expect(pitchOf(up)).toBe(c.pitch);
    c.commands(pad(), s, 0, 532);
    c.commands(pad({ down: [BACK] }), s, 0, 548);
    expect(pitchOf(c.commands(pad({ axes: [0, 0, 1, 0] }), s, 0, 564))).toBeUndefined();
  });

  it('the aim distance follows where the view meets the ground', () => {
    expect(aimDistance(-Math.atan(EYE_HEIGHT / 5))).toBeCloseTo(5);
    expect(aimDistance(0.2)).toBe(FP_MAX_AIM);
  });
});

describe('the Kart Rally opens in first person', () => {
  const ahead = { x: 1, z: 0 };

  it('switches every local player to first person, looking down the track, and gives back the view they had after', () => {
    const k = new Keyboard(), second = new PadControls();
    second.setFirstPerson(true, { x: 0, z: -1 });
    const view = createRaceView();
    const controls = [{ control: k, look: ahead }, { control: second, look: ahead }];
    view.update(false, controls);
    expect(k.firstPerson).toBe(false);
    view.update(true, controls);
    expect(k.firstPerson).toBe(true);
    expect(k.yaw).toBeCloseTo(yawOf(ahead));
    expect(second.firstPerson).toBe(true);
    view.update(true, controls);
    view.update(false, controls);
    expect(k.firstPerson).toBe(false);
    expect(second.firstPerson).toBe(true);
  });

  it('lets a player switch to the view from above during the race, and still gives back the view of the floors after', () => {
    const k = new Keyboard();
    const view = createRaceView();
    const controls = [{ control: k, look: ahead }];
    view.update(true, controls);
    k.setFirstPerson(false, ahead);
    view.update(true, controls);
    expect(k.firstPerson).toBe(false);
    k.setFirstPerson(true, ahead);
    view.update(false, controls);
    expect(k.firstPerson).toBe(false);
  });

  it('forgets the race when a new game starts in the middle of one', () => {
    const k = new Keyboard();
    const view = createRaceView();
    view.update(true, [{ control: k, look: ahead }]);
    view.reset();
    k.setFirstPerson(true, ahead);
    view.update(false, [{ control: k, look: ahead }]);
    expect(k.firstPerson).toBe(true);
  });
});
