import { describe, expect, it } from 'vitest';
import { createSim, stepSim } from '../../src/sim/sim';
import { FLOORS } from '../../src/sim/config/floors';
import { LOGO_EGG, shotAtWall } from '../../src/sim/systems/logo-egg';
import { logoSpots } from '../../src/sim/map/logo-spots';
import { BLOCKS_ENEMY, tileAt } from '../../src/sim/map/tilemap';

describe('the small Angry Dominik from the wall logo', () => {
  // (the Rooftop's logo looks out across a strip of glitch: he once stepped out into it and stood there, stuck)
  it.each(Object.keys(FLOORS))('steps out onto floor he can walk on and comes for the players on %s', id => {
    const s = createSim(FLOORS[id].map, 3933744232, { mode: 'quick', difficulty: 'low' });
    for (let i = 0; i < 60; i++) stepSim(s, []);
    const w = logoSpots(s.map).find(x => x.kind === 'wall');
    if (!w || w.kind !== 'wall') return;
    s.rng.next = () => 0.999;
    const at = { x: w.tx + 0.5, z: w.tz + 0.5 + (w.facing.z > 0 ? 0.45 : w.facing.z < 0 ? -0.45 : 0) };
    if (w.facing.x) at.x += w.facing.x * 0.45;
    for (let i = 0; i < LOGO_EGG.hits; i++) shotAtWall(s, at);
    expect(s.mini).toBeTruthy();
    const e = s.enemies.find(x => x.id === s.mini!.enemyId)!;
    expect(BLOCKS_ENEMY(tileAt(s.map, Math.floor(e.pos.x), Math.floor(e.pos.z)))).toBe(false);
    const from = { ...e.pos };
    for (let i = 0; i < 60 * 3; i++) stepSim(s, []);
    expect(Math.hypot(e.pos.x - from.x, e.pos.z - from.z)).toBeGreaterThan(1);
  });
});
