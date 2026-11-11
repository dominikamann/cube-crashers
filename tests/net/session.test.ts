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
});
