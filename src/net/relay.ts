import type { Transport } from './transport';

/**
 * Talks to the dev relay in the Vite server (/__lan). Lets several browser windows on one computer
 * play together without the desktop app. The relay only forwards messages.
 */
export function connectRelay(room: string, role: 'host' | 'client'): Promise<Transport> {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/__lan?room=${encodeURIComponent(room)}&role=${role}`;
  const ws = new WebSocket(url);
  let onMessage: (from: number, data: string) => void = () => {};
  let onPeer: (peer: number, joined: boolean) => void = () => {};
  let onClose: () => void = () => {};
  const transport: Transport = {
    send: (to, data) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ to, data })),
    onMessage: cb => void (onMessage = cb),
    onPeer: cb => void (onPeer = cb),
    onClose: cb => void (onClose = cb),
    kick: peer => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ kick: peer })),
    close: () => ws.close(),
  };
  return new Promise((resolve, reject) => {
    ws.onmessage = e => {
      let m: { sys?: string; peer?: number; from?: number; data?: string };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.sys === 'ready') resolve(transport);
      else if (m.sys === 'error') reject(new Error('room'));
      else if (m.sys === 'join') onPeer(m.peer!, true);
      else if (m.sys === 'leave') onPeer(m.peer!, false);
      else if (m.sys === 'closed') onClose();
      else if (typeof m.from === 'number' && typeof m.data === 'string') onMessage(m.from, m.data);
    };
    ws.onerror = () => reject(new Error('connect'));
    ws.onclose = () => onClose();
  });
}

export interface RelayRoom {
  room: string;
  players: number;
}

export async function listRelayRooms(): Promise<RelayRoom[]> {
  try {
    const r = await fetch('/__lan/rooms');
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}
