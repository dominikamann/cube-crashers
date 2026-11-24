import { describe, expect, it } from 'vitest';
import { ClientSession, HostSession } from '../../src/net/session';
import { parseMessage, type ServerInfo } from '../../src/net/protocol';
import { createMemoryHub } from '../../src/net/transport';
import { DedicatedServer, RESULT_SECONDS } from '../../src/server/dedicated';
import { defaultConfig, serverIdentity, type ServerConfig } from '../../src/server/config';
import { BRAWL_MAPS, QUICK_MAPS, VERSUS_MAPS } from '../../src/maps';
import { BOSS_RUSH } from '../../src/sim/config/floors';
import { openShop } from '../../src/sim/systems/shop';
import { DT } from '../../src/sim/types';

function setup(cfg: Partial<ServerConfig> = {}, clients = 1, seed?: number) {
  const hub = createMemoryHub();
  let now = 0;
  const config = { ...defaultConfig(), ...cfg };
  const host = new HostSession(hub.host(), { name: config.name, now: () => now, dedicated: serverIdentity(config) });
  const lines: string[] = [];
  const server = new DedicatedServer(host, config, { now: () => now, seed, log: l => lines.push(l) });
  const cs = Array.from({ length: clients }, (_, i) => new ClientSession(hub.client(), { name: `C${i}` }));
  hub.flush();
  /** run the server for `seconds` of game time */
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      now += DT * 1000;
      server.tick();
      hub.flush();
    }
  };
  return { hub, host, server, cs, run, lines };
}

describe('the dedicated server', () => {
  it('waits while nobody is there', () => {
    const { host, run } = setup({}, 0);
    run(60);
    expect(host.sim).toBeNull();
  });

  it('starts the next match after the countdown once someone joined, bots filling it up', () => {
    const { host, cs, run } = setup({ mode: 'score', countdown: 30, bots: 4 });
    run(1.5);
    // counted down in whole seconds, rounded up
    expect(cs[0].server?.startsIn).toBe(29);
    run(27.5);
    expect(host.sim).toBeNull();
    run(2);
    expect(host.sim?.versus?.rule).toBe('score');
    expect(host.sim?.players).toHaveLength(4);
    expect(cs[0].status).toBe('playing');
  });

  it('starts at once when every player is ready', () => {
    const { host, hub, cs, run } = setup({ mode: 'king', countdown: 30 }, 2);
    run(1);
    cs[0].setReady(true);
    cs[1].setReady(true);
    hub.flush();
    run(0.1);
    expect(host.sim?.versus?.rule).toBe('king');
  });

  it('the bots play: they move and fight', () => {
    const { host, cs, run } = setup({ mode: 'score', bots: 4 });
    cs[0].setReady(true);
    run(1);
    const bot = host.sim!.players.find(p => p.id >= 1000)!;
    const start = { ...bot.pos };
    // past the opening countdown
    host.sim!.countdown = 0;
    run(5);
    expect(Math.hypot(bot.pos.x - start.x, bot.pos.z - start.z)).toBeGreaterThan(1);
  });

  it('after a match it shows the results for a while, then goes back to the lobby and counts down again', () => {
    const { host, cs, run } = setup({ mode: 'score', countdown: 20 });
    cs[0].setReady(true);
    run(1);
    host.sim!.phase = 'won';
    run(RESULT_SECONDS - 1);
    expect(host.sim).not.toBeNull();
    run(2);
    expect(host.sim).toBeNull();
    expect(cs[0].server?.startsIn).toBeGreaterThan(15);
  });

  it('after a match it sends the end once, not a full snapshot every tick while the results show', () => {
    const { host, cs, run } = setup({ mode: 'score' });
    cs[0].setReady(true);
    run(1);
    let steps = 0;
    const step = host.step.bind(host);
    host.step = cmds => {
      steps++;
      step(cmds);
    };
    host.sim!.phase = 'won';
    run(5);
    expect(steps).toBe(0);
  });

  it('Discovery keeps a fixed arena and monster hordes when they are set', () => {
    const { host, cs, run } = setup({ mode: 'discovery', map: 'candy', monsters: true });
    for (let i = 0; i < 3; i++) {
      cs[0].setReady(true);
      run(1);
      expect(host.sim!.map.id).toBe('candy');
      expect(host.sim!.versus?.chaos).toBe(true);
      host.sim!.phase = 'won';
      run(RESULT_SECONDS + 1);
    }
  });

  it('a list of rules takes turns in its order, as teams with --teams, without monsters unless set', () => {
    const { host, cs, run } = setup({ mode: 'discovery', rules: ['capture', 'conquest', 'king'], teams: true });
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      cs[0].setReady(true);
      run(1);
      seen.push(host.sim!.versus!.rule);
      expect(host.sim!.versus!.mode).toBe('team');
      expect(host.sim!.versus!.chaos).toBe(false);
      host.sim!.phase = 'won';
      run(RESULT_SECONDS + 1);
    }
    expect(seen).toEqual(['capture', 'conquest', 'king', 'capture', 'conquest', 'king']);
  });

  it('gun game takes monster hordes when they are set, as it does in the game', () => {
    const { host, cs, run } = setup({ mode: 'gungame', monsters: true });
    cs[0].setReady(true);
    run(1);
    expect(host.sim!.versus?.rule).toBe('gungame');
    expect(host.sim!.versus?.chaos).toBe(true);
  });

  it('gun game moves on to another map each match: any arena of the game, never the same twice in a row', () => {
    const { host, cs, run } = setup({ mode: 'gungame' });
    const maps: string[] = [];
    for (let i = 0; i < 12; i++) {
      cs[0].setReady(true);
      run(1);
      maps.push(host.sim!.map.id);
      expect(host.sim!.versus?.rule).toBe('gungame');
      host.sim!.phase = 'won';
      run(RESULT_SECONDS + 1);
    }
    for (let i = 0; i < maps.length; i++) {
      expect(VERSUS_MAPS).toContain(maps[i]);
      if (i > 0) expect(maps[i]).not.toBe(maps[i - 1]);
    }
    expect(new Set(maps).size).toBeGreaterThan(3);
  });

  it('the rotations reach every arena, the boss floors and the Town too; with the view from above never the Town', () => {
    for (const mode of ['discovery', 'score'] as const) {
      const all = setup({ mode, bots: 2 }, 1, 7);
      const top = setup({ mode, bots: 2, view: 'top' }, 1, 7);
      const seen = new Set<string>(), seenTop = new Set<string>();
      for (let i = 0; i < 80; i++) {
        for (const [g, set] of [[all, seen], [top, seenTop]] as const) {
          g.cs[0].setReady(true);
          g.run(0.1);
          set.add(g.host.sim!.map.id);
          g.host.sim!.phase = 'won';
          g.run(RESULT_SECONDS + 0.1);
        }
      }
      expect([...seen].sort(), mode).toEqual([...VERSUS_MAPS].sort());
      expect([...seenTop].sort(), mode).toEqual(VERSUS_MAPS.filter(m => m !== 'waldsee').sort());
    }
  });

  it('versus in the Town: a fixed map can be any arena of the game', () => {
    const { host, cs, run } = setup({ mode: 'capture', map: 'waldsee' });
    cs[0].setReady(true);
    run(1);
    expect(host.sim!.map.id).toBe('waldsee');
    expect(host.sim!.versus?.rule).toBe('capture');
    expect(cs[0].view!.map.id).toBe('waldsee');
  });

  it('a fixed map stays', () => {
    const { host, cs, run } = setup({ mode: 'rounds', map: 'candy', teams: true });
    cs[0].setReady(true);
    run(1);
    expect(host.sim!.map.id).toBe('candy');
    expect(host.sim!.versus?.mode).toBe('team');
  });

  it('a server can run the other co-op games too: Boss Brawl, Boss Rush, Endless', () => {
    for (const [mode, run_] of [['brawl', 'brawl'], ['bossrush', 'bossrush'], ['endless', 'endless']] as const) {
      const { host, cs, run } = setup({ mode, bots: 4 }, 2);
      cs[0].setReady(true);
      cs[1].setReady(true);
      run(1);
      expect(host.sim!.run.mode, mode).toBe(run_);
      expect(host.sim!.players, mode).toHaveLength(2);
      // the clients see the same game
      expect(cs[0].view!.run.mode, mode).toBe(run_);
      expect(cs[0].view!.map.id, mode).toBe(host.sim!.map.id);
    }
  });

  it('a Single floor: the Town, with the witch at her fire, for the server and the clients alike', () => {
    const { host, cs, run, lines } = setup({ mode: 'quick', map: 'waldsee', bots: 4 }, 2);
    expect(cs[0].server?.mode).toBe('quick');
    cs[0].setReady(true);
    cs[1].setReady(true);
    run(1);
    expect(host.sim!.run.mode).toBe('quick');
    expect(host.sim!.map.id).toBe('waldsee');
    expect(host.sim!.players).toHaveLength(2);
    expect(cs[0].view!.run.mode).toBe('quick');
    expect(cs[0].view!.map.id).toBe('waldsee');
    expect(lines).toContain('quick on waldsee started with 2 player(s)');
    // past the opening countdown the Schrättele is there
    run(8);
    expect(host.sim!.boss?.kind).toBe('witch');
  });

  it('a Single floor that is won ends the match: results, then the lobby, then the next one', () => {
    const { host, cs, run } = setup({ mode: 'quick', map: 'floor01' });
    cs[0].setReady(true);
    run(8);
    // the nests are gone and the elevator reached
    const s = host.sim!;
    s.nests = [];
    s.elevatorOpen = true;
    s.players[0].pos = { ...s.map.elevator };
    run(1);
    expect(host.sim!.phase).toBe('won');
    expect(cs[0].view!.phase).toBe('won');
    run(RESULT_SECONDS + 1);
    expect(host.sim).toBeNull();
    expect(cs[0].status).toBe('lobby');
    cs[0].setReady(true);
    run(1);
    expect(host.sim!.map.id).toBe('floor01');
    expect(cs[0].status).toBe('playing');
  });

  it('a Single floor without a map plays another floor each time, in the end every one of them', () => {
    const all = setup({ mode: 'quick' }, 1, 11);
    const top = setup({ mode: 'quick', view: 'top' }, 1, 11);
    const maps: string[] = [], mapsTop: string[] = [];
    for (let i = 0; i < 120; i++) {
      for (const [g, list] of [[all, maps], [top, mapsTop]] as const) {
        g.cs[0].setReady(true);
        g.run(0.1);
        list.push(g.host.sim!.map.id);
        expect(g.cs[0].view!.map.id).toBe(g.host.sim!.map.id);
        g.host.sim!.phase = 'lost';
        g.run(RESULT_SECONDS + 0.1);
      }
    }
    for (let i = 1; i < maps.length; i++) expect(maps[i]).not.toBe(maps[i - 1]);
    expect([...new Set(maps)].sort()).toEqual([...QUICK_MAPS].sort());
    expect([...new Set(mapsTop)].sort()).toEqual(QUICK_MAPS.filter(m => m !== 'waldsee').sort());
  });

  it('a Boss Brawl is in the arena unless a map is set: a chosen one, or a random one each time', () => {
    const start = (cfg: Partial<ServerConfig>, seed?: number) => {
      const g = setup({ mode: 'brawl', ...cfg }, 1, seed);
      g.cs[0].setReady(true);
      g.run(1);
      return g;
    };
    expect(start({}).host.sim!.map.id).toBe('arena');
    const town = start({ map: 'waldsee' });
    expect(town.host.sim!.run.mode).toBe('brawl');
    expect(town.host.sim!.map.id).toBe('waldsee');
    expect(town.cs[0].view!.map.id).toBe('waldsee');
    const seen = new Set<string>(), seenTop = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      seen.add(start({ map: 'random' }, seed * 7919).host.sim!.map.id);
      seenTop.add(start({ map: 'random', view: 'top' }, seed * 7919).host.sim!.map.id);
    }
    for (const m of seen) expect(BRAWL_MAPS).toContain(m);
    expect(seen.size).toBeGreaterThan(5);
    expect(seenTop.has('waldsee')).toBe(false);
  });

  it('a Boss Rush is on the bosses own floors unless a map is set: one for all of them, or a random one each', () => {
    const start = (cfg: Partial<ServerConfig>) => {
      const g = setup({ mode: 'bossrush', ...cfg }, 1, 5);
      g.cs[0].setReady(true);
      g.run(1);
      return g;
    };
    const own = BOSS_RUSH.map(b => b.map);
    expect(start({}).host.sim!.run.floors).toEqual(own);
    expect(start({ map: 'own' }).host.sim!.run.floors).toEqual(own);
    const jungle = start({ map: 'jungle' });
    expect(jungle.host.sim!.run.floors).toEqual(own.map(() => 'jungle'));
    expect(jungle.host.sim!.map.id).toBe('jungle');
    expect(jungle.cs[0].view!.run.floors).toEqual(jungle.host.sim!.run.floors);
    const random = start({ map: 'random' });
    expect(random.host.sim!.run.floors).toHaveLength(own.length);
    for (const m of random.host.sim!.run.floors) expect(BRAWL_MAPS).toContain(m);
    expect(new Set(random.host.sim!.run.floors).size).toBeGreaterThan(1);
    expect(random.cs[0].view!.run.floors).toEqual(random.host.sim!.run.floors);
    expect(random.lines).toContain('bossrush on random maps started with 1 player(s)');
    // with the view from above the Schrättele comes to the arena, and no random map is her town
    const top = start({ view: 'top' });
    expect(top.host.sim!.run.floors).toEqual(own.map(m => (m === 'waldsee' ? 'arena' : m)));
    expect(top.cs[0].view!.run.floors).toEqual(top.host.sim!.run.floors);
    expect(start({ map: 'random', view: 'top' }).host.sim!.run.floors).not.toContain('waldsee');
  });

  it('a Tower Run with the view from above never goes through the Town', () => {
    for (let seed = 1; seed < 12; seed++) {
      const { host, cs, run } = setup({ mode: 'coop', view: 'top' }, 1, seed * 104729);
      cs[0].setReady(true);
      run(1);
      expect(host.sim!.run.between).not.toContain('town');
      expect(cs[0].view!.run.between).toEqual(host.sim!.run.between);
    }
  });

  it('a Tower Run goes on by itself between the floors: the game in between, the shop, the next floor', () => {
    const { host, cs, run } = setup({ mode: 'coop' });
    cs[0].setReady(true);
    run(8);
    const s = host.sim!;
    s.nests = [];
    s.elevatorOpen = true;
    s.players[0].pos = { ...s.map.elevator };
    run(1);
    // off the first floor and into the game between the floors: nobody had to press anything on the server
    expect(s.phase).toBe('playing');
    expect(s.run.stage !== 'floor' || s.map.id !== 'floor01').toBe(true);
    // the shop closes when its time is up, even when nobody says ready
    s.run.side = false;
    openShop(s);
    s.run.stageUntil = s.tick + 30;
    run(2);
    expect(s.run.stage).toBe('floor');
    expect(s.run.floor).toBe(1);
    expect(cs[0].view!.run.floor).toBe(1);
  });

  it('three players meet the boss of a floor twice on a server too', () => {
    const { host, cs, run } = setup({ mode: 'quick', map: 'arena' }, 3);
    for (const c of cs) c.setReady(true);
    run(8);
    expect(host.sim!.bosses).toHaveLength(2);
    expect(cs[0].view!.bosses).toHaveLength(2);
  });

  it('what the players have unlocked counts for the co-op game, and goes with a player who leaves', () => {
    const hub = createMemoryHub();
    const config = { ...defaultConfig(), mode: 'coop' as const };
    const host = new HostSession(hub.host(), { name: config.name, dedicated: serverIdentity(config) });
    const a = new ClientSession(hub.client(), { name: 'A', unlocked: ['hoverboard'] });
    const b = new ClientSession(hub.client(), { name: 'B', unlocked: ['bomb'] });
    hub.flush();
    host.start(1);
    expect(host.sim!.unlocks.vehicles).toContain('hoverboard');
    expect(host.sim!.unlocks.weapons).toContain('bomb');
    host.endRun();
    a.leave();
    hub.flush();
    host.start(2);
    hub.flush();
    expect(host.sim!.unlocks.vehicles).not.toContain('hoverboard');
    expect(host.sim!.unlocks.weapons).toContain('bomb');
    expect(b.view!.unlocks).toEqual(host.sim!.unlocks);
  });

  it('who joins during a match comes straight into it, on a floor and in versus, and plays on when the others leave', () => {
    for (const mode of ['coop', 'quick', 'brawl', 'score', 'gungame', 'capture'] as const) {
      const { hub, host, cs, run } = setup({ mode, countdown: 10, bots: 4 });
      cs[0].setReady(true);
      run(1);
      const first = host.sim!;
      expect(first, mode).not.toBeNull();
      const before = first.players.length;
      const late = new ClientSession(hub.client(), { name: 'Late' });
      hub.flush();
      run(1);
      expect(host.sim, mode).toBe(first);
      expect(late.status, mode).toBe('playing');
      const me = first.players.find(p => p.id === late.playerId)!;
      expect(me, mode).toMatchObject({ name: 'Late' });
      expect(me.bot, mode).toBeFalsy();
      // (the newcomer sees the game as it is: the same players, themselves among them)
      expect(late.view!.players.map(p => p.id).sort(), mode).toEqual(first.players.map(p => p.id).sort());
      expect(late.view!.map.id, mode).toBe(first.map.id);
      if (first.versus) {
        // a bot made room: the match is as big as before, and the lobby lost that bot too
        expect(first.players, mode).toHaveLength(before);
        expect(first.players.filter(p => p.bot), mode).toHaveLength(before - 2);
        expect(host.lobby.filter(p => p.bot), mode).toHaveLength(before - 2);
        expect(first.versus.scores[late.playerId!], mode).toBe(0);
        if (first.versus.mode === 'team') expect(first.players.filter(p => p.team === 0).length, mode).toBe(first.players.filter(p => p.team === 1).length);
      } else expect(first.players, mode).toHaveLength(before + 1);
      // what the newcomer does counts
      const from = { ...me.pos };
      // (through the opening countdown, in which nobody moves)
      let moved = 0;
      for (let i = 0; i < 8; i++) {
        // (now this way, now that: a wall may stand in one of them)
        late.sendInput([{ type: 'move', playerId: late.playerId!, dir: [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }][i % 4] }]);
        hub.flush();
        run(1);
        for (const p of first.players) p.hp = p.maxHp;
        moved = Math.max(moved, Math.hypot(me.pos.x - from.x, me.pos.z - from.z));
      }
      expect(moved, mode).toBeGreaterThan(0.5);
      cs[0].leave();
      hub.flush();
      run(0.5);
      expect(host.sim, mode).toBe(first);
      expect(first.players.some(p => p.id === late.playerId), mode).toBe(true);
    }
  });

  it('nobody comes in during a game between two floors or its shop: they are in from the next floor on', () => {
    const { hub, host, cs, run } = setup({ mode: 'coop', countdown: 10 });
    cs[0].setReady(true);
    run(1);
    const s = host.sim!;
    s.run.stage = 'shop';
    const late = new ClientSession(hub.client(), { name: 'Late' });
    hub.flush();
    host.step([]);
    hub.flush();
    expect(late.status).toBe('lobby');
    expect(late.server?.running).toBe(true);
    expect(s.players.some(p => p.id === late.playerId)).toBe(false);
    s.run.stage = 'floor';
    host.step([]);
    hub.flush();
    expect(late.status).toBe('playing');
    expect(s.players.some(p => p.id === late.playerId)).toBe(true);
  });

  it('a full match without bots takes nobody: they wait in the lobby', () => {
    const { hub, host, cs, run } = setup({ mode: 'score', countdown: 10, bots: 0 }, 10);
    for (const c of cs) c.setReady(true);
    run(1);
    expect(host.sim!.players).toHaveLength(10);
    const late = new ClientSession(hub.client(), { name: 'Late' });
    hub.flush();
    run(1);
    expect(late.status).not.toBe('playing');
    expect(host.sim!.players).toHaveLength(10);
  });

  it('co-op runs the tower with the humans only, at the set difficulty', () => {
    const { host, cs, run } = setup({ mode: 'coop', difficulty: 'high', bots: 4 }, 2);
    cs[0].setReady(true);
    cs[1].setReady(true);
    run(1);
    expect(host.sim!.run.mode).toBe('run');
    expect(host.sim!.versus).toBeFalsy();
    expect(host.sim!.players).toHaveLength(2);
    expect(host.sim!.difficulty).toBe('high');
  });

  it('when everybody leaves during a match it stops and waits again', () => {
    const { host, cs, hub, run } = setup({ mode: 'score' });
    cs[0].setReady(true);
    run(1);
    expect(host.sim).not.toBeNull();
    cs[0].leave();
    hub.flush();
    run(0.5);
    expect(host.sim).toBeNull();
  });

  it('the view setting goes out with every start', () => {
    const { cs, run } = setup({ mode: 'score', view: 'fp' });
    cs[0].setReady(true);
    run(1);
    expect(cs[0].viewMode).toBe('fp');
  });

  it('tells the lobby where the next match is played, and the match is played there', () => {
    const { host, hub, cs, run } = setup({ mode: 'quick', countdown: 10 });
    run(1);
    const map = cs[0].server?.map;
    expect(QUICK_MAPS).toContain(map);
    expect(cs[0].server?.rule).toBeUndefined();
    run(10);
    expect(host.sim?.map.id).toBe(map);
    // (while it runs the lobby of a late joiner still names it)
    const late = new ClientSession(hub.client(), { name: 'Late' });
    hub.flush();
    run(0.1);
    expect(late.server).toMatchObject({ running: true, map });
  });

  it('a server that takes turns between the rules names the rule of the next match too', () => {
    const { host, cs, run } = setup({ mode: 'discovery', countdown: 10 });
    run(1);
    const { map, rule } = cs[0].server!;
    expect(VERSUS_MAPS).toContain(map);
    expect(rule).toBeTruthy();
    run(10);
    expect(host.sim?.map.id).toBe(map);
    expect(host.sim?.versus?.rule).toBe(rule);
  });

  it('names a fixed map, a random one for each boss of a rush, and nothing where the game brings its floors', () => {
    const next = (cfg: Partial<ServerConfig>) => {
      const { cs, run } = setup({ countdown: 10, ...cfg });
      run(1);
      return cs[0].server?.map;
    };
    expect(next({ mode: 'brawl' })).toBe(BRAWL_MAPS[0]);
    expect(next({ mode: 'capture', map: 'waldsee' })).toBe('waldsee');
    expect(next({ mode: 'bossrush', map: 'random' })).toBe('random');
    expect(next({ mode: 'bossrush', map: 'jungle' })).toBe('jungle');
    expect(next({ mode: 'bossrush' })).toBeUndefined();
    expect(next({ mode: 'coop' })).toBeUndefined();
  });

  it('answers the server list with what its badges show: the map, the rule, how hard it is, a fixed view', () => {
    const ask = (cfg: Partial<ServerConfig>) => {
      const { hub, run } = setup({ countdown: 10, ...cfg }, 0);
      run(1);
      const answers: string[] = [];
      const t = hub.client();
      t.onMessage((_from, data) => answers.push(data));
      t.send('all', JSON.stringify({ type: 'info' }));
      hub.flush();
      return parseMessage(answers[0]) as unknown as ServerInfo;
    };
    // (nobody is on it: the next match is drawn all the same, so the list can say where it will be)
    expect(ask({ mode: 'quick', map: 'waldsee', difficulty: 'low' })).toMatchObject({ mode: 'quick', map: 'waldsee', difficulty: 'low' });
    const turns = ask({ mode: 'discovery' });
    expect(VERSUS_MAPS).toContain(turns.map);
    expect(turns.rule).toBeTruthy();
    expect(turns.difficulty).toBeUndefined();
    expect(ask({ mode: 'capture', map: 'jungle', view: 'fp' })).toMatchObject({ map: 'jungle', view: 'fp' });
    const run = ask({ mode: 'coop', difficulty: 'ultraLow' });
    expect(run.map).toBeUndefined();
    expect(run.difficulty).toBe('ultraLow');
    // weapons after a fall: said by a versus server, not by a co-op one nor by Gun Game (its ladder decides)
    expect(turns.keep).toBe('none');
    expect(ask({ mode: 'score', keep: 'level' }).keep).toBe('level');
    expect(run.keep).toBeUndefined();
    expect(ask({ mode: 'gungame', keep: 'all' }).keep).toBeUndefined();
  });

  it('a LAN host tells its lobby what it is about to start', () => {
    const hub = createMemoryHub();
    const host = new HostSession(hub.host(), { name: 'Host' });
    const c = new ClientSession(hub.client(), { name: 'C' });
    hub.flush();
    expect(c.game).toBeNull();
    host.setGame({ mode: 'brawl', map: 'neon' });
    hub.flush();
    expect(c.game).toEqual({ mode: 'brawl', map: 'neon' });
    host.setGame({ mode: 'capture', map: 'random', teams: true, view: 'fp' });
    hub.flush();
    expect(c.game).toEqual({ mode: 'capture', map: 'random', teams: true, view: 'fp' });
  });
});

describe('a server that keeps weapons', () => {
  it('says where --keep does nothing', () => {
    expect(setup({ mode: 'gungame', keep: 'all' }).lines.join('\n')).toMatch(/--keep does nothing in gungame/);
    expect(setup({ mode: 'coop', keep: 'level' }).lines.join('\n')).toMatch(/--keep does nothing in coop/);
    expect(setup({ mode: 'score', keep: 'level' }).lines.join('\n')).not.toMatch(/--keep/);
  });

  it('hands --keep to the match it starts', () => {
    const { host, cs, run } = setup({ mode: 'score', keep: 'all', countdown: 3 });
    run(4);
    expect(host.sim?.versus?.keep).toBe('all');
    // (and the lobby says so, for its badge)
    expect(cs[0].server?.keep).toBe('all');
  });
});

describe('the map a server announces', () => {
  it('says whether the server stays on it or picks another for the next match', () => {
    // (a versus server without --map goes through the arenas; with one it stays)
    const turns = setup({ mode: 'score' });
    turns.run(0.1);
    expect(turns.cs[0].server?.map).toBeDefined();
    expect(turns.cs[0].server?.fixed).toBe(false);
    const stays = setup({ mode: 'score', map: 'neon' });
    stays.run(0.1);
    expect(stays.cs[0].server).toMatchObject({ map: 'neon', fixed: true });
    // the Boss Brawl is in the Mega Block Arena unless told otherwise
    const brawl = setup({ mode: 'brawl' });
    brawl.run(0.1);
    expect(brawl.cs[0].server?.fixed).toBe(true);
    // a Tower Run brings its own floors: no map, nothing to say
    const run = setup({ mode: 'coop' });
    run.run(0.1);
    expect(run.cs[0].server?.fixed).toBeUndefined();
    // a list of maps takes turns: it starts on the first
    const turns2 = setup({ mode: 'quick', map: 'waldsee,jungle' });
    turns2.run(0.1);
    expect(turns2.cs[0].server).toMatchObject({ map: 'waldsee', fixed: false });
  });
});
