import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const lan = require('../../electron/lan.cjs');

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

describe('desktop LAN server', () => {
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
});
