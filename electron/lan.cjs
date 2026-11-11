// LAN networking for the desktop app: a WebSocket server that only forwards messages between the
// host's game window (peer 0) and the clients, a UDP beacon that announces the game, and discovery.
const dgram = require('node:dgram');
const os = require('node:os');
const { WebSocket, WebSocketServer } = require('ws');

const GAME_PORT = 47800;
const BEACON_PORT = 47801;
const MAX_BYTES = 256 * 1024;
const BEACON_TAG = 'cube-crashers';

/** Starts the game server. `send(to, data)`: to a peer number or 'all'. */
function startHost({ port = GAME_PORT, onMessage, onPeer }) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, maxPayload: MAX_BYTES });
    const peers = new Map();
    let nextPeer = 1;
    wss.on('error', reject);
    wss.on('connection', ws => {
      const peer = nextPeer++;
      peers.set(peer, ws);
      onPeer(peer, true);
      ws.on('message', raw => {
        const data = String(raw);
        if (data.length <= MAX_BYTES) onMessage(peer, data);
      });
      ws.on('close', () => {
        peers.delete(peer);
        onPeer(peer, false);
      });
      ws.on('error', () => ws.close());
    });
    wss.on('listening', () =>
      resolve({
        port: wss.address().port,
        players: () => peers.size + 1,
        send(to, data) {
          const targets = to === 'all' ? [...peers.values()] : [peers.get(Number(to))].filter(Boolean);
          for (const ws of targets) if (ws.readyState === WebSocket.OPEN) ws.send(data);
        },
        stop() {
          for (const ws of peers.values()) ws.close();
          wss.close();
        },
      }),
    );
  });
}

/** Connects to a host ("192.168.1.20" or "192.168.1.20:47800"). */
function connect(address, { onMessage, onClose }) {
  const target = address.includes(':') ? address : `${address}:${GAME_PORT}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${target}`, { maxPayload: MAX_BYTES, handshakeTimeout: 4000 });
    let open = false;
    ws.on('open', () => {
      open = true;
      resolve({
        send: data => ws.readyState === WebSocket.OPEN && ws.send(data),
        close: () => ws.close(),
      });
    });
    ws.on('message', raw => onMessage(0, String(raw)));
    ws.on('close', () => (open ? onClose() : reject(new Error('connect'))));
    ws.on('error', err => {
      if (!open) reject(err);
    });
  });
}

/** Broadcast addresses of all IPv4 network interfaces (plus the global one). */
function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const ip = i.address.split('.').map(Number);
      const mask = i.netmask.split('.').map(Number);
      out.add(ip.map((b, k) => (b | (~mask[k] & 255)) & 255).join('.'));
    }
  }
  return [...out];
}

/** Announces the game on the LAN every `intervalMs`. `info()` → { name, players, gamePort }. */
function startBeacon({ port = BEACON_PORT, intervalMs = 1000, info, addresses = broadcastAddresses() }) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.bind(() => sock.setBroadcast(true));
  const timer = setInterval(() => {
    const msg = Buffer.from(JSON.stringify({ tag: BEACON_TAG, v: 1, ...info() }));
    for (const a of addresses) sock.send(msg, port, a, () => {});
  }, intervalMs);
  return {
    stop() {
      clearInterval(timer);
      sock.close();
    },
  };
}

/** Listens for beacons and reports the current list of games whenever it changes (and every second). */
function startDiscovery({ port = BEACON_PORT, expireMs = 3000, onGames }) {
  const games = new Map();
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (buf, rinfo) => {
    let m;
    try {
      m = JSON.parse(String(buf));
    } catch {
      return;
    }
    if (m.tag !== BEACON_TAG || typeof m.name !== 'string' || typeof m.gamePort !== 'number') return;
    const address = `${rinfo.address}:${m.gamePort}`;
    games.set(address, { address, name: m.name.slice(0, 16), players: Number(m.players) || 1, seen: Date.now() });
    report();
  });
  sock.bind(port);
  const report = () => {
    const now = Date.now();
    for (const [k, g] of games) if (now - g.seen > expireMs) games.delete(k);
    onGames([...games.values()].map(({ address, name, players }) => ({ address, name, players })));
  };
  const timer = setInterval(report, Math.min(1000, expireMs / 2));
  return {
    stop() {
      clearInterval(timer);
      sock.close();
    },
  };
}

module.exports = { startHost, connect, startBeacon, startDiscovery, GAME_PORT, BEACON_PORT };
