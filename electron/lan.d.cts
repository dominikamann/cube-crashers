// Types for lan.cjs, which the dedicated server reuses (the desktop app loads it from plain JavaScript).
export interface HostServer {
  port: number;
  players(): number;
  send(to: number | 'all', data: string): void;
  kick(peer: number): void;
  stop(): void;
}
export function startHost(opts: {
  port?: number;
  onMessage: (peer: number, data: string) => void;
  onPeer: (peer: number, joined: boolean) => void;
  maxPeers?: number;
}): Promise<HostServer>;
export function connect(address: string, opts: { onMessage: (from: number, data: string) => void; onClose: () => void }): Promise<{ send(data: string): void; close(): void }>;
export const GAME_PORT: number;
