import { COOP_MODES, isCoop } from '../net/protocol';
import { createVersusBot } from '../bots/versus';
import type { VersusOption } from '../net/protocol';
import type { HostSession } from '../net/session';
import { BRAWL_MAPS, MAP_ROTATION, RUSH_OWN, brawlMapFor, quickMapFor, rushMapsFor, versusMapFor } from '../maps';
import { BOSS_RUSH } from '../sim/config/floors';
import { discovery } from '../sim/systems/versus';
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
  /** the map of the match before: a rotation never plays it twice in a row */
  private lastMap: string | null = null;
  /** the dice for the maps: their own row of numbers, so the seeds of the matches stay as they were */
  private dice: number;
  /** the match that comes next, drawn as soon as someone waits for it: the lobby shows its map (and rule) */
  private plan: { versus: VersusOption } | { map?: string; rush?: string[] } | null = null;
  private now: () => number;
  private log: (line: string) => void;

  constructor(private host: HostSession, private cfg: ServerConfig, opts: { now?: () => number; seed?: number; log?: (line: string) => void } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.seed = opts.seed ?? (this.now() % 2147483647 || 1);
    this.dice = this.seed;
    this.log = opts.log ?? (() => {});
    host.viewMode = cfg.view;
    host.difficulty = cfg.difficulty;
    host.setAutoFill(isCoop(cfg.mode) ? 0 : cfg.bots);
    if (cfg.mode === 'discovery' && cfg.teams) this.log('note: --teams does nothing in discovery, which takes turns between teams and free for all');
    if (isCoop(cfg.mode) && (cfg.monsters || cfg.teams)) this.log('note: --monsters and --teams are for versus');
    if ((cfg.mode === 'coop' || cfg.mode === 'endless') && cfg.map) this.log(`note: --map does nothing in ${cfg.mode}, which brings its own floors`);
  }

  /** 0..1, like Math.random, but from the server's seed */
  private random = (): number => {
    this.dice = (this.dice * 16807) % 2147483647 || 1;
    return (this.dice - 1) / 2147483646;
  };

  /** nobody is here and nothing runs: the server may doze between looks at the door */
  get idle(): boolean {
    return !this.host.sim && this.humans() === 0;
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
    this.announce();
    this.startsAt ??= this.now() + this.cfg.countdown * 1000;
    const left = Math.max(0, Math.ceil((this.startsAt - this.now()) / 1000));
    this.host.setStartsIn(left);
    if (left === 0 || this.host.allReady()) this.start();
  }

  /** the next match's arena and rule */
  private next(): VersusOption {
    const i = this.step++;
    // like a LAN host's "rotation": any arena of the game but the one just played (not the Town with the view from above)
    const map = versusMapFor(this.cfg.map ?? MAP_ROTATION, this.lastMap, this.random, this.cfg.view === 'top');
    this.lastMap = map;
    switch (this.cfg.mode) {
      case 'discovery': {
        // every rule in turn; a fixed arena and monster hordes still hold
        const d = discovery(i);
        return { ...d, map, chaos: d.chaos || this.cfg.monsters };
      }
      case 'gungame':
        return { mode: 'ffa', rule: 'gungame', map };
      case 'capture':
        return { mode: 'team', rule: 'capture', map, chaos: this.cfg.monsters };
      default:
        return { mode: this.cfg.teams ? 'team' : 'ffa', rule: this.cfg.mode as VersusOption['rule'], map, chaos: this.cfg.monsters };
    }
  }

  /** Draws the next match if it is not drawn yet and tells the lobby where it will be. */
  private announce(): void {
    if (!this.plan) {
      const run = COOP_MODES[this.cfg.mode];
      if (run) {
        // the maps a LAN host picks in its lobby: the Boss Brawl's (the arena unless set), a Single floor's (a new one
        // each time unless set), the Boss Rush's (the bosses' own floors unless set)
        const noTown = this.cfg.view === 'top';
        const map = run === 'brawl' ? brawlMapFor(this.cfg.map ?? BRAWL_MAPS[0], this.random, noTown) : run === 'quick' ? quickMapFor(this.cfg.map ?? MAP_ROTATION, this.lastMap, this.random, noTown) : undefined;
        const rush = run === 'bossrush' ? rushMapsFor(this.cfg.map ?? RUSH_OWN, BOSS_RUSH.length, this.random, noTown) : undefined;
        this.plan = { map, rush };
      } else this.plan = { versus: this.next() };
    }
    if ('versus' in this.plan) this.host.setNext(this.plan.versus.map, this.cfg.mode === 'discovery' ? this.plan.versus.rule : undefined);
    else this.host.setNext(this.plan.map ?? (this.plan.rush ? (this.cfg.map === MAP_ROTATION ? MAP_ROTATION : this.plan.rush[0]) : undefined));
  }

  private start(): void {
    this.startsAt = null;
    this.overSince = null;
    this.seed = (this.seed * 48271) % 2147483647 || 1;
    this.announce();
    const plan = this.plan!;
    this.plan = null;
    if ('versus' in plan) {
      const option = plan.versus;
      this.host.startVersus(option, this.seed);
      // --difficulty: how hard the co-op floors are, and how well the bots play in versus
      this.bots = this.host.lobby.filter(p => p.bot).map(p => createVersusBot(p.id, this.cfg.difficulty));
      this.log(`${option.rule} on ${option.map} started with ${this.humans()} player(s) and ${this.bots.length} bot(s)`);
    } else {
      const { map, rush } = plan;
      if (map) this.lastMap = map;
      this.host.start(this.seed, this.cfg.difficulty, COOP_MODES[this.cfg.mode]!, map, rush);
      this.bots = [];
      const where = map ?? (rush ? (this.cfg.map === MAP_ROTATION ? 'random maps' : rush[0]) : null);
      this.log(`${this.cfg.mode}${where ? ` on ${where}` : ''} started with ${this.humans()} player(s)`);
    }
  }

  private play(s: SimState): void {
    if (this.humans() === 0) {
      this.log('everybody left: back to the lobby');
      return this.backToLobby();
    }
    // whoever joined during the match waits in the lobby: once the last one playing has left, the match is
    // nobody's any more (a co-op game without players would never end), so the ones waiting get theirs
    if (!this.host.lobby.some(p => !p.bot && s.players.some(q => q.id === p.id))) {
      this.log('everybody in the match left: back to the lobby for those who wait');
      return this.backToLobby();
    }
    // the match is over and its last snapshot went out with the final step: just wait out the results
    if (s.phase !== 'playing') {
      this.overSince ??= this.now();
      if (this.now() - this.overSince >= RESULT_SECONDS * 1000) this.backToLobby();
      return;
    }
    const cmds: Command[] = [];
    for (const b of this.bots) cmds.push(...b(s));
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
