import { describe, expect, it } from 'vitest';
import { WALDSEE_LOD2 } from '../../src/render/waldsee-lod2';
import { roofsOver, shown } from '../../src/render/waldsee-look';

/** every corner of a building's roofs, by where it was: where each of its roofs puts it now */
const corners = () => {
  const out: { id: number; was: number[]; before: number[][]; now: number[][] }[] = [];
  WALDSEE_LOD2.forEach((b, id) => {
    if (!shown(b)) return;
    const over = roofsOver(b, id), at = new Map<string, { was: number[]; before: number[][]; now: number[][] }>();
    for (const [k, q] of b) {
      if (k !== 'r') continue;
      const nq = over.roofs.get(q) ?? q;
      for (let i = 0; i < q.length; i += 3) {
        const key = [q[i], q[i + 1], q[i + 2]].map(v => Math.round(v * 20)).join();
        if (!at.has(key)) at.set(key, { was: [q[i], q[i + 1], q[i + 2]], before: [], now: [] });
        at.get(key)!.before.push([q[i], q[i + 1], q[i + 2]]);
        at.get(key)!.now.push([nq[i], nq[i + 1], nq[i + 2]]);
      }
    }
    for (const c of at.values()) out.push({ id, ...c });
  });
  return out;
};
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the roofs of the Town', () => {
  const all = corners();

  it('reach out over the walls of most houses', () => {
    const houses = new Set(all.filter(c => c.now.some(p => dist(p, c.was) > 0.1)).map(c => c.id));
    expect(houses.size).toBeGreaterThan(200);
  });

  it('stay joined: a corner two roofs share goes to one spot (no further apart than it was in the data)', () => {
    const spread = (ps: number[][]) => Math.max(...ps.map(p => dist(p, ps[0])));
    const torn = all.filter(c => c.now.length > 1 && spread(c.now) > spread(c.before) + 0.01);
    expect(torn.map(c => `${c.id} at ${c.was.map(v => v.toFixed(2))}`)).toEqual([]);
  });

  it('never reach out far: no corner moves more than twice the overhang', () => {
    for (const c of all) for (const p of c.now) expect(dist(p, c.was), `building ${c.id}`).toBeLessThan(0.71);
  });
});

describe('the rounded corner house across the square from the ice-cream parlour (building 406)', () => {
  it('has its shallow roof reach out round its curved walls, with a band along the whole curve', () => {
    const id = 406, b = WALDSEE_LOD2[id], over = roofsOver(b, id);
    // (the big roof over the curved parts: the roof polygon with the most corners, a plane of about ten degrees)
    const big = b.filter(([k]) => k === 'r').map(([, q]) => q).sort((p, q) => q.length - p.length)[0];
    const now = over.roofs.get(big);
    expect(now).toBeDefined();
    let moved = 0;
    for (let i = 0; i < big.length; i += 3) if (dist(big.slice(i, i + 3), now!.slice(i, i + 3)) > 0.3) moved++;
    expect(moved).toBeGreaterThan(40);
    expect(over.edges.length).toBeGreaterThan(100);
  });
});
