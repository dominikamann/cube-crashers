import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES, parseMessage, PROTOCOL_VERSION } from '../../src/net/protocol';

describe('parseMessage', () => {
  it('accepts a valid hello', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name: 'Kim' }))).toEqual({ type: 'hello', v: PROTOCOL_VERSION, name: 'Kim' });
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
