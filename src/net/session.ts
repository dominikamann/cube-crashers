import { MAX_PLAYERS } from '../sim/config/balance';
import { floor01 } from '../sim/config/floor01';
import { createSim, stepSim } from '../sim/sim';
import { removePlayer } from '../sim/systems/coop';
import type { Command, Difficulty, SimEvent, SimState } from '../sim/types';
import { MAX_NAME, parseMessage, PROTOCOL_VERSION, sanitizeCommands, SNAPSHOT_EVERY_TICKS, type HostMessage, type LobbyPlayer } from './protocol';
import { applySnapshot, encodeSnapshot } from './snapshot';
import type { Transport } from './transport';

const EDGE = new Set(['jump', 'dash', 'use', 'select', 'build']);
const HELD = new Set(['hold', 'fire', 'fly']);

/**
 * Inputs that arrived from one client since the last host tick, merged into one tick's worth:
 * the newest move/aim/held keys, plus every one-off action (jump, dash, …) exactly once.
 */
function mergeInputs(batches: Command[][], last: Command[]): { cmds: Command[]; last: Command[] } {
  if (batches.length === 0) return { cmds: last, last };
  const edges: Command[] = [];
  for (const b of batches) for (const c of b) if (EDGE.has(c.type)) edges.push(c);
  const newest = batches[batches.length - 1];
  const steady = newest.filter(c => !EDGE.has(c.type));
  const keep = steady.filter(c => c.type === 'move' || c.type === 'aim' || HELD.has(c.type));
  return { cmds: [...steady, ...edges], last: keep };
}

export class HostSession {
  readonly lobby: LobbyPlayer[];
  difficulty: Difficulty = 'medium';
  sim: SimState | null = null;
  /** everything the host's own screen should show this frame */
  events: SimEvent[] = [];
  private pending = new Map<number, Command[][]>();
  private lastInput = new Map<number, Command[]>();
  private outEvents: SimEvent[] = [];
  private leftDuringRun: number[] = [];

  constructor(private net: Transport, opts: { name: string }) {
    this.lobby = [{ id: 0, name: opts.name.slice(0, MAX_NAME) || 'Host', color: 0 }];
    net.onMessage((from, data) => this.receive(from, data));
    net.onPeer((peer, joined) => {
      if (joined) return;
      const was = this.lobby.findIndex(p => p.id === peer);
      if (was < 0) return;
      this.lobby.splice(was, 1);
      this.pending.delete(peer);
      this.lastInput.delete(peer);
      if (this.sim) this.leftDuringRun.push(peer);
      this.broadcastLobby();
    });
  }

  private send(to: number | 'all', msg: HostMessage): void {
    this.net.send(to, JSON.stringify(msg));
  }

  private broadcastLobby(): void {
    this.send('all', { type: 'lobby', players: this.lobby, difficulty: this.difficulty });
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.broadcastLobby();
  }

  private receive(from: number, data: string): void {
    const m = parseMessage(data);
    if (!m) return;
    if (m.type === 'hello') {
      if (m.v !== PROTOCOL_VERSION) return this.send(from, { type: 'reject', reason: 'version' });
      if (this.sim) return this.send(from, { type: 'reject', reason: 'started' });
      if (this.lobby.length >= MAX_PLAYERS) return this.send(from, { type: 'reject', reason: 'full' });
      if (this.lobby.some(p => p.id === from)) return;
      const used = new Set(this.lobby.map(p => p.color));
      const color = [0, 1, 2, 3, 4, 5].find(c => !used.has(c)) ?? 0;
      this.lobby.push({ id: from, name: m.name || `Player ${this.lobby.length + 1}`, color });
      this.send(from, { type: 'welcome', playerId: from });
      this.broadcastLobby();
    } else if (m.type === 'input') {
      if (!this.sim || !this.lobby.some(p => p.id === from)) return;
      const list = this.pending.get(from) ?? [];
      if (list.length < 30) list.push(sanitizeCommands(m.cmds, from));
      this.pending.set(from, list);
    } else if (m.type === 'leave') {
      const i = this.lobby.findIndex(p => p.id === from);
      if (i >= 0) {
        this.lobby.splice(i, 1);
        if (this.sim) this.leftDuringRun.push(from);
        this.broadcastLobby();
      }
    }
  }

  start(seed: number, difficulty: Difficulty = this.difficulty): void {
    this.difficulty = difficulty;
    this.sim = createSim(floor01, seed, {
      difficulty,
      players: this.lobby.length,
      ids: this.lobby.map(p => p.id),
      names: this.lobby.map(p => p.name),
      colors: this.lobby.map(p => p.color),
    });
    this.send('all', { type: 'start', seed, difficulty, players: this.lobby });
  }

  /** One host tick: the host's own commands plus everything the clients sent. */
  step(localCommands: Command[]): void {
    const s = this.sim;
    if (!s) return;
    for (const id of this.leftDuringRun) removePlayer(s, id);
    this.leftDuringRun = [];
    const cmds = [...localCommands];
    for (const p of s.players) {
      if (p.id === 0) continue;
      const merged = mergeInputs(this.pending.get(p.id) ?? [], this.lastInput.get(p.id) ?? []);
      this.pending.set(p.id, []);
      this.lastInput.set(p.id, merged.last);
      cmds.push(...merged.cmds);
    }
    stepSim(s, cmds);
    this.events.push(...s.events);
    this.outEvents.push(...s.events);
    if (s.tick % SNAPSHOT_EVERY_TICKS === 0 || s.phase !== 'playing') {
      this.send('all', { type: 'snap', state: encodeSnapshot(s), events: this.outEvents });
      this.outEvents = [];
    }
  }

  /** Back to the lobby after a run (the same players stay). */
  endRun(): void {
    this.sim = null;
    this.pending.clear();
    this.lastInput.clear();
    this.outEvents = [];
    this.broadcastLobby();
  }

  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  close(): void {
    this.send('all', { type: 'bye', reason: 'hostLeft' });
    this.net.close();
  }
}

export type ClientStatus = 'connecting' | 'lobby' | 'playing' | 'rejected' | 'hostLeft';

export class ClientSession {
  status: ClientStatus = 'connecting';
  rejectReason: string | null = null;
  playerId = -1;
  lobby: LobbyPlayer[] = [];
  difficulty: Difficulty = 'medium';
  view: SimState | null = null;
  private events: SimEvent[] = [];
  private seq = 0;

  constructor(private net: Transport, opts: { name: string; version?: number }) {
    net.onMessage((_from, data) => this.receive(data));
    net.onClose(() => {
      if (this.status !== 'rejected') this.status = 'hostLeft';
    });
    net.send('all', JSON.stringify({ type: 'hello', v: opts.version ?? PROTOCOL_VERSION, name: opts.name.slice(0, MAX_NAME) }));
  }

  private receive(data: string): void {
    const m = parseMessage(data);
    if (!m) return;
    switch (m.type) {
      case 'welcome':
        this.playerId = m.playerId;
        this.status = 'lobby';
        break;
      case 'reject':
        this.status = 'rejected';
        this.rejectReason = m.reason;
        break;
      case 'lobby':
        this.lobby = m.players;
        this.difficulty = m.difficulty;
        if (this.status === 'playing' && this.view?.phase !== 'playing') {
          this.status = 'lobby';
          this.view = null;
        }
        break;
      case 'start':
        this.difficulty = m.difficulty;
        this.lobby = m.players;
        this.view = createSim(floor01, m.seed, {
          difficulty: m.difficulty,
          players: m.players.length,
          ids: m.players.map(p => p.id),
          names: m.players.map(p => p.name),
          colors: m.players.map(p => p.color),
        });
        this.status = 'playing';
        break;
      case 'snap':
        if (this.view && applySnapshot(this.view, m.state)) this.events.push(...m.events);
        break;
      case 'bye':
        this.status = 'hostLeft';
        break;
    }
  }

  /** Sends this tick's commands for the own player. */
  sendInput(cmds: Command[]): void {
    if (this.status !== 'playing') return;
    this.net.send('all', JSON.stringify({ type: 'input', seq: this.seq++, cmds }));
  }

  /** Events from the snapshots that arrived since the last call. */
  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  leave(): void {
    this.net.send('all', JSON.stringify({ type: 'leave' }));
    this.net.close();
  }
}
