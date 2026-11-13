import { describe, expect, it } from 'vitest';
import { BOT_CHASSIS, CHARACTERS, EARNED_CHARACTERS, FREE_CHARACTERS, isBotName, isCharacter, looksFor } from '../src/characters';
import { floor01 } from '../src/sim/config/floor01';
import { createSim, stepSim } from '../src/sim/sim';
import type { Command } from '../src/sim/types';
import { createBot } from './sim/bot';

const humans = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, name: ['Kim', 'Alex', 'Sam', 'Robin', 'Jo', 'Max', 'Toni', 'Uli', 'Chris', 'Pat'][i] }));

describe('looksFor', () => {
  it('gives the same looks for the same players, whatever order they come in', () => {
    const players = [...humans(4), { id: 4, name: 'Bot Pixel' }, { id: 5, name: 'Bot Turbo' }];
    const a = looksFor(players), b = looksFor([...players].reverse());
    for (const p of players) expect(b.get(p.id)).toEqual(a.get(p.id));
  });

  it('gives every human of a full house a different free character', () => {
    const looks = looksFor(humans(10));
    const kinds = [...looks.values()].map(l => l.kind);
    expect(new Set(kinds).size).toBe(10);
    for (const k of kinds) expect(FREE_CHARACTERS).toContain(k);
    expect([...looks.values()].every(l => !l.bot)).toBe(true);
  });

  it('keeps a player their character when others join', () => {
    const alone = looksFor(humans(1)).get(0);
    expect(looksFor(humans(6)).get(0)).toEqual(alone);
  });

  it('takes a chosen character as it is, and never hands one out that has to be earned', () => {
    const looks = looksFor([{ id: 0, name: 'Kim', character: 'dominik' }, { id: 1, name: 'Alex', character: 'duck' }, { id: 2, name: 'Sam', character: 'duck' }, ...humans(10).slice(3)]);
    expect(looks.get(0)?.kind).toBe('dominik');
    expect(looks.get(1)?.kind).toBe('duck');
    expect(looks.get(2)?.kind).toBe('duck');
    for (let id = 3; id < 10; id++) {
      expect(FREE_CHARACTERS).toContain(looks.get(id)?.kind);
      expect(looks.get(id)?.kind).not.toBe('duck');
    }
  });

  it('falls back to its own pick for a character it does not know', () => {
    const known = looksFor([{ id: 0, name: 'Kim' }]).get(0);
    expect(looksFor([{ id: 0, name: 'Kim', character: 'dragon' }]).get(0)).toEqual(known);
    expect(isCharacter('dragon')).toBe(false);
    expect(isCharacter(7)).toBe(false);
    expect(CHARACTERS.every(isCharacter)).toBe(true);
    expect(EARNED_CHARACTERS.every(c => !(FREE_CHARACTERS as readonly string[]).includes(c))).toBe(true);
  });

  it('makes bots robots, and no two of them the same', () => {
    const bots = ['Bot Turbo', 'Bot Pixel', 'Bot Crispy', 'Bot Wobbly', 'Bot Sneaky', 'Bot Cosmic', 'Bot Funky', 'Bot Lucky', 'Bot Zippy'].map((name, i) => ({ id: i + 1, name }));
    const looks = looksFor([{ id: 0, name: 'Kim' }, ...bots]);
    expect(looks.get(0)?.bot).toBe(false);
    const robots = bots.map(b => looks.get(b.id)!);
    for (const r of robots) {
      expect(r.bot).toBe(true);
      expect(BOT_CHASSIS).toContain(r.kind);
    }
    // the first four each have a chassis of their own; after that chassis and face together still differ
    expect(new Set(robots.slice(0, 4).map(r => r.kind)).size).toBe(4);
    expect(new Set(robots.map(r => `${r.kind}:${r.face}`)).size).toBe(robots.length);
  });

  it('tells bots by their name', () => {
    expect(isBotName('Bot Pixel')).toBe(true);
    expect(isBotName('Bot 3')).toBe(true);
    expect(isBotName('Bottle')).toBe(false);
    expect(isBotName('Robot')).toBe(false);
  });
});

describe('fairness', () => {
  /** a scripted game: the same seed and the same commands, only the characters differ */
  function play(characters: (string | undefined)[]) {
    const s = createSim(floor01, 7, { mode: 'quick', players: 2, characters });
    const bot = createBot();
    for (let i = 0; i < 900; i++) {
      const cmds: Command[] = [...bot(s), { type: 'move', playerId: 1, dir: { x: Math.sin(i / 40), z: Math.cos(i / 40) } }];
      if (i % 90 === 0) cmds.push({ type: 'dash', playerId: 1 }, { type: 'jump', playerId: 1 });
      stepSim(s, cmds);
    }
    return JSON.stringify({ ...s, flow: null, players: s.players.map(p => ({ ...p, character: undefined })) });
  }

  it('plays out the same whatever the characters are: same hits, same speed, same health', () => {
    const base = play([]);
    for (let i = 0; i < CHARACTERS.length; i++) expect(play([CHARACTERS[i], CHARACTERS[(i + 5) % CHARACTERS.length]]) === base, CHARACTERS[i]).toBe(true);
  }, 60000);

  it('puts the character on the player and nowhere else', () => {
    const s = createSim(floor01, 7, { mode: 'quick', players: 2, characters: ['babyDino'] });
    expect(s.players[0].character).toBe('babyDino');
    expect(s.players[1].character).toBeUndefined();
    const plain = createSim(floor01, 7, { mode: 'quick', players: 2 });
    expect({ ...s.players[0], character: undefined }).toEqual({ ...plain.players[0], character: undefined });
  });
});
