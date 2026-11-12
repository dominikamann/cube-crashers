import { MAX_PLAYERS } from '../sim/config/balance';
import { DISCOVERY_MAPS } from '../sim/systems/versus';
import type { Difficulty } from '../sim/types';
import { SERVER_MODES, VIEW_MODES, type ServerMode, type ViewMode } from '../net/protocol';

/** everything a server owner can set, by command line flag, environment variable or server.json */
export interface ServerConfig {
  /** shown in the server list */
  name: string;
  port: number;
  mode: ServerMode;
  /** versus: always this arena; null = a different one each match */
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
}

/** how the lobby introduces the server; teams = red against blue can happen, so team wishes matter */
export function serverIdentity(c: ServerConfig): { name: string; mode: ServerMode; teams: boolean } {
  const teams = c.mode === 'capture' || c.mode === 'discovery' || ((c.mode === 'score' || c.mode === 'king' || c.mode === 'rounds') && c.teams);
  return { name: c.name, mode: c.mode, teams };
}

const DIFFICULTIES: Difficulty[] = ['ultraLow', 'low', 'medium', 'high', 'ultraHigh'];

export function defaultConfig(): ServerConfig {
  return { name: 'Cube Crashers Server', port: 47800, mode: 'discovery', map: null, teams: false, difficulty: 'medium', bots: 4, view: 'both', countdown: 30, monsters: false };
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
  if (raw.map !== undefined && raw.map !== null && raw.map !== '') c.map = oneOf('map', raw.map, DISCOVERY_MAPS);
  return c;
}

export const HELP = `Cube Crashers dedicated server

  --name <text>        name in the server list (default "Cube Crashers Server")
  --port <number>      port to listen on (default 47800); open it in your router
  --mode <mode>        ${SERVER_MODES.join(' | ')} (default discovery)
  --map <arena>        versus always on this arena: ${DISCOVERY_MAPS.join(', ')} (default: a new one each match)
  --teams              red against blue (score, king, rounds); capture is always teams
  --difficulty <level> co-op: ${DIFFICULTIES.join(', ')} (default medium)
  --bots <0-${MAX_PLAYERS}>         versus: bots fill every match up to this many players (default 4)
  --view <view>        both | fp (first person only) | top (from above only) (default both)
  --countdown <secs>   wait this long for players before a match (default 30)
  --monsters           versus: monster hordes join in
  --config <file>      read settings from a JSON file (default ./server.json if it exists)

Every option also works as an environment variable: CC_MODE=gungame, CC_BOTS=6, ...
`;
