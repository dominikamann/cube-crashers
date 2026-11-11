import { describe, expect, it } from 'vitest';
import { createVersusBot } from '../src/bots/versus';
import { floorNeon } from '../src/sim/config/floor-neon';
import { createSim, stepSim } from '../src/sim/sim';
import type { Command } from '../src/sim/types';

describe('versus bots', () => {
  it('a bot hunts down a player who just stands there', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    const bot = createVersusBot(1);
    for (let i = 0; i < 90 * 60 && s.versus!.scores[1] === 0; i++) stepSim(s, bot(s));
    expect(s.versus!.scores[1]).toBeGreaterThan(0);
  }, 60_000);

  it('never shoots at a teammate', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'team', rule: 'score' } });
    s.players[1].team = s.players[0].team;
    s.players[0].pos = { x: 35.5, z: 18.5 };
    s.players[1].pos = { x: 38.5, z: 18.5 };
    const bot = createVersusBot(1);
    const cmds: Command[] = [];
    for (let i = 0; i < 300; i++) {
      const c = bot(s);
      cmds.push(...c);
      stepSim(s, c);
    }
    expect(cmds.some(c => c.type === 'fire')).toBe(false);
    expect(s.players[0].hp).toBe(100);
  });

  it('with nobody in sight it goes for a crate', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    s.players.splice(0, 1);
    const p = s.players[0];
    const crate = s.crates.slice().sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z))[0];
    expect(crate).toBeDefined();
    const before = Math.hypot(crate.pos.x - p.pos.x, crate.pos.z - p.pos.z);
    const bot = createVersusBot(p.id);
    for (let i = 0; i < 120; i++) stepSim(s, bot(s));
    const left = s.crates.find(c => c.id === crate.id);
    const after = left ? Math.hypot(left.pos.x - p.pos.x, left.pos.z - p.pos.z) : 0;
    expect(after).toBeLessThan(before);
  });
});
