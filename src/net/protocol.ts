import type { Command, Difficulty, SimEvent } from '../sim/types';
import type { SnapState } from './snapshot';

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 256 * 1024;
/** a client never needs to send more than this in one message */
export const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;
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

const validPlayers = (x: unknown) =>
  Array.isArray(x) && x.length >= 1 && x.length <= 6 && x.every(p => isObj(p) && isNum(p.id) && typeof p.name === 'string' && isNum(p.color));

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
      if (!isNum(m.seq) || !Array.isArray(m.cmds) || m.cmds.length > 32) return null;
      return { type: 'input', seq: m.seq, cmds: m.cmds as Command[] };
    case 'leave':
      return { type: 'leave' };
    case 'welcome':
      return isNum(m.playerId) ? { type: 'welcome', playerId: m.playerId } : null;
    case 'reject':
      return ['version', 'full', 'started'].includes(m.reason as string) ? (m as HostMessage) : null;
    case 'lobby':
      return validPlayers(m.players) && DIFFICULTIES.includes(m.difficulty as string) ? (m as unknown as HostMessage) : null;
    case 'start':
      return isNum(m.seed) && validPlayers(m.players) && DIFFICULTIES.includes(m.difficulty as string) ? (m as unknown as HostMessage) : null;
    case 'snap':
      return isObj(m.state) && isNum(m.state.tick) && Array.isArray(m.events) && Array.isArray(m.state.players) && Array.isArray(m.state.enemies) && Array.isArray(m.state.coins) ? (m as unknown as HostMessage) : null;
    case 'bye':
      return { type: 'bye', reason: 'hostLeft' };
    default:
      return null;
  }
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const vec = (v: unknown): v is { x: number; z: number } => isObj(v) && finite(v.x) && finite(v.z);
const TOWER_KINDS = new Set(['laser', 'popcorn', 'frost']);
/** generous bounds for aim points: the map plus a margin */
const AIM_MIN = 0;
const AIM_MAX = 70;

/**
 * Turns whatever a client sent into well-formed commands for its own player. Anything malformed is dropped,
 * so a broken or hostile client can never crash or corrupt the host's game.
 */
export function sanitizeCommands(cmds: unknown[], playerId: number): Command[] {
  const out: Command[] = [];
  for (const c of cmds) {
    if (!isObj(c)) continue;
    switch (c.type) {
      case 'move': {
        if (!vec(c.dir)) break;
        const len = Math.hypot(c.dir.x, c.dir.z);
        const k = len > 1 ? 1 / len : 1;
        out.push({ type: 'move', playerId, dir: { x: c.dir.x * k, z: c.dir.z * k } });
        break;
      }
      case 'aim':
        if (!vec(c.point)) break;
        out.push({ type: 'aim', playerId, point: { x: Math.min(AIM_MAX, Math.max(AIM_MIN, c.point.x)), z: Math.min(AIM_MAX, Math.max(AIM_MIN, c.point.z)) } });
        break;
      case 'select':
        if (Number.isInteger(c.slot) && (c.slot as number) >= -1 && (c.slot as number) <= 5) out.push({ type: 'select', playerId, slot: c.slot as number });
        break;
      case 'build':
        if (Number.isInteger(c.padId) && (c.padId as number) >= 0 && typeof c.tower === 'string' && TOWER_KINDS.has(c.tower)) {
          out.push({ type: 'build', playerId, padId: c.padId as number, tower: c.tower as 'laser' });
        }
        break;
      case 'jump':
      case 'fly':
      case 'dash':
      case 'use':
      case 'hold':
      case 'fire':
        out.push({ type: c.type, playerId });
        break;
    }
  }
  return out;
}
