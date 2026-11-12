import builtIn from '../../servers.json';
import { parseMessage, type ServerInfo } from './protocol';

/**
 * The online server list. The shared list lives in servers.json on GitHub (loaded by the desktop app) (anyone can add a server with a
 * pull request); the game loads it while the list is open, falls back to the copy it was built with, and adds
 * the servers the player entered. Every server is asked who it is every few seconds.
 */
export const DEFAULT_PORT = 47800;
/** how often each server is asked again while the list is open */
export const PROBE_EVERY_MS = 10_000;
/** how often the shared list is loaded again while the list is open */
export const LIST_EVERY_MS = 5 * 60_000;
const MAX_SERVERS = 200;

export interface ServerListEntry {
  name: string;
  address: string;
}

/** null = no answer (offline); undefined = not asked yet */
export type Probe = { info: ServerInfo; ping: number } | null;

export interface ServerRow {
  address: string;
  name: string;
  /** added by this player */
  own: boolean;
  status: 'online' | 'incompatible' | 'offline' | 'checking';
  info?: ServerInfo;
  ping?: number;
}

/** "host", "host:port" or "[v6]:port" → "host:port" with the default port; null when it is not an address */
export function normalizeAddress(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > 255) return null;
  const m = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(s);
  if (!m) return null;
  const port = m[2] === undefined ? DEFAULT_PORT : Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return `${m[1]}:${port}`;
}

/** reads servers.json: { "servers": [{ "name": "…", "address": "host:port" }] }; broken entries are skipped */
export function parseServerList(json: unknown): ServerListEntry[] {
  const list = json && typeof json === 'object' ? (json as { servers?: unknown }).servers : null;
  if (!Array.isArray(list)) return [];
  const out: ServerListEntry[] = [];
  for (const e of list.slice(0, MAX_SERVERS)) {
    if (!e || typeof e !== 'object') continue;
    const address = typeof (e as { address?: unknown }).address === 'string' ? normalizeAddress((e as { address: string }).address) : null;
    if (!address) continue;
    const name = (e as { name?: unknown }).name;
    out.push({ name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : address, address });
  }
  return out;
}

/** what the list shows: everyone on the server, out of how many, and how many of them are bots */
export const playerCount = (info: ServerInfo) => ({ players: info.players, max: info.max, bots: info.bots });
const humans = (r: ServerRow) => (r.info ? r.info.players - r.info.bots : 0);

const ORDER: Record<ServerRow['status'], number> = { online: 0, checking: 1, incompatible: 2, offline: 3 };

/** own servers and the shared list together, playable ones first (most real players, then lowest ping) */
export function rankServers(entries: ServerListEntry[], probes: Map<string, Probe>, protocol: number, own: string[]): ServerRow[] {
  const rows = new Map<string, ServerRow>();
  for (const address of own) rows.set(address, { address, name: address, own: true, status: 'checking' });
  for (const e of entries) {
    const r = rows.get(e.address);
    if (r) r.name = e.name;
    else rows.set(e.address, { address: e.address, name: e.name, own: false, status: 'checking' });
  }
  for (const r of rows.values()) {
    const p = probes.get(r.address);
    if (p === undefined) continue;
    if (p === null) {
      r.status = 'offline';
      continue;
    }
    r.status = p.info.protocol === protocol ? 'online' : 'incompatible';
    r.info = p.info;
    r.ping = p.ping;
    r.name = p.info.name || r.name;
  }
  const list = [...rows.values()];
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => ORDER[a.r.status] - ORDER[b.r.status] || humans(b.r) - humans(a.r) || (a.r.ping ?? 0) - (b.r.ping ?? 0) || a.i - b.i)
    .map(x => x.r);
}

export interface ServerBrowserDeps {
  /** the shared list as JSON, or null when it cannot be loaded */
  fetchList(): Promise<unknown>;
  /** asks one server who it is: its raw answer and the round trip, or null */
  probe(address: string): Promise<{ data: string; ms: number } | null>;
  own(): string[];
  protocol: number;
  onUpdate(rows: ServerRow[]): void;
  /** for tests; returns a cancel function */
  setTimer?: (fn: () => void, ms: number) => () => void;
  builtIn?: ServerListEntry[];
}

/** Keeps the list fresh while it is shown: start() when the page opens, stop() when it closes. */
export function createServerBrowser(deps: ServerBrowserDeps) {
  const setTimer = deps.setTimer ?? ((fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  });
  const fallback = deps.builtIn ?? parseServerList(builtIn);
  let entries: ServerListEntry[] = fallback;
  let listAt = -Infinity;
  let elapsed = 0;
  const probes = new Map<string, Probe>();
  let running = false;
  let cancel: (() => void) | null = null;
  /** each round belongs to one loop; a refresh starts a new loop and the old one ends when its round is back */
  let loop = 0;

  const publish = () => deps.onUpdate(rankServers(entries, probes, deps.protocol, deps.own()));

  async function round(mine: number) {
    const current = () => running && mine === loop;
    if (!current()) return;
    if (elapsed - listAt >= LIST_EVERY_MS) {
      listAt = elapsed;
      const json = await deps.fetchList().catch(() => null);
      const fresh = parseServerList(json);
      // an unreachable GitHub keeps the last list (or the built-in one)
      if (json !== null) entries = fresh;
      if (!current()) return;
    }
    publish();
    const addresses = [...new Set([...deps.own(), ...entries.map(e => e.address)])];
    await Promise.all(
      addresses.map(async address => {
        const answer = await deps.probe(address).catch(() => null);
        const m = answer ? parseMessage(answer.data) : null;
        probes.set(address, m && m.type === 'info' && 'name' in m ? { info: m as unknown as ServerInfo, ping: answer!.ms } : null);
      }),
    );
    if (!current()) return;
    publish();
    cancel = setTimer(() => {
      elapsed += PROBE_EVERY_MS;
      void round(mine);
    }, PROBE_EVERY_MS);
  }

  return {
    start() {
      if (running) return;
      running = true;
      void round(++loop);
    },
    stop() {
      running = false;
      cancel?.();
      cancel = null;
    },
    /** right now, e.g. after the player added a server */
    refresh() {
      if (!running) return;
      cancel?.();
      void round(++loop);
    },
  };
}
