import { describe, expect, it } from 'vitest';
import { parseMessage } from '../../src/net/protocol';
import { ClientSession, HostSession, VOTE_SECONDS } from '../../src/net/session';
import { createMemoryHub } from '../../src/net/transport';

function lobby(clients = 2) {
  const hub = createMemoryHub();
  let now = 1000;
  const host = new HostSession(hub.host(), { name: 'Host', now: () => now });
  const cs = Array.from({ length: clients }, (_, i) => new ClientSession(hub.client(), { name: `C${i}` }));
  hub.flush();
  return { hub, host, cs, tick: (ms: number) => (now += ms) };
}

describe('versus on the LAN', () => {
  it('the host can fill the lobby with bots, up to 8 players', () => {
    const { hub, host, cs } = lobby(2);
    for (let i = 0; i < 10; i++) host.addBot();
    hub.flush();
    expect(host.lobby).toHaveLength(8);
    expect(host.lobby.filter(p => p.bot)).toHaveLength(5);
    expect(cs[0].lobby).toHaveLength(8);
    host.removeBot();
    hub.flush();
    expect(cs[0].lobby).toHaveLength(7);
  });

  it('a vote with two options: a majority starts the match for everyone, with that mode, rule and map', () => {
    const { hub, host, cs } = lobby(2);
    host.addBot();
    host.startVote([
      { mode: 'ffa', rule: 'score', map: 'neon' },
      { mode: 'team', rule: 'rounds', map: 'highway' },
    ]);
    hub.flush();
    expect(cs[0].vote?.options[1].map).toBe('highway');
    // three humans: two votes for option 1 are a majority, the bot does not vote
    cs[0].castVote(1);
    cs[1].castVote(1);
    hub.flush();
    expect(host.sim?.versus?.mode).toBe('team');
    expect(host.sim?.map.id).toBe('highway');
    hub.flush();
    expect(cs[0].view?.versus?.rule).toBe('rounds');
    expect(cs[0].view?.map.id).toBe('highway');
    expect(cs[0].view?.players).toHaveLength(4);
  });

  it('when the time is up the option with more votes wins', () => {
    const { hub, host, cs, tick } = lobby(2);
    host.startVote([
      { mode: 'ffa', rule: 'score', map: 'neon' },
      { mode: 'ffa', rule: 'rounds', map: 'candy' },
    ]);
    hub.flush();
    cs[0].castVote(0);
    hub.flush();
    expect(host.sim).toBeNull();
    tick(VOTE_SECONDS * 1000 + 1);
    host.checkVote();
    expect(host.sim?.versus?.rule).toBe('score');
  });

  it('drops malformed votes and options', () => {
    expect(parseMessage(JSON.stringify({ type: 'vote', choice: 2 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'vote', choice: 1 }))).toEqual({ type: 'vote', choice: 1 });
    const players = Array.from({ length: 8 }, (_, i) => ({ id: i, name: `P${i}`, color: i }));
    expect(parseMessage(JSON.stringify({ type: 'lobby', players, difficulty: 'medium' }))).not.toBeNull();
    const badVote = { options: [{ mode: 'ffa', rule: 'score', map: 'constructor' }, { mode: 'ffa', rule: 'score', map: 'neon' }], votes: {}, endsIn: 20 };
    expect(parseMessage(JSON.stringify({ type: 'lobby', players, difficulty: 'medium', vote: badVote }))).toBeNull();
  });
});
