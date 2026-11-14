import { describe, expect, it } from 'vitest';
import { BRAWL_MAPS, QUICK_MAPS, VERSUS_MAPS } from '../../src/maps';
import { SERVER_MODES } from '../../src/net/protocol';
import { defaultConfig, HELP, mapChoices, parseConfig } from '../../src/server/config';

describe('dedicated server settings', () => {
  it('has sensible defaults: Discovery on port 47800, bots fill up to 4', () => {
    expect(parseConfig([], {}, null)).toEqual(defaultConfig());
    expect(defaultConfig()).toMatchObject({ mode: 'discovery', port: 47800, bots: 4, view: 'both', countdown: 30, difficulty: 'medium', map: null, teams: false, monsters: false });
  });

  it('reads command line flags', () => {
    const c = parseConfig(['--name', 'Gun Club', '--mode', 'gungame', '--port', '5000', '--bots', '6', '--view', 'fp', '--countdown', '10', '--monsters'], {}, null);
    expect(c).toMatchObject({ name: 'Gun Club', mode: 'gungame', port: 5000, bots: 6, view: 'fp', countdown: 10, monsters: true });
    expect(parseConfig(['--name=Eq Style', '--teams'], {}, null)).toMatchObject({ name: 'Eq Style', teams: true });
  });

  it('flags win over environment variables, which win over the file', () => {
    const file = { name: 'From file', mode: 'king', bots: 2, map: 'neon' };
    const env = { CC_MODE: 'capture', CC_BOTS: '8' };
    expect(parseConfig(['--bots', '0'], env, file)).toMatchObject({ name: 'From file', mode: 'capture', bots: 0, map: 'neon' });
  });

  it('--web opens the server to players in the browser; off unless asked for', () => {
    expect(defaultConfig().web).toBe(false);
    expect(parseConfig(['--web'], {}, null).web).toBe(true);
    expect(parseConfig([], { CC_WEB: '1' }, null).web).toBe(true);
    expect(parseConfig([], {}, { web: true }).web).toBe(true);
  });

  it('says clearly what is wrong', () => {
    expect(() => parseConfig(['--mode', 'deathmatch'], {}, null)).toThrow(/mode.*coop, quick, brawl, bossrush, endless, discovery, gungame/);
    expect(() => parseConfig(['--map', 'mars'], {}, null)).toThrow(/map.*neon/);
    expect(() => parseConfig(['--port', '99999'], {}, null)).toThrow(/port/);
    expect(() => parseConfig(['--bots', '12'], {}, null)).toThrow(/bots.*0.*10/);
    expect(() => parseConfig(['--difficulty', 'insane'], {}, null)).toThrow(/difficulty/);
    expect(() => parseConfig(['--frobnicate'], {}, null)).toThrow(/frobnicate/);
  });

  it('only arenas fit versus: every arena of the game, the boss floors and the Town too', () => {
    expect(() => parseConfig(['--mode', 'score', '--map', 'race'], {}, null)).toThrow(/map for mode score must be one of: random, neon, .*waldsee/);
    for (const mode of ['discovery', 'gungame', 'coinop', 'score', 'king', 'rounds', 'capture'] as const) {
      expect(mapChoices(mode)).toEqual(['random', ...VERSUS_MAPS]);
      for (const map of VERSUS_MAPS) expect(parseConfig(['--mode', mode, '--map', map], {}, null)).toMatchObject({ mode, map });
    }
    expect(parseConfig(['--mode', 'king', '--map', 'random'], {}, null).map).toBe('random');
    expect(() => parseConfig(['--mode', 'king', '--map', 'own'], {}, null)).toThrow(/map/);
  });

  it('a Single floor takes any floor a LAN host can pick: the Town and the games between the floors too', () => {
    expect(parseConfig(['--mode', 'quick'], {}, null)).toMatchObject({ mode: 'quick', map: null });
    expect(mapChoices('quick')).toEqual(['random', ...QUICK_MAPS]);
    for (const map of ['waldsee', 'race', 'lane', 'maze', 'underwater', 'random']) expect(parseConfig(['--mode', 'quick', '--map', map], {}, null).map).toBe(map);
    expect(() => parseConfig(['--mode', 'quick', '--map', 'shaft'], {}, null)).toThrow(/map for mode quick must be one of: random, floor01, .*maze/);
    expect(parseConfig([], { CC_MODE: 'quick', CC_MAP: 'waldsee' }, null)).toMatchObject({ mode: 'quick', map: 'waldsee' });
    expect(parseConfig([], {}, { mode: 'quick', map: 'lane' })).toMatchObject({ mode: 'quick', map: 'lane' });
  });

  it('a Boss Brawl takes a map or random, a Boss Rush also its own floors', () => {
    expect(mapChoices('brawl')).toEqual(['random', ...BRAWL_MAPS]);
    expect(mapChoices('bossrush')).toEqual(['own', 'random', ...BRAWL_MAPS]);
    expect(parseConfig(['--mode', 'brawl', '--map', 'waldsee'], {}, null).map).toBe('waldsee');
    expect(parseConfig(['--mode', 'brawl', '--map=random'], {}, null).map).toBe('random');
    expect(() => parseConfig(['--mode', 'brawl', '--map', 'own'], {}, null)).toThrow(/map for mode brawl must be one of: random, arena/);
    expect(() => parseConfig(['--mode', 'brawl', '--map', 'race'], {}, null)).toThrow(/map/);
    for (const map of ['own', 'random', 'jungle', 'waldsee']) expect(parseConfig(['--mode', 'bossrush', '--map', map], {}, null).map).toBe(map);
    expect(() => parseConfig(['--mode', 'bossrush', '--map', 'maze'], {}, null)).toThrow(/map for mode bossrush must be one of: own, random, arena/);
  });

  it('the Tower Run and Endless bring their own floors: a map left in the settings is no error', () => {
    expect(mapChoices('coop')).toBeNull();
    expect(mapChoices('endless')).toBeNull();
    expect(parseConfig(['--mode', 'coop'], {}, { map: 'neon' })).toMatchObject({ mode: 'coop', map: 'neon' });
  });

  it('the Town is first person only: with the view from above it is refused by name, and left out of what is allowed', () => {
    for (const mode of ['quick', 'brawl', 'bossrush', 'score', 'discovery'] as const) {
      expect(() => parseConfig(['--mode', mode, '--map', 'waldsee', '--view', 'top'], {}, null), mode).toThrow(/waldsee \(the Town\).*first person only.*view top/);
      expect(mapChoices(mode, 'top'), mode).not.toContain('waldsee');
      expect(mapChoices(mode, 'fp'), mode).toContain('waldsee');
      expect(parseConfig(['--mode', mode, '--map', 'waldsee', '--view', 'fp'], {}, null).map).toBe('waldsee');
    }
    // (whichever comes first on the command line)
    expect(() => parseConfig(['--view', 'top', '--map', 'waldsee'], {}, null)).toThrow(/Town/);
    expect(() => parseConfig(['--mode', 'score', '--map', 'mars', '--view', 'top'], {}, null)).toThrow(/must be one of: random, neon/);
  });

  it('the help names every mode and every map', () => {
    for (const mode of SERVER_MODES) expect(HELP).toContain(mode);
    for (const map of [...VERSUS_MAPS, ...QUICK_MAPS, ...BRAWL_MAPS, 'own', 'random']) expect(HELP).toContain(map);
  });

  it('--compress squeezes what the server sends, and is off unless asked for', () => {
    expect(parseConfig([], {}, null).compress).toBe(false);
    expect(parseConfig(['--compress'], {}, null).compress).toBe(true);
    expect(parseConfig([], { CC_COMPRESS: '1' }, null).compress).toBe(true);
    expect(parseConfig([], {}, { compress: true }).compress).toBe(true);
  });
});
