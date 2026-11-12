import { describe, expect, it } from 'vitest';
import { parseMessage, PROTOCOL_VERSION, type HostMessage } from '../../src/net/protocol';
import { ClientSession, HostSession } from '../../src/net/session';
import { createMemoryHub } from '../../src/net/transport';
import { APP_VERSION } from '../../src/version';

function server(clients = 1) {
  const hub = createMemoryHub();
  const host = new HostSession(hub.host(), { name: 'Server', dedicated: { name: 'Dominiks Server', mode: 'gungame' } });
  const cs = Array.from({ length: clients }, (_, i) => new ClientSession(hub.client(), { name: `C${i}` }));
  hub.flush();
  return { hub, host, cs };
}

describe('a dedicated server session', () => {
  it('has nobody in the lobby until players join: the server itself does not play', () => {
    const { host, cs } = server(2);
    expect(host.lobby.map(p => p.name)).toEqual(['C0', 'C1']);
    expect(cs[0].lobby).toHaveLength(2);
    expect(cs[0].playerId).toBe(host.lobby[0].id);
  });

  it('answers a server-list probe with its name, mode, players and version, then hangs up', () => {
    const { hub, host } = server(2);
    const t = hub.client();
    const got: HostMessage[] = [];
    t.onMessage((_f, d) => got.push(parseMessage(d) as HostMessage));
    t.send(0, JSON.stringify({ type: 'info' }));
    hub.flush();
    expect(got[0]).toEqual({ type: 'info', name: 'Dominiks Server', mode: 'gungame', players: 2, bots: 0, max: 8, version: APP_VERSION, protocol: PROTOCOL_VERSION, playing: false });
    expect(hub.kicked).toHaveLength(1);
    expect(host.lobby).toHaveLength(2);
  });

  it('players can say they are ready; the lobby shows it and when the next match starts', () => {
    const { hub, host, cs } = server(2);
    cs[0].setReady(true);
    hub.flush();
    expect(host.lobby.find(p => p.name === 'C0')?.ready).toBe(true);
    expect(host.allReady()).toBe(false);
    cs[1].setReady(true);
    hub.flush();
    expect(host.allReady()).toBe(true);
    host.setStartsIn(17);
    hub.flush();
    expect(cs[1].server).toEqual({ name: 'Dominiks Server', mode: 'gungame', startsIn: 17 });
    expect(cs[1].lobby.every(p => p.ready)).toBe(true);
  });

  it('back in the lobby after a match nobody is ready any more', () => {
    const { hub, host, cs } = server(1);
    cs[0].setReady(true);
    hub.flush();
    host.startVersus({ mode: 'ffa', rule: 'gungame', map: 'neon' }, 5);
    host.endRun();
    hub.flush();
    expect(host.allReady()).toBe(false);
    expect(cs[0].lobby[0].ready).toBeFalsy();
  });

  it('the probe counts everyone in the lobby and says how many of them are bots', () => {
    const { hub, host } = server(2);
    host.setAutoFill(7);
    const t = hub.client();
    const got: HostMessage[] = [];
    t.onMessage((_f, d) => got.push(parseMessage(d) as HostMessage));
    t.send(0, JSON.stringify({ type: 'info' }));
    hub.flush();
    expect(got[0]).toMatchObject({ players: 7, bots: 5 });
  });

  it('a LAN host answers a probe too, counting itself', () => {
    const hub = createMemoryHub();
    new HostSession(hub.host(), { name: 'Host' });
    const t = hub.client();
    const got: HostMessage[] = [];
    t.onMessage((_f, d) => got.push(parseMessage(d) as HostMessage));
    t.send(0, JSON.stringify({ type: 'info' }));
    hub.flush();
    expect(got[0]).toMatchObject({ type: 'info', name: 'Host', players: 1, version: APP_VERSION });
  });

  it('the new messages are checked like all others', () => {
    expect(parseMessage(JSON.stringify({ type: 'ready', ready: true }))).toEqual({ type: 'ready', ready: true });
    expect(parseMessage(JSON.stringify({ type: 'ready', ready: 'yes' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'info' }))).toEqual({ type: 'info' });
    expect(parseMessage(JSON.stringify({ type: 'info', name: 'x', mode: 'score', players: 1, max: 8, version: '0.4.1', protocol: 4, playing: true }))).toMatchObject({ name: 'x' });
    expect(parseMessage(JSON.stringify({ type: 'info', name: 'x'.repeat(200), mode: 'score', players: 1, max: 8, version: '0.4.1', protocol: 4, playing: true }))).toMatchObject({ name: 'x'.repeat(40) });
    expect(parseMessage(JSON.stringify({ type: 'info', name: 'x', players: 'many' }))).toBeNull();
    // a server without the bot count (older) counts as none
    expect(parseMessage(JSON.stringify({ type: 'info', name: 'x', mode: 'score', players: 3, max: 8, version: '0.4.1', protocol: 3, playing: false }))).toMatchObject({ bots: 0 });
  });
});
