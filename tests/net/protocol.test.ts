import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES, parseMessage, PROTOCOL_VERSION, sanitizeCommands } from '../../src/net/protocol';

describe('parseMessage', () => {
  it('accepts a valid hello', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name: 'Kim' }))).toMatchObject({ type: 'hello', v: PROTOCOL_VERSION, name: 'Kim', unlocked: [] });
  });

  it('keeps a character it knows in a hello and drops one it does not (the game then picks)', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name: 'Kim', character: 'duck' }))).toMatchObject({ character: 'duck' });
    const odd = parseMessage(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name: 'Kim', character: 'dragon' }));
    expect(odd).toMatchObject({ type: 'hello', name: 'Kim' });
    expect((odd as { character?: string }).character).toBeUndefined();
    expect((parseMessage(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name: 'Kim', character: 5 })) as { character?: string }).character).toBeUndefined();
    // (an older build may still send the character that is gone)
    const old = parseMessage(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name: 'Kim', character: 'dominik' }));
    expect(old).not.toBeNull();
    expect((old as { character?: string }).character).toBeUndefined();
  });

  it('rejects garbage, unknown types, missing fields and oversized messages', () => {
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'nope' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'input', seq: 1, cmds: 'x' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'hello', v: 1, name: 'x'.repeat(MAX_MESSAGE_BYTES) }))).toBeNull();
  });

  it('cuts overlong names', () => {
    const m = parseMessage(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name: 'x'.repeat(100) }));
    expect(m?.type === 'hello' && m.name.length).toBe(16);
  });
});

describe('sanitizeCommands', () => {
  const clean = (cmds: unknown[]) => sanitizeCommands(cmds as never, 3);

  it('drops commands with missing or broken fields', () => {
    expect(clean([{ type: 'move' }])).toEqual([]);
    expect(clean([{ type: 'move', dir: { x: NaN, z: 0 } }])).toEqual([]);
    expect(clean([{ type: 'move', dir: { x: 'a', z: 0 } }])).toEqual([]);
    expect(clean([{ type: 'aim', point: 5 }])).toEqual([]);
    expect(clean([{ type: 'aim', point: { x: Infinity, z: 1 } }])).toEqual([]);
    expect(clean([{ type: 'select', slot: 0.5 }])).toEqual([]);
    expect(clean([{ type: 'select', slot: 6 }])).toEqual([]);
    expect(clean([{ type: 'build', padId: 1, tower: 'constructor' }])).toEqual([]);
    expect(clean([{ type: 'build', padId: 1, tower: 'x' }])).toEqual([]);
    expect(clean([{ type: 'build', padId: 1.5, tower: 'laser' }])).toEqual([]);
    expect(clean([{ type: 'upgrade', padId: 1.5 }])).toEqual([]);
    expect(clean([{ type: 'upgrade', padId: 2 }])).toEqual([{ type: 'upgrade', playerId: 3, padId: 2 }]);
    expect(clean([{ type: 'teleport' }])).toEqual([]);
  });

  it('keeps good commands, clamps them and sets the sender as player', () => {
    const [m] = clean([{ type: 'move', playerId: 0, dir: { x: 3, z: 4 } }]);
    expect(m).toMatchObject({ type: 'move', playerId: 3 });
    if (m.type === 'move') expect(Math.hypot(m.dir.x, m.dir.z)).toBeCloseTo(1);
    expect(clean([{ type: 'aim', point: { x: -50, z: 999 } }])).toEqual([{ type: 'aim', playerId: 3, point: { x: 0, z: 70 } }]);
    expect(clean([{ type: 'select', slot: -1 }])).toEqual([{ type: 'select', playerId: 3, slot: -1 }]);
    expect(clean([{ type: 'build', padId: 2, tower: 'frost' }])).toEqual([{ type: 'build', playerId: 3, padId: 2, tower: 'frost' }]);
    expect(clean([{ type: 'jump' }, { type: 'fire', extra: 1 }])).toEqual([{ type: 'jump', playerId: 3 }, { type: 'fire', playerId: 3 }]);
  });
});
