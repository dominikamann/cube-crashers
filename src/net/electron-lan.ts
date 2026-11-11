import type { Lan } from './lan';
import type { Transport } from './transport';

/** The part of the desktop app's preload bridge that carries LAN games (see electron/preload.cjs). */
export interface LanBridge {
  host(name: string): Promise<void>;
  join(address: string): Promise<void>;
  discover(): Promise<void>;
  stopDiscovery(): Promise<void>;
  send(to: number | 'all', data: string): void;
  kick(peer: number): void;
  /** what the network announcement says about this game */
  setInfo(info: { players: number; open: boolean }): void;
  close(): Promise<void>;
  on(cb: (event: LanBridgeEvent) => void): () => void;
}

export type LanBridgeEvent =
  | { type: 'message'; from: number; data: string }
  | { type: 'peer'; peer: number; joined: boolean }
  | { type: 'closed' }
  | { type: 'games'; games: { address: string; name: string; players: number }[] };

function bridgeTransport(bridge: LanBridge): Transport {
  let onMessage: (from: number, data: string) => void = () => {};
  let onPeer: (peer: number, joined: boolean) => void = () => {};
  let onClose: () => void = () => {};
  const off = bridge.on(e => {
    if (e.type === 'message') onMessage(e.from, e.data);
    else if (e.type === 'peer') onPeer(e.peer, e.joined);
    else if (e.type === 'closed') onClose();
  });
  return {
    send: (to, data) => bridge.send(to, data),
    onMessage: cb => void (onMessage = cb),
    onPeer: cb => void (onPeer = cb),
    onClose: cb => void (onClose = cb),
    kick: peer => bridge.kick(peer),
    close: () => {
      off();
      void bridge.close();
    },
  };
}

export function electronLan(bridge: LanBridge): Lan {
  return {
    canEnterAddress: true,
    async host(name) {
      const t = bridgeTransport(bridge);
      try {
        await bridge.host(name);
      } catch (err) {
        t.close();
        throw err;
      }
      return t;
    },
    discover(cb) {
      const off = bridge.on(e => {
        if (e.type === 'games') cb(e.games.map(g => ({ target: g.address, label: g.name, players: g.players })));
      });
      void bridge.discover();
      return () => {
        off();
        void bridge.stopDiscovery();
      };
    },
    async join(address) {
      const t = bridgeTransport(bridge);
      try {
        await bridge.join(address);
      } catch (err) {
        t.close();
        throw err;
      }
      return t;
    },
  };
}
