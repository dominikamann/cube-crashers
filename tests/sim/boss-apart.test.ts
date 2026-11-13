import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { onBorder } from '../../src/sim/map/border';
import { Tile, tileAt } from '../../src/sim/map/tilemap';
import type { Enemy, SimState } from '../../src/sim/types';

const bodies = (s: SimState): Enemy[] => (s.bosses ?? []).filter(b => b.enemyId !== null && !b.leap).map(b => s.enemies.find(e => e.id === b.enemyId)!).filter(Boolean);

describe('bosses do not walk into each other', () => {
  it('in a Boss Brawl their bodies stay apart, all the way through', () => {
    const s = createSim(FLOORS.arena.map, 5, { mode: 'brawl', players: 1 });
    s.players[0].invulnUntil = 1e9;
    let seen = 0, since = 0, streak = 0;
    for (let i = 0; i < 120 * 60; i++) {
      // (a wave with one boss alone is of no use here: it falls at once, and so does a brood)
      const alone = (s.bosses ?? []).filter(x => x.enemyId !== null || x.worms.length > 0).length < 2;
      if (alone) {
        const ids = new Set((s.bosses ?? []).flatMap(x => [x.enemyId, ...x.worms.flat(), ...(x.brood ?? [])]));
        for (const e of s.enemies) if (ids.has(e.id)) e.hp = 0;
        since = i;
      }
      stepSim(s, []);
      const all = bodies(s);
      // (they are set down side by side and all want to the same player: after the first moments, never more
      // than a little into each other)
      if (alone || i - since < 180) continue;
      // (one that lands from a leap may come down on another: they are apart again a moment later)
      let into = false;
      for (let a = 0; a < all.length; a++)
        for (let b = a + 1; b < all.length; b++) {
          seen++;
          into ||= Math.hypot(all[a].pos.x - all[b].pos.x, all[a].pos.z - all[b].pos.z) < (all[a].radius + all[b].radius) * 0.8;
        }
      streak = into ? streak + 1 : 0;
      expect(streak, `tick ${i}`).toBeLessThan(4);
      // and being pushed puts none of them into a wall, or onto the wall round the map
      for (const e of all) {
        expect(onBorder(s.map, e.pos.x, e.pos.z)).toBe(false);
        const climbs = s.bosses!.some(b => b.enemyId === e.id && (b.kind === 'spider' || b.kind === 'kraken'));
        if (!climbs) expect(tileAt(s.map, e.pos.x, e.pos.z)).not.toBe(Tile.Wall);
      }
    }
    expect(seen).toBeGreaterThan(1000);
  }, 120_000);
});
