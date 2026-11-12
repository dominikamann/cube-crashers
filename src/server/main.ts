import { existsSync, readFileSync } from 'node:fs';
import { startHost } from '../../electron/lan.cjs';
import { HostSession } from '../net/session';
import type { Transport } from '../net/transport';
import { MAX_PLAYERS } from '../sim/config/balance';
import { DT } from '../sim/types';
import { APP_VERSION } from '../version';
import { HELP, parseConfig, serverIdentity, type ServerConfig } from './config';
import { DedicatedServer } from './dedicated';

/** The dedicated server: `node cube-crashers-server.mjs --mode gungame` (see --help). */
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  if (args.includes('--version')) {
    console.log(APP_VERSION);
    return;
  }
  // --config <file> (or ./server.json when it is there)
  let configPath: string | null = existsSync('server.json') ? 'server.json' : null;
  const i = args.findIndex(a => a === '--config' || a.startsWith('--config='));
  if (i >= 0) {
    configPath = args[i].includes('=') ? args[i].slice('--config='.length) : args[i + 1];
    args.splice(i, args[i].includes('=') ? 1 : 2);
  }
  let cfg: ServerConfig;
  try {
    const file = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : null;
    cfg = parseConfig(args, process.env, file);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }

  // the desktop app's LAN server carries the game here too: peer 0 is this process
  let onMessage: (from: number, data: string) => void = () => {};
  let onPeer: (peer: number, joined: boolean) => void = () => {};
  const net = await startHost({
    port: cfg.port,
    onMessage: (from, data) => onMessage(from, data),
    onPeer: (peer, joined) => onPeer(peer, joined),
    // 8 players plus plenty of room for server-list probes (short-lived) and for telling more that it is full
    maxPeers: MAX_PLAYERS + 56,
  }).catch(err => {
    console.error(`error: cannot listen on port ${cfg.port} (${(err as Error).message})`);
    process.exit(1);
  });
  const transport: Transport = {
    send: (to, data) => net.send(to, data),
    onMessage: cb => void (onMessage = cb),
    onPeer: cb => void (onPeer = cb),
    onClose: () => {},
    kick: peer => net.kick(peer),
    close: () => net.stop(),
  };
  const log = (line: string) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${line}`);
  const host = new HostSession(transport, { name: cfg.name, dedicated: serverIdentity(cfg) });
  const server = new DedicatedServer(host, cfg, { log });

  log(`Cube Crashers server ${APP_VERSION}: "${cfg.name}", ${cfg.mode}, port ${net.port}`);
  log(`players join with this computer's address and port ${net.port} (open it in your router to play over the internet)`);

  // a fixed step like the game's own loop; catches up after a hiccup, but never more than a few steps
  let last = performance.now();
  let acc = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    acc = Math.min(acc + (now - last) / 1000, DT * 5);
    last = now;
    while (acc >= DT) {
      server.tick();
      acc -= DT;
    }
  }, 1000 * DT / 2);

  const stop = () => {
    log('shutting down');
    clearInterval(timer);
    host.close();
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void main();
