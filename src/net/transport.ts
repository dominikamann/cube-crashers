/**
 * The game talks to the network through this small interface. Peer 0 is always the host.
 * Implementations: an in-memory hub (tests), the dev relay (browser windows on one machine)
 * and the desktop app's LAN server.
 */
export interface Transport {
  /** host: send to one peer or everyone; client: `to` is ignored and the message goes to the host */
  send(to: number | 'all', data: string): void;
  onMessage(cb: (from: number, data: string) => void): void;
  /** host only: a peer connected or went away */
  onPeer(cb: (peer: number, joined: boolean) => void): void;
  /** client only: the host is gone */
  onClose(cb: () => void): void;
  close(): void;
}

interface Queued {
  to: number;
  from: number;
  data: string;
}

/** Synchronous in-memory network for tests: messages are delivered on flush(). */
export function createMemoryHub() {
  const queue: Queued[] = [];
  const handlers = new Map<number, (from: number, data: string) => void>();
  const peerHandlers: ((peer: number, joined: boolean) => void)[] = [];
  const closeHandlers = new Map<number, () => void>();
  const events: (() => void)[] = [];
  let nextPeer = 1;
  let hostOpen = true;
  const open = new Set<number>([0]);

  function hostTransport(): Transport {
    return {
      send(to, data) {
        const targets = to === 'all' ? [...open].filter(p => p !== 0) : [to];
        for (const t of targets) queue.push({ to: t, from: 0, data });
      },
      onMessage: cb => void handlers.set(0, cb),
      onPeer: cb => void peerHandlers.push(cb),
      onClose: () => {},
      close() {
        hostOpen = false;
        for (const p of open) if (p !== 0) events.push(() => closeHandlers.get(p)?.());
      },
    };
  }

  function clientTransport(): Transport {
    const id = nextPeer++;
    open.add(id);
    events.push(() => peerHandlers.forEach(h => h(id, true)));
    return {
      send(_to, data) {
        if (hostOpen && open.has(id)) queue.push({ to: 0, from: id, data });
      },
      onMessage: cb => void handlers.set(id, cb),
      onPeer: () => {},
      onClose: cb => void closeHandlers.set(id, cb),
      close() {
        open.delete(id);
        events.push(() => peerHandlers.forEach(h => h(id, false)));
      },
    };
  }

  return {
    host: hostTransport,
    client: clientTransport,
    /** delivers everything that was sent, including messages sent while delivering */
    flush() {
      for (let guard = 0; guard < 1000 && (events.length > 0 || queue.length > 0); guard++) {
        while (events.length > 0) events.shift()!();
        while (queue.length > 0) {
          const m = queue.shift()!;
          if (m.to !== 0 && !open.has(m.to)) continue;
          handlers.get(m.to)?.(m.from, m.data);
        }
      }
    },
  };
}
