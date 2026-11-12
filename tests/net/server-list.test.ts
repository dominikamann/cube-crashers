import { describe, expect, it } from 'vitest';
import type { ServerInfo } from '../../src/net/protocol';
import { createServerBrowser, normalizeAddress, parseServerList, playerCount, rankServers, type Probe, type ServerRow } from '../../src/net/server-list';

const info = (o: Partial<ServerInfo> = {}): ServerInfo => ({ name: 'S', mode: 'score', players: 0, bots: 0, max: 8, version: '0.4.1', protocol: 3, playing: false, ...o });

describe('server addresses', () => {
  it('adds the default port and accepts names, IPv4 and IPv6', () => {
    expect(normalizeAddress(' 10.12.3.23 ')).toBe('10.12.3.23:47800');
    expect(normalizeAddress('10.12.3.23:21')).toBe('10.12.3.23:21');
    expect(normalizeAddress('play.example.org:5000')).toBe('play.example.org:5000');
    expect(normalizeAddress('[::1]:5000')).toBe('[::1]:5000');
  });
  it('turns away anything that is not a host and port', () => {
    for (const bad of ['', 'ws://x:1', 'a b', 'host:0', 'host:70000', 'host:12ab', 'x'.repeat(300), 'host/path']) expect(normalizeAddress(bad)).toBeNull();
  });
});

describe('how a server reads in the list', () => {
  it('players with the bots among them', () => {
    expect(playerCount(info({ players: 8, bots: 5 }))).toEqual({ players: 8, max: 8, bots: 5 });
  });
});

describe('the server list file', () => {
  it('reads name and address of each server and skips broken entries', () => {
    const list = parseServerList({ servers: [{ name: 'Official 1', address: 'eu.example.org' }, { name: 'bad', address: 'no way' }, { address: '1.2.3.4:9' }, 'junk'] });
    expect(list).toEqual([
      { name: 'Official 1', address: 'eu.example.org:47800' },
      { name: '1.2.3.4:9', address: '1.2.3.4:9' },
    ]);
  });
  it('anything else is an empty list', () => {
    expect(parseServerList(null)).toEqual([]);
    expect(parseServerList({ servers: 'x' })).toEqual([]);
  });
});

describe('ranking the servers', () => {
  const entries = [
    { name: 'Offline', address: 'a:1' },
    { name: 'Old', address: 'b:1' },
    { name: 'Busy', address: 'c:1' },
    { name: 'Quiet', address: 'd:1' },
    { name: 'Unknown', address: 'e:1' },
  ];
  const probes = new Map<string, Probe>([
    ['a:1', null],
    ['b:1', { info: info({ protocol: 2, version: '0.3.7' }), ping: 20 }],
    ['c:1', { info: info({ name: 'Busy Server', players: 6, bots: 1 }), ping: 80 }],
    ['d:1', { info: info({ players: 6, bots: 6 }), ping: 10 }],
  ]);

  it('lists playable servers first (most real players first), then other versions, then offline ones', () => {
    const rows = rankServers(entries, probes, 3, []);
    expect(rows.map(r => [r.address, r.status])).toEqual([
      ['c:1', 'online'],
      ['d:1', 'online'],
      ['e:1', 'checking'],
      ['b:1', 'incompatible'],
      ['a:1', 'offline'],
    ]);
    // the name the server gives itself wins over the one in the list
    expect(rows[0].name).toBe('Busy Server');
    expect(rows.find(r => r.address === 'b:1')?.info?.version).toBe('0.3.7');
  });

  it('marks own servers and lists them even when the shared list does not have them', () => {
    const rows = rankServers(entries.slice(0, 1), new Map(), 3, ['a:1', 'mine:47800']);
    expect(rows.map((r: ServerRow) => [r.address, r.own])).toEqual([
      ['a:1', true],
      ['mine:47800', true],
    ]);
  });
});

describe('the server browser', () => {
  function setup(listJson: unknown) {
    let clock = 0;
    const timers: { at: number; fn: () => void }[] = [];
    const probed: string[] = [];
    const updates: ServerRow[][] = [];
    const browser = createServerBrowser({
      fetchList: async () => listJson,
      probe: async address => {
        probed.push(address);
        return address.startsWith('up') ? { data: JSON.stringify({ type: 'info', ...info({ name: address }) }), ms: 12 } : null;
      },
      own: () => ['up-own:47800'],
      protocol: 3,
      onUpdate: rows => updates.push(rows),
      setTimer: (fn, ms) => {
        const t = { at: clock + ms, fn };
        timers.push(t);
        return () => timers.splice(timers.indexOf(t), 1);
      },
    });
    const advance = async (ms: number) => {
      clock += ms;
      for (const t of timers.filter(x => x.at <= clock)) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
      await new Promise(r => setTimeout(r, 0));
    };
    return { browser, probed, updates, advance };
  }

  it('loads the list from GitHub, checks every server and checks again every few seconds', async () => {
    const { browser, probed, updates, advance } = setup({ servers: [{ name: 'Up', address: 'up1:1' }, { name: 'Down', address: 'down:1' }] });
    browser.start();
    await advance(0);
    expect(probed.sort()).toEqual(['down:1', 'up-own:47800', 'up1:1']);
    const last = updates[updates.length - 1];
    expect(last.map(r => [r.address, r.status])).toEqual([
      ['up-own:47800', 'online'],
      ['up1:1', 'online'],
      ['down:1', 'offline'],
    ]);
    await advance(10_000);
    expect(probed).toHaveLength(6);
    browser.stop();
    await advance(60_000);
    expect(probed).toHaveLength(6);
  });

  it('adding a server while the others are still being asked does not start a second loop', async () => {
    const { browser, probed, advance } = setup({ servers: [{ name: 'Up', address: 'up1:1' }] });
    browser.start();
    browser.refresh();
    browser.refresh();
    await advance(0);
    const afterStart = probed.length;
    await advance(10_000);
    await advance(10_000);
    // two addresses (own + list), one round per 10 seconds
    expect(probed.length - afterStart).toBe(4);
  });

  it('keeps working with the built-in list when GitHub cannot be reached', async () => {
    const { browser, updates, advance } = setup(null);
    browser.start();
    await advance(0);
    expect(updates[updates.length - 1].map(r => r.address)).toEqual(['up-own:47800']);
  });
});
