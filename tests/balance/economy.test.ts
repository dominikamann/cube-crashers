import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '../../src/sim/config/difficulty';
import { FLOORS } from '../../src/sim/config/floors';
import { creditPrice, healPrice } from '../../src/sim/systems/shop';
import { botRun } from './measure';

/**
 * Coins against prices, and crates, over whole Tower Runs of the scripted player on Ultra Low (the level it
 * gets through). A person who keeps a combo going earns about twice as much, so the bounds leave room for that.
 */
describe('the economy of a run', () => {
  const runs = [1, 2].map(seed => botRun('ultraLow', seed));

  it('the scripted player gets through the tower on Ultra Low', () => {
    for (const r of runs) expect(r.result).toBe('won');
  });

  it('there is always something to buy in the shop, never everything, and the life is a decision', () => {
    for (const r of runs) {
      const shops = r.floors.filter(f => f.shopTotal > 0);
      expect(shops.length).toBe(r.floors.length - 1);
      shops.forEach((f, i) => {
        expect(f.atShop, `floor ${f.floor}: all offers`).toBeLessThan(f.shopTotal);
        expect(f.lifePrice).toBe(creditPrice(0, i, 1));
        expect(f.lifePrice / f.shopTotal).toBeGreaterThan(0.4);
      });
      expect(shops.filter((f, i) => f.atShop >= healPrice(i)).length, 'shops with something affordable').toBeGreaterThanOrEqual(shops.length - 1);
      // over the whole run: even someone who earns two and a half times as much cannot buy most of what was offered
      const earned = r.floors.reduce((n, f) => n + f.earned, 0), offered = shops.reduce((n, f) => n + f.shopTotal, 0);
      expect(earned * 2.5).toBeLessThan(offered * 0.8);
      expect(earned).toBeGreaterThan(offered * 0.15);
    }
  });

  it('a nest floor gives a handful of crates, not a dozen', () => {
    const c = DIFFICULTY.ultraLow.crates;
    for (const r of runs)
      for (const f of r.floors) {
        if (FLOORS[f.map].kind !== 'nests') continue;
        // what lies around, two of the four nests, the elites, and now and then a wild boss's or one from a wall logo
        expect(f.cratesOpened, `floor ${f.floor}`).toBeLessThanOrEqual(c.start + 2 + c.elites + 2);
      }
  });
});
