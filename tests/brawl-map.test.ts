import { describe, expect, it } from 'vitest';
import { FLOORS } from '../src/sim/config/floors';
import { createSim, stepSim } from '../src/sim/sim';
import { isBossBody } from '../src/sim/systems/combat';
import { BLOCKS_ENEMY, isFree } from '../src/sim/map/tilemap';
import { BRAWL_MAPS, MAP_ROTATION, brawlMapFor } from '../src/ui/screens';

describe('the Boss Brawl on other maps', () => {
  it('the arena is the default; random picks one of the others too', () => {
    expect(BRAWL_MAPS[0]).toBe('arena');
    expect(brawlMapFor('arena')).toBe('arena');
    const seen = new Set(Array.from({ length: 40 }, (_, i) => brawlMapFor(MAP_ROTATION, () => (i * 0.173) % 1)));
    expect(seen.size).toBeGreaterThan(3);
    for (const m of seen) expect(BRAWL_MAPS).toContain(m);
  });

  it('on every map the bosses come in on free floor', () => {
    for (const id of BRAWL_MAPS) {
      for (const seed of [1, 2, 3]) {
        const s = createSim(FLOORS[id].map, seed, { mode: 'brawl' });
        for (let i = 0; i < 5; i++) stepSim(s, []);
        expect(s.bosses!.length, id).toBeGreaterThan(0);
        // (of a worm only the head counts: its body follows the head's trail and may cut a corner on the way)
        const heads = new Set(s.bosses!.flatMap(b => b.worms.map(w => w[0])));
        for (const e of s.enemies.filter(x => isBossBody(s, x) && (x.kind !== 'wormSegment' || heads.has(x.id)))) expect(isFree(s.map, e.pos, 0.3, BLOCKS_ENEMY), `${id} ${e.kind}`).toBe(true);
      }
    }
  });
});

describe('the Boss Rush on other maps', () => {
  it('by default each boss has its own floor; a chosen map hosts them all; random gives each a map', async () => {
    const { BOSS_RUSH } = await import('../src/sim/config/floors');
    const { RUSH_OWN, rushMapsFor } = await import('../src/ui/screens');
    expect(rushMapsFor(RUSH_OWN, BOSS_RUSH.length)).toBeUndefined();
    expect(rushMapsFor('jungle', BOSS_RUSH.length)).toEqual(BOSS_RUSH.map(() => 'jungle'));
    const random = rushMapsFor(MAP_ROTATION, BOSS_RUSH.length, () => 0.5)!;
    expect(random).toHaveLength(BOSS_RUSH.length);
    for (const m of random) expect(BRAWL_MAPS).toContain(m);
    const own = createSim(FLOORS.floor01.map, 3, { mode: 'bossrush' });
    expect(own.run.floors).toEqual(BOSS_RUSH.map(b => b.map));
    const jungle = createSim(FLOORS.floor01.map, 3, { mode: 'bossrush', rushMaps: rushMapsFor('jungle', BOSS_RUSH.length) });
    expect(jungle.map.id).toBe('jungle');
    expect(jungle.boss?.kind).toBe(BOSS_RUSH[0].boss);
  });
});
