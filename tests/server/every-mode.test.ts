import { describe, expect, it } from 'vitest';
import { MAP_ROTATION, RUSH_OWN } from '../../src/maps';
import { isCoop, SERVER_MODES, VIEW_MODES } from '../../src/net/protocol';
import { ClientSession, HostSession } from '../../src/net/session';
import { createMemoryHub } from '../../src/net/transport';
import { defaultConfig, mapChoices, parseConfig, serverIdentity } from '../../src/server/config';
import { DedicatedServer } from '../../src/server/dedicated';
import { FLOORS } from '../../src/sim/config/floors';

/** a server with these flags and `clients` players on it, started; then `ticks` steps of the match */
function play(args: string[], clients: number, ticks: number) {
  const cfg = parseConfig(args, {}, null);
  const hub = createMemoryHub();
  let now = 0;
  const host = new HostSession(hub.host(), { name: cfg.name, now: () => now, dedicated: serverIdentity(cfg) });
  const server = new DedicatedServer(host, cfg, { now: () => now, seed: 4711 });
  const cs = Array.from({ length: clients }, (_, i) => new ClientSession(hub.client(), { name: `C${i}` }));
  hub.flush();
  for (const c of cs) c.setReady(true);
  hub.flush();
  // a tick that throws is caught by the host (the game must go on for everyone): here it fails the test
  const errors: unknown[] = [];
  const error = console.error;
  console.error = (...a: unknown[]) => void errors.push(a);
  try {
    for (let i = 0; i < ticks; i++) {
      now += 1000 / 60;
      server.tick();
      hub.flush();
    }
  } finally {
    console.error = error;
  }
  return { cfg, host, cs, errors };
}

describe('every mode and every map a server takes', () => {
  it('starts and plays: each mode on each of its maps, for the server and for the players', () => {
    let games = 0;
    for (const mode of SERVER_MODES) {
      for (const map of mapChoices(mode) ?? [null]) {
        const what = `${mode} on ${map}`;
        // three players: the boss of a floor comes twice
        const { host, cs, errors } = play(['--mode', mode, ...(map ? ['--map', map] : []), '--bots', '4'], 3, 500);
        games++;
        const s = host.sim;
        expect(errors, what).toEqual([]);
        expect(s, what).not.toBeNull();
        // past the opening countdown, and still going
        expect(s!.tick, what).toBeGreaterThan(100);
        expect(s!.phase, what).toBe('playing');
        expect(s!.players, what).toHaveLength(isCoop(mode) ? 3 : 4);
        expect(!!s!.versus, what).toBe(!isCoop(mode));
        // a fixed map is the map (the tower starts on its first floor, a rush with the bosses' own floors on the first boss's)
        if (map && map !== MAP_ROTATION && map !== RUSH_OWN) expect(s!.map.id, what).toBe(map);
        expect(Object.keys(FLOORS), what).toContain(s!.map.id);
        for (const c of cs) {
          expect(c.status, what).toBe('playing');
          expect(c.view!.map.id, what).toBe(s!.map.id);
          expect(c.view!.run.mode, what).toBe(s!.run.mode);
          expect(c.view!.run.floors, what).toEqual(s!.run.floors);
          expect(c.view!.players.map(p => p.id), what).toEqual(s!.players.map(p => p.id));
          expect(c.server?.mode, what).toBe(mode);
        }
      }
    }
    // 7 versus modes x (11 arenas + random), 14 floors + random, 11 brawl maps + random, 11 rush maps + own + random, the tower, endless
    expect(games).toBe(7 * 12 + 15 + 12 + 13 + 2);
  }, 120_000);

  it('with the view from above too: every mode on every map that is left, never in the Town', () => {
    for (const mode of SERVER_MODES) {
      for (const map of mapChoices(mode, 'top') ?? [null]) {
        const what = `${mode} on ${map} from above`;
        expect(map, what).not.toBe('waldsee');
        const { host, cs, errors } = play(['--mode', mode, ...(map ? ['--map', map] : []), '--view', 'top'], 1, 200);
        expect(errors, what).toEqual([]);
        expect(host.sim?.phase, what).toBe('playing');
        expect(host.sim!.map.id, what).not.toBe('waldsee');
        expect(host.sim!.run.floors, what).not.toContain('waldsee');
        expect(cs[0].viewMode, what).toBe('top');
        expect(cs[0].view!.map.id, what).toBe(host.sim!.map.id);
      }
    }
  }, 120_000);

  it('what a server says it is fits what a player reads: every mode, every view, in the list and in the lobby', () => {
    expect(VIEW_MODES).toEqual(['both', 'fp', 'top']);
    for (const mode of SERVER_MODES) {
      const cfg = { ...defaultConfig(), mode };
      const hub = createMemoryHub();
      const host = new HostSession(hub.host(), { name: cfg.name, dedicated: serverIdentity(cfg) });
      new DedicatedServer(host, cfg, { now: () => 0 });
      const c = new ClientSession(hub.client(), { name: 'C' });
      hub.flush();
      expect(c.status, mode).toBe('lobby');
      expect(c.server, mode).toMatchObject({ mode, running: false });
    }
  });
});
