import { createVersusBot } from '../bots/versus';
import type { VersusOption } from '../net/protocol';
import type { HostSession } from '../net/session';
import { discovery, DISCOVERY_MAPS } from '../sim/systems/versus';
import type { Command, SimState } from '../sim/types';
import type { ServerConfig } from './config';

/** how long the results stay up before everyone is back in the lobby */
export const RESULT_SECONDS = 12;

/**
 * Runs a host session without anyone at the keyboard: when players are there it counts down and starts the
 * configured match (at once when everyone is ready), plays the bots, shows the results for a while and
 * then goes back to the lobby for the next one. Call tick() once per simulation step.
 */
export class DedicatedServer {
  private startsAt: number | null = null;
  private overSince: number | null = null;
  private bots: ((s: SimState) => Command[])[] = [];
  private step = 0;
  private seed: number;
  private now: () => number;
  private log: (line: string) => void;

  constructor(private host: HostSession, private cfg: ServerConfig, opts: { now?: () => number; seed?: number; log?: (line: string) => void } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.seed = opts.seed ?? (this.now() % 2147483647 || 1);
    this.log = opts.log ?? (() => {});
    host.viewMode = cfg.view;
    host.difficulty = cfg.difficulty;
    host.setAutoFill(cfg.mode === 'coop' ? 0 : cfg.bots);
  }

  private humans(): number {
    return this.host.lobby.filter(p => !p.bot).length;
  }

  tick(): void {
    const s = this.host.sim;
    if (s) return this.play(s);
    if (this.humans() === 0) {
      this.startsAt = null;
      this.host.setStartsIn(null);
      return;
    }
    this.startsAt ??= this.now() + this.cfg.countdown * 1000;
    const left = Math.max(0, Math.ceil((this.startsAt - this.now()) / 1000));
    this.host.setStartsIn(left);
    if (left === 0 || this.host.allReady()) this.start();
  }

  /** the next match's arena and rule */
  private next(): VersusOption {
    const i = this.step++;
    const map = this.cfg.map ?? DISCOVERY_MAPS[i % DISCOVERY_MAPS.length];
    switch (this.cfg.mode) {
      case 'discovery':
        return discovery(i);
      case 'gungame':
        return { mode: 'ffa', rule: 'gungame', map };
      case 'capture':
        return { mode: 'team', rule: 'capture', map, chaos: this.cfg.monsters };
      default:
        return { mode: this.cfg.teams ? 'team' : 'ffa', rule: this.cfg.mode as VersusOption['rule'], map, chaos: this.cfg.monsters };
    }
  }

  private start(): void {
    this.startsAt = null;
    this.overSince = null;
    this.seed = (this.seed * 48271) % 2147483647 || 1;
    if (this.cfg.mode === 'coop') {
      this.host.start(this.seed, this.cfg.difficulty, 'run');
      this.bots = [];
      this.log(`co-op run started with ${this.humans()} player(s)`);
    } else {
      const option = this.next();
      this.host.startVersus(option, this.seed);
      this.bots = this.host.lobby.filter(p => p.bot).map(p => createVersusBot(p.id));
      this.log(`${option.rule} on ${option.map} started with ${this.humans()} player(s) and ${this.bots.length} bot(s)`);
    }
  }

  private play(s: SimState): void {
    if (this.humans() === 0) {
      this.log('everybody left: back to the lobby');
      return this.backToLobby();
    }
    if (s.phase !== 'playing') {
      this.overSince ??= this.now();
      if (this.now() - this.overSince >= RESULT_SECONDS * 1000) return this.backToLobby();
    }
    const cmds: Command[] = [];
    if (s.phase === 'playing') for (const b of this.bots) cmds.push(...b(s));
    this.host.step(cmds);
    // nobody watches on the server: drop what a screen would show
    this.host.takeEvents();
  }

  private backToLobby(): void {
    this.host.endRun();
    this.bots = [];
    this.overSince = null;
  }
}
