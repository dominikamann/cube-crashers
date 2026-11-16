import { MAX_PLAYERS } from '../sim/config/balance';
import { BRAWL_MAPS, MAP_ROTATION, QUICK_MAPS, RUSH_OWN, VERSUS_MAPS, withoutTown } from '../maps';
import type { Difficulty } from '../sim/types';
import { isCoop, SERVER_MODES, VIEW_MODES, type ServerMode, type ViewMode } from '../net/protocol';

/** everything a server owner can set, by command line flag, environment variable or server.json */
export interface ServerConfig {
  /** shown in the server list */
  name: string;
  port: number;
  mode: ServerMode;
  /**
   * the map, one of mapChoices(mode): always this arena (versus), this floor (quick), this map for the Boss Brawl
   * or for every boss of the Boss Rush; "random" = a random one each time; bossrush also "own" (each boss on its
   * own floor). null = the mode's default: a different one each match (versus, quick), the arena (brawl), own (bossrush)
   */
  map: string | null;
  /** versus (score, king, rounds): red against blue instead of everyone for themselves */
  teams: boolean;
  /** co-op */
  difficulty: Difficulty;
  /** versus: bots fill every match up to this many players (0 = humans only) */
  bots: number;
  view: ViewMode;
  /** seconds from the first player joining until the match starts (sooner when everyone is ready) */
  countdown: number;
  /** versus: monster hordes join in */
  monsters: boolean;
  /** players from the browser version may join (they reach the server through a TLS proxy) */
  web: boolean;
  /** squeeze what the server sends: a fraction of the upload, for more work per player */
  compress: boolean;
}

/** how the lobby introduces the server; teams = red against blue can happen, so team wishes matter */
export function serverIdentity(c: ServerConfig): { name: string; mode: ServerMode; teams: boolean } {
  const teams = c.mode === 'capture' || c.mode === 'discovery' || ((c.mode === 'score' || c.mode === 'king' || c.mode === 'rounds' || c.mode === 'coinop') && c.teams);
  return { name: c.name, mode: c.mode, teams };
}

/** the Town: walked in first person only */
const TOWN = 'waldsee';

/**
 * What --map may be in a mode: the same maps a LAN host can pick for it, without the Town where the view is fixed
 * from above. null: the mode brings its own floors (the Tower Run, Endless).
 */
export function mapChoices(mode: ServerMode, view: ViewMode = 'both'): string[] | null {
  const noTown = view === 'top';
  switch (mode) {
    case 'coop':
    case 'endless':
      return null;
    case 'quick':
      return [MAP_ROTATION, ...withoutTown(QUICK_MAPS, noTown)];
    case 'brawl':
      return [MAP_ROTATION, ...withoutTown(BRAWL_MAPS, noTown)];
    case 'bossrush':
      return [RUSH_OWN, MAP_ROTATION, ...withoutTown(BRAWL_MAPS, noTown)];
    default:
      return [MAP_ROTATION, ...withoutTown(VERSUS_MAPS, noTown)];
  }
}

const DIFFICULTIES: Difficulty[] = ['ultraLow', 'low', 'medium', 'high', 'ultraHigh'];

export function defaultConfig(): ServerConfig {
  return { name: 'Cube Crashers Server', port: 47800, mode: 'discovery', map: null, teams: false, difficulty: 'medium', bots: 4, view: 'both', countdown: 30, monsters: false, web: false, compress: false };
}

/** name of the setting, its flag and environment variable, and how to read it */
const FIELDS: { key: keyof ServerConfig; flag: boolean }[] = [
  { key: 'name', flag: false },
  { key: 'port', flag: false },
  { key: 'mode', flag: false },
  { key: 'map', flag: false },
  { key: 'teams', flag: true },
  { key: 'difficulty', flag: false },
  { key: 'bots', flag: false },
  { key: 'view', flag: false },
  { key: 'countdown', flag: false },
  { key: 'monsters', flag: true },
  { key: 'web', flag: true },
  { key: 'compress', flag: true },
];

const envName = (key: string) => `CC_${key.toUpperCase()}`;

function int(key: string, v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key} must be a whole number from ${min} to ${max} (got "${v}")`);
  return n;
}

function bool(v: unknown): boolean {
  return v === true || v === 'true' || v === '1' || v === 'yes';
}

function oneOf<T extends string>(key: string, v: unknown, list: readonly T[]): T {
  if (!list.includes(v as T)) throw new Error(`${key} must be one of: ${list.join(', ')} (got "${v}")`);
  return v as T;
}

/**
 * Reads the settings: command line flags (--mode gungame or --mode=gungame) win over environment
 * variables (CC_MODE=gungame), which win over server.json, which wins over the defaults.
 * Throws an error that says what is wrong.
 */
export function parseConfig(argv: string[], env: Record<string, string | undefined>, file: unknown): ServerConfig {
  const raw: Record<string, unknown> = {};
  if (file && typeof file === 'object') for (const f of FIELDS) if (f.key in file) raw[f.key] = (file as Record<string, unknown>)[f.key];
  for (const f of FIELDS) if (env[envName(f.key)] !== undefined) raw[f.key] = env[envName(f.key)];
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    const field = m && FIELDS.find(f => f.key === m[1]);
    if (!m || !field) throw new Error(`unknown option "${argv[i]}" (try --help)`);
    if (m[2] !== undefined) raw[field.key] = m[2];
    else if (field.flag) raw[field.key] = true;
    else if (i + 1 < argv.length) raw[field.key] = argv[++i];
    else throw new Error(`--${field.key} needs a value`);
  }

  const c = defaultConfig();
  if (raw.name !== undefined) c.name = String(raw.name).trim().slice(0, 40) || c.name;
  if (raw.port !== undefined) c.port = int('port', raw.port, 1, 65535);
  if (raw.mode !== undefined) c.mode = oneOf('mode', raw.mode, SERVER_MODES);
  if (raw.teams !== undefined) c.teams = bool(raw.teams);
  if (raw.difficulty !== undefined) c.difficulty = oneOf('difficulty', raw.difficulty, DIFFICULTIES);
  if (raw.bots !== undefined) c.bots = int('bots', raw.bots, 0, MAX_PLAYERS);
  if (raw.view !== undefined) c.view = oneOf('view', raw.view, VIEW_MODES);
  if (raw.countdown !== undefined) c.countdown = int('countdown', raw.countdown, 3, 600);
  if (raw.monsters !== undefined) c.monsters = bool(raw.monsters);
  if (raw.web !== undefined) c.web = bool(raw.web);
  if (raw.compress !== undefined) c.compress = bool(raw.compress);
  if (raw.map !== undefined && raw.map !== null && raw.map !== '') {
    const allowed = mapChoices(c.mode, c.view);
    // (the Tower Run and Endless bring their own floors: a map left in the settings is not an error, the server says it is unused)
    if (!allowed) c.map = String(raw.map);
    else {
      // a Single floor or a versus server can take turns between maps: "waldsee,jungle" plays them in this order
      const maps = String(raw.map).split(',').map(m => m.trim());
      const turns = maps.length > 1 && (c.mode === 'quick' || !isCoop(c.mode));
      if (maps.length > 1 && !turns) throw new Error(`map for mode ${c.mode} must be one of: ${allowed.join(', ')} (a list of maps is for quick and versus) (got "${raw.map}")`);
      for (const m of maps) {
        if (m === TOWN && !allowed.includes(TOWN) && mapChoices(c.mode)!.includes(TOWN)) throw new Error(`map ${TOWN} (the Town) is walked in first person only: it cannot be played with view top (set view to both or fp, or pick another map)`);
        oneOf(`map for mode ${c.mode}`, m, turns ? allowed.filter(a => a !== MAP_ROTATION) : allowed);
      }
      c.map = maps.join(',');
    }
  }
  return c;
}

export const HELP = `Cube Crashers dedicated server

  --name <text>        name in the server list (default "Cube Crashers Server")
  --port <number>      port to listen on (default 47800); open it in your router
  --mode <mode>        ${SERVER_MODES.join(' | ')} (default discovery)
                       co-op: coop (the Tower Run), quick (a Single floor), brawl (Boss Brawl), bossrush, endless;
                       versus: discovery (every rule in turn) or one rule
  --map <map>          the map, by mode (${MAP_ROTATION} = a random one each time; for quick and versus also a list,
                       comma apart, played in turn: waldsee,jungle):
                         versus:   ${VERSUS_MAPS.join(', ')}
                                   (default ${MAP_ROTATION}: a new arena each match)
                         quick:    ${QUICK_MAPS.join(', ')}
                                   (default ${MAP_ROTATION}: a new floor each match)
                         brawl:    ${BRAWL_MAPS.join(', ')}, ${MAP_ROTATION}
                                   (default ${BRAWL_MAPS[0]})
                         bossrush: ${RUSH_OWN} (each boss on its own floor), ${MAP_ROTATION} (a random map for each boss),
                                   or one of the brawl maps for all of them (default ${RUSH_OWN})
                       coop and endless bring their own floors; ${TOWN} is the Town
  --teams              red against blue (score, king, rounds, coinop); capture is always teams
  --difficulty <level> co-op games and versus bots: ${DIFFICULTIES.join(', ')} (default medium)
  --bots <0-${MAX_PLAYERS}>         versus: bots fill every match up to this many players (default 4)
  --view <view>        both | fp (first person only) | top (from above only) (default both);
                       the Town is walked in first person only: with top it is left out
  --countdown <secs>   wait this long for players before a match (default 30)
  --monsters           versus: monster hordes join in
  --web                let players from the browser version join (needs a TLS proxy, see the README)
  --compress           squeeze what the server sends: far less upload, more work for the processor
  --config <file>      read settings from a JSON file (default ./server.json if it exists)
  --licenses           the licenses of the libraries and data this server is built with

Every option also works as an environment variable: CC_MODE=gungame, CC_BOTS=6, ...
`;
