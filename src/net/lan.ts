import type { JoinEntry } from '../ui/screens';
import { connectRelay, listRelayRooms } from './relay';
import type { Transport } from './transport';

/** How this build reaches other players: the desktop app's LAN server, or the dev relay in the browser. */
export interface Lan {
  /** an address field makes sense (real network) */
  canEnterAddress: boolean;
  host(name: string): Promise<Transport>;
  /** reports the games it finds, again and again, until the returned stop function is called */
  discover(cb: (games: JoinEntry[]) => void): () => void;
  join(target: string): Promise<Transport>;
  /** internet servers: only the desktop app can reach them */
  online?: { probe(address: string): Promise<{ data: string; ms: number } | null>; fetchList(): Promise<unknown> };
}

function devRelayLan(): Lan {
  return {
    canEnterAddress: false,
    host: name => connectRelay(name || 'game', 'host'),
    discover(cb) {
      let stopped = false;
      const poll = async () => {
        if (stopped) return;
        const rooms = await listRelayRooms();
        if (!stopped) cb(rooms.map(r => ({ target: r.room, label: r.room, players: r.players })));
        setTimeout(poll, 1000);
      };
      void poll();
      return () => {
        stopped = true;
      };
    },
    join: target => connectRelay(target, 'client'),
  };
}

/** null when neither the desktop app nor the dev server is there to carry LAN games */
export async function createLan(): Promise<Lan | null> {
  if (window.cubeCrashers?.lan) {
    const { electronLan } = await import('./electron-lan');
    return electronLan(window.cubeCrashers.lan);
  }
  if (import.meta.env.DEV) return devRelayLan();
  return null;
}
