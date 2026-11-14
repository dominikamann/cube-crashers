import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { BLOCKS_WALKER, isFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import type { SimState, VersusRule } from '../../src/sim/types';
import { BRAWL_MAPS, VERSUS_MAPS, brawlMapFor, rushMapsFor, versusMapFor } from '../../src/ui/screens';

const run = (s: SimState, ticks: number) => {
  for (let i = 0; i < ticks && s.phase === 'playing'; i++) stepSim(s, []);
};

describe('every map in versus, the Boss Brawl and the Boss Rush', () => {
  it('versus can be played on every floor with room to fight: the boss floors and the Town too', () => {
    for (const id of ['jungle', 'servers', 'underwater', 'waldsee']) expect(VERSUS_MAPS).toContain(id);
    for (const id of VERSUS_MAPS)
      for (const rule of ['score', 'king', 'capture', 'gungame'] as VersusRule[]) {
        const s = createSim(FLOORS[id].map, 5, { mode: 'versus', players: 4, versus: { mode: rule === 'capture' ? 'team' : 'ffa', rule } });
        for (const p of s.players) expect(isFree(s.map, p.pos, 0.3, BLOCKS_WALKER), `${id} ${rule}: player ${p.id} at ${p.pos.x},${p.pos.z}`).toBe(true);
        run(s, 5 * 60);
        expect(s.phase, `${id} ${rule}`).toBe('playing');
      }
  });

  it('a Boss Brawl and a Boss Rush can be fought in the Town', () => {
    expect(BRAWL_MAPS).toContain('waldsee');
    const brawl = createSim(FLOORS.waldsee.map, 5, { mode: 'brawl', players: 1 });
    run(brawl, 20 * 60);
    expect(brawl.bosses?.length ?? 0).toBeGreaterThan(0);
    for (const b of brawl.bosses ?? []) {
      const body = brawl.enemies.find(e => e.id === b.enemyId);
      if (body) expect(isFree(brawl.map, body.pos, 0.3, BLOCKS_WALKER) || b.kind === 'spider' || b.kind === 'kraken', `${b.kind} in a wall`).toBe(true);
    }
    const rush = createSim(FLOORS.arena.map, 5, { mode: 'bossrush', players: 1, rushMaps: Array(8).fill('waldsee') });
    expect(rush.map.id).toBe('waldsee');
    expect(rush.boss).not.toBeNull();
  });

  it('never the Town where a LAN host has fixed the view from above', () => {
    for (let i = 0; i < 50; i++) {
      const r = () => i / 50;
      expect(brawlMapFor('random', r, true)).not.toBe('waldsee');
      expect(versusMapFor('random', null, r, true)).not.toBe('waldsee');
      expect(rushMapsFor('random', 8, r, true)).not.toContain('waldsee');
    }
    expect(brawlMapFor('waldsee', Math.random, true)).not.toBe('waldsee');
    expect(versusMapFor('waldsee', null, Math.random, true)).not.toBe('waldsee');
  });
});
