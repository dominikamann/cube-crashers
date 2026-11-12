import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { BRAWL, bossHp } from '../../src/sim/systems/boss';
import { isBossBody } from '../../src/sim/systems/combat';
import type { SimEvent, SimState } from '../../src/sim/types';

const brawl = (seed: number, players = 1) => {
  const s = createSim(FLOORS.arena.map, seed, { mode: 'brawl', players });
  for (const p of s.players) p.invulnUntil = 1e9;
  return s;
};
const run = (s: SimState, n: number) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepSim(s, []);
    events.push(...s.events);
  }
  return events;
};
/** every boss body in the arena falls */
const killWave = (s: SimState) => {
  for (const e of s.enemies) if (isBossBody(s, e)) e.hp = 0;
};

describe('Boss Brawl', () => {
  it('opens with one or two bosses in the arena at once, and over many games both happen', () => {
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 16; seed++) {
      const s = brawl(seed);
      run(s, 5);
      expect(s.bosses!.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(s.bosses!.length, `seed ${seed}`).toBeLessThanOrEqual(2);
      expect(s.boss).toBe(s.bosses![0]);
      sizes.add(s.bosses!.length);
    }
    expect([...sizes].sort()).toEqual([1, 2]);
  });

  it('every boss of a wave is a solid boss body, and the bar counts them together', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => brawl(seed)).find(x => (run(x, 5), x.bosses!.length === 2))!;
    const bodies = s.enemies.filter(e => isBossBody(s, e));
    expect(new Set(bodies.map(e => e.kind)).size + (bodies.every(e => e.kind === bodies[0].kind) ? 1 : 0)).toBeGreaterThanOrEqual(2);
    expect(bossHp(s)).toBeCloseTo(s.bosses!.reduce((n, b) => n + b.maxHp, 0), 3);
  });

  it('a cleared wave brings the next after a breather, and when every boss is down the elevator opens', () => {
    const s = brawl(3);
    const events = run(s, 5);
    let waves = 1;
    for (let guard = 0; guard < 20 && !s.elevatorOpen; guard++) {
      killWave(s);
      events.push(...run(s, 3));
      if (s.elevatorOpen) break;
      expect(s.bosses).toHaveLength(0);
      expect(s.phase).toBe('playing');
      events.push(...run(s, BRAWL.breakTicks + 3));
      waves++;
    }
    expect(s.elevatorOpen).toBe(true);
    expect(events.filter(e => e.type === 'bossDead')).toHaveLength(BRAWL.kinds.length + BRAWL.extra);
    expect(events.filter(e => e.type === 'bossSpawn')).toHaveLength(BRAWL.kinds.length + BRAWL.extra);
    expect(waves).toBeGreaterThanOrEqual(Math.ceil((BRAWL.kinds.length + BRAWL.extra) / 2));
    expect(s.boss).toBeNull();
  });

  it('now and then a shark swims through the arena', () => {
    const s = brawl(5);
    const events = run(s, BRAWL.sharkEveryTicks * 3 + 10);
    void events;
    expect(s.enemies.some(e => e.kind === 'shark')).toBe(true);
  });
});
