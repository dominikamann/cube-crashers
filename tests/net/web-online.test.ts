import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { connectWeb, probeWeb, socketUrl, webOnline, type OpenSocket } from '../../src/net/web-online';

const require = createRequire(import.meta.url);
const lan = require('../../electron/lan.cjs');
const { WebSocket } = require('ws');

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

/** a socket the way a browser opens it: it always says which page it comes from */
const fromPage: OpenSocket = url => new WebSocket(url, { origin: 'https://html-classic.itch.zone' });

async function server(web: boolean) {
  const got: string[] = [];
  const host = await lan.startHost({
    port: 0,
    web,
    onMessage: (from: number, data: string) => {
      got.push(`${from}:${data}`);
      if (data.includes('"info"')) host.send(from, '{"type":"info","name":"S"}');
    },
    onPeer: (peer: number, joined: boolean) => got.push(`peer ${peer} ${joined}`),
  });
  cleanup.push(() => host.stop());
  return { host, got, url: `ws://127.0.0.1:${host.port}` };
}

describe('online games from a web page', () => {
  it('joining gives up when the server never finishes the handshake', async () => {
    let closed = false;
    const silent: OpenSocket = () => ({ send() {}, close: () => void (closed = true), onopen: null, onmessage: null, onclose: null, onerror: null });
    await expect(connectWeb('wss://never.example.org', silent, 50)).rejects.toThrow();
    expect(closed).toBe(true);
  });

  it('an https page opens encrypted connections, an http page plain ones', () => {
    expect(socketUrl('play.example.org:443', true)).toBe('wss://play.example.org:443');
    expect(socketUrl('10.0.0.5:47800', false)).toBe('ws://10.0.0.5:47800');
    expect(webOnline(true, fromPage)).toMatchObject({ web: true, defaultPort: 443 });
    expect(webOnline(false, fromPage)).toMatchObject({ web: false, defaultPort: 47800 });
  });

  it('asks a server that takes browser players who it is', async () => {
    const { url } = await server(true);
    const answer = await probeWeb(url, fromPage);
    expect(answer?.data).toBe('{"type":"info","name":"S"}');
    expect(answer?.ms).toBeGreaterThanOrEqual(0);
  });

  it('a server without --web, or none at all, reads as offline', async () => {
    const { url, host } = await server(false);
    expect(await probeWeb(url, fromPage, 500)).toBeNull();
    host.stop();
    await wait(50);
    expect(await probeWeb(url, fromPage, 500)).toBeNull();
    expect(await probeWeb('ws://', () => {
      throw new Error('SyntaxError');
    })).toBeNull();
  });

  it('joins: messages go both ways and the server going away is noticed', async () => {
    const { url, host, got } = await server(true);
    const t = await connectWeb(url, fromPage);
    const seen: string[] = [];
    t.onMessage((from, data) => seen.push(`${from}:${data}`));
    t.onClose(() => seen.push('closed'));
    await wait(50);
    t.send('all', 'hello');
    host.send(1, 'welcome');
    await wait(100);
    expect(got).toContain('1:hello');
    expect(seen).toEqual(['0:welcome']);
    host.stop();
    await wait(100);
    expect(seen).toEqual(['0:welcome', 'closed']);
  });

  it('nobody there: joining fails', async () => {
    const { url, host } = await server(true);
    host.stop();
    await wait(50);
    await expect(connectWeb(url, fromPage)).rejects.toThrow();
  });
});
