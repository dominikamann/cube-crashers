import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { WALDSEE_LOD2 } from '../../src/render/waldsee-lod2';
import { shown } from '../../src/render/waldsee-look';
import { WALDSEE_BARRIERS, WALDSEE_TILES } from '../../src/sim/config/waldsee-town';

/**
 * The real walls the Town's walkers bump into. The plan is a grid of tiles, the fronts of the real buildings
 * (LoD2, see waldsee-lod2.ts) run slanted across it: so the sim gets every shown building's outline as solid lines
 * (src/sim/config/waldsee-solids.ts), and a wall tile that a building covers only in part becomes floor again,
 * so the outline decides where one stops, not the tile. A tile the building covers for the most part stays wall
 * (the flow fields of the monsters stay sane). Afterwards the board fences are worked out again (fences.py).
 *   npx vitest run --config tools/waldsee/vitest.config.ts            (prints what it would do)
 *   WALDSEE_WRITE=1 npx vitest run --config tools/waldsee/vitest.config.ts   (writes the files)
 *   python3 -I tools/waldsee/fences.py . --write
 */
const N = 128;
const SOLIDS = 'src/sim/config/waldsee-solids.ts';
const FLOOR = 'src/sim/config/floor-waldsee.ts';
/** a tile the real building covers by this much (of 25 samples) or more stays wall; by less it is the outline's */
const KEEP_WALL = 20;

const code = (x: number, z: number) => parseInt(WALDSEE_TILES[z].substr(2 * x, 2), 36);
const inside = (segs: number[], x: number, z: number): boolean => {
  let c = false;
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], az = segs[i + 1], bx = segs[i + 2], bz = segs[i + 3];
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) c = !c;
  }
  return c;
};

it('the solid outlines of the Town, the plan and the fences', () => {
  // the outline of every shown building: the feet of its walls, as the render draws them (wallFeet)
  const solids: number[][] = [];
  const ids: number[] = [];
  WALDSEE_LOD2.forEach((b, id) => {
    if (!shown(b)) return;
    const segs: number[] = [];
    for (const [k, q] of b) {
      if (k !== 'w') continue;
      const low: [number, number][] = [];
      for (let i = 0; i < q.length; i += 3) if (q[i + 1] < 0.3) low.push([q[i], q[i + 2]]);
      if (low.length < 2) continue;
      const [[x0, z0], [x1, z1]] = [low[0], low[low.length - 1]];
      if (x0 === x1 && z0 === z1) continue;
      segs.push(x0, z0, x1, z1);
    }
    if (segs.length < 12) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < segs.length; i += 2) ((x0 = Math.min(x0, segs[i])), (x1 = Math.max(x1, segs[i])), (z0 = Math.min(z0, segs[i + 1])), (z1 = Math.max(z1, segs[i + 1])));
    // (only the buildings one can reach: those on the plan)
    if (x1 < 0 || z1 < 0 || x0 > N || z0 > N) return;
    // (closed? every corner is the end of an even number of feet)
    const ends = new Map<string, number>();
    for (let i = 0; i < segs.length; i += 2) ends.set(`${segs[i]},${segs[i + 1]}`, (ends.get(`${segs[i]},${segs[i + 1]}`) ?? 0) + 1);
    for (const [k, n] of ends) if (n % 2) throw new Error(`open outline at ${k}`);
    solids.push(segs);
    ids.push(id);
  });
  // (the police, building 165, must be among them: one walked into it once)
  if (!ids.includes(165)) throw new Error('the police is not solid');
  const built = (x: number, z: number) => solids.some(s => inside(s, x, z));
  const cover = (x: number, z: number) => {
    let n = 0;
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) if (built(x + (a + 0.5) / 5, z + (b + 0.5) / 5)) n++;
    return n;
  };

  // the plan: wall tiles at the floor that a building covers only in part become floor (the outline stops one
  // there), outward from the streets as far as such tiles go; never a tile on or behind a barrier, nor the lake,
  // the meadow, the gravel or the street painted on behind a barrier
  const src = readFileSync(FLOOR, 'utf8');
  const rows = [...src.matchAll(/^  '([#.=]{128})',$/gm)].map(m => [...m[1]]);
  if (rows.length !== N) throw new Error(`plan has ${rows.length} rows`);
  const behindBarrier = (x: number, z: number) =>
    WALDSEE_BARRIERS.some(b => {
      const px = x + 0.5 - b.at[0], pz = z + 0.5 - b.at[1];
      const d = px * b.dir[0] + pz * b.dir[1], l = Math.abs(-px * b.dir[1] + pz * b.dir[0]);
      return d > -0.3 && d < 6 && l < b.half;
    });
  // (one tile deep only: the front where it meets the street, not the slits between the houses)
  const was = rows.map(r => r.join(''));
  const opened: [number, number, number][] = [];
  for (let z = 2; z < N - 2; z++)
    for (let x = 2; x < N - 2; x++) {
      if (was[z][x] !== '#' || [0, 3, 4, 5].includes(code(x, z)) || behindBarrier(x, z)) continue;
      if (!(was[z][x + 1] === '.' || was[z][x - 1] === '.' || was[z + 1][x] === '.' || was[z - 1][x] === '.')) continue;
      const c = cover(x, z);
      if (c === 0 || c >= KEEP_WALL) continue;
      rows[z][x] = '.';
      opened.push([x, z, c]);
    }
  console.log(`${solids.length} solid outlines; ${opened.length} wall tiles under a part of a front made floor`);
  // (the floor tiles whose middle a building covers: the monsters' flow fields go round them)
  let mid = 0;
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (rows[z][x] === '.' && built(x + 0.5, z + 0.5)) mid++;
  console.log(`${mid} floor tiles with their middle inside a building`);
  // the markers must stay on the floor
  for (const [, name, pts] of src.matchAll(/b\.put\('(.)', (.*?)\);/g))
    for (const [, a, b] of pts.matchAll(/\[(\d+), (\d+)\]/g)) if (rows[+b][+a] === '#') console.log(`marker ${name} ${a},${b} on a wall`);

  if (!process.env.WALDSEE_WRITE) return;
  writeFileSync(
    SOLIDS,
    '/**\n * The outlines of the real buildings of the Town (see floor-waldsee.ts), one closed boundary each as lines\n' +
      ' * [x0, z0, x1, z1, ...] in tiles: what the walkers bump into where a front runs slanted across the tiles. From the\n' +
      ' * LoD2 building models of Baden-Wuerttemberg, (c) LGL, www.lgl-bw.de, dl-de/by-2-0; made by tools/waldsee/solids.gen.ts.\n */\n' +
      'export const WALDSEE_SOLIDS: number[][] = ' +
      JSON.stringify(solids) +
      ';\n',
  );
  const start = src.indexOf('const BASE = [\n') + 'const BASE = [\n'.length, end = src.indexOf('];', start);
  writeFileSync(FLOOR, src.slice(0, start) + rows.map(r => `  '${r.join('')}',\n`).join('') + src.slice(end));
  // (the board fences stand on the plan's edges: worked out again for the new plan)
  console.log('now run: python3 -I tools/waldsee/fences.py . --write');
});
