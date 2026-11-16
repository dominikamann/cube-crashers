import { MAX_PLAYERS } from '../sim/config/balance';
import { floor01 } from '../sim/config/floor01';
import { FLOORS } from '../sim/config/floors';
import { createSim, stepSim } from '../sim/sim';
import { removePlayer } from '../sim/systems/coop';
import { balanceTeams, joinRunning, takeSeat } from '../sim/systems/versus';
import type { Command, Difficulty, KeepWeapons, Player, RunMode, SimEvent, SimState } from '../sim/types';
import { APP_VERSION } from '../version';
import { isCoop, MAX_NAME, MAX_SERVER_NAME, parseMessage, PROTOCOL_VERSION, sanitizeCommands, SNAPSHOT_EVERY_TICKS, type GameInfo, type HostMessage, type LobbyPlayer, type LobbyVote, type ServerMode, type ServerStatus, type VersusOption, type ViewMode } from './protocol';
import { applySnapshot, serializeSnapshot } from './snapshot';
import type { Transport } from './transport';

/** after this many ticks without input a client's last held keys are dropped */
const SILENT_INPUT_TICKS = 15;
/** a client gives up on a host that sent nothing for this long while playing */
export const HOST_TIMEOUT_MS = 5000;

/** bots get ids from here on, far away from the transport's peer ids */
export const BOT_IDS = 1000;
/** how long a seat in a running game is kept for someone whose connection broke off */
export const SEAT_HOLD_MS = 60_000;
/** how long a versus vote stays open */
export const VOTE_SECONDS = 30;
/** names for bots that fill a match up */
const BOT_NAMES = ['Bot Turbo', 'Bot Pixel', 'Bot Crispy', 'Bot Wobbly', 'Bot Sneaky', 'Bot Cosmic', 'Bot Funky', 'Bot Lucky', 'Bot Zippy', 'Bot Mango'];

const EDGE = new Set(['jump', 'dash', 'use', 'select', 'build', 'upgrade', 'buy', 'ready', 'emote']);
const HELD = new Set(['hold', 'fire', 'fly']);

/**
 * Inputs that arrived from one client since the last host tick, merged into one tick's worth:
 * the newest move/aim/held keys, plus every one-off action (jump, dash, …) exactly once.
 */
export function mergeInputs(batches: Command[][], last: Command[]): { cmds: Command[]; last: Command[] } {
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
  /** first person only, from above only, or either: sent to everyone with the start */
  viewMode: ViewMode = 'both';
  /** versus: what a player's weapons do after a fall */
  keepWeapons: KeepWeapons = 'none';
  sim: SimState | null = null;
  /** everything the host's own screen should show this frame */
  events: SimEvent[] = [];
  private pending = new Map<number, Command[][]>();
  private lastInput = new Map<number, Command[]>();
  private lastInputAt = new Map<number, number>();
  private outEvents: SimEvent[] = [];
  private leftDuringRun: number[] = [];

  /** the host's own unlocks */
  private unlocked = new Set<string>();
  /** what each client has unlocked, for as long as it is in the lobby (a server runs for weeks: nothing piles up) */
  private unlockedBy = new Map<number, string[]>();

  /** a running versus vote: the two options, who chose what, and when it closes (ms) */
  private vote: { options: [VersusOption, VersusOption]; votes: Record<number, 0 | 1>; until: number } | null = null;
  private now: () => number;
  private lastVoteSecond = -1;
  /** a dedicated server: nobody plays on it, it runs one mode and starts matches by itself */
  private server: ServerStatus | null = null;

  constructor(
    private net: Transport,
    opts: { name: string; color?: number | null; character?: string; unlocked?: string[]; now?: () => number; dedicated?: { name: string; mode: ServerMode; teams: boolean } },
  ) {
    this.now = opts.now ?? (() => Date.now());
    for (const u of opts.unlocked ?? []) this.unlocked.add(u);
    if (opts.dedicated) this.server = { name: opts.dedicated.name.slice(0, MAX_SERVER_NAME), mode: opts.dedicated.mode, teams: opts.dedicated.teams, startsIn: null, running: false };
    this.lobby = opts.dedicated ? [] : [{ id: 0, name: opts.name.slice(0, MAX_NAME) || 'Host', color: opts.color ?? 0, character: opts.character }];
    net.onMessage((from, data) => this.receive(from, data));
    net.onPeer((peer, joined) => {
      if (!joined) this.drop(peer);
    });
  }

  /** who each client is across connections (the key of its hello) */
  private keys = new Map<number, string>();
  /** seats kept for those whose connection broke off during a game: what they had, until when it is kept */
  private held = new Map<string, { was: Player; score?: number; until: number }>();

  /**
   * A client's connection is gone. In a running game their seat is kept for a while (see SEAT_HOLD_MS): back in
   * time, they get what they had (see admit). The last one playing takes the game with them: it waits as it is
   * (see waiting), and is not judged without them.
   */
  private drop(peer: number): void {
    const key = this.keys.get(peer);
    this.keys.delete(peer);
    const was = this.lobby.findIndex(p => p.id === peer);
    if (was < 0) return;
    this.lobby.splice(was, 1);
    this.unlockedBy.delete(peer);
    this.pending.delete(peer);
    this.lastInput.delete(peer);
    const s = this.sim, body = s?.players.find(p => p.id === peer);
    if (s && body && key && s.phase === 'playing') {
      this.held.set(key, { was: JSON.parse(JSON.stringify(body)) as Player, score: s.versus?.scores[peer], until: this.now() + SEAT_HOLD_MS });
      if (s.players.some(p => p.id !== peer && !p.bot)) this.leftDuringRun.push(peer);
      else removePlayer(s, peer, true);
    } else if (s) this.leftDuringRun.push(peer);
    this.syncBots();
    this.broadcastLobby();
  }

  /** the game stands still: the last one playing lost the connection, and their seat is still kept */
  get waiting(): boolean {
    const s = this.sim;
    if (!s || s.phase !== 'playing') return false;
    for (const [key, seat] of this.held) if (this.now() >= seat.until) this.held.delete(key);
    return this.held.size > 0 && !s.players.some(p => !p.bot);
  }

  /** while the game waits (see waiting) nothing moves in it; whoever comes is let in, and with them it goes on */
  idle(): void {
    if (this.sim) this.admit(this.sim);
  }

  private send(to: number | 'all', msg: HostMessage): void {
    this.sendRaw(to, JSON.stringify(msg));
  }

  /** 'all' means everyone in the lobby, not every connection (half-open or rejected peers get nothing) */
  private sendRaw(to: number | 'all', data: string): void {
    if (to !== 'all') this.net.send(to, data);
    else for (const p of this.lobby) if (p.id !== 0 && !p.bot) this.net.send(p.id, data);
  }

  private broadcastLobby(): void {
    this.send('all', { type: 'lobby', players: this.lobby, difficulty: this.difficulty, vote: this.voteInfo() ?? undefined, server: this.server ? { ...this.server, ...this.keepBadge() } : undefined, game: this.gameNow() ?? undefined });
  }

  /** a LAN host: the game picked in its lobby, so everyone in it sees what Start will begin */
  private game: GameInfo | null = null;
  /** (and whether it runs already: whoever comes now is told they come in as soon as it can take them) */
  private gameNow(): GameInfo | null {
    return this.game && this.sim && !this.server ? { ...this.game, running: true } : this.game;
  }
  setGame(game: GameInfo | null): void {
    if (JSON.stringify(game) === JSON.stringify(this.game)) return;
    this.game = game;
    this.broadcastLobby();
  }

  /** dedicated server: seconds until the next match, or null while it waits for players */
  setStartsIn(seconds: number | null): void {
    if (!this.server || this.server.startsIn === seconds) return;
    this.server.startsIn = seconds;
    this.broadcastLobby();
  }

  /** a versus server's weapons after a fall, for the badges (not Gun Game, whose ladder decides) */
  private keepBadge(): { keep?: KeepWeapons } {
    return this.server && !isCoop(this.server.mode) && this.server.mode !== 'gungame' ? { keep: this.keepWeapons } : {};
  }

  /** dedicated server: where the next match is played, and by which rule if the server takes turns (see ServerStatus) */
  setNext(map: string | undefined, rule?: string, fixed = false): void {
    if (!this.server || (this.server.map === map && this.server.rule === rule)) return;
    this.server.map = map;
    this.server.rule = rule;
    if (map) this.server.fixed = fixed;
    else delete this.server.fixed;
    this.broadcastLobby();
  }

  /** every human in the lobby is ready (and there is at least one) */
  allReady(): boolean {
    const humans = this.lobby.filter(p => !p.bot);
    return humans.length > 0 && humans.every(p => p.ready);
  }

  /** the vote as the lobby shows it, or null */
  voteInfo(): LobbyVote | null {
    if (!this.vote) return null;
    return { options: this.vote.options, votes: { ...this.vote.votes }, endsIn: Math.max(0, Math.ceil((this.vote.until - this.now()) / 1000)) };
  }

  /** versus matches start with at least this many players: bots fill the gaps (0 = off) */
  private autoFill = 0;

  setAutoFill(n: number): void {
    this.autoFill = Math.max(0, Math.min(MAX_PLAYERS, Math.floor(n)));
    this.syncBots();
    this.broadcastLobby();
  }

  /** keeps the lobby at the auto-fill size: bots come in for missing humans and make way for new ones */
  private syncBots(): void {
    if (this.sim) return;
    const humans = this.lobby.filter(p => !p.bot).length;
    const want = this.autoFill === 0 ? 0 : Math.max(0, this.autoFill - humans);
    let bots = this.lobby.filter(p => p.bot).length;
    while (bots > want) {
      this.lobby.splice(this.lobby.map(p => !!p.bot).lastIndexOf(true), 1);
      bots--;
    }
    while (bots < want && this.lobby.length < MAX_PLAYERS) {
      this.addBot(BOT_NAMES[(this.lobby.length + bots) % BOT_NAMES.length]);
      bots++;
    }
  }

  /** a player's wish for red or blue (null = no wish) */
  setTeamWish(id: number, team: 0 | 1 | null): void {
    const p = this.lobby.find(x => x.id === id && !x.bot);
    if (!p || this.sim) return;
    if (team === null) delete p.team;
    else p.team = team;
    this.broadcastLobby();
  }

  /** a bot joins the lobby (versus): it plays on the host */
  addBot(name?: string): void {
    if (this.lobby.length >= MAX_PLAYERS || this.sim) return;
    const used = new Set(this.lobby.map(p => p.color));
    const color = [...Array(MAX_PLAYERS).keys()].find(c => !used.has(c)) ?? 0;
    let id = BOT_IDS;
    while (this.lobby.some(p => p.id === id)) id++;
    this.lobby.push({ id, name: (name ?? `Bot ${this.lobby.length}`).slice(0, MAX_NAME), color, bot: true });
    this.broadcastLobby();
  }

  removeBot(): void {
    const i = this.lobby.map(p => !!p.bot).lastIndexOf(true);
    if (i < 0) return;
    this.lobby.splice(i, 1);
    this.broadcastLobby();
  }

  /** Starts a versus vote: two cards, VOTE_SECONDS to choose. A majority of the humans starts it at once. */
  startVote(options: [VersusOption, VersusOption]): void {
    if (this.sim) return;
    this.vote = { options, votes: {}, until: this.now() + VOTE_SECONDS * 1000 };
    this.broadcastLobby();
  }

  /** the host's own vote */
  castVote(choice: 0 | 1): void {
    this.countVote(0, choice);
  }

  private countVote(from: number, choice: 0 | 1): void {
    if (!this.vote || this.sim || !this.lobby.some(p => p.id === from && !p.bot)) return;
    this.vote.votes[from] = choice;
    const humans = this.lobby.filter(p => !p.bot).length;
    const forIt = Object.values(this.vote.votes).filter(c => c === choice).length;
    if (forIt > humans / 2) this.closeVote(choice);
    else this.broadcastLobby();
  }

  /** Called every frame while the lobby is open: ends a vote whose time is up. */
  checkVote(): void {
    if (!this.vote || this.sim) return;
    // the clients' countdown follows the host's, once a second
    const left = this.voteInfo()!.endsIn;
    if (left !== this.lastVoteSecond) {
      this.lastVoteSecond = left;
      this.broadcastLobby();
    }
    if (this.now() < this.vote.until) return;
    const votes = Object.values(this.vote.votes);
    const a = votes.filter(c => c === 0).length, b = votes.filter(c => c === 1).length;
    this.closeVote(a === b ? (Math.floor(this.now() / 7) % 2 as 0 | 1) : a > b ? 0 : 1);
  }

  private closeVote(choice: 0 | 1): void {
    const option = this.vote!.options[choice];
    this.vote = null;
    this.startVersus(option, (this.now() * 7919) % 2147483647 || 1);
  }

  /** a match begins: a dedicated server's lobby shows it is running */
  private running(on: boolean): void {
    if (!this.server) return;
    this.server.running = on;
    this.server.startsIn = null;
  }

  /** A versus match on `option`'s map with the whole lobby, bots included. */
  startVersus(option: VersusOption, seed: number): void {
    // (the Town is walked in first person only: not with the view fixed from above)
    const def = FLOORS[option.map === 'waldsee' && this.viewMode === 'top' ? 'arena' : option.map];
    if (!def) return;
    while (this.lobby.length < this.autoFill) this.addBot(BOT_NAMES[this.lobby.length % BOT_NAMES.length]);
    this.running(true);
    const versus = { mode: option.rule === 'capture' ? ('team' as const) : option.rule === 'gungame' ? ('ffa' as const) : option.mode, rule: option.rule, chaos: !!option.chaos, boss: !!option.chaos && !!option.boss, keep: this.keepWeapons, teams: balanceTeams(this.lobby.map(p => ({ id: p.id, bot: p.bot, wish: p.team }))) };
    this.sim = createSim(def.map, seed, {
      mode: 'versus',
      versus,
      countdown: true,
      players: this.lobby.length,
      ids: this.lobby.map(p => p.id),
      names: this.lobby.map(p => p.name),
      colors: this.lobby.map(p => p.color),
      characters: this.lobby.map(p => p.character),
      bots: this.lobby.map(p => !!p.bot),
    });
    this.started = { type: 'start', seed, difficulty: this.difficulty, players: this.lobby, mode: 'versus', versus, mapId: option.map, view: this.viewMode };
    this.send('all', this.started);
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.broadcastLobby();
  }

  private receive(from: number, data: string): void {
    const m = parseMessage(data);
    if (!m) return;
    if (m.type === 'info' && !('name' in m)) {
      // the server list asking: answer and hang up (the asker never joins the lobby)
      this.send(from, {
        type: 'info',
        name: this.server?.name ?? this.lobby[0]?.name ?? 'Host',
        mode: this.server?.mode ?? 'lan',
        players: this.lobby.length,
        bots: this.lobby.filter(p => p.bot).length,
        max: MAX_PLAYERS,
        version: APP_VERSION,
        protocol: PROTOCOL_VERSION,
        playing: this.sim !== null,
        // (for the list's badges: where and by which rule the next match is, how hard a co-op server is, a fixed view)
        ...(this.server?.map ? { map: this.server.map } : {}),
        ...(this.server?.rule ? { rule: this.server.rule } : {}),
        ...(this.server?.fixed !== undefined ? { fixed: this.server.fixed } : {}),
        ...(this.server && isCoop(this.server.mode) ? { difficulty: this.difficulty } : {}),
        ...(this.server && this.viewMode !== 'both' ? { view: this.viewMode } : {}),
        ...this.keepBadge(),
      });
      this.net.kick(from);
    } else if (m.type === 'hello') {
      const reject = (reason: 'version' | 'started' | 'full') => {
        this.send(from, { type: 'reject', reason });
        this.net.kick(from);
      };
      if (m.v !== PROTOCOL_VERSION) return reject('version');
      // (whoever comes while a game runs waits in the lobby until it can take them, see admit)
      if (this.lobby.some(p => p.id === from)) return;
      if (m.key) {
        // the same player on a connection that is still open here (it died on their side): the new one counts
        for (const [peer, key] of [...this.keys]) {
          if (key !== m.key || peer === from) continue;
          this.drop(peer);
          this.net.kick(peer);
        }
        this.keys.set(from, m.key);
      }
      // a full lobby with bots: a bot makes room for the human
      if (this.lobby.length >= MAX_PLAYERS && this.lobby.some(p => p.bot)) this.lobby.splice(this.lobby.map(p => !!p.bot).lastIndexOf(true), 1);
      if (this.lobby.length >= MAX_PLAYERS) return reject('full');
      const used = new Set(this.lobby.map(p => p.color));
      const wish = m.color !== undefined && !used.has(m.color) ? m.color : undefined;
      const color = wish ?? [...Array(MAX_PLAYERS).keys()].find(c => !used.has(c)) ?? 0;
      this.lobby.push({ id: from, name: m.name || `Player ${this.lobby.length + 1}`, color, character: m.character });
      // what anyone in the lobby has unlocked is available to everyone
      this.unlockedBy.set(from, m.unlocked ?? []);
      this.send(from, { type: 'welcome', playerId: from });
      this.syncBots();
      this.broadcastLobby();
    } else if (m.type === 'input') {
      if (!this.sim || !this.lobby.some(p => p.id === from)) return;
      const list = this.pending.get(from) ?? [];
      if (list.length < 30) list.push(sanitizeCommands(m.cmds, from));
      this.pending.set(from, list);
      this.lastInputAt.set(from, this.sim.tick);
    } else if (m.type === 'vote') {
      this.countVote(from, m.choice);
    } else if (m.type === 'team') {
      this.setTeamWish(from, m.team);
    } else if (m.type === 'ready') {
      const p = this.lobby.find(x => x.id === from);
      if (!p || this.sim) return;
      p.ready = m.ready;
      this.broadcastLobby();
    } else if (m.type === 'leave') {
      const i = this.lobby.findIndex(p => p.id === from);
      // (whoever says goodbye is gone for good: no seat is kept)
      this.keys.delete(from);
      if (i >= 0) {
        this.lobby.splice(i, 1);
        this.unlockedBy.delete(from);
        if (this.sim) this.leftDuringRun.push(from);
        this.syncBots();
        this.broadcastLobby();
      }
    }
  }

  start(seed: number, difficulty: Difficulty = this.difficulty, mode: RunMode = 'run', pickedMap = 'arena', rushMaps?: string[]): void {
    this.difficulty = difficulty;
    const unlocked = [...new Set([...this.unlocked, ...[...this.unlockedBy.values()].flat()])];
    // bots only play versus: a co-op run is for the humans in the lobby
    const humans = this.lobby.filter(p => !p.bot);
    this.vote = null;
    this.running(true);
    // (the Boss Brawl is in the Mega Block Arena, or on the map the host picked; a Single floor is the picked floor)
    // (the Town is walked in first person only: not with the view fixed from above)
    const picked = pickedMap === 'waldsee' && this.viewMode === 'top' ? 'arena' : pickedMap;
    const mapId = (mode === 'brawl' || mode === 'quick') && Object.hasOwn(FLOORS, picked) ? picked : undefined;
    this.sim = createSim(mapId ? FLOORS[mapId].map : floor01, seed, {
      mode,
      noTown: this.viewMode === 'top',
      unlocked,
      difficulty,
      rushMaps,
      countdown: true,
      players: humans.length,
      ids: humans.map(p => p.id),
      names: humans.map(p => p.name),
      colors: humans.map(p => p.color),
      characters: humans.map(p => p.character),
    });
    this.started = { type: 'start', seed, difficulty, players: humans, mode, unlocked, view: this.viewMode, mapId, maps: rushMaps };
    this.send('all', this.started);
  }

  /** how the running game was started: whoever comes in later is told the same */
  private started: Extract<HostMessage, { type: 'start' }> | null = null;

  /**
   * Whoever waits in the lobby comes into the running game, as soon as the game can take them (see joinRunning):
   * on a dedicated server and with a LAN host alike, a newcomer as well as someone who lost the connection and
   * is back. In versus a bot makes room for them when the match is as big as it is meant to be.
   */
  private admit(s: SimState): void {
    if (!this.started || s.phase !== 'playing') return;
    for (const p of this.lobby) {
      if (p.bot || s.players.some(q => q.id === p.id)) continue;
      const bots = s.versus ? s.players.filter(q => q.bot) : [];
      const leaves = bots.length > 0 && s.players.length >= Math.max(this.autoFill, 1) ? bots[bots.length - 1].id : undefined;
      const joined = joinRunning(s, { id: p.id, name: p.name, color: p.color, character: p.character }, leaves);
      if (!joined) continue;
      // back after the connection broke off: with what they had
      const key = this.keys.get(p.id), seat = key ? this.held.get(key) : undefined;
      if (seat && this.now() < seat.until) takeSeat(s, joined, seat.was, seat.score);
      if (key) this.held.delete(key);
      if (leaves !== undefined) {
        const i = this.lobby.findIndex(q => q.id === leaves);
        if (i >= 0) this.lobby.splice(i, 1);
      }
      p.color = joined.color;
      delete p.ready;
      this.lastInputAt.set(p.id, s.tick);
      // the newcomer's game starts like everyone's did, with those who are in it now; the snapshots do the rest
      const inGame = this.lobby.filter(q => s.players.some(x => x.id === q.id));
      this.send(p.id, { ...this.started, players: inGame });
      this.broadcastLobby();
    }
  }

  /** One host tick: the host's own commands plus everything the clients sent. */
  step(localCommands: Command[]): void {
    const s = this.sim;
    if (!s) return;
    for (const id of this.leftDuringRun) removePlayer(s, id);
    this.leftDuringRun = [];
    this.admit(s);
    const cmds = [...localCommands];
    for (const p of s.players) {
      if (p.id === 0) continue;
      // a client that went quiet (lost Wi-Fi) must not keep running and firing on its last input
      const silent = s.tick - (this.lastInputAt.get(p.id) ?? s.tick) > SILENT_INPUT_TICKS;
      const merged = mergeInputs(this.pending.get(p.id) ?? [], silent ? [] : (this.lastInput.get(p.id) ?? []));
      this.pending.set(p.id, []);
      this.lastInput.set(p.id, merged.last);
      cmds.push(...merged.cmds);
    }
    try {
      stepSim(s, cmds);
    } catch (err) {
      // never let one bad tick stop the game for everyone
      console.error('host tick failed', err);
      return;
    }
    this.events.push(...s.events);
    this.outEvents.push(...s.events);
    // (during the opening countdown the game's clock stands still: count by the countdown then)
    if ((s.countdown || s.tick) % SNAPSHOT_EVERY_TICKS === 0 || s.phase !== 'playing') {
      this.sendRaw('all', serializeSnapshot(s, this.outEvents));
      this.outEvents = [];
    }
  }

  /** Back to the lobby after a run (the same players stay). */
  endRun(): void {
    this.sim = null;
    this.started = null;
    this.held.clear();
    this.running(false);
    for (const p of this.lobby) delete p.ready;
    // players who came during the match push bots out again
    this.syncBots();
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
  /** the view the host allows in this game */
  viewMode: ViewMode = 'both';
  /** set when the host is a dedicated server */
  server: ServerStatus | null = null;
  /** what a LAN host is about to start */
  game: GameInfo | null = null;
  view: SimState | null = null;
  private events: SimEvent[] = [];
  private seq = 0;
  private lastHeard = 0;
  private clock = 0;
  private now = () => this.clock;

  /** the host said goodbye (it is gone for good, not just out of reach) */
  private bye = false;
  /** the connection broke off though the host did not say goodbye: worth trying to come back */
  get lost(): boolean {
    return this.status === 'hostLeft' && !this.bye;
  }

  constructor(private net: Transport, opts: { name: string; version?: number; color?: number | null; character?: string; unlocked?: string[]; key?: string }) {
    net.onMessage((_from, data) => this.receive(data));
    net.onClose(() => {
      if (this.status !== 'rejected') this.status = 'hostLeft';
    });
    net.send('all', JSON.stringify({ type: 'hello', v: opts.version ?? PROTOCOL_VERSION, name: opts.name.slice(0, MAX_NAME), color: opts.color ?? undefined, character: opts.character, unlocked: opts.unlocked ?? [], key: opts.key }));
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
        this.vote = m.vote ?? null;
        this.server = m.server ?? null;
        this.game = m.game ?? null;
        // the host only sends the lobby while nobody plays: a finished run goes back to it
        if (this.status === 'playing' && this.view?.phase !== 'playing') this.status = 'lobby';
        break;
      case 'start':
        this.difficulty = m.difficulty;
        this.viewMode = m.view ?? 'both';
        this.lobby = m.players;
        this.vote = null;
        this.view = createSim((m.versus || m.mode === 'brawl' || m.mode === 'quick') && m.mapId ? FLOORS[m.mapId].map : m.mode === 'brawl' ? FLOORS.arena.map : floor01, m.seed, {
          mode: m.versus ? 'versus' : m.mode && ['quick', 'brawl', 'bossrush', 'endless'].includes(m.mode) ? m.mode : 'run',
          noTown: m.view === 'top',
          versus: m.versus,
          rushMaps: Array.isArray(m.maps) ? m.maps.filter((x): x is string => typeof x === 'string') : undefined,
          unlocked: m.unlocked ?? [],
          difficulty: m.difficulty,
          players: m.players.length,
          ids: m.players.map(p => p.id),
          names: m.players.map(p => p.name),
          colors: m.players.map(p => p.color),
          characters: m.players.map(p => p.character),
          bots: m.players.map(p => !!p.bot),
        });
        this.status = 'playing';
        this.lastHeard = this.now();
        break;
      case 'snap':
        this.lastHeard = this.now();
        if (this.view && applySnapshot(this.view, m.state)) this.events.push(...m.events);
        break;
      case 'bye':
        this.bye = true;
        this.status = 'hostLeft';
        break;
    }
  }

  /** the versus vote the host is running, if any */
  vote: LobbyVote | null = null;

  castVote(choice: 0 | 1): void {
    this.net.send('all', JSON.stringify({ type: 'vote', choice }));
  }

  /** wish to play red (0) or blue (1) in team games, or null for whatever evens it out */
  chooseTeam(team: 0 | 1 | null): void {
    this.net.send('all', JSON.stringify({ type: 'team', team }));
  }

  /** on a dedicated server: ready for the next match */
  setReady(ready: boolean): void {
    this.net.send('all', JSON.stringify({ type: 'ready', ready }));
  }

  /** Sends this tick's commands for the own player. */
  sendInput(cmds: Command[]): void {
    if (this.status !== 'playing') return;
    this.net.send('all', JSON.stringify({ type: 'input', seq: this.seq++, cmds }));
  }

  /** Call regularly with the current time: a host that stays silent while playing is treated as gone. */
  checkTimeout(nowMs: number): void {
    this.clock = nowMs;
    if (this.lastHeard === 0) this.lastHeard = nowMs;
    if (this.status === 'playing' && this.view?.phase === 'playing' && nowMs - this.lastHeard > HOST_TIMEOUT_MS) this.status = 'hostLeft';
  }

  /** Events from the snapshots that arrived since the last call. */
  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  leave(): void {
    if (!this.hungUp) this.net.send('all', JSON.stringify({ type: 'leave' }));
    this.net.close();
  }

  private hungUp = false;
  /** drops a line that went dead without saying goodbye: the host keeps this player's seat (see HostSession.drop) */
  hangUp(): void {
    this.hungUp = true;
    this.net.close();
  }
}
