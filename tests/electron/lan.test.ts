import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const lan = require('../../electron/lan.cjs');
const { WebSocket } = require('ws');

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

describe('desktop LAN server', () => {
  it('reuses free peer numbers, so they stay small however many come and go (bots use 1000 and up)', async () => {
    const peers: number[] = [];
    const host = await lan.startHost({ port: 0, onMessage: () => {}, onPeer: (peer: number, joined: boolean) => joined && peers.push(peer) });
    cleanup.push(() => host.stop());
    for (let i = 0; i < 30; i++) {
      const c = await lan.connect(`127.0.0.1:${host.port}`, { onMessage: () => {}, onClose: () => {} });
      await wait(20);
      c.close();
      await wait(20);
    }
    expect(Math.max(...peers)).toBeLessThan(5);
  });

  it('probes a server for the online list: its answer and the round trip, or null when nobody is there', async () => {
    const host = await lan.startHost({
      port: 0,
      onMessage: (from: number, data: string) => data.includes('"info"') && host.send(from, '{"type":"info","name":"S"}'),
      onPeer: () => {},
    });
    cleanup.push(() => host.stop());
    const answer = await lan.probe(`127.0.0.1:${host.port}`);
    expect(answer.data).toBe('{"type":"info","name":"S"}');
    expect(answer.ms).toBeGreaterThanOrEqual(0);
    const port = host.port;
    host.stop();
    await wait(50);
    expect(await lan.probe(`127.0.0.1:${port}`, 500)).toBeNull();
  });

  it('relays messages between a host and two clients', async () => {
    const got: string[] = [];
    const host = await lan.startHost({ port: 0, onMessage: (from: number, data: string) => got.push(`host<${from}:${data}`), onPeer: (peer: number, joined: boolean) => got.push(`peer ${peer} ${joined}`) });
    cleanup.push(() => host.stop());
    const a = await lan.connect(`127.0.0.1:${host.port}`, { onMessage: (_f: number, d: string) => got.push(`a<${d}`), onClose: () => got.push('a closed') });
    await lan.connect(`127.0.0.1:${host.port}`, { onMessage: (_f: number, d: string) => got.push(`b<${d}`), onClose: () => got.push('b closed') });
    await wait(100);
    a.send('ping');
    host.send(2, 'just-b');
    host.send('all', 'everyone');
    await wait(150);
    expect(got).toContain('peer 1 true');
    expect(got).toContain('peer 2 true');
    expect(got).toContain('host<1:ping');
    expect(got).toContain('b<just-b');
    expect(got).not.toContain('a<just-b');
    expect(got).toContain('a<everyone');
    expect(got).toContain('b<everyone');
    a.close();
    await wait(100);
    expect(got).toContain('peer 1 false');
    host.stop();
    await wait(100);
    expect(got).toContain('b closed');
  });

  it('finds a game by its beacon and forgets it when the beacon stops', async () => {
    const port = 47900 + Math.floor(Math.random() * 50);
    const seen: { name: string; players: number; address: string }[][] = [];
    const disco = lan.startDiscovery({ port, expireMs: 400, onGames: (g: typeof seen[number]) => seen.push(g) });
    cleanup.push(() => disco.stop());
    const beacon = lan.startBeacon({ port, intervalMs: 100, info: () => ({ name: 'Dominik', players: 2, gamePort: 47800 }), addresses: ['127.0.0.1'] });
    await wait(350);
    expect(seen.some(g => g.some(x => x.name === 'Dominik' && x.players === 2 && x.address.endsWith(':47800')))).toBe(true);
    beacon.stop();
    await wait(700);
    expect(seen[seen.length - 1]).toEqual([]);
  });

  it('refuses huge messages', async () => {
    const got: string[] = [];
    const host = await lan.startHost({ port: 0, onMessage: (_f: number, d: string) => got.push(d), onPeer: () => {} });
    cleanup.push(() => host.stop());
    const a = await lan.connect(`127.0.0.1:${host.port}`, { onMessage: () => {}, onClose: () => {} });
    a.send('x'.repeat(300 * 1024));
    await wait(150);
    expect(got).toHaveLength(0);
  });

  async function quietHost(opts: Record<string, unknown> = {}) {
    const got: string[] = [];
    const host = await lan.startHost({ port: 0, onMessage: (_f: number, d: string) => got.push(d), onPeer: () => {}, ...opts });
    cleanup.push(() => host.stop());
    return { host, got };
  }

  function raw(port: number, opts: Record<string, unknown> = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, opts);
    const state = { open: false, closed: false };
    ws.on('open', () => (state.open = true));
    ws.on('close', () => (state.closed = true));
    ws.on('error', () => {});
    cleanup.push(() => ws.terminate());
    return { ws, state };
  }

  it('turns away web pages (connections with an Origin header)', async () => {
    const { host } = await quietHost();
    const page = raw(host.port, { origin: 'http://evil.example' });
    await wait(150);
    expect(page.state.open).toBe(false);
  });

  it('a dedicated server started with --web lets the browser version in', async () => {
    const { host } = await quietHost({ web: true });
    const page = raw(host.port, { origin: 'https://html-classic.itch.zone' });
    const app = raw(host.port);
    await wait(150);
    expect(page.state.open).toBe(true);
    expect(app.state.open).toBe(true);
  });

  it('accepts at most 14 connections (10 players and room to turn more away)', async () => {
    const { host } = await quietHost();
    const conns = Array.from({ length: 17 }, () => raw(host.port));
    await wait(300);
    expect(conns.filter(c => c.state.open && !c.state.closed)).toHaveLength(14);
  });

  it('drops a peer that sends too much too fast', async () => {
    const { host, got } = await quietHost();
    const c = raw(host.port);
    await wait(100);
    for (let i = 0; i < 400; i++) c.ws.send('x');
    await wait(200);
    expect(got.length).toBeLessThanOrEqual(130);
    expect(c.state.closed).toBe(true);
  });

  it('closes peers the host never took in', async () => {
    const { host } = await quietHost({ admitMs: 200 });
    const lurker = raw(host.port);
    const guest = raw(host.port);
    await wait(80);
    host.send(2, 'welcome');
    await wait(300);
    expect(lurker.state.closed).toBe(true);
    expect(guest.state.closed).toBe(false);
  });

  it('closes a peer that stops answering pings', async () => {
    const { host } = await quietHost({ heartbeatMs: 100 });
    const dead = raw(host.port, { autoPong: false });
    await wait(80);
    host.send(1, 'welcome');
    await wait(400);
    expect(dead.state.closed).toBe(true);
  });

  it('can kick a peer', async () => {
    const { host } = await quietHost();
    const c = raw(host.port);
    await wait(100);
    host.kick(1);
    await wait(100);
    expect(c.state.closed).toBe(true);
  });

  it('ignores beacons with a bad port and lists at most 20 games', async () => {
    const port = 47950 + Math.floor(Math.random() * 40);
    let last: unknown[] = [];
    const disco = lan.startDiscovery({ port, onGames: (g: unknown[]) => (last = g) });
    cleanup.push(() => disco.stop());
    const dgram = require('node:dgram');
    const sock = dgram.createSocket('udp4');
    const send = (m: object) => sock.send(Buffer.from(JSON.stringify({ tag: 'cube-crashers', v: 1, name: 'x', players: 1, open: true, ...m })), port, '127.0.0.1');
    send({ gamePort: 99999 });
    for (let i = 0; i < 30; i++) send({ gamePort: 40000 + i });
    await wait(300);
    sock.close();
    expect(last.length).toBe(20);
  });
});
