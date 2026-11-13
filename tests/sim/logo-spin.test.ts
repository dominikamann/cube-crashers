import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { logoSpots } from '../../src/sim/map/logo-spots';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { LOGO_SPIN, logoAwake } from '../../src/sim/systems/logo-spin';
import type { SimState } from '../../src/sim/types';

function onLogo(): { s: SimState; mid: { x: number; z: number } } {
  const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
  s.enemies = [];
  s.nests = [];
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  const spot = logoSpots(s.map).find(x => x.kind === 'floor')!;
  if (spot.kind !== 'floor') throw new Error('no floor logo');
  const mid = { x: spot.tx + spot.w / 2, z: spot.tz + spot.h / 2 };
  s.players[0].invulnUntil = 1e9;
  return { s, mid };
}

describe('the floor logo wakes up under a player', () => {
  it('is asleep with nobody on it, awake with a player on it', () => {
    const { s, mid } = onLogo();
    expect(logoAwake(s)).toBe(false);
    s.players[0].pos = { ...mid };
    expect(logoAwake(s)).toBe(true);
  });

  it('hurts a monster that touches it, a little, while a player stands on it', () => {
    const { s, mid } = onLogo();
    s.players[0].pos = { ...mid };
    const e = spawnEnemy(s, 'tank', { x: mid.x + 1, z: mid.z });
    e.speed = 0;
    const hp = e.hp;
    for (let i = 0; i < 60; i++) stepSim(s, []);
    const lost = hp - e.hp;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(LOGO_SPIN.dps + 1e-6);
  });

  it('does nothing with nobody on it, and nothing to a monster away from it', () => {
    const { s, mid } = onLogo();
    const near = spawnEnemy(s, 'tank', { x: mid.x + 1, z: mid.z });
    near.speed = 0;
    for (let i = 0; i < 60; i++) stepSim(s, []);
    expect(near.hp).toBe(near.maxHp);
    s.players[0].pos = { ...mid };
    const far = spawnEnemy(s, 'tank', { x: mid.x, z: mid.z + 6 });
    far.speed = 0;
    for (let i = 0; i < 60; i++) stepSim(s, []);
    expect(far.hp).toBe(far.maxHp);
  });
});
