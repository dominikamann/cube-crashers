import { describe, expect, it } from 'vitest';
import { ClientSession, HostSession } from '../../src/net/session';
import { createMemoryHub } from '../../src/net/transport';
import { DedicatedServer, RESULT_SECONDS } from '../../src/server/dedicated';
import { defaultConfig, type ServerConfig } from '../../src/server/config';
import { DISCOVERY_MAPS } from '../../src/sim/systems/versus';
import { DT } from '../../src/sim/types';

function setup(cfg: Partial<ServerConfig> = {}, clients = 1) {
  const hub = createMemoryHub();
  let now = 0;
  const config = { ...defaultConfig(), ...cfg };
  const host = new HostSession(hub.host(), { name: config.name, now: () => now, dedicated: { name: config.name, mode: config.mode } });
  const server = new DedicatedServer(host, config, { now: () => now });
  const cs = Array.from({ length: clients }, (_, i) => new ClientSession(hub.client(), { name: `C${i}` }));
  hub.flush();
  /** run the server for `seconds` of game time */
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      now += DT * 1000;
      server.tick();
      hub.flush();
    }
  };
  return { hub, host, server, cs, run };
}

describe('the dedicated server', () => {
  it('waits while nobody is there', () => {
    const { host, run } = setup({}, 0);
    run(60);
    expect(host.sim).toBeNull();
  });

  it('starts the next match after the countdown once someone joined, bots filling it up', () => {
    const { host, cs, run } = setup({ mode: 'score', countdown: 30, bots: 4 });
    run(1.5);
    // counted down in whole seconds, rounded up
    expect(cs[0].server?.startsIn).toBe(29);
    run(27.5);
    expect(host.sim).toBeNull();
    run(2);
    expect(host.sim?.versus?.rule).toBe('score');
    expect(host.sim?.players).toHaveLength(4);
    expect(cs[0].status).toBe('playing');
  });

  it('starts at once when every player is ready', () => {
    const { host, hub, cs, run } = setup({ mode: 'king', countdown: 30 }, 2);
    run(1);
    cs[0].setReady(true);
    cs[1].setReady(true);
    hub.flush();
    run(0.1);
    expect(host.sim?.versus?.rule).toBe('king');
  });

  it('the bots play: they move and fight', () => {
    const { host, cs, run } = setup({ mode: 'score', bots: 4 });
    cs[0].setReady(true);
    run(1);
    const bot = host.sim!.players.find(p => p.id >= 1000)!;
    const start = { ...bot.pos };
    run(5);
    expect(Math.hypot(bot.pos.x - start.x, bot.pos.z - start.z)).toBeGreaterThan(1);
  });

  it('after a match it shows the results for a while, then goes back to the lobby and counts down again', () => {
    const { host, cs, run } = setup({ mode: 'score', countdown: 20 });
    cs[0].setReady(true);
    run(1);
    host.sim!.phase = 'won';
    run(RESULT_SECONDS - 1);
    expect(host.sim).not.toBeNull();
    run(2);
    expect(host.sim).toBeNull();
    expect(cs[0].server?.startsIn).toBeGreaterThan(15);
  });

  it('gun game moves on to the next map each match', () => {
    const { host, cs, run } = setup({ mode: 'gungame' });
    const maps: string[] = [];
    for (let i = 0; i < 3; i++) {
      cs[0].setReady(true);
      run(1);
      maps.push(host.sim!.map.id);
      expect(host.sim!.versus?.rule).toBe('gungame');
      host.sim!.phase = 'won';
      run(RESULT_SECONDS + 1);
    }
    expect(maps).toEqual([DISCOVERY_MAPS[0], DISCOVERY_MAPS[1], DISCOVERY_MAPS[2]]);
  });

  it('a fixed map stays', () => {
    const { host, cs, run } = setup({ mode: 'rounds', map: 'candy', teams: true });
    cs[0].setReady(true);
    run(1);
    expect(host.sim!.map.id).toBe('candy');
    expect(host.sim!.versus?.mode).toBe('team');
  });

  it('co-op runs the tower with the humans only, at the set difficulty', () => {
    const { host, cs, run } = setup({ mode: 'coop', difficulty: 'high', bots: 4 }, 2);
    cs[0].setReady(true);
    cs[1].setReady(true);
    run(1);
    expect(host.sim!.run.mode).toBe('run');
    expect(host.sim!.versus).toBeFalsy();
    expect(host.sim!.players).toHaveLength(2);
    expect(host.sim!.difficulty).toBe('high');
  });

  it('when everybody leaves during a match it stops and waits again', () => {
    const { host, cs, hub, run } = setup({ mode: 'score' });
    cs[0].setReady(true);
    run(1);
    expect(host.sim).not.toBeNull();
    cs[0].leave();
    hub.flush();
    run(0.5);
    expect(host.sim).toBeNull();
  });

  it('the view setting goes out with every start', () => {
    const { cs, run } = setup({ mode: 'score', view: 'fp' });
    cs[0].setReady(true);
    run(1);
    expect(cs[0].viewMode).toBe('fp');
  });
});
