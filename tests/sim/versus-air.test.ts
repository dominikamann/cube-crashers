import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { updateProjectiles } from '../../src/sim/systems/combat';
import type { SimState } from '../../src/sim/types';

const match = () => createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });

/** a shot of the first player's, right on the second */
function shotAt(s: SimState): void {
  const [a, b] = s.players;
  b.invulnUntil = 0;
  s.projectiles.push({ id: s.nextId++, kind: 'pixelBlaster', behavior: 'bolt', pos: { ...b.pos }, vel: { x: 0, z: 0 }, damage: 10, pierce: 0, until: s.tick + 60, hitIds: [], ownerId: a.id });
}

describe('shots at a rival in the air', () => {
  it('from the ground they hit a rival on a jetpack: you aim up at them', () => {
    const s = match();
    s.players[1].flying = true;
    shotAt(s);
    updateProjectiles(s);
    expect(s.players[1].hp).toBeLessThan(s.players[1].maxHp);
  });

  it('a jump still takes a rival over a shot', () => {
    const s = match();
    s.players[1].air = 10;
    shotAt(s);
    updateProjectiles(s);
    expect(s.players[1].hp).toBe(s.players[1].maxHp);
  });

  it('from a jetpack they hit a rival on a jetpack', () => {
    const s = match();
    s.players[0].flying = true;
    s.players[1].flying = true;
    shotAt(s);
    updateProjectiles(s);
    expect(s.players[1].hp).toBeLessThan(s.players[1].maxHp);
  });

  it('from a jetpack they still hit a rival on the ground', () => {
    const s = match();
    s.players[0].flying = true;
    shotAt(s);
    updateProjectiles(s);
    expect(s.players[1].hp).toBeLessThan(s.players[1].maxHp);
  });
});
