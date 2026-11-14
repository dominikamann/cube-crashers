import { describe, expect, it } from 'vitest';
import { WALDSEE_FENCE_RUNS, WALDSEE_LOD2 } from '../../src/render/waldsee-lod2';
import { WALDSEE_BARRIERS, WALDSEE_REPLACED, WALDSEE_TILES } from '../../src/sim/config/waldsee-town';
import { floorWaldseeRows } from '../../src/sim/config/floor-waldsee';

/** the Town's board fences (tools/waldsee/fences.py) and barriers, checked against the plan and the real buildings */
const rows = floorWaldseeRows;
const walkable = (x: number, z: number) => rows[Math.floor(z)]?.[Math.floor(x)] === '.';
const codeAt = (x: number, z: number) => parseInt(WALDSEE_TILES[Math.floor(z)]?.substr(Math.floor(x) * 2, 2) ?? '1', 36);
/** how far a point is from the nearest edge of a real building's footprint (its roofs, flat on the ground) */
const toBuilding = (px: number, pz: number): number => {
  let best = Infinity;
  for (const b of WALDSEE_LOD2)
    for (const [k, q] of b) {
      if (k !== 'r') continue;
      const n = q.length / 3;
      for (let i = 0; i < n; i++) {
        const x0 = q[i * 3], z0 = q[i * 3 + 2], x1 = q[((i + 1) % n) * 3], z1 = q[((i + 1) % n) * 3 + 2];
        const ex = x1 - x0, ez = z1 - z0, L2 = ex * ex + ez * ez || 1;
        const u = Math.max(0, Math.min(1, ((px - x0) * ex + (pz - z0) * ez) / L2));
        best = Math.min(best, Math.hypot(px - x0 - ex * u, pz - z0 - ez * u));
      }
    }
  return best;
};
/** on the edge of a lot built on its own (the AmannLabs building, WALDSEE_REPLACED): a fence may end on that too */
const onLot = (px: number, pz: number) => [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]].some(([dx, dz]) => WALDSEE_REPLACED.includes(codeAt(px + dx, pz + dz) - 6));
const atWall = (px: number, pz: number) => toBuilding(px, pz) < 0.3 || onLot(px, pz);
const along = (f: number[], n: number) => Array.from({ length: n + 1 }, (_, k) => [f[0] + ((f[2] - f[0]) * k) / n, f[1] + ((f[3] - f[1]) * k) / n]);

describe('the board fences of the Town', () => {
  it('stand between two real buildings, each end at a wall, none longer than a gap between houses', () => {
    expect(WALDSEE_FENCE_RUNS.length).toBeGreaterThan(5);
    for (const f of WALDSEE_FENCE_RUNS) {
      const len = Math.hypot(f[2] - f[0], f[3] - f[1]);
      expect(len, `fence ${f}`).toBeLessThan(8.5);
      expect(atWall(f[0], f[1]), `start of fence ${f} at no wall`).toBe(true);
      expect(atWall(f[2], f[3]), `end of fence ${f} at no wall`).toBe(true);
    }
  });

  it('stand on no walkable tile, not on the lake, and not on or behind a barrier', () => {
    for (const f of WALDSEE_FENCE_RUNS) {
      for (const [x, z] of along(f, 24)) {
        expect(walkable(x, z), `fence ${f} over the floor at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
        expect(codeAt(x, z), `fence ${f} on the lake`).not.toBe(0);
      }
      for (const b of WALDSEE_BARRIERS) {
        const px = (f[0] + f[2]) / 2 - b.at[0], pz = (f[1] + f[3]) / 2 - b.at[1];
        const d = px * b.dir[0] + pz * b.dir[1], l = Math.abs(-px * b.dir[1] + pz * b.dir[0]);
        expect(d > -0.3 && d < 8 && l < b.half, `fence ${f} behind the barrier at ${b.at}`).toBe(false);
      }
    }
  });

  it('close the passages left and right of the Wirtschaft zur Flasche', () => {
    const near = (x: number, z: number) => WALDSEE_FENCE_RUNS.some(f => Math.hypot((f[0] + f[2]) / 2 - x, (f[1] + f[3]) / 2 - z) < 2);
    expect(near(57.3, 79.5), 'left of the Flasche').toBe(true);
    expect(near(64.4, 77.5), 'right of the Flasche').toBe(true);
  });
});

describe('the barriers of the Town', () => {
  it('each stands at the end of a walkable way, with a house wall at both ends within its reach', () => {
    for (const b of WALDSEE_BARRIERS) {
      const ax = -b.dir[1], az = b.dir[0];
      let before = false;
      for (let l = -b.half; l <= b.half; l += 0.25) for (const d of [-0.6, -1.0, -1.4]) before ||= walkable(b.at[0] + ax * l + b.dir[0] * d, b.at[1] + az * l + b.dir[1] * d);
      expect(before, `nothing walkable before the barrier at ${b.at}`).toBe(true);
      // (the ends: a building within half + 2 tiles each way, else the barrier would hang in the open)
      for (const sx of [-1, 1]) {
        let hit = false;
        for (let t = 0.5; t <= b.half + 2 && !hit; t += 0.1) hit = toBuilding(b.at[0] + ax * sx * t, b.at[1] + az * sx * t) < 0.15;
        expect(hit, `no wall ${sx < 0 ? 'left' : 'right'} of the barrier at ${b.at}`).toBe(true);
      }
    }
  });
});
