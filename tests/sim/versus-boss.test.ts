import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { VERSUS } from '../../src/sim/systems/versus';
import { parseMessage } from '../../src/net/protocol';
import type { SimState } from '../../src/sim/types';

function match(boss: boolean): SimState {
  const s = createSim(FLOORS.neon.map, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score', chaos: true, boss } });
  for (const p of s.players) p.invulnUntil = 1e9;
  return s;
}
const until = (s: SimState, ticks: number, done: () => boolean) => {
  for (let i = 0; i < ticks && !done(); i++) stepSim(s, []);
};

describe('versus chaos with a boss', () => {
  it('rarely brings King Rex or the Rhino: none at the start, one later, smaller than the real thing', () => {
    const s = match(true);
    until(s, VERSUS.bossFirstTicks[0] - 60, () => false);
    expect(s.boss).toBeNull();
    until(s, VERSUS.bossFirstTicks[1], () => !!s.boss);
    expect(s.boss).not.toBeNull();
    expect(['rex', 'rhino']).toContain(s.boss!.kind);
    expect(s.boss!.wild).toBe(true);
    expect(s.boss!.waiting).toBeUndefined();
    expect(s.boss!.maxHp).toBeLessThan(1600);
  });

  it('beating it does not end the match, and the next one takes its time', () => {
    const s = match(true);
    until(s, VERSUS.bossFirstTicks[1] + 60, () => !!s.boss);
    const body = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    body.hp = 0;
    stepSim(s, []);
    expect(s.boss).toBeNull();
    expect(s.phase).toBe('playing');
    expect(s.elevatorOpen).toBe(false);
    until(s, VERSUS.bossAgainTicks[0] - 120, () => false);
    expect(s.boss).toBeNull();
  });

  it('plain chaos has no boss', () => {
    const s = match(false);
    until(s, VERSUS.bossFirstTicks[1] + 600, () => !!s.boss);
    expect(s.boss).toBeNull();
  });

  it('travels in the start message', () => {
    const m = parseMessage(JSON.stringify({ type: 'start', seed: 1, difficulty: 'medium', players: [{ id: 0, name: 'A', color: 0 }], versus: { mode: 'ffa', rule: 'score', chaos: true, boss: true }, mapId: 'neon' }));
    expect(m && m.type === 'start' && m.versus?.boss).toBe(true);
  });
});
