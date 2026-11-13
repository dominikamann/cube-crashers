import { FLOORS } from '../sim/config/floors';
import { MAX_PLAYERS } from '../sim/config/balance';
import { TOWER_ORDER } from '../sim/config/towers';
import type { Command, Difficulty, EmoteId, RunMode, SimEvent, VersusMode, VersusRule } from '../sim/types';
import { EMOTES } from '../sim/systems/emotes';
import type { SnapState } from './snapshot';

/** how a LAN game may be watched: first person only, from above only, or either (V switches) */
export type ViewMode = 'both' | 'fp' | 'top';
export const VIEW_MODES: ViewMode[] = ['both', 'fp', 'top'];

/**
 * 3: versus, votes, team wishes, gun game, the host's view setting (0.4.0).
 * 0.4.1 added the server-list probe and ready flags without breaking 0.4.0, so it stayed 3.
 * 4: up to 10 players, new monsters, weapons, towers and events, emotes, Coin-Op Chaos (0.5.0).
 * 5: three new worlds, Boss Rush, new monsters, the Kraken's grab, ladders, a changed Candy Factory (0.5.1).
 * 6: an opening countdown, lives per player (out until the next floor), a hidden heart (0.5.3).
 * 7: Boss Brawl (several bosses at once), Boss Rush and Endless on the LAN and on servers, the Rhino (0.5.4).
 * 8: a Single floor on the LAN, on the map the host picked.
 */
export const PROTOCOL_VERSION = 8;
export const MAX_MESSAGE_BYTES = 256 * 1024;
/** a client never needs to send more than this in one message */
export const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;
export const MAX_NAME = 16;
export const SNAPSHOT_EVERY_TICKS = 2;
/** a server name in the server list */
export const MAX_SERVER_NAME = 40;

/** what a dedicated server plays: a co-op run, one versus rule, or Discovery (all of them in turn) */
export type ServerMode = 'coop' | 'brawl' | 'bossrush' | 'endless' | 'discovery' | 'gungame' | 'coinop' | 'score' | 'king' | 'rounds' | 'capture';
export const SERVER_MODES: ServerMode[] = ['coop', 'brawl', 'bossrush', 'endless', 'discovery', 'gungame', 'coinop', 'score', 'king', 'rounds', 'capture'];
/** the co-op games a server (or a LAN host) can run, and the kind of run each is */
export const COOP_MODES: Partial<Record<ServerMode, 'run' | 'brawl' | 'bossrush' | 'endless'>> = { coop: 'run', brawl: 'brawl', bossrush: 'bossrush', endless: 'endless' };
export const isCoop = (m: ServerMode) => m in COOP_MODES;
const VERSUS_RULES = ['score', 'rounds', 'king', 'capture', 'gungame', 'coinop'];

/** what a dedicated server tells its lobby: its name, its mode and when the next match starts (null = waiting for players) */
export interface ServerStatus {
  name: string;
  mode: ServerMode;
  /** red against blue can happen here (so team wishes matter) */
  teams: boolean;
  startsIn: number | null;
  /** a match is running: newcomers wait for the next one */
  running: boolean;
}

/** the answer to a server-list probe */
export interface ServerInfo {
  name: string;
  mode: ServerMode | 'lan';
  /** everyone in the lobby or match, bots included */
  players: number;
  /** how many of them are bots */
  bots: number;
  max: number;
  /** the game version the server runs, e.g. "0.4.1" */
  version: string;
  protocol: number;
  /** a match is running (new players wait in the lobby) */
  playing: boolean;
}

export interface LobbyPlayer {
  id: number;
  name: string;
  color: number;
  /** a bot the host runs */
  bot?: boolean;
  /** red (0) or blue (1) wished for team games; unset = whatever evens the teams out */
  team?: 0 | 1;
  /** on a dedicated server: ready for the next match */
  ready?: boolean;
}

/** one card of a versus vote */
export interface VersusOption {
  mode: VersusMode;
  rule: VersusRule;
  /** floor id */
  map: string;
  /** monster hordes join in */
  chaos?: boolean;
}

export interface LobbyVote {
  options: [VersusOption, VersusOption];
  /** choice per player id */
  votes: Record<number, 0 | 1>;
  /** seconds left */
  endsIn: number;
}

/** client → host */
export type ClientMessage =
  | { type: 'hello'; v: number; name: string; color?: number; unlocked?: string[] }
  | { type: 'input'; seq: number; cmds: Command[] }
  | { type: 'vote'; choice: 0 | 1 }
  | { type: 'team'; team: 0 | 1 | null }
  | { type: 'ready'; ready: boolean }
  /** the server list asking who is there (answered with 'info', then the connection is closed) */
  | { type: 'info' }
  | { type: 'leave' };

/** host → client */
export type HostMessage =
  | { type: 'welcome'; playerId: number }
  | { type: 'reject'; reason: 'version' | 'full' | 'started' }
  | { type: 'lobby'; players: LobbyPlayer[]; difficulty: Difficulty; vote?: LobbyVote; server?: ServerStatus }
  | ({ type: 'info' } & ServerInfo)
  | { type: 'start'; seed: number; difficulty: Difficulty; players: LobbyPlayer[]; mode?: RunMode; maps?: string[]; unlocked?: string[]; versus?: { mode: VersusMode; rule: VersusRule; chaos?: boolean; teams?: Record<number, 0 | 1> }; mapId?: string; view?: ViewMode }
  | { type: 'snap'; state: SnapState; events: SimEvent[] }
  | { type: 'bye'; reason: 'hostLeft' };

export type Message = ClientMessage | HostMessage;

const DIFFICULTIES = ['ultraLow', 'low', 'medium', 'high', 'ultraHigh'];
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

const validPlayers = (x: unknown) =>
  Array.isArray(x) && x.length >= 1 && x.length <= MAX_PLAYERS && x.every(p => isObj(p) && isNum(p.id) && typeof p.name === 'string' && isNum(p.color));

const validOption = (o: unknown) =>
  isObj(o) && (o.mode === 'ffa' || o.mode === 'team') && VERSUS_RULES.includes(o.rule as string) && typeof o.map === 'string' && Object.hasOwn(FLOORS, o.map);
const validVote = (v: unknown) =>
  v === undefined || (isObj(v) && Array.isArray(v.options) && v.options.length === 2 && v.options.every(validOption) && isObj(v.votes) && isNum(v.endsIn));
const validTeams = (t: unknown) => t === undefined || (isObj(t) && Object.values(t).every(x => x === 0 || x === 1));
const validServer = (v: unknown) =>
  v === undefined || (isObj(v) && typeof v.name === 'string' && SERVER_MODES.includes(v.mode as ServerMode) && typeof v.teams === 'boolean' && typeof v.running === 'boolean' && (v.startsIn === null || isNum(v.startsIn)));
const validVersus = (v: unknown) => v === undefined || (isObj(v) && (v.mode === 'ffa' || v.mode === 'team') && VERSUS_RULES.includes(v.rule as string) && (v.chaos === undefined || typeof v.chaos === 'boolean') && validTeams(v.teams));

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
      return {
        type: 'hello',
        v: m.v,
        name: m.name.slice(0, MAX_NAME),
        color: Number.isInteger(m.color) && (m.color as number) >= 0 && (m.color as number) < MAX_PLAYERS ? (m.color as number) : undefined,
        unlocked: Array.isArray(m.unlocked) ? m.unlocked.filter((x): x is string => typeof x === 'string' && x.length < 24).slice(0, 16) : [],
      };
    case 'input':
      if (!isNum(m.seq) || !Array.isArray(m.cmds) || m.cmds.length > 32) return null;
      return { type: 'input', seq: m.seq, cmds: m.cmds as Command[] };
    case 'team':
      return m.team === 0 || m.team === 1 || m.team === null ? { type: 'team', team: m.team } : null;
    case 'vote':
      return m.choice === 0 || m.choice === 1 ? { type: 'vote', choice: m.choice } : null;
    case 'ready':
      return typeof m.ready === 'boolean' ? { type: 'ready', ready: m.ready } : null;
    case 'info':
      // the probe has no fields; the answer has all of them
      if (m.name === undefined) return { type: 'info' };
      if (typeof m.name !== 'string' || !(SERVER_MODES.includes(m.mode as ServerMode) || m.mode === 'lan') || !isNum(m.players) || !(m.bots === undefined || isNum(m.bots)) || !isNum(m.max) || typeof m.version !== 'string' || !isNum(m.protocol) || typeof m.playing !== 'boolean') return null;
      return { type: 'info', name: m.name.slice(0, MAX_SERVER_NAME), mode: m.mode as ServerMode, players: m.players, bots: Math.min(m.players, (m.bots as number | undefined) ?? 0), max: m.max, version: m.version.slice(0, 16), protocol: m.protocol, playing: m.playing };
    case 'leave':
      return { type: 'leave' };
    case 'welcome':
      return isNum(m.playerId) ? { type: 'welcome', playerId: m.playerId } : null;
    case 'reject':
      return ['version', 'full', 'started'].includes(m.reason as string) ? (m as HostMessage) : null;
    case 'lobby':
      return validPlayers(m.players) && DIFFICULTIES.includes(m.difficulty as string) && validVote(m.vote) && validServer(m.server) ? (m as unknown as HostMessage) : null;
    case 'start':
      return isNum(m.seed) && validPlayers(m.players) && DIFFICULTIES.includes(m.difficulty as string) && validVersus(m.versus) && (m.mapId === undefined || (typeof m.mapId === 'string' && Object.hasOwn(FLOORS, m.mapId))) && (m.view === undefined || VIEW_MODES.includes(m.view as ViewMode))
        ? (m as unknown as HostMessage)
        : null;
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
const TOWER_KINDS = new Set<string>(TOWER_ORDER);
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
      case 'upgrade':
        if (Number.isInteger(c.padId) && (c.padId as number) >= 0) out.push({ type: 'upgrade', playerId, padId: c.padId as number });
        break;
      case 'buy':
        if (Number.isInteger(c.offer) && (c.offer as number) >= 0 && (c.offer as number) < 8) out.push({ type: 'buy', playerId, offer: c.offer as number });
        break;
      case 'ready':
        out.push({ type: 'ready', playerId });
        break;
      case 'emote':
        if (!EMOTES.includes(c.emote as EmoteId)) break;
        out.push(vec(c.at) ? { type: 'emote', playerId, emote: c.emote as EmoteId, at: { x: Math.min(AIM_MAX, Math.max(AIM_MIN, c.at.x)), z: Math.min(AIM_MAX, Math.max(AIM_MIN, c.at.z)) } } : { type: 'emote', playerId, emote: c.emote as EmoteId });
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
