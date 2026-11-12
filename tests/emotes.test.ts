import { describe, expect, it } from 'vitest';
import { PadControls, PAD, type PadSnapshot } from '../src/input/gamepad';
import { Keyboard } from '../src/input/keyboard';
import { sanitizeCommands } from '../src/net/protocol';
import { mergeInputs } from '../src/net/session';
import { floor01 } from '../src/sim/config/floor01';
import { createSim, stepSim } from '../src/sim/sim';
import { EMOTES } from '../src/sim/systems/emotes';
import type { Command } from '../src/sim/types';

const emote = (e: string, at?: { x: number; z: number }): Command => ({ type: 'emote', playerId: 0, emote: e as 'help', ...(at ? { at } : {}) });

describe('emotes in the simulation', () => {
  it('an emote goes out as an event everyone sees; a ping carries the spot', () => {
    const s = createSim(floor01, 1);
    stepSim(s, [emote('help')]);
    expect(s.events).toContainEqual({ type: 'emote', playerId: 0, emote: 'help' });
    s.players[0].lastEmoteAt = -1000;
    stepSim(s, [emote('here', { x: 10, z: 12 })]);
    expect(s.events).toContainEqual({ type: 'emote', playerId: 0, emote: 'here', pos: { x: 10, z: 12 } });
  });

  it('one a second at most, so nobody can flood the others', () => {
    const s = createSim(floor01, 1);
    stepSim(s, [emote('gg')]);
    stepSim(s, [emote('gg')]);
    expect(s.events.filter(e => e.type === 'emote')).toHaveLength(0);
    for (let i = 0; i < 60; i++) stepSim(s, []);
    stepSim(s, [emote('gg')]);
    expect(s.events.filter(e => e.type === 'emote')).toHaveLength(1);
  });

  it('there are six, and only those get through from the network', () => {
    expect(EMOTES).toEqual(['help', 'here', 'nest', 'coins', 'nice', 'gg']);
    expect(sanitizeCommands([{ type: 'emote', emote: 'nice' }, { type: 'emote', emote: 'spam' }], 3)).toEqual([{ type: 'emote', playerId: 3, emote: 'nice' }]);
    const [ping] = sanitizeCommands([{ type: 'emote', emote: 'here', at: { x: -50, z: 999 } }], 3);
    expect(ping).toEqual({ type: 'emote', playerId: 3, emote: 'here', at: { x: 0, z: 70 } });
  });

  it('a client emote reaches the host once, not every tick', () => {
    const { cmds, last } = mergeInputs([[emote('gg')]], []);
    expect(cmds.filter(c => c.type === 'emote')).toHaveLength(1);
    expect(last.filter(c => c.type === 'emote')).toHaveLength(0);
  });
});

describe('emotes on the keyboard', () => {
  it('C opens the emote bar, a number sends that one and closes it; numbers pick weapons again after', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.keyDown('KeyC', 0);
    expect(k.emoteOpen).toBe(true);
    k.keyDown('Digit6', 10);
    const cmds = k.commands(s, 0, 20);
    expect(cmds.filter(c => c.type === 'emote')).toEqual([{ type: 'emote', playerId: 0, emote: 'gg' }]);
    expect(cmds.some(c => c.type === 'select')).toBe(false);
    expect(k.emoteOpen).toBe(false);
  });

  it('the middle mouse button pings the spot under the crosshair', () => {
    const s = createSim(floor01, 1);
    const k = new Keyboard();
    k.setAim({ x: 20, z: 30 });
    k.ping();
    expect(k.commands(s, 0, 10).filter(c => c.type === 'emote')).toEqual([{ type: 'emote', playerId: 0, emote: 'here', at: { x: 20, z: 30 } }]);
  });
});

describe('emotes on a controller', () => {
  const pad = (down: number[] = []): PadSnapshot => ({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) });

  it('the d-pad: up help, right ping, left nice, down gg', () => {
    const s = createSim(floor01, 1);
    const sent: string[] = [];
    for (const [button, name] of [[PAD.UP, 'help'], [PAD.RIGHT, 'here'], [PAD.LEFT, 'nice'], [PAD.DOWN, 'gg']] as const) {
      const g = new PadControls();
      g.commands(pad(), s, 0, 0);
      const out = g.commands(pad([button]), s, 0, 10).filter(c => c.type === 'emote');
      expect(out).toHaveLength(1);
      if (out[0].type === 'emote') sent.push(out[0].emote);
      if (name === 'here' && out[0].type === 'emote') expect(out[0].at).toBeDefined();
    }
    expect(sent).toEqual(['help', 'here', 'nice', 'gg']);
  });
});
