import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Plugin } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

interface Room {
  host: WebSocket;
  clients: Map<number, WebSocket>;
  nextPeer: number;
}

const MAX_BYTES = 256 * 1024;

/**
 * Dev only: a WebSocket relay at /__lan so several browser windows can test LAN play on one computer.
 * The first connection to a room is the host (peer 0); everyone else gets a peer number.
 */
export function lanRelayPlugin(): Plugin {
  return {
    name: 'cube-crashers-lan-relay',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BYTES });
      const rooms = new Map<string, Room>();

      server.middlewares.use('/__lan/rooms', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify([...rooms].map(([room, r]) => ({ room, players: r.clients.size + 1 }))));
      });

      server.httpServer?.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        if (url.pathname !== '/__lan') return;
        // only the game's own pages (same dev server) may use the relay
        const origin = req.headers.origin ?? '';
        if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return socket.destroy();
        wss.handleUpgrade(req, socket, head, ws => {
          const room = (url.searchParams.get('room') ?? '').slice(0, 32);
          const role = url.searchParams.get('role');
          const send = (to: WebSocket, msg: unknown) => to.readyState === WebSocket.OPEN && to.send(JSON.stringify(msg));
          if (!room) return ws.close();

          if (role === 'host') {
            if (rooms.has(room)) {
              send(ws, { sys: 'error' });
              return ws.close();
            }
            const r: Room = { host: ws, clients: new Map(), nextPeer: 1 };
            rooms.set(room, r);
            send(ws, { sys: 'ready' });
            ws.on('message', raw => {
              let m: { to?: number | 'all'; data?: string; kick?: number };
              try {
                m = JSON.parse(String(raw));
              } catch {
                return;
              }
              if (typeof m.kick === 'number') return r.clients.get(m.kick)?.close();
              if (typeof m.data !== 'string') return;
              const targets = m.to === 'all' ? [...r.clients.values()] : [r.clients.get(Number(m.to))].filter(Boolean);
              for (const t of targets) send(t as WebSocket, { from: 0, data: m.data });
            });
            ws.on('close', () => {
              rooms.delete(room);
              for (const c of r.clients.values()) {
                send(c, { sys: 'closed' });
                c.close();
              }
            });
            return;
          }

          const r = rooms.get(room);
          if (!r) {
            send(ws, { sys: 'error' });
            return ws.close();
          }
          const peer = r.nextPeer++;
          r.clients.set(peer, ws);
          send(ws, { sys: 'ready' });
          send(r.host, { sys: 'join', peer });
          ws.on('message', raw => {
            let m: { data?: string };
            try {
              m = JSON.parse(String(raw));
            } catch {
              return;
            }
            if (typeof m.data === 'string') send(r.host, { from: peer, data: m.data });
          });
          ws.on('close', () => {
            r.clients.delete(peer);
            send(r.host, { sys: 'leave', peer });
          });
        });
      });
    },
  };
}
