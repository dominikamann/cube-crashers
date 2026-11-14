import { describe, expect, it } from 'vitest';
import { WALDSEE_LOD2 } from '../../src/render/waldsee-lod2';
import { LAKE_WIN, shown, waldseeIslet, waldseeLake } from '../../src/render/waldsee-look';
import { WALDSEE_BOAT, WALDSEE_BOAT2, WALDSEE_SHARK, WALDSEE_SHORE_TREES } from '../../src/sim/config/waldsee-town';

/** the distance (tiles) from a point to the nearest water tile of the lake as drawn (to the tile's edge) */
const toWater = (x: number, z: number, reach: number): number => {
  let best = Infinity;
  for (let tz = Math.floor(z) - reach; tz <= Math.floor(z) + reach; tz++) for (let tx = Math.floor(x) - reach; tx <= Math.floor(x) + reach; tx++) {
    if (!waldseeLake(tx, tz)) continue;
    const dx = Math.max(tx - x, 0, x - (tx + 1)), dz = Math.max(tz - z, 0, z - (tz + 1));
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
};

describe('the Stadtsee and its shore path', () => {
  it('has water to look at', () => {
    let n = 0;
    for (let tz = LAKE_WIN.z0; tz < LAKE_WIN.z1; tz++) for (let tx = LAKE_WIN.x0; tx < LAKE_WIN.x1; tx++) if (waldseeLake(tx, tz)) n++;
    expect(n).toBeGreaterThan(1500);
  });

  it('has its shore trees on land, not in the water', () => {
    for (const [x, z] of WALDSEE_SHORE_TREES) expect(waldseeLake(x, z), `tree at ${x},${z}`).toBe(false);
  });

  it('has no island out in the water: a patch of land cut off from the shore is lake', () => {
    for (let tz = LAKE_WIN.z0; tz < LAKE_WIN.z1; tz++) for (let tx = LAKE_WIN.x0; tx < LAKE_WIN.x1; tx++) expect(waldseeIslet(tx, tz), `at ${tx},${tz}`).toBe(false);
    expect(waldseeLake(89, 30)).toBe(true);
  });

  it('keeps the boats, the anglers and the shark in the water', () => {
    for (const p of [WALDSEE_BOAT, WALDSEE_BOAT2, WALDSEE_SHARK]) {
      if (p) expect(waldseeLake(p[0], p[1]), `at ${p}`).toBe(true);
    }
  });

  it('never has a building that stands within two tiles of the water (room for rim, path and meadow)', () => {
    const near: string[] = [];
    WALDSEE_LOD2.forEach((b, id) => {
      if (!shown(b)) return;
      for (const [kind, q] of b) {
        if (kind !== 'w') continue;
        for (let i = 0; i < q.length; i += 3) {
          if (q[i + 1] > 0.3) continue;
          const d = toWater(q[i], q[i + 2], 3);
          if (d < 2) near.push(`building ${id} at ${q[i].toFixed(1)},${q[i + 2].toFixed(1)}: ${d.toFixed(2)}`);
        }
      }
    });
    expect(near).toEqual([]);
  });
});
