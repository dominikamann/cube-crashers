import { DEFAULT_PORT, WEB_PORT } from './server-list';
import type { Online } from './lan';
import type { Transport } from './transport';

/**
 * Online games from a web page (itch.io, a self-hosted copy). The browser connects to the server
 * itself; it can neither host a game nor look for one on the LAN. A page served over https may only
 * open encrypted connections, so there the servers are reached at their web address (wss://, a TLS
 * proxy in front of the server); a page served over plain http talks to the game port directly.
 */
const SERVER_LIST_URL = 'https://raw.githubusercontent.com/dominikamann/cube-crashers/main/servers.json';

/** "host:port" → the address a page opens; `secure` = the page itself came over https */
export function socketUrl(address: string, secure: boolean): string {
  return `${secure ? 'wss' : 'ws'}://${address}`;
}

/** the part of the browser's WebSocket this file uses (so tests can stand in for it) */
export interface Socket {
  send(data: string): void;
  close(): void;
  onopen: ((e: any) => void) | null;
  onmessage: ((e: any) => void) | null;
  onclose: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
}
export type OpenSocket = (url: string) => Socket;

/** Connects to a server; the promise fails when nobody answers within `timeoutMs` (like the desktop app's 4 s). */
export function connectWeb(url: string, open: OpenSocket, timeoutMs = 4000): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const ws = open(url);
    let opened = false;
    let closed = false;
    const timer = setTimeout(() => {
      if (opened) return;
      closed = true;
      ws.close();
      reject(new Error('connect'));
    }, timeoutMs);
    let onMessage: (from: number, data: string) => void = () => {};
    let onClose: () => void = () => {};
    ws.onopen = () => {
      if (closed) return;
      opened = true;
      clearTimeout(timer);
      resolve({
        send: (_to, data) => {
          if (!closed) ws.send(data);
        },
        onMessage: cb => void (onMessage = cb),
        onPeer: () => {},
        onClose: cb => void (onClose = cb),
        kick: () => {},
        close: () => ws.close(),
      });
    };
    ws.onmessage = e => onMessage(0, String(e.data));
    ws.onclose = () => {
      closed = true;
      clearTimeout(timer);
      if (opened) onClose();
      else reject(new Error('connect'));
    };
    ws.onerror = () => {};
  });
}

/** Asks a server who it is: its first answer and the round trip in ms, or null when it does not answer in time. */
export function probeWeb(url: string, open: OpenSocket, timeoutMs = 3000): Promise<{ data: string; ms: number } | null> {
  return new Promise(resolve => {
    let done = false;
    let sent = 0;
    let ws: Socket | null = null;
    const finish = (result: { data: string; ms: number } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ws?.close();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      ws = open(url);
    } catch {
      // an address the browser refuses outright
      return finish(null);
    }
    ws.onopen = () => {
      sent = performance.now();
      ws!.send(JSON.stringify({ type: 'info' }));
    };
    ws.onmessage = e => finish({ data: String(e.data).slice(0, 4096), ms: Math.round(performance.now() - sent) });
    ws.onclose = () => finish(null);
    ws.onerror = () => finish(null);
  });
}

export function webOnline(secure = location.protocol === 'https:', open: OpenSocket = url => new WebSocket(url)): Online {
  return {
    web: secure,
    defaultPort: secure ? WEB_PORT : DEFAULT_PORT,
    probe: address => probeWeb(socketUrl(address, secure), open),
    join: address => connectWeb(socketUrl(address, secure), open),
    async fetchList() {
      try {
        const res = await fetch(SERVER_LIST_URL, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
        if (!res.ok) return null;
        const text = await res.text();
        return text.length < 200_000 ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    },
  };
}
