import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { parseMessage } from '../../src/net/protocol';
import { DEFAULT_BINDINGS, actionOf } from '../../src/input/bindings';

describe('a player dances', () => {
  it('on the dance key (T), and everyone gets to see it', () => {
    expect(actionOf(DEFAULT_BINDINGS, 'KeyT')).toBe('dance');
    const s = createSim(floor01, 1, { mode: 'quick', players: 2 });
    stepSim(s, [{ type: 'emote', playerId: 1, emote: 'dance' }]);
    expect(s.events).toContainEqual({ type: 'emote', playerId: 1, emote: 'dance' });
  });

  it('not twice within a second', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
    stepSim(s, [{ type: 'emote', playerId: 0, emote: 'dance' }]);
    stepSim(s, [{ type: 'emote', playerId: 0, emote: 'dance' }]);
    expect(s.events.filter(e => e.type === 'emote')).toHaveLength(0);
  });

  it('travels over the LAN', () => {
    const m = parseMessage(JSON.stringify({ type: 'input', seq: 1, cmds: [{ type: 'emote', playerId: 0, emote: 'dance' }] }));
    expect(m && m.type === 'input' && m.cmds).toEqual([{ type: 'emote', playerId: 0, emote: 'dance' }]);
  });
});
