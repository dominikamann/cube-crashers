import { describe, expect, it } from 'vitest';
import { defaultConfig, parseConfig } from '../../src/server/config';

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

  it('says clearly what is wrong', () => {
    expect(() => parseConfig(['--mode', 'deathmatch'], {}, null)).toThrow(/mode.*coop, discovery, gungame/);
    expect(() => parseConfig(['--map', 'mars'], {}, null)).toThrow(/map.*neon/);
    expect(() => parseConfig(['--port', '99999'], {}, null)).toThrow(/port/);
    expect(() => parseConfig(['--bots', '12'], {}, null)).toThrow(/bots.*0.*10/);
    expect(() => parseConfig(['--difficulty', 'insane'], {}, null)).toThrow(/difficulty/);
    expect(() => parseConfig(['--frobnicate'], {}, null)).toThrow(/frobnicate/);
  });

  it('only arenas fit versus; co-op always runs the tower', () => {
    expect(() => parseConfig(['--mode', 'score', '--map', 'race'], {}, null)).toThrow(/map/);
  });
});
