import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { logoSpots } from '../../src/sim/map/logo-spots';
import { createSim, stepSim } from '../../src/sim/sim';
import { LOGO_EGG } from '../../src/sim/systems/logo-egg';
import { TICK_RATE } from '../../src/sim/types';
import type { SimState } from '../../src/sim/types';

/** fires `n` shots into the middle of the wall logo, from the floor in front of it */
function shootLogo(s: SimState, n: number) {
  const spot = logoSpots(s.map).find(x => x.kind === 'wall')!;
  if (spot.kind !== 'wall') throw new Error('no wall logo');
  const mid = (spot.w - 1) / 2;
  const at = { x: spot.tx + 0.5 + (spot.along === 'x' ? mid : 0), z: spot.tz + 0.5 + (spot.along === 'z' ? mid : 0) };
  const events = [];
  for (let i = 0; i < n; i++) {
    s.projectiles.push({ id: s.nextId++, kind: 'pixelBlaster', pos: { x: at.x + spot.facing.x * 0.8, z: at.z + spot.facing.z * 0.8 }, vel: { x: -spot.facing.x * 20, z: -spot.facing.z * 20 }, damage: 1, ownerId: 0, hostile: false, until: s.tick + 60, pierce: 0, hit: [] } as never);
    for (let k = 0; k < 6; k++) {
      stepSim(s, []);
      events.push(...s.events);
    }
  }
  return events;
}

describe('the AmannLabs easter egg', () => {
  it('shoot the logo on the wall often enough and it answers: every hit rings, the last one brings a prize', () => {
    const s = createSim(floor01, 5, { mode: 'quick' });
    s.enemies = [];
    s.players[0].invulnUntil = 1e9;
    const events = shootLogo(s, LOGO_EGG.hits);
    expect(events.filter(e => e.type === 'logoHit')).toHaveLength(LOGO_EGG.hits);
    const egg = events.filter(e => e.type === 'logoEgg');
    expect(egg).toHaveLength(1);
    expect(['coins', 'crate', 'nothing']).toContain((egg[0] as { prize: string }).prize);
  });

  it('it does not always pay, and only a few times per floor', () => {
    const prizes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = createSim(floor01, seed, { mode: 'quick' });
      s.enemies = [];
      s.players[0].invulnUntil = 1e9;
      const events = shootLogo(s, LOGO_EGG.hits * (LOGO_EGG.perFloor + 2));
      const eggs = events.filter(e => e.type === 'logoEgg');
      expect(eggs.length).toBeLessThanOrEqual(LOGO_EGG.perFloor);
      for (const e of eggs) prizes.add((e as { prize: string }).prize);
    }
    expect(prizes.has('coins')).toBe(true);
    expect(prizes.size).toBeGreaterThan(1);
  }, 90_000);

  it('after an answer the logo rests for 30 seconds: shots do not count and do not shake it', () => {
    expect(LOGO_EGG.restSeconds).toBe(30);
    const s = createSim(floor01, 5, { mode: 'quick' });
    s.enemies = [];
    s.players[0].invulnUntil = 1e9;
    const answeredAt = (() => {
      shootLogo(s, LOGO_EGG.hits);
      return s.logoEgg!.restUntil;
    })();
    expect(s.logoEgg!.given).toBe(1);
    // right away: nothing
    const resting = shootLogo(s, LOGO_EGG.hits);
    expect(resting.filter(e => e.type === 'logoHit' || e.type === 'logoEgg')).toHaveLength(0);
    expect(s.logoEgg).toMatchObject({ hits: 0, given: 1 });
    // a shot just before the rest is over still does nothing
    while (s.tick < answeredAt - 12) stepSim(s, []);
    expect(shootLogo(s, 1).filter(e => e.type === 'logoHit')).toHaveLength(0);
    // and once it is over the count starts from zero
    while (s.tick < answeredAt) stepSim(s, []);
    expect(answeredAt).toBeGreaterThanOrEqual(LOGO_EGG.restSeconds * TICK_RATE);
    const again = shootLogo(s, LOGO_EGG.hits);
    expect(again.filter(e => e.type === 'logoHit')).toHaveLength(LOGO_EGG.hits);
    expect(s.logoEgg!.given).toBe(2);
  }, 60_000);
});
