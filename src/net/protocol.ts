import type { Command, Difficulty, SimEvent } from '../sim/types';
import type { SnapState } from './snapshot';

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 256 * 1024;
export const MAX_NAME = 16;
export const SNAPSHOT_EVERY_TICKS = 2;

export interface LobbyPlayer {
  id: number;
  name: string;
  color: number;
}

/** client → host */
export type ClientMessage =
  | { type: 'hello'; v: number; name: string }
  | { type: 'input'; seq: number; cmds: Command[] }
  | { type: 'leave' };

/** host → client */
export type HostMessage =
  | { type: 'welcome'; playerId: number }
  | { type: 'reject'; reason: 'version' | 'full' | 'started' }
  | { type: 'lobby'; players: LobbyPlayer[]; difficulty: Difficulty }
  | { type: 'start'; seed: number; difficulty: Difficulty; players: LobbyPlayer[] }
  | { type: 'snap'; state: SnapState; events: SimEvent[] }
  | { type: 'bye'; reason: 'hostLeft' };

export type Message = ClientMessage | HostMessage;

const DIFFICULTIES = ['ultraLow', 'low', 'medium', 'high', 'ultraHigh'];
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Parses and validates one message from the network. Anything unexpected is dropped (null). */
export function parseMessage(raw: string): Message | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m)) return null;
  switch (m.type) {
    case 'hello':
      if (!isNum(m.v) || typeof m.name !== 'string') return null;
      return { type: 'hello', v: m.v, name: m.name.slice(0, MAX_NAME) };
    case 'input':
      if (!isNum(m.seq) || !Array.isArray(m.cmds) || m.cmds.length > 64 || !m.cmds.every(c => isObj(c) && typeof c.type === 'string')) return null;
      return { type: 'input', seq: m.seq, cmds: m.cmds as Command[] };
    case 'leave':
      return { type: 'leave' };
    case 'welcome':
      return isNum(m.playerId) ? { type: 'welcome', playerId: m.playerId } : null;
    case 'reject':
      return ['version', 'full', 'started'].includes(m.reason as string) ? (m as HostMessage) : null;
    case 'lobby':
      return Array.isArray(m.players) && DIFFICULTIES.includes(m.difficulty as string) ? (m as unknown as HostMessage) : null;
    case 'start':
      return isNum(m.seed) && Array.isArray(m.players) && DIFFICULTIES.includes(m.difficulty as string) ? (m as unknown as HostMessage) : null;
    case 'snap':
      return isObj(m.state) && isNum(m.state.tick) && Array.isArray(m.events) ? (m as unknown as HostMessage) : null;
    case 'bye':
      return { type: 'bye', reason: 'hostLeft' };
    default:
      return null;
  }
}

/** Only these commands may come from a client; the player id is always replaced by the sender's. */
const CLIENT_COMMANDS = new Set(['move', 'jump', 'fly', 'dash', 'use', 'hold', 'build', 'aim', 'fire', 'select']);

export function sanitizeCommands(cmds: Command[], playerId: number): Command[] {
  return cmds.filter(c => CLIENT_COMMANDS.has(c.type)).map(c => ({ ...c, playerId }) as Command);
}
