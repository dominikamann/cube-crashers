import { describe, expect, it } from 'vitest';
import { ClientSession, HostSession, SEAT_HOLD_MS } from '../../src/net/session';
import { createMemoryHub } from '../../src/net/transport';

const KEY = 'a-key-of-mine';

function server(mode: 'quick' | 'score' = 'quick') {
  const hub = createMemoryHub();
  let now = 1000;
  const host = new HostSession(hub.host(), { name: 'Server', now: () => now, dedicated: { name: 'S', mode, teams: false } });
  const line = hub.client();
  new ClientSession(line, { name: 'Ann', key: KEY });
  hub.flush();
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      if (host.waiting) host.idle();
      else host.step([]);
      hub.flush();
    }
  };
  return { hub, host, line, run, later: (ms: number) => (now += ms) };
}

describe('a seat is kept for whoever loses the connection', () => {
  it('the last one playing takes the game with them: it waits as it is, and they come back with what they had', () => {
    const { hub, host, line, run } = server();
    host.start(3, 'medium', 'quick', 'floor01');
    run(600);
    const s = host.sim!;
    const ann = s.players[0];
    ann.coins = 77;
    ann.pos = { ...ann.pos, x: ann.pos.x + 1 };
    const at = { ...ann.pos }, tick = s.tick;
    line.close();
    hub.flush();
    expect(host.waiting).toBe(true);
    expect(s.phase).toBe('playing');
    run(120);
    // (nothing moved while it waited)
    expect(s.tick).toBe(tick);
    const back = new ClientSession(hub.client(), { name: 'Ann', key: KEY });
    hub.flush();
    run(5);
    expect(back.status).toBe('playing');
    expect(host.waiting).toBe(false);
    expect(s.players).toHaveLength(1);
    expect(s.players[0].coins).toBe(77);
    expect(s.players[0].pos).toEqual(at);
    expect(s.tick).toBeGreaterThan(tick);
  });

  it('is not kept for ever: after a minute the game is nobody\'s', () => {
    const { hub, host, line, later } = server();
    host.start(3, 'medium', 'quick', 'floor01');
    line.close();
    hub.flush();
    expect(host.waiting).toBe(true);
    later(SEAT_HOLD_MS + 1);
    expect(host.waiting).toBe(false);
    expect(host.sim!.players).toHaveLength(0);
  });

  it('is not kept for whoever says goodbye', () => {
    const { hub, host, line, run } = server();
    host.start(3, 'medium', 'quick', 'floor01');
    run(10);
    // (as on a real line: the goodbye arrives, then the line closes)
    line.send(0, JSON.stringify({ type: 'leave' }));
    hub.flush();
    line.close();
    hub.flush();
    expect(host.waiting).toBe(false);
  });

  it('in a versus match that goes on without them they come back with their score', () => {
    const { hub, host, line, run } = server('score');
    const other = new ClientSession(hub.client(), { name: 'Bob', key: 'another-key' });
    hub.flush();
    host.startVersus({ mode: 'ffa', rule: 'score', map: 'neon' }, 4);
    run(600);
    const s = host.sim!;
    const id = s.players.find(p => p.name === 'Ann')!.id;
    s.versus!.scores[id] = 6;
    line.close();
    hub.flush();
    run(30);
    expect(host.waiting).toBe(false);
    expect(s.players.some(p => p.name === 'Ann')).toBe(false);
    const back = new ClientSession(hub.client(), { name: 'Ann', key: KEY });
    hub.flush();
    run(5);
    expect(back.status).toBe('playing');
    expect(s.versus!.scores[back.playerId]).toBe(6);
    expect(other.status).toBe('playing');
  });

  it('a second line of the same player takes the place of the first, which is hung up', () => {
    const { hub, host, run } = server();
    host.start(3, 'medium', 'quick', 'floor01');
    run(600);
    host.sim!.players[0].coins = 5;
    const back = new ClientSession(hub.client(), { name: 'Ann', key: KEY });
    hub.flush();
    run(5);
    expect(hub.kicked).toHaveLength(1);
    expect(host.lobby.map(p => p.id)).toEqual([back.playerId]);
    expect(host.sim!.players.map(p => p.coins)).toEqual([5]);
  });
});
