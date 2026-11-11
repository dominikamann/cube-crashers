import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../src/net/protocol';
import { ClientSession, HostSession } from '../../src/net/session';
import { createMemoryHub } from '../../src/net/transport';

function setup() {
  const hub = createMemoryHub();
  const host = new HostSession(hub.host(), { name: 'Dominik' });
  const a = new ClientSession(hub.client(), { name: 'Kim' });
  const b = new ClientSession(hub.client(), { name: 'Sam' });
  hub.flush();
  return { hub, host, a, b };
}

describe('LAN session', () => {
  it('fills the lobby as clients join', () => {
    const { host, a, b } = setup();
    expect(host.lobby.map(p => p.name)).toEqual(['Dominik', 'Kim', 'Sam']);
    expect(a.lobby.map(p => p.name)).toEqual(['Dominik', 'Kim', 'Sam']);
    expect(a.playerId).toBe(1);
    expect(b.playerId).toBe(2);
    expect(new Set(host.lobby.map(p => p.color)).size).toBe(3);
  });

  it('turns away a client with another version and a seventh player', () => {
    const hub = createMemoryHub();
    const host = new HostSession(hub.host(), { name: 'H' });
    const odd = new ClientSession(hub.client(), { name: 'Old', version: PROTOCOL_VERSION + 1 });
    for (let i = 0; i < 5; i++) new ClientSession(hub.client(), { name: `P${i}` });
    const late = new ClientSession(hub.client(), { name: 'Late' });
    hub.flush();
    expect(odd.status).toBe('rejected');
    expect(late.status).toBe('rejected');
    expect(host.lobby).toHaveLength(6);
  });

  it('starts everyone on the same floor and moves each player by their own input', () => {
    const { hub, host, a, b } = setup();
    host.start(42, 'high');
    hub.flush();
    expect(a.status).toBe('playing');
    expect(a.view!.seed).toBe(42);
    expect(a.view!.difficulty).toBe('high');
    expect(host.sim!.players.map(p => p.id)).toEqual([0, 1, 2]);
    const x0 = host.sim!.players[1].pos.x;
    for (let i = 0; i < 60; i++) {
      a.sendInput([{ type: 'move', playerId: 99, dir: { x: 1, z: 0 } }]);
      b.sendInput([]);
      hub.flush();
      host.step([]);
      hub.flush();
    }
    expect(host.sim!.players[1].pos.x - x0).toBeGreaterThan(5);
    expect(a.view!.players[1].pos.x).toBeCloseTo(host.sim!.players[1].pos.x, 0);
    expect(a.view!.tick).toBeGreaterThan(50);
  });

  it('applies a jump once even when it arrives with several inputs in one tick', () => {
    const { hub, host, a } = setup();
    host.start(1, 'medium');
    hub.flush();
    a.sendInput([{ type: 'jump', playerId: 1 }]);
    a.sendInput([]);
    hub.flush();
    host.step([]);
    expect(host.sim!.events.filter(e => e.type === 'jump')).toHaveLength(1);
  });

  it('removes a player who leaves', () => {
    const { hub, host, a } = setup();
    host.start(1, 'medium');
    hub.flush();
    a.leave();
    hub.flush();
    host.step([]);
    expect(host.sim!.players.map(p => p.id)).toEqual([0, 2]);
  });

  it('sends everyone back when the host leaves', () => {
    const { hub, host, a, b } = setup();
    host.close();
    hub.flush();
    expect(a.status).toBe('hostLeft');
    expect(b.status).toBe('hostLeft');
  });

  it('survives a client that sends broken commands', () => {
    const { hub, host, a } = setup();
    host.start(1, 'medium');
    hub.flush();
    a.sendInput([{ type: 'move' } as never, { type: 'build', playerId: 1, padId: 3, tower: 'constructor' } as never]);
    hub.flush();
    expect(() => host.step([])).not.toThrow();
    expect(host.sim!.players.every(p => Number.isFinite(p.coins))).toBe(true);
  });

  it('stops repeating the input of a client that went silent', () => {
    const { hub, host, a } = setup();
    host.start(1, 'medium');
    hub.flush();
    a.sendInput([{ type: 'move', playerId: 1, dir: { x: 1, z: 0 } }]);
    hub.flush();
    for (let i = 0; i < 20; i++) host.step([]);
    const x = host.sim!.players[1].pos.x;
    for (let i = 0; i < 20; i++) host.step([]);
    expect(host.sim!.players[1].pos.x).toBe(x);
  });

  it('sends the game only to players in the lobby and closes rejected peers', () => {
    const hub = createMemoryHub();
    const host = new HostSession(hub.host(), { name: 'H' });
    const ok = new ClientSession(hub.client(), { name: 'A' });
    const odd = new ClientSession(hub.client(), { name: 'Old', version: PROTOCOL_VERSION + 1 });
    hub.flush();
    expect(hub.kicked).toContain(2);
    host.start(1, 'medium');
    hub.flush();
    expect(ok.status).toBe('playing');
    expect(odd.view).toBeNull();
  });

  it('notices a host that went silent', () => {
    const { hub, host, a } = setup();
    host.start(1, 'medium');
    hub.flush();
    host.step([]);
    host.step([]);
    hub.flush();
    a.checkTimeout(1000);
    expect(a.status).toBe('playing');
    a.checkTimeout(1000 + 6000);
    expect(a.status).toBe('hostLeft');
  });

  it('goes back to the lobby when the host does', () => {
    const { hub, host, a } = setup();
    host.start(1, 'medium');
    hub.flush();
    host.sim!.phase = 'won';
    host.step([]);
    host.endRun();
    hub.flush();
    expect(a.status).toBe('lobby');
  });

  it('gives a joining player the colour they asked for, if it is free', () => {
    const hub = createMemoryHub();
    const host = new HostSession(hub.host(), { name: 'H', color: 4 });
    const a = new ClientSession(hub.client(), { name: 'A', color: 2 });
    const b = new ClientSession(hub.client(), { name: 'B', color: 2 });
    const c = new ClientSession(hub.client(), { name: 'C', color: 4 });
    hub.flush();
    expect(host.lobby.map(p => p.color)).toEqual([4, 2, expect.any(Number), expect.any(Number)]);
    expect(new Set(host.lobby.map(p => p.color)).size).toBe(4);
    void a;
    void b;
    void c;
  });
});
