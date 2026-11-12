import { describe, expect, it } from 'vitest';
import { createVersusBot } from '../src/bots/versus';
import { floorNeon } from '../src/sim/config/floor-neon';
import { createSim, stepSim } from '../src/sim/sim';
import type { Command, Difficulty } from '../src/sim/types';

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

describe('how well the bots play', () => {
  /** a bot facing a player who stands still: how far off it aims, and how often it fires, over a few seconds */
  function measure(skill: Difficulty) {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    s.players[0].pos = { x: 35.5, z: 18.5 };
    s.players[1].pos = { x: 39.5, z: 18.5 };
    s.players[0].invulnUntil = 1e9;
    const bot = createVersusBot(1, skill);
    let off = 0, aims = 0, shots = 0;
    for (let i = 0; i < 600; i++) {
      s.players[0].pos = { x: 35.5, z: 18.5 };
      const c = bot(s);
      for (const cmd of c) {
        if (cmd.type === 'aim') {
          off += Math.hypot(cmd.point.x - 35.5, cmd.point.z - 18.5);
          aims++;
        }
        if (cmd.type === 'fire') shots++;
      }
      stepSim(s, c.filter(cmd => cmd.type !== 'move'));
    }
    return { miss: off / Math.max(1, aims), shots };
  }

  it('ultra high aims dead on, ultra low wide and slower on the trigger, the levels in between in order', () => {
    const levels: Difficulty[] = ['ultraLow', 'low', 'medium', 'high', 'ultraHigh'];
    const m = levels.map(measure);
    expect(m[4].miss).toBeLessThan(0.05);
    expect(m[0].miss).toBeGreaterThan(1);
    for (let i = 1; i < m.length; i++) {
      expect(m[i].miss, levels[i]).toBeLessThan(m[i - 1].miss);
      expect(m[i].shots, levels[i]).toBeGreaterThanOrEqual(m[i - 1].shots);
    }
    expect(m[0].shots).toBeLessThan(m[4].shots * 0.5);
  });
});

describe('versus bots and objectives', () => {
  it('in capture the cube a bot steals the enemy cube and brings it home', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'team', rule: 'capture' } });
    // the human of the other team stays at home and does nothing
    const bot = createVersusBot(s.players[0].id);
    for (let i = 0; i < 150 * 60 && s.versus!.teamScores[s.players[0].team!] === 0; i++) stepSim(s, bot(s));
    expect(s.versus!.teamScores[s.players[0].team!]).toBeGreaterThan(0);
  }, 60_000);

  it('in king of the cube a bot goes for the zone', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'king' } });
    s.players[0].pos = { x: 200, z: 200 };
    s.players.splice(0, 1);
    const bot = createVersusBot(s.players[0].id);
    for (let i = 0; i < 60 * 60; i++) stepSim(s, bot(s));
    expect(s.versus!.scores[s.players[0].id]).toBeGreaterThan(5);
  }, 60_000);
});
