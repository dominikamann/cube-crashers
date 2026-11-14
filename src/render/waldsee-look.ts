import * as THREE from 'three';
import { WALDSEE_FENCE_RUNS, WALDSEE_LAKES, WALDSEE_LOD2 } from './waldsee-lod2';
import markUrl from './amannlabs-mark.png';
import {
  WALDSEE_BARRIERS, WALDSEE_BOAT, WALDSEE_BOAT2, WALDSEE_CARS, WALDSEE_BUILT, WALDSEE_CZARDAS, WALDSEE_CZARDAS_SIDE, WALDSEE_ALLEY, WALDSEE_DROWNED, WALDSEE_EXTRA_FENCES, WALDSEE_FOUNTAIN, WALDSEE_HIDDEN, WALDSEE_HOUSES, WALDSEE_REPLACED, WALDSEE_ROOFS, WALDSEE_SHARK, WALDSEE_SIGNS, WALDSEE_TABLES, WALDSEE_TILES,
  WALDSEE_SHORE_TREES, WALDSEE_TREES, type WaldseeFace, type WaldseeHouse,
} from '../sim/config/waldsee-town';

/**
 * How the Town looks (the map `waldsee`, see floor-waldsee.ts): every wall tile is part of a house with its own
 * plaster colour, height and tiled roof, a walled yard, the lake, or the street going on behind a barrier. On
 * top of that come the things one knows the place by: the Czardas with its terrace, the Federle-Brunnen, the
 * trees with benches round them, the police car, the names over the doors, the shop of
 * AmannLabs with robots in its window, and a pedal boat out on the lake.
 */
export type WaldseeGround = 'water' | 'yard' | 'street' | 'meadow' | 'gravel' | 'house';

const codeAt = (tx: number, tz: number): number => {
  const row = WALDSEE_TILES[tz];
  return row && tx >= 0 && tx * 2 < row.length ? parseInt(row.substr(tx * 2, 2), 36) : 1;
};
/** a house taken away at the lake's edge: its tiles are water, no walls and no roof */
const takenAway = (c: number): boolean => c >= 6 && WALDSEE_HIDDEN.includes(c - 6);
const MAP_W = WALDSEE_TILES[0].length / 2, MAP_H = WALDSEE_TILES.length;
/** the houses one knows, built new as clean blocks (see buildWaldseeTown): their tiles are not drawn as town houses */
const BUILT = new Map(WALDSEE_BUILT.map(b => [b.house, b]));
/** where a front lies on a house built new: on the edge of its block, the way the front looks */
/** the feet of the real walls: each a stretch on the ground with the way it looks out */
/**
 * Whether a real building stands in the game: not the AmannLabs lot (built on its own), and not one whose middle is
 * on the lake side of the police lane (its meadow, gravel or water) north of the Wurzacher Strasse, nor out beyond
 * the shore there: the view down the lane is open water. The houses of the Wurzacher Strasse stand.
 */
const shownBase = (b: (typeof WALDSEE_LOD2)[number]): boolean => {
  let cx = 0, cz = 0, n = 0;
  for (const [, q] of b) for (let i = 0; i < q.length; i += 3) ((cx += q[i]), (cz += q[i + 2]), n++);
  cx /= n;
  cz /= n;
  const tx = Math.floor(cx), tz = Math.floor(cz), c = codeAt(tx, tz);
  if (c >= 6 && WALDSEE_REPLACED.includes(c - 6)) return false;
  const north = cz < 62;
  const g = waldseeGround(tx, tz);
  if (north && tx >= 0 && tz >= 0 && tx < MAP_W && tz < MAP_H && (g === 'water' || g === 'meadow' || g === 'gravel' || drowned(tx, tz))) return false;
  const lake = WALDSEE_BARRIERS.find(x => x.lake);
  return !(lake && cx > lake.at[0] && cz < lake.at[1] + 6);
};
/** the convex outline round some points (a wall with its gable on top), counter-clockwise */
const hull = (pts: [number, number][]): [number, number][] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const h: [number, number][] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
};
type Foot = { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number; id: number; eave: number; prof: [number, number][] };
// (worked out on first use: shown() needs waldseeGround, which comes further down)
let FEET: Foot[] | null = null;
const wallFeet = (): Foot[] => (FEET ??= (() => {
  const out: Foot[] = [];
  for (const [id, b] of WALDSEE_LOD2.entries()) {
    if (!shown(b)) continue;
    let cx = 0, cz = 0, n = 0;
    for (const [, q] of b) for (let i = 0; i < q.length; i += 3) ((cx += q[i]), (cz += q[i + 2]), n++);
    cx /= n;
    cz /= n;
    let eave = Infinity;
    for (const [k, q] of b) if (k === 'r') for (let i = 1; i < q.length; i += 3) eave = Math.min(eave, q[i]);
    if (!isFinite(eave)) eave = 3;
    for (const [k, q] of b) {
      if (k !== 'w') continue;
      const low: [number, number][] = [];
      for (let i = 0; i < q.length; i += 3) if (q[i + 1] < 0.3) low.push([q[i], q[i + 2]]);
      if (low.length < 2) continue;
      const [[x0, z0], [x1, z1]] = [low[0], low[low.length - 1]];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.3) continue;
      let nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) ((nx = -nx), (nz = -nz));
      // (the outline of the wall: how far along from its first foot, and how high, so a gable shows)
      const prof: [number, number][] = [];
      for (let i = 0; i < q.length; i += 3) prof.push([Math.hypot(q[i] - x0, q[i + 2] - z0), q[i + 1]]);
      // (a gable can be a wall of its own over the eaves, with no foot on the ground: in the same plane as this
      // wall and over it, it belongs to its outline, so a front painted on the wall reaches up into the gable)
      let gabled = false;
      for (const [k2, q2] of b) {
        if (k2 !== 'w' || q2 === q) continue;
        let foot = false, inPlane = true;
        const pts: [number, number][] = [];
        for (let i = 0; i < q2.length; i += 3) {
          if (q2[i + 1] < 0.3) foot = true;
          const t = ((q2[i] - x0) * (x1 - x0) + (q2[i + 2] - z0) * (z1 - z0)) / len;
          if (Math.abs((q2[i] - x0) * nx + (q2[i + 2] - z0) * nz) > 0.25 || t < -0.3 || t > len + 0.3) inPlane = false;
          pts.push([t, q2[i + 1]]);
        }
        if (foot || !inPlane) continue;
        prof.push(...pts);
        gabled = true;
      }
      // (its own eave: the lowest of its top corners, so a front on a wall higher than the house's lowest roof
      // reaches up to that wall's own roof)
      let own = Infinity;
      for (let i = 1; i < q.length; i += 3) if (q[i] > 0.3) own = Math.min(own, q[i]);
      out.push({ x0, z0, x1, z1, nx, nz, id, eave: isFinite(own) ? own : eave, prof: gabled ? hull(prof) : prof });
    }
  }
  return out;
})());
/**
 * A front put onto the real wall nearest to it that looks about the same way. `wall` tells how the real wall is:
 * `width` along the front, `along` where the front's point lies on it (from the wall's middle, in the front's own
 * `along` direction), and `eave`, the height up to the roof
 */
export type OnWall = { wall?: { id?: number; width: number; along: number; eave: number; prof?: [number, number][] } };
const onWall = <F extends WaldseeFace>(f: F): F & OnWall => {
  let best: { d: number; x: number; z: number; nx: number; nz: number; len: number; u: number; eave: number; ex: number; ez: number; prof: [number, number][]; id: number } | null = null;
  for (const w of wallFeet()) {
    if (w.nx * f.dx + w.nz * f.dz < 0.5) continue;
    const ex = w.x1 - w.x0, ez = w.z1 - w.z0, L2 = ex * ex + ez * ez;
    const u = Math.max(0, Math.min(1, ((f.x - w.x0) * ex + (f.z - w.z0) * ez) / L2));
    const x = w.x0 + ex * u, z = w.z0 + ez * u, d = Math.hypot(f.x - x, f.z - z);
    if (!best || d < best.d) best = { d, x, z, nx: w.nx, nz: w.nz, len: Math.sqrt(L2), u, eave: w.eave, ex, ez, prof: w.prof, id: w.id };
  }
  if (!best || best.d > 4) return f;
  // (the front's `along` runs (-dz, dx): the sign of the wall's direction in it)
  const sgn = Math.sign(-best.nz * best.ex + best.nx * best.ez) || 1;
  const wall = { id: best.id, width: best.len, along: (best.u - 0.5) * best.len * sgn, eave: best.eave, prof: best.prof.map(([t, y]): [number, number] => [(t - best.len / 2) * sgn, y]) };
  return { ...f, x: best.x, z: best.z, dx: best.nx, dz: best.nz, len: Math.max(1, Math.min(f.len, Math.floor(best.len))), wall };
};
/** a piece of a house's front: its own wall (a face at its middle), how long it is, where it starts across the
 *  front (from the left as one looks at it) and how high its eave is */
type FrontPiece = { face: WaldseeFace; len: number; u0: number; eave: number };
type Front = { pieces: FrontPiece[]; width: number; eave: number };
/**
 * The whole street front of the house a front snapped to: its wall and the walls of the same house joined to it end
 * to end that look about the same way (a front with slight kinks or a step in its line), from left to right
 */
const frontOf = (f: WaldseeFace & OnWall): Front | null => {
  const id = f.wall?.id;
  if (id === undefined) return null;
  const mine = wallFeet().filter(w => w.id === id && w.nx * f.dx + w.nz * f.dz > 0.7);
  const off = (w: Foot) => {
    const ex = w.x1 - w.x0, ez = w.z1 - w.z0, t = Math.max(0, Math.min(1, ((f.x - w.x0) * ex + (f.z - w.z0) * ez) / (ex * ex + ez * ez)));
    return Math.hypot(w.x0 + ex * t - f.x, w.z0 + ez * t - f.z);
  };
  const start = mine.reduce<Foot | null>((b, w) => (!b || off(w) < off(b) ? w : b), null);
  if (!start || off(start) > 0.1) return null;
  const ends = (w: Foot): [number, number][] => [[w.x0, w.z0], [w.x1, w.z1]];
  const touches = (a: Foot, b: Foot) => ends(a).some(([x, z]) => ends(b).some(([x2, z2]) => Math.hypot(x - x2, z - z2) < 0.2));
  const chain = [start];
  for (let grew = true; grew; ) {
    grew = false;
    for (const w of mine) if (!chain.includes(w) && chain.some(c => touches(c, w))) ((grew = true), chain.push(w));
  }
  // (left as one looks at it: the farthest along the front's `along`)
  const along = (w: Foot) => -((w.x0 + w.x1) / 2 - f.x) * f.dz + ((w.z0 + w.z1) / 2 - f.z) * f.dx;
  chain.sort((a, b) => along(b) - along(a));
  let u = 0;
  const pieces = chain.map(w => {
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    const p = { face: { x: (w.x0 + w.x1) / 2, z: (w.z0 + w.z1) / 2, dx: w.nx, dz: w.nz, len: 1 }, len, u0: u, eave: w.eave };
    u += len;
    return p;
  });
  return { pieces, width: u, eave: Math.min(...pieces.map(p => p.eave)) };
};
const onBlock = <F extends WaldseeFace>(f: F): F & OnWall => {
  if (WALDSEE_LOD2.length) return onWall(f);
  const b = BUILT.get(codeAt(Math.floor(f.x - f.dx * 0.5 - (f.dx ? 0 : 0.0001)), Math.floor(f.z - f.dz * 0.5 - (f.dz ? 0 : 0.0001))) - 6);
  if (!b) return f;
  const x = f.dx > 0 ? b.x1 + 1 : f.dx < 0 ? b.x0 : Math.min(Math.max(f.x, b.x0 + 1), b.x1);
  const z = f.dz > 0 ? b.z1 + 1 : f.dz < 0 ? b.z0 : Math.min(Math.max(f.z, b.z0 + 1), b.z1);
  return { ...f, x, z, len: f.dx ? b.z1 - b.z0 + 1 : b.x1 - b.x0 + 1 };
};
/** the big rounded corner house: a spot on its wall that looks across the square at the ice-cream parlour, and its
 *  rounded corner (the entrance is counted from the end of that wall toward it) */
const CORNER_HOUSE: WaldseeFace = { x: 57.6, z: 64.2, dx: 1, dz: 0, len: 1 };
const CORNER_ROUND: [number, number] = [56.8, 69.0];
/**
 * The real buildings that carry a painted shop front: their plaster (and shutters) in the facade's own colours on
 * every wall and gable, found by snapping each shop to its wall (the wall's feet know the building)
 */
let SHOP_HOUSES: Map<number, { col: number; shut: string }> | null = null;
const shopHouses = () => (SHOP_HOUSES ??= (() => {
  const m = new Map<number, { col: number; shut: string }>();
  const put = (f: WaldseeFace, col: number, shut = '') => {
    const id = (onBlock(f) as OnWall).wall?.id;
    if (id !== undefined) m.set(id, { col, shut });
  };
  put(WALDSEE_CZARDAS, 0x7096de, 'b3262b');
  const BY_KIND: Record<string, [number, string?]> = {
    eis: [0xefe3cd], amadeus: [0xece6d4], bank: [0xe4dfd3], shop: [0xece3d0, 'b97a8c'], nemo: [0xe9e0cc], frauen: [0xd9d8d3],
    flasche: [0xdfe6d6], nkd: [0xe4dfd2], brille: [0xf1efe8, '8a2a30'], empire: [0xe6dcc4], police: [0xf1efe8, '2f5a3c'],
  };
  for (const s of WALDSEE_SIGNS) if (BY_KIND[s.kind]) put(s, BY_KIND[s.kind][0], BY_KIND[s.kind][1]);
  // (the big rounded corner house across the square from the ice-cream parlour: pale cream on the whole building)
  put(CORNER_HOUSE, 0xeee3bd);
  return m;
})());
/** grass patches out in the water that are not joined to the town: drowned, so no island is left */
const DROWNED_ISLANDS: Set<number> = (() => {
  const key = (x: number, z: number) => z * MAP_W + x;
  const code = (x: number, z: number) => (x < 0 || z < 0 || x >= MAP_W || z >= MAP_H ? 1 : parseInt(WALDSEE_TILES[z].substr(x * 2, 2), 36));
  const passable = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= MAP_W || z >= MAP_H) return false;
    const c = code(x, z);
    if (c === 1 || c === 2 || c === 3 || c === 4 || c === 5) return true;
    if (c >= 6) return !WALDSEE_HIDDEN.includes(c - 6);
    return false;
  };
  const seen = new Uint8Array(MAP_W * MAP_H), q: [number, number][] = [];
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const c = code(x, z);
    const solid = (c >= 6 && !WALDSEE_HIDDEN.includes(c - 6)) || c === 1 || c === 2 || c === 3;
    if (solid && !seen[key(x, z)]) { seen[key(x, z)] = 1; q.push([x, z]); }
  }
  while (q.length) {
    const [x, z] = q.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!passable(nx, nz) || seen[key(nx, nz)]) continue;
      seen[key(nx, nz)] = 1;
      q.push([nx, nz]);
    }
  }
  const set = new Set<number>();
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const c = code(x, z);
    if ((c === 4 || c === 5) && !seen[key(x, z)]) set.add(key(x, z));
  }
  return set;
})();
const drowned = (tx: number, tz: number): boolean =>
  WALDSEE_DROWNED.some(([x, z]) => x === tx && z === tz) || DROWNED_ISLANDS.has(tz * MAP_W + tx);
const alley = (tx: number, tz: number): boolean => WALDSEE_ALLEY.some(([x, z]) => x === tx && z === tz);
export const waldseeGround = (tx: number, tz: number): WaldseeGround => {
  const c = codeAt(tx, tz);
  if (alley(tx, tz)) return 'street';
  if (c >= 6 && (WALDSEE_REPLACED.includes(c - 6) || BUILT.has(c - 6))) return 'street';
  // (a house taken away south of the lake, along the Wurzacher Strasse, leaves the street paved, not water)
  if (takenAway(c) && tz >= 62) return 'street';
  if (takenAway(c) || drowned(tx, tz)) return 'water';
  // (a house tile is a low block hidden inside the real building that stands there, see buildWaldseeTown)
  // (a house tile, or a yard behind the houses, is paved: the real buildings stand on it, and where a tile reaches
  // a little past a front one sees cobbles, not a block)
  return c === 0 ? 'water' : c === 4 ? 'meadow' : c === 5 ? 'gravel' : 'street';
};
/** the tiles a real building stands on, by its outline (the feet of its walls, sampled) */
const footTiles = (b: (typeof WALDSEE_LOD2)[number]): [number, number][] => {
  const seen = new Set<number>(), out: [number, number][] = [];
  const add = (x: number, z: number) => {
    const tx = Math.floor(x), tz = Math.floor(z), k = (tz + 400) * 1000 + tx + 400;
    if (!seen.has(k)) (seen.add(k), out.push([tx, tz]));
  };
  for (const [kind, q] of b) {
    if (kind !== 'w') continue;
    const low: [number, number][] = [];
    for (let i = 0; i < q.length; i += 3) if (q[i + 1] < 0.3) low.push([q[i], q[i + 2]]);
    if (low.length < 2) continue;
    const [[x0, z0], [x1, z1]] = [low[0], low[low.length - 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2));
    for (let i = 0; i <= n; i++) add(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n);
  }
  return out;
};
/** the part of the Town and its surroundings where the Stadtsee and its shore are drawn (tiles) */
export const LAKE_WIN = { x0: 70, x1: 190, z0: -20, z1: 70 };
/** the lake as drawn: the water of the plan (north of the Wurzacher Strasse) and the Stadtsee of OpenStreetMap, less a
 *  margin round every house that stands (its shore path and a strip of meadow lie there), and the houses hidden for it */
const LAKE: { get(): { water: Uint8Array; islet: Uint8Array; hidden: Set<number> }; isWater(tx: number, tz: number): boolean; isIslet(tx: number, tz: number): boolean } = (() => {
  let data: { water: Uint8Array; islet: Uint8Array; hidden: Set<number> } | null = null;
  const W = LAKE_WIN.x1 - LAKE_WIN.x0, H = LAKE_WIN.z1 - LAKE_WIN.z0;
  const at = (tx: number, tz: number) => (tz - LAKE_WIN.z0) * W + (tx - LAKE_WIN.x0);
  const inside = (tx: number, tz: number) => tx >= LAKE_WIN.x0 && tx < LAKE_WIN.x1 && tz >= LAKE_WIN.z0 && tz < LAKE_WIN.z1;
  const inRing = (r: number[], x: number, z: number) => {
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2)
      if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
    return c;
  };
  const build = () => {
    const stadtsee = WALDSEE_LAKES.reduce<number[]>((a, r) => (r.length > a.length ? r : a), []);
    const water0 = new Uint8Array(W * H);
    for (let tz = LAKE_WIN.z0; tz < LAKE_WIN.z1; tz++) for (let tx = LAKE_WIN.x0; tx < LAKE_WIN.x1; tx++) {
      const plan = tx >= 78 && tx < MAP_W && tz >= 0 && tz <= 61 && waldseeGround(tx, tz) === 'water';
      if (plan || (stadtsee.length > 0 && inRing(stadtsee, tx + 0.5, tz + 0.5))) water0[at(tx, tz)] = 1;
    }
    // a house that stands mostly in the water does not stand there at all
    const hidden = new Set<number>(), kept: [number, number][] = [];
    WALDSEE_LOD2.forEach((b, id) => {
      if (!shownBase(b)) return;
      const feet = footTiles(b);
      const wet = feet.filter(([x, z]) => inside(x, z) && water0[at(x, z)]).length;
      if (wet >= 3 && wet / feet.length >= 0.4) hidden.add(id);
      else kept.push(...feet);
    });
    // the water keeps back from every house that stands: room for the path, the rim and a strip of meadow
    const water = water0.slice();
    for (const [x, z] of kept) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dz * dz <= 12.25 && inside(x + dx, z + dz)) water[at(x + dx, z + dz)] = 0;
    }
    // little patches of land out in the water (not joined to the shore, no house on them) are islets: just green
    const islet = new Uint8Array(W * H), mark = new Uint8Array(W * H), keep = new Set<number>();
    for (const [x, z] of kept) if (inside(x, z)) keep.add(at(x, z));
    for (let i = 0; i < W * H; i++) {
      if (water[i] || mark[i]) continue;
      const comp = [i];
      mark[i] = 1;
      let edge = false, house = false;
      for (let k = 0; k < comp.length; k++) {
        const cx = comp[k] % W, cz = Math.floor(comp[k] / W);
        if (keep.has(comp[k])) house = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) { edge = true; continue; }
          const n = nz * W + nx;
          if (!water[n] && !mark[n]) ((mark[n] = 1), comp.push(n));
        }
      }
      if (!edge && !house && comp.length < 40) for (const c of comp) islet[c] = 1;
    }
    return { water, islet, hidden };
  };
  return {
    get: () => (data ??= build()),
    isWater: (tx: number, tz: number): boolean => inside(tx, tz) && LAKE.get().water[at(tx, tz)] === 1,
    isIslet: (tx: number, tz: number): boolean => inside(tx, tz) && LAKE.get().islet[at(tx, tz)] === 1,
  };
})();
/** whether the lake drawn there (see LAKE) covers a tile */
export const waldseeLake = (tx: number, tz: number): boolean => LAKE.isWater(tx, tz);
/** whether a tile is a little islet of green out in the lake (no path round it) */
export const waldseeIslet = (tx: number, tz: number): boolean => LAKE.isIslet(tx, tz);
/** whether a real building stands in the game (see shownBase, and the houses the lake takes away) */
export const shown = (b: (typeof WALDSEE_LOD2)[number]): boolean => shownBase(b) && !LAKE.get().hidden.has(WALDSEE_LOD2.indexOf(b));
/** the plan's house at a tile, for its colours (the real building there takes them) */
export const houseAt = (tx: number, tz: number): WaldseeHouse | null => {
  const c = codeAt(tx, tz);
  return c >= 6 && !takenAway(c) && !WALDSEE_REPLACED.includes(c - 6) ? WALDSEE_HOUSES[c - 6] ?? null : null;
};
export const waldseeHouse = (tx: number, tz: number): WaldseeHouse | null => {
  const c = codeAt(tx, tz);
  // (the houses are the real buildings now, drawn whole: no house is drawn tile by tile)
  void c;
  return null;
};
/** how high the roof stands over the walls at a tile, in blocks */
export const waldseeRoof = (tx: number, tz: number): number => (waldseeHouse(tx, tz) ? Number(WALDSEE_ROOFS[tz]?.[tx] ?? 0) * 0.2 : 0);

const hash = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** the height of the block at a wall tile, from its foot (0.4 under the floor): a house up to its roof, a yard wall, the lake, the street beyond */
export function waldseeBlockHeight(tx: number, tz: number): number {
  const h = waldseeHouse(tx, tz);
  if (h) return h.wall + waldseeRoof(tx, tz) + 0.4;
  const g = waldseeGround(tx, tz);
  return g === 'water' ? 0.26 : g === 'yard' ? 1.5 : g === 'meadow' ? 0.36 + 0.06 * hash(tx >> 1, tz >> 1) : 0.4;
}

const WATER = [0x4f9fd6, 0x4592cc, 0x58a8dd];
const STREET = [0xb6b0a4, 0xaea89c, 0xbdb7ab];
const MEADOW = [0x7fb866, 0x76ae5e, 0x88c06e];
const GRAVEL = [0xd2c7ab, 0xc9bea2, 0xd9cfb4];
/** the colour of the block at a wall tile: the plaster of its house, a yard wall, water, or the cobbles of the street beyond */
export function waldseeBlockColor(tx: number, tz: number): number {
  const h = waldseeHouse(tx, tz);
  if (h) return parseInt(h.col, 16);
  const g = waldseeGround(tx, tz);
  const k = Math.floor(hash(tx, tz) * 3);
  return g === 'water' ? WATER[k] : g === 'street' ? STREET[k] : g === 'meadow' ? MEADOW[k] : g === 'gravel' ? GRAVEL[k] : 0xcfc4ae;
}

/** plaster with windows and their shutters, white so the house's own colour shows through */
export function paintWaldseeWall(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  // the foot of the house, a little darker
  g.fillStyle = '#d9d6d0';
  g.fillRect(0, 58, 64, 6);
  // three floors: a wide window with a white frame and a cross, and shutters at the edges of the tile
  for (const y of [5, 23, 41]) {
    // shutters (a pale green), with slats
    g.fillStyle = '#7d9475';
    g.fillRect(1, y, 12, 13);
    g.fillRect(51, y, 12, 13);
    g.fillStyle = '#68805f';
    for (let k = 2; k < 13; k += 3) {
      g.fillRect(1, y + k, 12, 1);
      g.fillRect(51, y + k, 12, 1);
    }
    // the white frame
    g.fillStyle = '#fbfaf6';
    g.fillRect(15, y - 1, 34, 14);
    // the glass and its cross
    g.fillStyle = '#9fb2c0';
    g.fillRect(17, y + 1, 30, 10);
    g.fillStyle = '#fbfaf6';
    g.fillRect(31, y + 1, 2, 10);
    g.fillRect(17, y + 5, 30, 1);
    // a soft reflection
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(19, y + 2, 4, 8);
  }
}

/** cobbles: rows of setts with dark joints, each row shifted against the next (grey only: the colour comes from the theme) */
export function paintWaldseeFloor(g: CanvasRenderingContext2D, tx: number, tz: number, x: number, y: number, px: number): void {
  const n = 4, s = px / n;
  g.fillStyle = 'rgb(176,176,176)';
  g.fillRect(x, y, px, px);
  for (let r = 0; r < n; r++)
    for (let c = -1; c < n; c++) {
      const v = Math.round(214 + hash(tx * n + c, tz * n + r) * 34);
      g.fillStyle = `rgb(${v},${v},${v})`;
      const sx = x + (c + (r % 2 ? 0.5 : 0)) * s + 0.7, w = s - 1.4;
      const x0 = Math.max(x, sx), x1 = Math.min(x + px, sx + w);
      if (x1 > x0) g.fillRect(x0, y + r * s + 0.7, x1 - x0, s - 1.4);
    }
}

interface Piece {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  yaw: number;
  lean: number;
}

/** Everything that stands on the plan. Two meshes of boxes (lit ones and glowing ones) and the name signs. */
export function buildWaldseeTown(add: (o: THREE.Object3D) => void, disposables: { dispose(): void }[]): void {
  const lit: Piece[] = [], glow: Piece[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, yaw = 0, lean = 0) => lit.push({ x, y, z, sx, sy, sz, color, yaw, lean });
  const lamp = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, yaw = 0) => glow.push({ x, y, z, sx, sy, sz, color, yaw, lean: 0 });
  const shade = (color: number, k: number) => new THREE.Color(color).multiplyScalar(k).getHex();
  // a spot before the face of a house: `along` it (to the right as one looks at it) and `out` from the wall
  const on = (f: WaldseeFace, along: number, out: number): [number, number] => [f.x - f.dz * along + f.dx * out, f.z + f.dx * along + f.dz * out];
  const faceYaw = (f: WaldseeFace) => Math.atan2(f.dx, f.dz);
  /** a box on a face: `w` wide along the wall, `h` high, `t` thick out of it */
  const onFace = (f: WaldseeFace, along: number, out: number, y: number, w: number, h: number, t: number, color: number, glowing = false) => {
    const [x, z] = on(f, along, out);
    (glowing ? lamp : box)(x, y, z, w, h, t, color, faceYaw(f));
  };
  /** a painted front (a canvas `front.width` across, `H` high) laid over the pieces of a house's front, each its part */
  const paintFront = (canvas: HTMLCanvasElement, front: Front, H: number) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    disposables.push(tex, mat);
    for (const p of front.pieces) {
      const geo = new THREE.PlaneGeometry(p.len, H), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (p.u0 + uv.getX(i) * p.len) / front.width);
      disposables.push(geo);
      const m = new THREE.Mesh(geo, mat);
      const [x, z] = on(p.face, 0, 0.04);
      m.position.set(x, H / 2, z);
      m.rotation.y = faceYaw(p.face);
      add(m);
    }
  };
  /** where a spot `u` across a painted front (from its left end) lies: the face of its piece and how far along it */
  const frontAt = (front: Front, u: number): [WaldseeFace, number] => {
    const p = front.pieces.find(q => u < q.u0 + q.len) ?? front.pieces[front.pieces.length - 1];
    return [p.face, p.len / 2 - (u - p.u0)];
  };
  /** a name on a board on the face of a house */
  const sign = (f: WaldseeFace, text: string, y: number, width: number, colors: { back: string; ink: string; rim: string }, font = 'italic bold 84px Georgia, "Times New Roman", serif', mark?: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = colors.back;
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = colors.rim;
    g.lineWidth = 6;
    g.strokeRect(7, 7, 498, 114);
    g.fillStyle = colors.ink;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // (a long name is squeezed to fit the board)
    const wide = g.measureText(text).width;
    // (with a mark before the name, the name moves over to make room for it)
    const room = mark ? 340 : 440, middle = mark ? 310 : 256;
    g.save();
    g.translate(middle, 68);
    g.scale(Math.min(1, room / wide), 1);
    g.fillText(text, 0, 0);
    g.restore();
    const tex = new THREE.CanvasTexture(canvas);
    if (mark) {
      const img = new Image();
      img.onload = () => {
        const h = 84, w = (img.width / img.height) * h, left = middle - Math.min(wide, room) / 2 - w - 14;
        g.drawImage(img, Math.max(18, left), 64 - h / 2, w, h);
        tex.needsUpdate = true;
      };
      img.src = mark;
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(width, width / 4), mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    disposables.push(tex, geo, mat);
    const m = new THREE.Mesh(geo, mat);
    const [x, z] = on(f, 0, 0.06);
    m.position.set(x, y, z);
    m.rotation.y = faceYaw(f);
    add(m);
  };

  // ---- the roofs: a slab of tiles on every house tile, thick enough to hide the step to the next one down
  WALDSEE_TILES.forEach((_row, tz) => {
    for (let tx = 0; tx < WALDSEE_TILES[tz].length / 2; tx++) {
      const h = waldseeHouse(tx, tz);
      if (!h) continue;
      const top = h.wall + waldseeRoof(tx, tz);
      box(tx + 0.5, top - 0.28, tz + 0.5, 1.07, 0.72, 1.07, shade(parseInt(h.roof, 16), 0.96 + 0.08 * hash(tx, tz)));
    }
  });

  // ---- shutters in their own colour on the houses one knows: a pair at every window of every wall that looks
  // onto the street (the windows are where the wall's texture has them, three floors of them)
  WALDSEE_TILES.forEach((_row, tz) => {
    for (let tx = 0; tx < WALDSEE_TILES[tz].length / 2; tx++) {
      const h = waldseeHouse(tx, tz);
      if (!h?.shut) continue;
      const full = h.wall + waldseeRoof(tx, tz) + 0.4, colour = parseInt(h.shut, 16);
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (codeAt(tx + dx, tz + dz) !== 2 && codeAt(tx + dx, tz + dz) !== 3) continue;
        const f: WaldseeFace = { x: tx + 0.5 + dx * 0.5, z: tz + 0.5 + dz * 0.5, dx, dz, len: 1 };
        for (const row of [5, 23, 41]) {
          const y = full - 0.4 - (full * (row + 5.5)) / 64;
          for (const u of [18, 46]) onFace(f, u / 64 - 0.5, 0.02, y, 7.5 / 64, (full * 11.5) / 64, 0.04, colour);
        }
      }
    }
  });

  // ---- the buildings as they really stand: their walls and roofs as polygons (LoD2 building models), the walls
  // in their house's plaster with a window to every tile and storey, the roofs in its tiles. (Not the houses
  // taken away for the view of the lake, nor the AmannLabs shop, which is built on its own.)
  {
    const roofPos: number[] = [], roofCol: number[] = [];
    /** the walls, one set to each colour of shutters ('' none) */
    const wallSets = new Map<string, { pos: number[]; uv: number[]; col: number[] }>();
    const walls = (shut: string) => {
      let w = wallSets.get(shut);
      if (!w) wallSets.set(shut, (w = { pos: [], uv: [], col: [] }));
      return w;
    };
    const col = new THREE.Color();
    const PALE = [0xf4f1ea, 0xf1e7c9, 0xecd0a0, 0xe9b9a6, 0xcfe0c0, 0xc6d9e6, 0xefe6d6, 0xf6efe0, 0xe8d5bd];
    const TILES = [0xb45a3c, 0xc06544, 0xa9553a, 0xb8623f, 0x9c5038];
    WALDSEE_LOD2.forEach((b, bi) => {
      let cx = 0, cz = 0, n = 0;
      for (const [, q] of b) for (let i = 0; i < q.length; i += 3) ((cx += q[i]), (cz += q[i + 2]), n++);
      const tx = Math.floor(cx / n), tz = Math.floor(cz / n);
      if (!shown(b)) return;
      // (the Czardas's colours belong to the Czardas only: a neighbour whose middle lands on its tile stays neutral)
      // (and the part left of it, building 124, is one house with the yellow one beside it: it wears its yellow)
      const h0 = bi === 124 ? houseAt(38, 42) : houseAt(tx, tz), h = h0 && h0.col === '6f93c9' && bi !== 280 ? null : h0;
      // (a house with a painted shop front wears the facade's colours on all its walls and gables)
      const shop = shopHouses().get(bi);
      const plaster = shop ? shop.col : h ? parseInt(h.col, 16) : PALE[bi % PALE.length], tiles = h ? parseInt(h.roof, 16) : TILES[bi % TILES.length];
      const shutters = shop ? shop.shut : h?.shut ?? '';
      // (its eaves: the lowest point of its roofs; as many storeys of about two tiles as fit under them)
      let eaves = Infinity;
      for (const [k, q] of b) if (k === 'r') for (let i = 1; i < q.length; i += 3) eaves = Math.min(eaves, q[i]);
      if (!isFinite(eaves)) {
        eaves = 0;
        for (const [, q] of b) for (let i = 1; i < q.length; i += 3) eaves = Math.max(eaves, q[i]);
      }
      for (const [k, q] of b) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < q.length; i += 3) pts.push(new THREE.Vector3(q[i], q[i + 1] - 0.4 + 0.4 * Math.min(1, q[i + 1]), q[i + 2]));
        if (pts.length < 3) continue;
        // (the polygon's plane: its normal by Newell, then its points in two dimensions on that plane)
        const nrm = new THREE.Vector3();
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], d = pts[(i + 1) % pts.length];
          nrm.x += (a.y - d.y) * (a.z + d.z);
          nrm.y += (a.z - d.z) * (a.x + d.x);
          nrm.z += (a.x - d.x) * (a.y + d.y);
        }
        if (nrm.lengthSq() < 1e-9) continue;
        nrm.normalize();
        const u = Math.abs(nrm.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-nrm.z, 0, nrm.x).normalize();
        const v = new THREE.Vector3().crossVectors(nrm, u);
        const flat = pts.map(p => new THREE.Vector2(p.dot(u), p.dot(v)));
        const tris = THREE.ShapeUtils.triangulateShape(flat, []);
        const wall = k === 'w';
        // (each wall its own eaves: the lowest of its top corners, so a tall part of a house next to a low annex
        // gets windows all the way up, not only as high as the annex's roof)
        let eave = Infinity;
        if (wall) for (const p of pts) if (p.y > 0.3) eave = Math.min(eave, p.y);
        if (!isFinite(eave)) eave = eaves;
        const storeys = Math.max(1, Math.round(eave / 2)), storey = eave / storeys;
        col.setHex(wall ? plaster : tiles);
        if (!wall) col.multiplyScalar(0.9 + 0.12 * Math.max(0, nrm.y));
        // (along the wall: as many windows as fit two tiles apart, spread evenly from end to end)
        let a0 = Infinity, a1 = -Infinity;
        for (const p of pts) ((a0 = Math.min(a0, p.dot(u))), (a1 = Math.max(a1, p.dot(u))));
        const across = Math.max(1, Math.round((a1 - a0) / 2)) / Math.max(0.01, a1 - a0);
        const put = (p: THREE.Vector3, gable: boolean) => {
          (wall ? walls(shutters).pos : roofPos).push(p.x, p.y, p.z);
          (wall ? walls(shutters).col : roofCol).push(col.r, col.g, col.b);
          // (the gable over the eaves is plain plaster: a corner of the texture where there is no window)
          if (wall) walls(shutters).uv.push(gable ? 0.03 : (p.dot(u) - a0) * across, gable ? 0.97 : Math.min(storeys, (p.y + 0.4) / storey));
        };
        for (const t of tris) {
          const tri = t.map(i => pts[i]);
          if (!wall || Math.max(...tri.map(p => p.y)) <= eave + 0.05) for (const p of tri) put(p, false);
          else if (Math.min(...tri.map(p => p.y)) >= eave - 0.05) for (const p of tri) put(p, true);
          else {
            // (a triangle across the eaves: cut there, windows below, plaster above)
            const cut = (pa: THREE.Vector3, pb: THREE.Vector3) => pa.clone().lerp(pb, (eave - pa.y) / (pb.y - pa.y));
            const below = tri.filter(p => p.y <= eave), above = tri.filter(p => p.y > eave);
            const lone = below.length === 1 ? below[0] : above[0], pair = below.length === 1 ? above : below;
            const c0 = cut(lone, pair[0]), c1 = cut(lone, pair[1]);
            const low = below.length === 1, single = [lone, c0, c1], quad = [c0, pair[0], pair[1], c1];
            for (const p of single) put(p, !low);
            for (const p of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) put(p, low);
          }
        }
      }
    });
    const mesh = (pos: number[], colours: number[], mat: THREE.Material, uv?: number[]) => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
      if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      disposables.push(geo, mat);
      add(m);
    };
    const windows = (shut: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 64, 64);
      // a window: a pale frame, dark glass, a cross, a sill; shutters beside it if the house has them
      g.fillStyle = '#f7f5f0';
      g.fillRect(20, 14, 24, 34);
      g.fillStyle = '#3d4a5c';
      g.fillRect(23, 17, 18, 28);
      g.fillStyle = '#f7f5f0';
      g.fillRect(31, 17, 2, 28);
      g.fillRect(23, 28, 18, 2);
      g.fillStyle = '#e4e1da';
      g.fillRect(18, 48, 28, 3);
      if (shut) {
        g.fillStyle = '#' + shut;
        g.fillRect(9, 14, 10, 34);
        g.fillRect(45, 14, 10, 34);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let y = 17; y < 46; y += 4) (g.fillRect(9, y, 10, 1), g.fillRect(45, y, 10, 1));
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      disposables.push(tex);
      return tex;
    };
    for (const [shut, w] of wallSets) mesh(w.pos, w.col, new THREE.MeshLambertMaterial({ map: windows(shut), vertexColors: true, side: THREE.DoubleSide }), w.uv);
    mesh(roofPos, roofCol, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    // the lake round the Town, flat on the ground beyond the map
    for (const ring of WALDSEE_LAKES) {
      const shape = new THREE.Shape();
      for (let i = 0; i < ring.length; i += 2) (i ? shape.lineTo(ring[i], ring[i + 1]) : shape.moveTo(ring[i], ring[i + 1]));
      const geo = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({ color: 0x4f9fd6, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = -0.37;
      m.receiveShadow = true;
      disposables.push(geo, mat);
      add(m);
    }
  }

  // ---- the houses one knows, built new on their lot as clean blocks: plaster in their own colour from the
  // ground to the eaves, three storeys of windows (with shutters where they have them) on every side that looks
  // onto a street, and a gable roof along the longer side with a little overhang
  // (only where the real buildings are missing)
  for (const b of WALDSEE_LOD2.length ? [] : WALDSEE_BUILT) {
    const h = WALDSEE_HOUSES[b.house];
    if (!h) continue;
    const w = b.x1 - b.x0 + 1, d = b.z1 - b.z0 + 1, cx = b.x0 + w / 2, cz = b.z0 + d / 2, top = h.wall;
    const plaster = parseInt(h.col, 16), roof = parseInt(h.roof, 16);
    box(cx, (top - 0.4) / 2, cz, w, top + 0.4, d, plaster);
    box(cx, 0.2, cz, w + 0.04, 0.6, d + 0.04, shade(plaster, 0.82));
    box(cx, top - 0.05, cz, w + 0.08, 0.1, d + 0.08, shade(plaster, 0.9));
    const storey = (top - 0.6) / 3;
    const sides: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dz] of sides) {
      const n = dx ? d : w;
      for (let k = 0; k < n; k++) {
        const tx = dx ? (dx > 0 ? b.x1 + 1 : b.x0 - 1) : b.x0 + k, tz = dz ? (dz > 0 ? b.z1 + 1 : b.z0 - 1) : b.z0 + k;
        const g = codeAt(tx, tz);
        if (g !== 2 && g !== 3) continue;
        const f: WaldseeFace = { x: dx ? (dx > 0 ? b.x1 + 1 : b.x0) : tx + 0.5, z: dz ? (dz > 0 ? b.z1 + 1 : b.z0) : tz + 0.5, dx, dz, len: 1 };
        // (the ground floor is the shop's, where there is one: its windows only above)
        for (let st = 1; st < 3; st++) {
          const y = 0.6 + storey * (st + 0.5);
          onFace(f, 0, 0.03, y, 0.56, storey * 0.56, 0.05, 0xf4f1ea);
          onFace(f, 0, 0.05, y, 0.46, storey * 0.48, 0.05, 0x3d4a5c);
          onFace(f, 0, 0.06, y, 0.04, storey * 0.48, 0.05, 0xf4f1ea);
          if (h.shut) for (const side of [-1, 1]) onFace(f, side * 0.4, 0.05, y, 0.2, storey * 0.52, 0.05, parseInt(h.shut, 16));
        }
      }
    }
    // the roof: slabs along the longer side, each narrower than the one below
    const along = w >= d, len = (along ? w : d) + 0.3, across = (along ? d : w) + 0.3, steps = 6;
    const rise = Math.min(0.42, (across / 2) * 0.16);
    for (let k = 0; k < steps; k++) {
      const a = across * (1 - k / steps);
      box(cx, top + rise * (k + 0.5), cz, along ? len : a, rise, along ? a : len, shade(roof, 0.94 + 0.03 * (k % 2)));
    }
  }

  // ---- trees: a trunk, a crown of leaves, and a bench all round the trunk
  const leaf = [0x4f9a4a, 0x5aa653, 0x468c42], wood = 0x8a5a36, bark = 0x6b4a32;
  for (const [tx, tz] of WALDSEE_TREES) {
    const x = tx + 0.5, z = tz + 0.5, turn = hash(tx, tz) * 1.5;
    box(x, 1.5, z, 0.3, 3, 0.3, bark, turn);
    [[1.5, 3.1], [2.1, 3.7], [1.8, 4.3], [1.1, 4.85]].forEach(([w, y], k) => box(x, y, z, w, 0.62, w, leaf[(tx + tz + k) % 3], turn + k * 0.4));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      box(x + Math.cos(a) * 0.62, 0.42, z + Math.sin(a) * 0.62, 0.3, 0.1, 0.52, wood, -a);
      if (k % 2 === 0) box(x + Math.cos(a) * 0.62, 0.2, z + Math.sin(a) * 0.62, 0.1, 0.4, 0.1, 0x3a3f52, -a);
    }
  }

  // (on the meadows by the lake and on its far side: plain trees, bigger and smaller)
  for (const [tx, tz] of WALDSEE_SHORE_TREES) {
    const x = tx + 0.5, z = tz + 0.5, k = 0.8 + hash(tx, tz) * 0.9, turn = hash(tz, tx) * 1.5;
    box(x, 1.2 * k, z, 0.3 * k, 2.4 * k, 0.3 * k, bark, turn);
    [[1.7, 2.5], [2.3, 3.1], [1.9, 3.7], [1.1, 4.2]].forEach(([w, y], q) => box(x, y * k, z, w * k, 0.64 * k, w * k, leaf[(tx + tz + q) % 3], turn + q * 0.4));
  }

  // ---- the Federle-Brunnen: a long, rounded basin of grey granite standing on a foot, a round block of granite at
  // one end, water jumping in the basin, and on a pole over it the Federle in bronze, swinging round the pole
  // with his legs in the air: a hat, a jagged collar, and on his back the great feather he is named after
  if (WALDSEE_FOUNTAIN.length) {
    const [bx, bz] = WALDSEE_FOUNTAIN[0];
    const x = bx + 0.6, z = bz + 0.5, granite = 0x9a9a96, bronze = 0x4f5c52, edge = 0x6f7d70;
    // the foot and the basin (rounded: three slabs of different lengths)
    box(x, 0.2, z, 0.9, 0.4, 0.7, shade(granite, 0.8));
    box(x, 0.62, z, 2.0, 0.44, 1.1, granite);
    box(x, 0.62, z, 1.6, 0.44, 1.5, granite);
    box(x, 0.62, z, 1.2, 0.44, 1.7, granite);
    lamp(x, 0.83, z, 1.5, 0.05, 1.0, 0x6fb7dc);
    lamp(x, 0.83, z, 1.1, 0.05, 1.3, 0x6fb7dc);
    // the round block at the east end, on a foot of its own, a lower step on top
    const rx = bx + 1.75;
    box(rx, 0.25, z, 0.5, 0.5, 0.5, shade(granite, 0.8));
    for (const turn of [0, Math.PI / 4]) box(rx, 0.82, z, 0.9, 0.66, 0.9, granite, turn);
    for (const turn of [0, Math.PI / 4]) box(rx, 1.2, z, 0.56, 0.12, 0.56, shade(granite, 1.06), turn);
    // three jets of water
    for (const [dx, dz, hgt] of [[-0.45, 0.1, 0.5], [-0.2, -0.25, 0.36], [0.05, 0.2, 0.62]]) lamp(x + dx, 0.85 + hgt / 2, z + dz, 0.1, hgt, 0.1, 0xdff3ff);
    // the pole and the Federle on it
    const px = x + 0.25;
    box(px, 2, z, 0.07, 3.2, 0.07, bronze);
    // (he hangs out to the west, feet first, about level)
    box(px - 0.42, 2.25, z + 0.1, 0.62, 0.3, 0.3, bronze);
    box(px - 0.42, 2.25, z + 0.1, 0.5, 0.34, 0.12, edge);
    for (const side of [-1, 1]) {
      box(px - 0.95, 2.34, z + 0.1 + side * 0.09, 0.5, 0.14, 0.13, bronze, 0, 0.25);
      box(px - 1.3, 2.2, z + 0.1 + side * 0.09, 0.3, 0.13, 0.13, bronze, 0, -0.5);
      box(px - 1.44, 2.02, z + 0.1 + side * 0.09, 0.24, 0.12, 0.14, edge);
    }
    box(px + 0.02, 2.62, z + 0.1, 0.26, 0.26, 0.26, bronze);
    box(px + 0.02, 2.8, z + 0.1, 0.4, 0.06, 0.4, edge);
    box(px + 0.02, 2.88, z + 0.1, 0.24, 0.14, 0.24, bronze);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      box(px - 0.1 + Math.cos(a) * 0.2, 2.44, z + 0.1 + Math.sin(a) * 0.2, 0.14, 0.05, 0.14, edge, a);
    }
    // his arms hold the pole, high and low
    box(px - 0.12, 2.55, z + 0.02, 0.3, 0.1, 0.1, bronze);
    box(px - 0.1, 2.02, z + 0.02, 0.1, 0.4, 0.1, bronze);
    // the feather: a long blade from his shoulder down and out behind him, and the ribbons of his hat in two bows
    box(px + 0.42, 2.05, z + 0.12, 0.2, 1.5, 0.05, bronze, 0, -0.62);
    box(px + 0.47, 2.05, z + 0.15, 0.05, 1.45, 0.02, edge, 0, -0.62);
    for (const [dy, r] of [[0.25, 0.42], [0.1, 0.3]])
      for (let k = 0; k < 7; k++) {
        const a = -0.4 + (k / 6) * 2.6;
        box(px + 0.1 + Math.cos(a) * r, 2.9 + dy + Math.sin(a) * r * 0.9, z + 0.1, 0.12, 0.035, 0.07, edge, 0, a + Math.PI / 2);
      }
  }

  // ---- parked cars: the police car, silver and blue with a yellow band, blue lights on the roof
  for (const car of WALDSEE_CARS) {
    const x = car.at[0] + 0.5, z = car.at[1] + 1;
    box(x, 0.42, z, 0.92, 0.44, 1.9, 0xdfe3e8);
    box(x, 0.42, z, 0.94, 0.2, 1.5, 0x2f5fbf);
    box(x, 0.3, z, 0.95, 0.07, 1.92, 0xe8e23a);
    box(x, 0.84, z + 0.08, 0.84, 0.4, 1.0, 0xdfe3e8);
    box(x, 0.86, z + 0.08, 0.86, 0.26, 0.9, 0x2a3440);
    box(x, 1.02, z + 0.08, 0.86, 0.06, 1.02, 0xdfe3e8);
    for (const sx of [-1, 1]) for (const sz of [-0.62, 0.62]) box(x + sx * 0.44, 0.2, z + sz, 0.14, 0.4, 0.4, 0x1c1e24);
    for (const sx of [-1, 1]) {
      lamp(x + sx * 0.22, 1.12, z + 0.08, 0.3, 0.12, 0.16, 0x3f8cff);
      lamp(x + sx * 0.32, 0.5, z - 0.96, 0.18, 0.1, 0.04, 0xfff3c0);
      lamp(x + sx * 0.32, 0.5, z + 0.96, 0.18, 0.1, 0.04, 0xff3b3b);
    }
  }

  // ---- tables: small round ones with chairs, and in the beer garden of the Hasen long ones with benches
  for (const place of WALDSEE_TABLES) {
    place.at.forEach(([tx, tz]) => {
      const x = tx + 0.5, z = tz + 0.5, turn = hash(tx, tz) * 3;
      if (place.name === 'Hasen') {
        // (a long table across, a bench before and behind it, a mug on it)
        box(x, 0.74, z, 1.5, 0.07, 0.5, 0xc9a06a);
        for (const e of [-1, 1]) box(x + e * 0.6, 0.36, z, 0.06, 0.72, 0.4, 0x4a4f5c);
        for (const side of [-1, 1]) {
          box(x, 0.44, z + side * 0.5, 1.5, 0.06, 0.22, 0xb9895a);
          for (const e of [-1, 1]) box(x + e * 0.6, 0.22, z + side * 0.5, 0.06, 0.44, 0.2, 0x4a4f5c);
        }
        lamp(x + 0.2, 0.86, z, 0.1, 0.18, 0.1, 0xf2b84c);
        return;
      }
      box(x, 0.36, z, 0.1, 0.72, 0.1, 0x4a4f5c);
      box(x, 0.74, z, 0.66, 0.06, 0.66, 0xb9895a, turn);
      for (const a of [turn, turn + Math.PI, turn + Math.PI / 2]) {
        const cx = x + Math.cos(a) * 0.62, cz = z + Math.sin(a) * 0.62;
        box(cx, 0.24, cz, 0.3, 0.06, 0.3, wood, -a);
        box(cx, 0.12, cz, 0.24, 0.24, 0.24, shade(wood, 0.7), -a);
        box(cx + Math.cos(a) * 0.14, 0.5, cz + Math.sin(a) * 0.14, 0.05, 0.5, 0.3, wood, -a);
      }
    });
  }

  // ---- the Czardas on the Hochstatt, the place to sit: a sky-blue house with a grey plinth, white corner strips and red
  // shutters; its name only on the plaque by the side door; strings of lights over the terrace and the
  // board with today's offer. The house front and its side are one painted plane each, exactly as wide as the real
  // walls, so nothing spills onto the neighbours
  {
    const f = onBlock(WALDSEE_CZARDAS), S = 64;
    // (a face moved along its wall)
    const at = (face: WaldseeFace, u: number): WaldseeFace => {
      const [x, z] = on(face, u, 0);
      return { ...face, x, z };
    };
    /** one wall of the house on a plane; `doorU` is where its door should be, from the wall's middle. Returns the door's place */
    const wallPlane = (face: WaldseeFace & OnWall, doorU: number, big: boolean, name: string): number => {
      const W = face.wall?.width ?? Math.max(3, face.len), H = face.wall?.eave ?? 4.64;
      const cw = Math.round(W * S), ch = Math.round(H * S);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const g = canvas.getContext('2d')!;
      const px = (u: number) => (u + W / 2) * S, py = (y: number) => (H - y) * S;
      const rect = (u0: number, y0: number, u1: number, y1: number, c: string) => {
        g.fillStyle = c;
        g.fillRect(px(u0), py(y1), (u1 - u0) * S, (y1 - y0) * S);
      };
      // bright sky-blue plaster, a grey plinth with a darker edge, a white strip at the east corner, shadow under the eaves
      rect(-W / 2, 0, W / 2, H, '#7096de');
      rect(-W / 2, 0, W / 2, 0.9, '#8e9ec2');
      rect(-W / 2, 0.88, W / 2, 0.95, '#6f7fa6');
      rect(-W / 2, 0, -W / 2 + 0.8, H, '#f4f2ec');
      const sh = g.createLinearGradient(0, 0, 0, 0.5 * S);
      sh.addColorStop(0, 'rgba(30,40,80,0.25)');
      sh.addColorStop(1, 'rgba(30,40,80,0)');
      g.fillStyle = sh;
      g.fillRect(0, 0, cw, 0.5 * S);
      // a window: white frame, dark panes, a cross, a sill; bright red shutters either side upstairs
      const win = (u: number, yc: number, ww: number, wh: number, shutters: boolean) => {
        if (shutters) for (const e of [-1, 1]) {
          const x0 = u + e * (ww / 2 + 0.04) - (e < 0 ? 0.3 : 0);
          rect(x0, yc - wh / 2 - 0.04, x0 + 0.3, yc + wh / 2 + 0.04, '#c42a35');
          for (let k = 1; k < 7; k++) rect(x0, yc - wh / 2 + (wh * k) / 7, x0 + 0.3, yc - wh / 2 + (wh * k) / 7 + 0.02, '#9a1d2b');
        }
        rect(u - ww / 2, yc - wh / 2, u + ww / 2, yc + wh / 2, '#f6f4ee');
        rect(u - ww / 2 + 0.05, yc - wh / 2 + 0.05, u + ww / 2 - 0.05, yc + wh / 2 - 0.05, '#4d5d6e');
        rect(u - ww / 2 + 0.05, yc + wh * 0.1, u + ww / 2 - 0.05, yc + wh / 2 - 0.05, '#7f96aa');
        rect(u - 0.02, yc - wh / 2 + 0.05, u + 0.02, yc + wh / 2 - 0.05, '#f6f4ee');
        rect(u - ww / 2 + 0.05, yc - 0.02, u + ww / 2 - 0.05, yc + 0.02, '#f6f4ee');
        rect(u - ww / 2 - 0.05, yc - wh / 2 - 0.05, u + ww / 2 + 0.05, yc - wh / 2, '#dcd8cc');
      };
      const d = Math.max(-W / 2 + 1.4, Math.min(W / 2 - 1.4, doorU));
      // (one entrance only on the front)
      const d2 = 1e9;
      const n = Math.max(2, Math.round((W - 0.8) / 1.8)), pitch = (W - 0.8) / n;
      for (let k = 0; k < n; k++) {
        const u = -W / 2 + 0.8 + (k + 0.5) * pitch;
        if (big || Math.abs(u - d) > 1.0) win(u, 3.4, 0.7, 1.0, true);
        // (the ground floor: windows on the front only; the side has just the door and the low plinth windows)
        if (big && Math.abs(u - d) > 1.1 && Math.abs(u - d2) > 1.0) win(u, 1.75, 0.7, 0.85, false);
      }
      if (big) {
        // the front: a dark brown wooden frame with a glass door and menu cards beside it
        rect(d - 0.62, 0, d + 0.62, 2.2, '#5a3322');
        rect(d - 0.52, 0, d + 0.52, 2.1, '#2b2624');
        rect(d - 0.02, 0, d + 0.02, 2.1, '#5a3322');
        rect(d - 0.58, 0, d + 0.58, 0.07, '#b9b6ae');
        rect(d + 0.7, 1.1, d + 0.95, 1.5, '#f4f1e6');
        rect(d - 0.95, 1.1, d - 0.7, 1.5, '#f4f1e6');
      } else {
        // the side: a brown wooden door in a white stone frame, an arched fanlight of small panes, a white niche with
        // a small golden saint over it, a lamp each side and a menu box; the plaque with the name on the wall at the left
        rect(d - 0.62, 0, d + 0.62, 2.2, '#f4f2ec');
        rect(d - 0.5, 0, d + 0.5, 2.1, '#8a5a36');
        rect(d - 0.5, 0, d - 0.1, 2.1, '#26211f');
        rect(d - 0.62, 2.2, d + 0.62, 2.32, '#f4f2ec');
        g.fillStyle = '#f4f2ec';
        g.beginPath();
        g.arc(px(d), py(2.3), 0.62 * S, Math.PI, 0);
        g.fill();
        g.fillStyle = '#6c7f8c';
        g.beginPath();
        g.arc(px(d), py(2.34), 0.5 * S, Math.PI, 0);
        g.fill();
        for (let k = -2; k <= 2; k++) rect(d + k * 0.18 - 0.01, 2.34, d + k * 0.18 + 0.01, 2.84, '#f4f2ec');
        rect(d - 0.5, 2.56, d + 0.5, 2.58, '#f4f2ec');
        // (the niche with the saint)
        rect(d - 0.36, 2.9, d + 0.36, 3.5, '#f4f2ec');
        g.fillStyle = '#f4f2ec';
        g.beginPath();
        g.arc(px(d), py(3.5), 0.36 * S, Math.PI, 0);
        g.fill();
        rect(d - 0.27, 2.98, d + 0.27, 3.5, '#a9b8d8');
        g.fillStyle = '#a9b8d8';
        g.beginPath();
        g.arc(px(d), py(3.5), 0.27 * S, Math.PI, 0);
        g.fill();
        rect(d - 0.1, 3.05, d + 0.1, 3.55, '#d9a93a');
        rect(d - 0.14, 2.98, d + 0.14, 3.05, '#2b2624');
        rect(d + 0.85, 1.4, d + 1.1, 1.8, '#2b2624');
        rect(d - 0.62, 0, d + 0.62, 0.07, '#b9b6ae');
        // (a basement window low in the plinth at the left, a small shop window in the plinth zone right of the door)
        const lowWin = (u0: number, u1: number, y0: number, y1: number) => {
          rect(u0, y0, u1, y1, '#f4f2ec');
          rect(u0 + 0.05, y0 + 0.05, u1 - 0.05, y1 - 0.05, '#26303c');
        };
        lowWin(d - 3.2, d - 2.4, 0.2, 0.7);
        lowWin(d + 1.5, d + 2.6, 0.2, 0.75);
        // the plaque: white, a thin dark frame, dark serif letters, on the wall left of the door at about door-top height
        const pu = d - 2.0;
        rect(pu - 0.8, 1.7, pu + 0.8, 2.3, '#4a4a52');
        rect(pu - 0.78, 1.72, pu + 0.78, 2.28, '#f6f4ee');
        g.fillStyle = '#34343a';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${Math.round(0.24 * S)}px Georgia, "Times New Roman", serif`;
        g.fillText(name, px(pu), py(2.1));
        g.font = `${Math.round(0.12 * S)}px Georgia, "Times New Roman", serif`;
        g.fillText('CAFÉ - BAR', px(pu), py(1.86));
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(W, H), mat = new THREE.MeshLambertMaterial({ map: tex });
      disposables.push(tex, geo, mat);
      const m = new THREE.Mesh(geo, mat);
      const [mx, mz] = on(face, -(face.wall?.along ?? 0), 0.04);
      m.position.set(mx, H / 2, mz);
      m.rotation.y = faceYaw(face);
      add(m);
      return d;
    };
    // (the front: the one door in the middle, no lettering)
    const alongF = f.wall?.along ?? 0;
    const door = at(f, wallPlane(f, 0, true, 'CZARDAS') - alongF);
    // (the terrace is centred on its tables, not on the door)
    const tab = WALDSEE_TABLES.find(p => p.name === 'Czardas')?.at ?? [];
    const mx = tab.reduce((a, [x]) => a + x + 0.5, 0) / Math.max(1, tab.length), mz = tab.reduce((a, [, z]) => a + z + 0.5, 0) / Math.max(1, tab.length);
    const terrace = tab.length ? at(f, (mx - f.x) * -f.dz + (mz - f.z) * f.dx) : door;
    const out = 5.4, bulbs = [0xffd76a, 0xff8a5a, 0x7fe0c0, 0xfff1c0], w = 3;
    for (const side of [-1, 0, 1]) {
      const [px, pz] = on(terrace, side * (w / 2 + 1.6), out);
      box(px, 1.5, pz, 0.07, 3, 0.07, 0x3a3f52);
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, sag = Math.sin(Math.PI * t) * 0.4;
        const [sx, sz] = on(terrace, side * (w / 2) * (1 - t) + side * (w / 2 + 1.6) * t, 0.1 + (out - 0.1) * t);
        lamp(sx, 2.9 + 0.1 * t - sag, sz, 0.09, 0.09, 0.09, bulbs[k % 4]);
      }
    }
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const [sx, sz] = on(terrace, -w / 2 - 1.6 + (w + 3.2) * t, out);
      lamp(sx, 3 - Math.sin(Math.PI * ((t * 2) % 1)) * 0.25, sz, 0.09, 0.09, 0.09, bulbs[k % 4]);
    }
    // the two trees of the terrace stand in square grates with a low metal guard rail round them
    for (const [tx, tz] of [[53, 48], [50, 46]]) {
      const x = tx + 0.5, z = tz + 0.5;
      box(x, 0.02, z, 1.3, 0.04, 1.3, 0x55585e);
      for (const e of [-1, 1]) {
        box(x + e * 0.65, 0.3, z, 0.05, 0.05, 1.3, 0x3a3f4a);
        box(x, 0.3, z + e * 0.65, 1.3, 0.05, 0.05, 0x3a3f4a);
        for (const q of [-1, 1]) box(x + e * 0.65, 0.15, z + q * 0.65, 0.05, 0.3, 0.05, 0x3a3f4a);
      }
    }
    // a lamp post with a round white globe by the east end of the front
    {
      const [lx, lz] = on(f, -(f.wall?.width ?? 3) / 2 + 0.5 - alongF, 1.6);
      box(lx, 1.6, lz, 0.1, 3.2, 0.1, 0x26282e);
      lamp(lx, 3.3, lz, 0.4, 0.4, 0.4, 0xf4f1ea);
    }
    // its second door, on the side toward the Hauptstrasse: the same house, a small board with its name over it
    if (WALDSEE_CZARDAS_SIDE) {
      const sd = onBlock(WALDSEE_CZARDAS_SIDE), alongS = sd.wall?.along ?? 0;
      const door2 = at(sd, wallPlane(sd, 0, false, 'Czardas') - alongS);
      // (a small lamp each side of the door)
      for (const e of [-1, 1]) {
        const [lx, lz] = on(door2, e * 0.78, 0.1);
        lamp(lx, 1.9, lz, 0.14, 0.26, 0.14, 0xffd76a);
      }
    }
    const [cx, cz] = on(door, 1.5, 1.0);
    box(cx, 0.45, cz, 0.5, 0.9, 0.08, 0x2a2d33, 0.5);
    box(cx, 0.45, cz + 0.05, 0.4, 0.5, 0.02, 0xf4f1ea, 0.5);
  }

  // ---- the big rounded corner house across the square from the ice-cream parlour: cream plaster, a grey plinth and
  // cornice, white-framed windows in grey surrounds in even rows on every street-facing wall segment of the real
  // building (each segment one textured plane flush on it, clipped to the wall's outline), a flat entrance with a
  // stone frame, a bench, bollards and a bicycle rack at the wall. Nothing of it is solid.
  {
    const id = (onBlock(CORNER_HOUSE) as OnWall).wall?.id;
    const S = 64;
    const feet = id === undefined ? [] : wallFeet().filter(w => {
      if (w.id !== id) return false;
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0), mx = (w.x0 + w.x1) / 2 + w.nx * 0.7, mz = (w.z0 + w.z1) / 2 + w.nz * 0.7;
      const gd = waldseeGround(Math.floor(mx), Math.floor(mz));
      return len > 0.45 && gd !== 'house' && gd !== 'water';
    });
    // (the entrance: on the longest segment looking at the ice-cream parlour, its middle `DOOR` tiles from the
    // segment's end toward the rounded corner)
    const DOOR = 1.9, RACK = [0.12, 1.32];
    let main: Foot | undefined;
    for (const w of feet) if (w.nx * CORNER_HOUSE.dx + w.nz * CORNER_HOUSE.dz > 0.9 && (!main || Math.hypot(w.x1 - w.x0, w.z1 - w.z0) > Math.hypot(main.x1 - main.x0, main.z1 - main.z0))) main = w;
    // (whether a segment's second foot is its end toward the rounded corner)
    const toCorner = (w: Foot) => Math.hypot(w.x1 - CORNER_ROUND[0], w.z1 - CORNER_ROUND[1]) < Math.hypot(w.x0 - CORNER_ROUND[0], w.z0 - CORNER_ROUND[1]);
    for (const w of feet) {
      const L = Math.hypot(w.x1 - w.x0, w.z1 - w.z0), ex = (w.x1 - w.x0) / L, ez = (w.z1 - w.z0) / L;
      // (the canvas runs along the plane's own x axis: (nz, -nx); `flip` when the wall's first foot lies at its far end)
      const flip = ex * w.nz - ez * w.nx < 0;
      const cu = (t: number) => (flip ? L - t : t);
      const ymax = Math.max(...w.prof.map(p => p[1]));
      const H = Math.ceil(ymax * S) / S, E = w.eave;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(8, Math.round(L * S));
      canvas.height = Math.round(H * S);
      const g = canvas.getContext('2d')!;
      const px = (u: number) => u * S, py = (y: number) => (H - y) * S;
      const rect = (u: number, y0: number, y1: number, ww: number, c: string | CanvasGradient) => {
        g.fillStyle = c;
        g.fillRect(px(u), py(y1), ww * S, (y1 - y0) * S);
      };
      // only inside the wall's outline (the gable and mansard stand higher than the eaves)
      g.beginPath();
      w.prof.forEach(([t, y], i) => (i ? g.lineTo(px(cu(t)), py(y)) : g.moveTo(px(cu(t)), py(y))));
      g.closePath();
      g.clip();
      rect(0, 0, H, L, '#eee3bd');
      rect(0, 0, 0.55, L, '#a3a4a6');
      rect(0, 0.55, 0.6, L, '#8f9094');
      // the slim grey cornice over the ground floor, a darker band at the eaves
      rect(0, 2.0, 2.12, L, '#b5b3ad');
      if (E < H - 0.3) rect(0, E - 0.02, E + 0.1, L, '#b5b3ad');
      // the windows: as many as fit 1.3 tiles apart, spread along the segment so the rows run on round the curve
      const n = Math.max(L > 0.8 ? 1 : 0, Math.round(L / 1.3));
      const doorU = w === main ? cu(toCorner(w) ? L - DOOR : DOOR) : -9;
      const win = (u: number, y0: number, y1: number, ww: number) => {
        rect(u - ww / 2 - 0.07, y0 - 0.07, y1 + 0.07, ww + 0.14, '#9a9ca0');
        rect(u - ww / 2, y0, y1, ww, '#fbf8f0');
        const glass = g.createLinearGradient(0, py(y1), 0, py(y0));
        glass.addColorStop(0, '#7f97a4');
        glass.addColorStop(1, '#566a76');
        rect(u - ww / 2 + 0.05, y0 + 0.05, y1 - 0.05, ww - 0.1, glass);
        rect(u - 0.02, y0 + 0.05, y1 - 0.05, 0.04, '#fbf8f0');
        rect(u - ww / 2 + 0.05, y1 - 0.28, y1 - 0.25, ww - 0.1, '#fbf8f0');
        rect(u - ww / 2 - 0.09, y0 - 0.1, y0 - 0.03, ww + 0.18, '#a7a8ab');
      };
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) * (L / n);
        for (let fl = 0; fl * 2 < ymax - 0.6; fl++) {
          const f0 = fl * 2, top = Math.min(ymax, f0 + 2);
          if (fl === 0) {
            if (Math.abs(u - doorU) > 0.85) win(u, 0.75, 1.75, 0.6);
          } else if (top - f0 >= 1.8 || f0 + 2 <= E + 0.1) win(u, f0 + 0.55, f0 + 1.55, 0.6);
          else if (top - f0 >= 1.1) win(u, f0 + 0.3, f0 + 0.95, 0.5);
        }
      }
      // the entrance: a flat door in a grey stone frame with pilasters and a lintel
      if (w === main && doorU > 0) {
        rect(doorU - 0.55, 0, 1.95, 0.14, '#a3a4a6');
        rect(doorU + 0.41, 0, 1.95, 0.14, '#a3a4a6');
        rect(doorU - 0.58, 1.78, 1.95, 1.16, '#a3a4a6');
        rect(doorU - 0.41, 0, 1.78, 0.82, '#ddd2b0');
        rect(doorU - 0.41, 0, 1.78, 0.82, 'rgba(120,100,60,0.12)');
        rect(doorU - 0.02, 0, 1.78, 0.03, '#b8ad8c');
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(L, H), mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
      disposables.push(tex, geo, mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set((w.x0 + w.x1) / 2 + w.nx * 0.04, H / 2, (w.z0 + w.z1) / 2 + w.nz * 0.04);
      m.rotation.y = Math.atan2(w.nx, w.nz);
      add(m);
      // the bollards: low grey stones along the other walls looking the same way, and nothing else solid
      if (main && w.nx * main.nx + w.nz * main.nz > 0.9 && w !== main) {
        const k = Math.floor(L / 0.9);
        for (let i = 0; i < k; i++) {
          const t = (i + 0.5) * (L / k);
          box(w.x0 + ex * t + w.nx * 0.35, 0.22, w.z0 + ez * t + w.nz * 0.35, 0.12, 0.44, 0.12, 0xa9aaad);
        }
      }
      if (w === main) {
        // (distances from the segment's end toward the rounded corner: `at(d)` is that spot, `out` off the wall)
        const east = toCorner(w) ? 1 : 0;
        const at = (d: number, out: number): [number, number] => {
          const t = east ? L - d : d;
          return [w.x0 + ex * t + w.nx * out, w.z0 + ez * t + w.nz * out];
        };
        // the bench by the entrance: a wooden seat on two grey ends
        {
          const [bx, bz] = at(DOOR + 1.15, 0.3), yaw = Math.atan2(w.nx, w.nz);
          box(bx, 0.27, bz, 0.9, 0.05, 0.28, 0x8b5a34, yaw);
          for (const e of [-0.38, 0.38]) box(bx + ex * e, 0.12, bz + ez * e, 0.06, 0.24, 0.26, 0x8f9094, yaw);
        }
        // the bicycle rack: six little metal hoops in a row, two bikes standing in them
        const mat2 = new THREE.MeshLambertMaterial({ color: 0x6f747a });
        disposables.push(mat2);
        const bar = (len: number) => {
          const geo2 = new THREE.BoxGeometry(len, 0.025, 0.025);
          disposables.push(geo2);
          return geo2;
        };
        const hoopTop = bar(0.18), hoopLeg = new THREE.BoxGeometry(0.025, 0.4, 0.025);
        disposables.push(hoopLeg);
        const tx = ex * (east ? -1 : 1), tz = ez * (east ? -1 : 1);
        const tangentYaw = Math.atan2(-tz, tx);
        for (let i = 0; i < 6; i++) {
          const d = RACK[0] + 0.1 + i * ((RACK[1] - RACK[0] - 0.2) / 5);
          const [hx, hz] = at(d, 0.26);
          const grp = new THREE.Group();
          const top = new THREE.Mesh(hoopTop, mat2);
          top.position.set(0, 0.4, 0);
          top.rotation.y = Math.PI / 2;
          grp.add(top);
          for (const s of [-1, 1]) {
            const leg = new THREE.Mesh(hoopLeg, mat2);
            leg.position.set(0, 0.2, s * 0.09);
            leg.rotation.y = Math.PI / 2;
            grp.add(leg);
          }
          grp.position.set(hx, 0, hz);
          grp.rotation.y = tangentYaw;
          add(grp);
        }
        // two bikes: two wheels, a frame, a saddle and bars, standing against the wall's rack, one red, one blue
        const wheelGeo = new THREE.TorusGeometry(0.17, 0.014, 5, 16), wheelMat = new THREE.MeshLambertMaterial({ color: 0x23262a });
        disposables.push(wheelGeo, wheelMat);
        for (const [d, col] of [[RACK[0] + 0.3, 0xb8322a], [RACK[0] + 0.75, 0x2f5aa8]] as [number, number][]) {
          const [bx, bz] = at(d, 0.4);
          const grp = new THREE.Group();
          const fm = new THREE.MeshLambertMaterial({ color: col });
          disposables.push(fm);
          for (const s of [-1, 1]) {
            const wh = new THREE.Mesh(wheelGeo, wheelMat);
            wh.position.set(s * 0.27, 0.18, 0);
            grp.add(wh);
          }
          const part = (sx: number, sy: number, x: number, y: number, rz: number) => {
            const gp = new THREE.BoxGeometry(sx, sy, 0.02);
            disposables.push(gp);
            const mm = new THREE.Mesh(gp, fm);
            mm.position.set(x, y, 0);
            mm.rotation.z = rz;
            grp.add(mm);
          };
          part(0.5, 0.025, 0, 0.3, 0.12);
          part(0.3, 0.025, -0.1, 0.22, -0.9);
          part(0.18, 0.025, -0.2, 0.42, 0);
          part(0.14, 0.025, 0.26, 0.42, 0);
          part(0.2, 0.025, 0.22, 0.3, 1.2);
          grp.position.set(bx, 0, bz);
          grp.rotation.y = tangentYaw;
          add(grp);
        }
      }
    }
  }

  // ---- names over doors, each with what belongs to the place
  for (const s0 of WALDSEE_SIGNS) {
    // (the AmannLabs shop is a building of its own: its window and name stay on its own front)
    const s = s0.kind === 'amannlabs' ? s0 : onBlock(s0);
    const w = Math.max(2, Math.min(4, s.len));
    if (s.kind === 'amannlabs') {
      // the house is a modern tech building with a glass front under a red-tiled gable roof; the lit ground floor
      // holds the shop window with the robots, the name glowing above
      {
        // the house fills the gap between the real house to its left and the one to its right (their walls are
        // measured from the LoD2 feet: the left one at x 22.3 to 21.7, the right one at x 29.3 to 30.5), flush with
        // them. The front stands on z 50 between the two side-alleys (x 22-23 and x 29-30, which stay walkable); behind
        // the alleys two wings of the house close them as dead ends, up to the neighbours' walls. A gable roof of dark slate
        // tiles, the eaves as high as the neighbours', all four sides in the same dark glass
        const X0 = 23, X1 = 29, Z0 = 44, Z1 = 50, W = X1 - X0, cx = (X0 + X1) / 2, E = 6.2, RISE = 3.6, S = 80;
        const leftX = (z: number) => 21.65 + Math.max(0, z - 46.55) * 0.193;
        const rightX = (z: number) => 28.31 + (z - 40.09) * 0.245;
        // the glass front of the house: dark glass, light mullions, a glowing cyan line under the eaves, four lit windows
        const curtain = (wB: number, hB: number, front = true): HTMLCanvasElement => {
          const cw = Math.round(wB * S), ch = Math.round(hB * S), c = document.createElement('canvas');
          c.width = cw;
          c.height = ch;
          const g = c.getContext('2d')!;
          const sky = g.createLinearGradient(0, 0, 0, ch);
          sky.addColorStop(0, '#24415c');
          sky.addColorStop(0.5, '#12202e');
          sky.addColorStop(1, '#0b141d');
          g.fillStyle = sky;
          g.fillRect(0, 0, cw, ch);
          const colW = 0.75, rowH = 1.05;
          for (let yy = 0; yy < hB - 0.01; yy += rowH)
            for (let xx = 0; xx < wB - 0.01; xx += colW) {
              const hh = Math.min(rowH, hB - yy);
              g.fillStyle = ((Math.round(xx / colW) + Math.round(yy / rowH)) & 1) ? '#17293b' : '#12202e';
              g.fillRect(xx * S + 2, (hB - yy - hh) * S + 2, colW * S - 4, hh * S - 4);
              g.fillStyle = 'rgba(120,200,255,0.06)';
              g.fillRect(xx * S + 2, (hB - yy - hh) * S + 2, colW * S - 4, hh * S * 0.4);
            }
          g.strokeStyle = '#3b566f';
          g.lineWidth = 2;
          for (let xx = 0; xx <= wB + 0.001; xx += colW) {
            g.beginPath();
            g.moveTo(xx * S, 0);
            g.lineTo(xx * S, ch);
            g.stroke();
          }
          for (let yy = 0; yy <= hB + 0.001; yy += rowH) {
            g.beginPath();
            g.moveTo(0, (hB - yy) * S);
            g.lineTo(cw, (hB - yy) * S);
            g.stroke();
          }
          g.fillStyle = '#2bf0ff';
          g.fillRect(0, 0, cw, 0.1 * S);
          g.fillStyle = 'rgba(43,240,255,0.22)';
          g.fillRect(0, 0.1 * S, cw, 0.2 * S);
          // (four lit windows over the shop: two storeys, left and right of the middle)
          for (const ci of front ? [1, 5] : [])
            for (const y0 of [3.85, 4.95]) {
              const x = ci * colW * S, y = (hB - y0 - 0.95) * S, w = 2 * colW * S, h = 0.95 * S;
              g.fillStyle = 'rgba(43,240,255,0.35)';
              g.fillRect(x, y, w, h);
              g.fillStyle = '#1de6ff';
              g.fillRect(x + 3, y + 3, w - 6, h - 6);
            }
          if (front) {
            g.fillStyle = '#0a1017';
            g.fillRect(0, (hB - 2.5) * S, cw, ch - (hB - 2.5) * S);
            g.fillStyle = '#2bf0ff';
            g.fillRect(0, (hB - 2.5) * S - 2, cw, 3);
          }
          return c;
        };
        // a wall from a to b (its outward side is on the left of a to b, looking down), h high
        const wallQ = (ax: number, az: number, bx: number, bz: number, h: number, canvas: HTMLCanvasElement, off = 0.02) => {
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
          const geo = new THREE.PlaneGeometry(len, h), mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
          disposables.push(tex, geo, mat);
          const m = new THREE.Mesh(geo, mat);
          m.position.set((ax + bx) / 2 + nx * off, h / 2, (az + bz) / 2 + nz * off);
          m.rotation.y = Math.atan2(nx, nz);
          add(m);
        };
        const flat = (pts: [number, number][], y: number, color: number) => {
          const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
          geo.rotateX(-Math.PI / 2);
          const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
          disposables.push(geo, mat);
          const m = new THREE.Mesh(geo, mat);
          m.position.y = y;
          add(m);
        };
        // walls: the glass front, the plaster sides and wings, the back
        wallQ(X0, Z1, X1, Z1, E, curtain(W, E), 0.02);
        wallQ(X0, 47, X0, Z1, E, curtain(Z1 - 47, E, false));
        wallQ(X1, Z1, X1, 49, E, curtain(Z1 - 49, E, false));
        const wl = 21.7, wr = rightX(49), hw = E;
        wallQ(leftX(47), 47, X0, 47, hw, curtain(X0 - leftX(47), hw, false));
        wallQ(X1, 49, wr, 49, hw, curtain(wr - X1, hw, false));
        wallQ(rightX(Z0), Z0, wl, Z0, hw, curtain(rightX(Z0) - wl, hw, false));
        // (and the sides behind and between the wings, so the house is shut all round)
        wallQ(X0, Z0, X0, 47, E, curtain(3, E, false));
        wallQ(X1, 49, X1, Z0, E, curtain(5, E, false));
        wallQ(wl, Z0, leftX(47), 47, E, curtain(3, E, false));
        wallQ(wr, 49, rightX(Z0), Z0, E, curtain(5, E, false));
        for (const ex of [X0, X1]) box(ex, E / 2, Z1, 0.16, E, 0.16, 0x141c28);
        // the wings: flat tiled tops under the eaves of the main roof
        flat([[wl, Z0], [X0, Z0], [X0, 47], [leftX(47), 47]], hw, 0x1c222c);
        flat([[X1, Z0], [rightX(Z0), Z0], [wr, 49], [X1, 49]], hw, 0x1c222c);
        // a glass door on the west side, opening onto the left alley
        {
          const dz = 48.5, dx = X0 - 0.16;
          box(dx, 1.22, dz, 0.14, 2.44, 1.1, 0x11192a);
          box(dx - 0.16, 2.62, dz, 0.66, 0.12, 1.3, 0x11192a);
          const gd = new THREE.PlaneGeometry(0.85, 2.1);
          const gm = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.5, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
          disposables.push(gd, gm);
          const dm = new THREE.Mesh(gd, gm);
          dm.position.set(dx - 0.09, 1.15, dz);
          dm.rotation.y = Math.PI / 2;
          add(dm);
          lamp(dx - 0.14, 1.15, dz + 0.45, 0.06, 0.5, 0.06, 0x2bf0ff);
        }
        // the roof: a gable roof of dark slate tiles, the ridge running back from the street, a little overhang; the gables in plaster
        {
          const ov = 0.3, drop = (ov * RISE) / (W / 2), yE = E - drop, yR = E + RISE;
          const tc = document.createElement('canvas');
          tc.width = 64;
          tc.height = 64;
          const tg = tc.getContext('2d')!;
          tg.fillStyle = '#2b3340';
          tg.fillRect(0, 0, 64, 64);
          tg.fillStyle = '#171c25';
          for (let r = 0; r < 4; r++) {
            tg.fillRect(0, r * 16, 64, 2);
            for (let k = 0; k < 4; k++) tg.fillRect(k * 16 + (r & 1) * 8, r * 16, 2, 16);
          }
          const tt = new THREE.CanvasTexture(tc);
          tt.colorSpace = THREE.SRGBColorSpace;
          tt.wrapS = tt.wrapT = THREE.RepeatWrapping;
          const tm = new THREE.MeshLambertMaterial({ map: tt, side: THREE.DoubleSide });
          const pm = new THREE.MeshLambertMaterial({ color: 0x141c28, side: THREE.DoubleSide });
          disposables.push(tt, tm, pm);
          const zA = Z1 + ov, zB = Z0 - ov, len = Math.hypot(W / 2 + ov, yR - yE);
          const slope = (xe: number) => {
            const pos = [xe, yE, zA, xe, yE, zB, cx, yR, zB, xe, yE, zA, cx, yR, zB, cx, yR, zA];
            const u = zA - zB, v = len / 0.9;
            const uv = [u, 0, 0, 0, 0, v, u, 0, 0, v, u, v];
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
            geo.computeVertexNormals();
            disposables.push(geo);
            add(new THREE.Mesh(geo, tm));
          };
          slope(X0 - ov);
          slope(X1 + ov);
          for (const z of [Z1, Z0]) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute([X0, E, z, X1, E, z, cx, yR, z], 3));
            geo.computeVertexNormals();
            disposables.push(geo);
            add(new THREE.Mesh(geo, pm));
          }
        }
      }
      const ww = Math.max(3, Math.min(5, s.len)) - 0.4;
      const dep = 0.7, gy = 1.3, gh = 2.2, topY = gy + gh / 2, botY = gy - gh / 2, bx = 26;
      // the lit backdrop just in front of the wall
      onFace(s, 0, 0.04, gy, ww, gh, 0.04, 0xcfefff, true);
      // the robots stand inside the case
      const robots = [0x2bf0ff, 0xff2bd6, 0xffc928, 0x7fe0c0];
      const count = 4;
      for (let k = 0; k < count; k++) {
        const a = -ww / 2 + ((k + 0.5) * ww) / count, c = robots[k % robots.length], tall = 0.9 + 0.25 * (k % 2);
        onFace(s, a, 0.14, 0.34, 0.34, 0.1, 0.18, 0x3a3f52);
        for (const leg of [-1, 1]) onFace(s, a + leg * 0.1, 0.14, 0.55, 0.1, 0.34, 0.1, 0x9aa3b5);
        onFace(s, a, 0.14, 0.72 + tall * 0.22, 0.4, tall * 0.44, 0.2, 0xd0d4e0);
        onFace(s, a, 0.25, 0.74 + tall * 0.22, 0.16, 0.12, 0.02, c, true);
        for (const arm of [-1, 1]) onFace(s, a + arm * 0.26, 0.14, 0.7 + tall * 0.24, 0.08, tall * 0.36, 0.1, 0x9aa3b5);
        onFace(s, a, 0.14, 0.8 + tall * 0.56, 0.32, 0.26, 0.2, 0xe6e8ef);
        for (const eye of [-1, 1]) onFace(s, a + eye * 0.08, 0.25, 0.82 + tall * 0.56, 0.07, 0.07, 0.02, c, true);
        onFace(s, a, 0.14, 1.0 + tall * 0.56, 0.03, 0.16, 0.03, 0x3a3f52);
        onFace(s, a, 0.25, 1.1 + tall * 0.56, 0.08, 0.08, 0.08, c, true);
      }
      // the glass display case: front, two sides and top in glass, a dark frame and base
      {
        const glass = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.14, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
        disposables.push(glass);
        const pane = (w: number, h: number, x: number, y: number, z: number, ry: number, rx = 0) => {
          const geo = new THREE.PlaneGeometry(w, h), m = new THREE.Mesh(geo, glass);
          disposables.push(geo);
          m.position.set(x, y, z);
          m.rotation.set(rx, ry, 0);
          add(m);
        };
        pane(ww, gh, bx, gy, 50 + dep, 0);
        pane(dep, gh, bx - ww / 2, gy, 50 + dep / 2, -Math.PI / 2);
        pane(dep, gh, bx + ww / 2, gy, 50 + dep / 2, Math.PI / 2);
        pane(ww, dep, bx, topY, 50 + dep / 2, 0, -Math.PI / 2);
        const fr = 0x1a1840;
        box(bx, topY, 50 + dep, ww + 0.14, 0.1, 0.1, fr);
        box(bx, botY, 50 + dep, ww + 0.14, 0.1, 0.1, fr);
        for (const sx of [-1, 1]) {
          box(bx + sx * (ww / 2), gy, 50 + dep, 0.1, gh + 0.16, 0.1, fr);
          box(bx + sx * (ww / 2), topY, 50 + dep / 2, 0.1, 0.1, dep, fr);
          box(bx + sx * (ww / 2), botY, 50 + dep / 2, 0.1, 0.1, dep, fr);
        }
        box(bx, botY - 0.04, 50 + dep / 2, ww, 0.08, dep, fr);
      }
      sign(s, 'AmannLabs', 3.3, Math.min(ww, 3.6), { back: '#1a1840', ink: '#ffffff', rim: '#2bf0ff' }, 'bold 78px "Helvetica Neue", Arial, sans-serif', markUrl);
      continue;
    }
    if (s.kind === 'amadeus') {
      // the Amadeus: a two-storey front under a tall gable, painted flush on its real wall (the plane is as high as the
      // gable's tip and clipped to the wall's outline): the canopy band low over the ground floor, the name over it,
      // two grey-framed lit windows on the first floor and a small one high in the gable. Below the canopy the cream
      // ground floor: a wooden glazed door up three steps, the "Burgers" chalkboard, a white-framed glass front with
      // the violet light inside it. Before it: the blade sign, an olive tree with lights, bistro tables.
      const wl = (s as OnWall).wall, W = wl?.width ?? 4, E = wl?.eave ?? 3.3, S = 80, mid = -(wl?.along ?? 0);
      const prof: [number, number][] = wl?.prof ?? [[-W / 2, 0], [W / 2, 0], [W / 2, E], [-W / 2, E]];
      const H = Math.max(E, ...prof.map(p => p[1]));
      const cw = Math.round(W * S), ch = Math.round(H * S);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const g = canvas.getContext('2d')!;
      const px = (u: number) => (u + W / 2) * S;
      const py = (y: number) => (H - y) * S;
      const CAN = 1.55;
      // the wall's outline: nothing is painted outside it
      g.beginPath();
      prof.forEach(([u, y], i) => (i ? g.lineTo(px(u), py(y)) : g.moveTo(px(u), py(y))));
      g.closePath();
      g.clip();
      g.fillStyle = '#ece6d4';
      g.fillRect(0, 0, cw, ch);
      // a window: grey frame, warm lit room, a middle bar and a sill
      const win = (u: number, yc: number, ww: number, wh: number) => {
        g.fillStyle = '#8a8d92';
        g.fillRect(px(u - ww / 2), py(yc + wh / 2), ww * S, wh * S);
        g.fillStyle = '#f0c98a';
        g.fillRect(px(u - ww / 2 + 0.06), py(yc + wh / 2 - 0.06), (ww - 0.12) * S, (wh - 0.12) * S);
        g.fillStyle = '#f7f1e4';
        g.fillRect(px(u - 0.02), py(yc + wh / 2 - 0.06), 0.04 * S, (wh - 0.12) * S);
        g.fillStyle = '#7a7d82';
        g.fillRect(px(u - ww / 2 - 0.05), py(yc - wh / 2 - 0.04), (ww + 0.1) * S, 0.06 * S);
      };
      const yw = Math.max(CAN + 1.2, E - 0.55);
      win(-W / 2 + W * 0.36, yw, 0.62, 0.78);
      win(-W / 2 + W * 0.7, yw, 0.62, 0.78);
      // the tinsel along the sills
      g.strokeStyle = '#a4a9b0';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px(-W / 2), py(yw - 0.35));
      g.quadraticCurveTo(px(-W / 2 + W * 0.53), py(yw - 0.6), px(W / 2), py(yw - 0.35));
      g.stroke();
      // a small window high in the gable, where the wall is high enough
      const gy = yw + 1.15;
      if (H > gy + 0.45) win(-W / 2 + W * 0.5, gy, 0.4, 0.5);
      // the ground floor: cream, recessed under the canopy
      g.fillStyle = '#e9e3d2';
      g.fillRect(0, py(CAN), cw, CAN * S);
      // the canopy band along the whole front, with a light edge
      g.fillStyle = '#f2efe8';
      g.fillRect(0, py(CAN + 0.3), cw, 0.04 * S);
      g.fillStyle = '#5a5d62';
      g.fillRect(0, py(CAN + 0.26), cw, 0.26 * S);
      // the name over the canopy: a big red A, the rest smaller, and the trade below it
      g.fillStyle = '#8c1f2a';
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      const big = `${Math.round(0.42 * S)}px Georgia, "Times New Roman", serif`, small = `${Math.round(0.25 * S)}px Georgia, "Times New Roman", serif`;
      g.font = big;
      const wa = g.measureText('A').width;
      g.font = small;
      const wr = g.measureText('MADEUS').width, tot = wa + wr + 2, sc = Math.min(1, (0.56 * cw) / tot);
      const nx = cw * 0.58 - (tot * sc) / 2, base = CAN + 0.7;
      g.save();
      g.translate(nx, py(base));
      g.scale(sc, 1);
      g.font = big;
      g.fillText('A', 0, 0);
      g.fillStyle = '#2a2428';
      g.font = small;
      g.fillText('MADEUS', wa + 2, 0);
      g.restore();
      g.fillStyle = '#2a2428';
      g.font = `${Math.round(0.11 * S)}px Georgia, "Times New Roman", serif`;
      g.textAlign = 'center';
      g.fillText('Bar · Lounge · Restaurant', nx + (tot * sc) / 2, py(base - 0.2));
      // downstairs: a wooden glazed door at the left, the black chalkboard, then the glass front
      const du = -W / 2 + 0.75, dw = 0.6, dh = 1.25;
      g.fillStyle = '#b97a3e';
      g.fillRect(px(du - dw / 2), py(dh + 0.1), dw * S, dh * S);
      g.fillStyle = '#e8c68a';
      for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 3; c2++) g.fillRect(px(du - dw / 2 + 0.06 + c2 * 0.17), py(dh + 0.03 - r * 0.22), 0.14 * S, 0.19 * S);
      const bu = du + dw / 2 + 0.38;
      g.fillStyle = '#17171a';
      g.fillRect(px(bu - 0.22), py(1.3), 0.44 * S, 0.62 * S);
      g.fillStyle = '#e8e4da';
      g.textAlign = 'center';
      g.font = `${Math.round(0.07 * S)}px Georgia, serif`;
      g.fillText('Delicious', px(bu), py(1.2));
      g.fillText('BURGERS', px(bu), py(1.1));
      g.fillStyle = '#c9a878';
      g.fillRect(px(bu - 0.1), py(0.98), 0.2 * S, 0.14 * S);
      const gx0 = bu + 0.4, gx1 = W / 2 - 0.1;
      if (gx1 - gx0 > 0.6) {
        g.fillStyle = '#f4f1ea';
        g.fillRect(px(gx0), py(1.45), (gx1 - gx0) * S, 1.25 * S);
        const glass = g.createLinearGradient(0, py(1.4), 0, py(0.3));
        glass.addColorStop(0, '#5a2a8a');
        glass.addColorStop(0.6, '#7a3fb0');
        glass.addColorStop(1, '#43275f');
        g.fillStyle = glass;
        g.fillRect(px(gx0 + 0.05), py(1.4), (gx1 - gx0 - 0.1) * S, 1.1 * S);
        // a poster in the right half ("TO GO") and the white frame bar
        g.fillStyle = '#2a1d34';
        g.fillRect(px((gx0 + gx1) / 2 + 0.04), py(1.3), ((gx1 - gx0) / 2 - 0.12) * S, 0.9 * S);
        g.fillStyle = '#f4f1ea';
        g.fillRect(px((gx0 + gx1) / 2 - 0.025), py(1.4), 0.05 * S, 1.1 * S);
        g.font = `bold ${Math.round(0.09 * S)}px Arial, sans-serif`;
        g.fillText('TO GO', px((gx0 + gx1) / 2 + (gx1 - gx0) / 4), py(0.45));
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(W, H);
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
      disposables.push(tex, geo, mat);
      const m = new THREE.Mesh(geo, mat);
      const [fx, fz] = on(s, mid, 0.04);
      m.position.set(fx, H / 2, fz);
      m.rotation.y = faceYaw(s);
      add(m);
      // (the canvas runs against the face's `along`: a point `u` across it lies at `mid - u`)
      // the canopy sticks out a little over the front
      onFace(s, mid, 0.18, CAN + 0.1, W - 0.1, 0.08, 0.36, 0x5a5d62);
      // three grey stone steps up to the door
      for (let k = 0; k < 3; k++) onFace(s, mid + W / 2 - 0.75, 0.1 + (2 - k) * 0.15, 0.04 + k * 0.04, 0.9, 0.08 + k * 0.08, 0.15, 0x8c8e90);
      // the blade sign on its iron arm: up at the left corner of the front, clear of the name: a white board, a red A
      const bx = mid + W / 2 - 0.22;
      onFace(s, bx, 0.22, yw + 0.3, 0.04, 0.04, 0.45, 0x1a1a1c);
      onFace(s, bx, 0.46, yw, 0.04, 0.4, 0.3, 0xf4f1ea);
      onFace(s, bx, 0.47, yw + 0.02, 0.05, 0.2, 0.14, 0xb8322a);
      // the olive tree with fairy lights left of the steps, and two bistro tables with red-blanketed chairs
      onFace(s, mid + W / 2 - 0.2, 0.6, 0.15, 0.3, 0.3, 0.3, 0x3a3a3e);
      onFace(s, mid + W / 2 - 0.2, 0.6, 0.6, 0.06, 0.6, 0.06, 0x5a4a3a);
      onFace(s, mid + W / 2 - 0.2, 0.6, 1.0, 0.45, 0.55, 0.45, 0x5f7a4a);
      onFace(s, mid + W / 2 - 0.2, 0.6, 1.0, 0.48, 0.3, 0.48, 0xffe9a8, true);
      for (const u of [0.1, 0.9]) {
        const tu = mid - ((gx0 + gx1) / 2 + u - 0.5);
        onFace(s, tu, 0.75, 0.42, 0.34, 0.04, 0.34, 0x2a2a2e);
        onFace(s, tu, 0.75, 0.21, 0.04, 0.42, 0.04, 0x2a2a2e);
        for (const sd of [-1, 1]) {
          onFace(s, tu + sd * 0.3, 0.75, 0.22, 0.22, 0.44, 0.22, 0x3a3a3e);
          onFace(s, tu + sd * 0.3, 0.75, 0.24, 0.24, 0.05, 0.24, 0xb8322a);
        }
      }
      continue;
    }
    if (s.kind === 'eis') {
      // the ice-cream parlour "Eis-Café Italia": the real corner house, plastered cream. Its west wall (toward the
      // tables) and its south wall (along the street) each get one textured plane, as wide as the wall and as high
      // as its eave: big glass shopfronts with the counter and the tubs, the name over them, windows above, the
      // red-brown door at the corner, a striped awning over the shopfronts
      const S = 64;
      const facade = (f: WaldseeFace & OnWall, o: { shop: [number, number]; door?: number }) => {
        const wl = f.wall ?? { width: 5, along: 0, eave: 3 };
        const W = wl.width, H = wl.eave, G = Math.min(2.0, H * 0.64);
        const [u0, u1] = [Math.max(0.2, o.shop[0]), Math.min(W - 0.2, o.shop[1])];
        // (the canvas runs against `along`: the wall's middle lies `wl.along` behind the snapped point)
        const alongOf = (u: number) => -wl.along - (u - W / 2);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(W * S);
        canvas.height = Math.round(H * S);
        const g = canvas.getContext('2d')!;
        const px = (u: number) => u * S, py = (y: number) => (H - y) * S;
        const rect = (u: number, y0: number, y1: number, w: number, c: string | CanvasGradient) => {
          g.fillStyle = c;
          g.fillRect(px(u), py(y1), w * S, (y1 - y0) * S);
        };
        // cream plaster, a darker plinth, a band between the storeys and the shadow under the eaves
        rect(0, 0, H, W, '#efe3cd');
        rect(0, 0, 0.15, W, '#d7cbb4');
        rect(0, G - 0.04, G + 0.04, W, '#ddd0b6');
        const shade = g.createLinearGradient(0, 0, 0, 0.5 * S);
        shade.addColorStop(0, 'rgba(66,58,44,0.30)');
        shade.addColorStop(1, 'rgba(66,58,44,0)');
        g.fillStyle = shade;
        g.fillRect(0, 0, W * S, 0.5 * S);
        // windows: white frames, dark panes, a cross and a sill
        const win = (u: number, y0: number, y1: number, ww: number) => {
          rect(u - ww / 2, y0, y1, ww, '#fbf8f0');
          const glass = g.createLinearGradient(0, py(y1), 0, py(y0));
          glass.addColorStop(0, '#6d8490');
          glass.addColorStop(1, '#4d626d');
          rect(u - ww / 2 + 0.05, y0 + 0.05, y1 - 0.05, ww - 0.1, glass);
          rect(u - ww / 2 + 0.05, y0 + 0.05, y1 - 0.05, (ww - 0.1) * 0.3, 'rgba(255,255,255,0.28)');
          rect(u - 0.02, y0 + 0.05, y1 - 0.05, 0.04, '#fbf8f0');
          rect(u - ww / 2 + 0.05, (y0 + y1) / 2, (y0 + y1) / 2 + 0.04, ww - 0.1, '#fbf8f0');
          rect(u - ww / 2 - 0.05, y0 - 0.05, y0 + 0.01, ww + 0.1, '#d9cfba');
        };
        const n = Math.max(1, Math.floor((W - 0.8) / 1.5));
        const doorU = o.door ?? -9;
        for (let k = 0; k < n; k++) {
          const u = 0.4 + (k + 0.5) * ((W - 0.8) / n);
          const wh = Math.max(0.4, Math.min(0.85, H - G - 0.45));
          win(u, G + (H - G) / 2 - wh / 2 - 0.03, G + (H - G) / 2 + wh / 2 - 0.03, 0.55);
          // (downstairs beyond the shopfronts: plain windows under the upper ones, clear of the door)
          if ((u < u0 - 0.3 || u > u1 + 0.3) && Math.abs(u - doorU) > 0.9) win(u, 0.5, 1.5, 0.62);
        }
        // the shopfronts: dark glass with the warm counter and the tubs of ice cream behind it
        if (u1 - u0 > 1) {
          const bays = Math.max(1, Math.round((u1 - u0) / 1.8)), bw = (u1 - u0) / bays;
          const colours = ['#f2a6c0', '#f6e08a', '#a6d8c0', '#c9a6e8'];
          for (let k = 0; k < bays; k++) {
            const x0 = u0 + k * bw + 0.1, ww = bw - 0.2;
            rect(x0, 0.2, 1.6, ww, '#d8c7a2');
            const glass = g.createLinearGradient(0, py(1.55), 0, py(0.25));
            glass.addColorStop(0, '#39474f');
            glass.addColorStop(0.6, '#2b363c');
            glass.addColorStop(1, '#5b4a34');
            rect(x0 + 0.07, 0.27, 1.53, ww - 0.14, glass);
            rect(x0 + 0.07, 0.3, 0.64, ww - 0.14, '#b98546');
            rect(x0 + 0.07, 0.64, 0.69, ww - 0.14, '#f6d38a');
            const tubs = Math.max(2, Math.round(ww / 0.4));
            for (let t = 0; t < tubs; t++) rect(x0 + 0.16 + t * ((ww - 0.32) / tubs) + 0.03, 0.69, 0.87, (ww - 0.32) / tubs - 0.06, colours[(t + k) % 4]);
            rect(x0 + 0.07, 1.2, 1.25, ww - 0.14, '#d8c7a2');
            rect(x0 + ww / 2 - 0.025, 0.27, 1.53, 0.05, '#d8c7a2');
            g.fillStyle = 'rgba(255,255,255,0.14)';
            g.beginPath();
            g.moveTo(px(x0 + 0.15), py(1.5));
            g.lineTo(px(x0 + 0.55), py(1.5));
            g.lineTo(px(x0 + 0.3), py(0.35));
            g.lineTo(px(x0 + 0.12), py(0.35));
            g.closePath();
            g.fill();
          }
          // the name painted on the plaster over them
          g.fillStyle = '#6f7780';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `600 ${Math.round(0.26 * S)}px Georgia, "Times New Roman", serif`;
          const wide = g.measureText('Eis-Café Italia').width;
          g.save();
          g.translate(px((u0 + u1) / 2), py((1.6 + G) / 2 + 0.03));
          g.scale(Math.min(1, (0.9 * (u1 - u0) * S) / wide), 1);
          g.fillText('Eis-Café Italia', 0, 0);
          g.restore();
        }
        // the door: red-brown, glass above the middle, a lintel
        if (o.door !== undefined) {
          rect(o.door - 0.5, 0, 1.7, 1, '#d8c7a2');
          rect(o.door - 0.4, 0, 1.6, 0.8, '#7a3b2c');
          rect(o.door - 0.3, 0.55, 1.5, 0.6, '#56707c');
          rect(o.door - 0.02, 0.55, 1.5, 0.04, '#d8c7a2');
          rect(o.door + 0.22, 0.7, 0.78, 0.1, '#d8c7a2');
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(W, H);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        const [fx, fz] = on(f, -wl.along, 0.04);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(f);
        add(m);
        // a striped awning over the shopfronts, a little lamp by the door
        for (let k = 0; k < Math.floor((u1 - u0) / 0.25); k++) {
          const c = k % 2 ? 0xf4ecd8 : 0xb8322a;
          onFace(f, alongOf(u0 + (k + 0.5) * 0.25), 0.32, 1.62, 0.25, 0.06, 0.56, c);
          onFace(f, alongOf(u0 + (k + 0.5) * 0.25), 0.6, 1.54, 0.25, 0.12, 0.03, c);
        }
        if (o.door !== undefined) onFace(f, alongOf(o.door + 0.68), 0.1, 1.2, 0.1, 0.22, 0.08, 0xffcf7a, true);
      };
      // (the west wall: the door at its south end, the shopfronts next to it; the south wall: plain windows only, no
      // shopfront and no awning)
      const south = onBlock({ x: 73, z: 69.7, dx: 0, dz: 1, len: 1 });
      const wW = (s as OnWall).wall?.width ?? 5;
      facade(s, { shop: [0.25, wW - 1.7], door: wW - 0.85 });
      facade(south, { shop: [0, 0] });
      continue;
    }
    if (s.kind === 'frauen') {
      // the clothes shop "FRAUENZIMMER" (from photos), the corner house east of the lane: light grey rough plaster, a
      // glazed corner shop with a white pillar at the corner (the number 5), the entrance recessed on the street side
      // with steps and a mauve mat, a slim ledge over the ground floor, the name painted above it, deep-set windows
      // upstairs. The street wall and the lane wall each get one plane, as wide as the wall and as high as its eave
      const S = 64;
      const facade = (f: WaldseeFace & OnWall, street: boolean) => {
        const wl = f.wall ?? { width: 6, along: 0, eave: 4.5 };
        const W = wl.width, H = wl.eave, G = Math.min(1.9, H * 0.42);
        // (the canvas runs against `along`: the wall's middle lies `wl.along` behind the snapped point; the pillar
        // stands at the corner: at the west end of the street wall, at the south end of the lane wall)
        const alongOf = (u: number) => -wl.along - (u - W / 2);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(W * S);
        canvas.height = Math.round(H * S);
        const g = canvas.getContext('2d')!;
        const px = (u: number) => u * S, py = (y: number) => (H - y) * S;
        const rect = (u: number, y0: number, y1: number, w: number, c: string | CanvasGradient) => {
          g.fillStyle = c;
          g.fillRect(px(u), py(y1), w * S, (y1 - y0) * S);
        };
        const pu0 = street ? 0 : W - 0.6;
        // rough light grey plaster with a speckle, a grey plinth, the shadow under the eaves
        rect(0, 0, H, W, '#d9d8d3');
        for (let k = 0; k < W * H * 40; k++) {
          g.fillStyle = k & 1 ? 'rgba(255,255,255,0.18)' : 'rgba(90,88,80,0.12)';
          g.fillRect(((k * 7919) % 9973) / 9973 * W * S, ((k * 104729) % 10007) / 10007 * H * S, 2, 2);
        }
        rect(0, 0, 0.3, W, '#aeaca6');
        const shade = g.createLinearGradient(0, 0, 0, 0.5 * S);
        shade.addColorStop(0, 'rgba(66,62,54,0.30)');
        shade.addColorStop(1, 'rgba(66,62,54,0)');
        g.fillStyle = shade;
        g.fillRect(0, 0, W * S, 0.5 * S);
        // upstairs: deep-set white-framed windows with white sills, a plaster reveal round each
        const win = (u: number, y0: number, y1: number, ww: number) => {
          rect(u - ww / 2 - 0.08, y0 - 0.02, y1 + 0.1, ww + 0.16, '#e9e8e3');
          rect(u - ww / 2, y0, y1, ww, '#fbf8f0');
          const glass = g.createLinearGradient(0, py(y1), 0, py(y0));
          glass.addColorStop(0, '#47525b');
          glass.addColorStop(1, '#2f3a43');
          rect(u - ww / 2 + 0.06, y0 + 0.06, y1 - 0.06, ww - 0.12, glass);
          rect(u - ww / 2 + 0.06, y0 + 0.06, y1 - 0.06, (ww - 0.12) * 0.3, 'rgba(255,255,255,0.2)');
          rect(u - 0.025, y0 + 0.06, y1 - 0.06, 0.05, '#fbf8f0');
          rect(u - ww / 2 - 0.12, y0 - 0.07, y0 - 0.01, ww + 0.24, '#fbf8f0');
        };
        // (the windows stay clear of the name painted just over the ledge)
        const top = H - 0.35, wy0 = Math.max(Math.min(4.35, top) - 0.95, G + 0.8), wy1 = Math.max(wy0 + 0.5, Math.min(wy0 + 0.95, top));
        const nWin = Math.max(1, Math.floor((W - 1.0) / 1.9));
        for (let k = 0; k < nWin; k++) {
          const u = 0.5 + (k + 0.5) * ((W - 1.0) / nWin);
          win(u, wy0, wy1, 0.7);
          if (!street && nWin > 1) win(u, G + 0.45, G + 1.25, 0.5);
        }
        // the shop's glass: dark metal frames, a pale interior with racks of clothes, mannequins
        const glassBay = (u0: number, u1: number, y0: number, y1: number) => {
          rect(u0, y0, y1, u1 - u0, '#34363a');
          const back = g.createLinearGradient(0, py(y1), 0, py(y0));
          back.addColorStop(0, '#9b9690');
          back.addColorStop(1, '#6a6560');
          rect(u0 + 0.06, y0 + 0.06, y1 - 0.06, u1 - u0 - 0.12, back);
          const cols = ['#c93a3a', '#2d4f9b', '#e8d9c0', '#d96a8a', '#e0a23c', '#2f6f6a', '#f2f0ea'];
          for (let u = u0 + 0.15; u < u1 - 0.3; u += 0.17) rect(u, y1 - 0.85, y1 - 0.3, 0.13, cols[Math.floor(u * 7.3) % cols.length]);
          rect(u0 + 0.1, y1 - 0.31, y1 - 0.27, u1 - u0 - 0.2, '#2c2c2e');
          // (a mannequin or two: a coloured dress on a thin stand)
          for (let u = u0 + 0.5; u < u1 - 0.4; u += 1.7) {
            rect(u - 0.12, y0 + 0.5, y0 + 1.05, 0.24, cols[Math.floor(u * 3.1) % cols.length]);
            rect(u - 0.08, y0 + 1.05, y0 + 1.2, 0.16, '#d8c9bd');
            rect(u - 0.03, y0 + 0.06, y0 + 0.5, 0.06, '#2c2c2e');
          }
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.beginPath();
          g.moveTo(px(u0 + 0.3), py(y1 - 0.06));
          g.lineTo(px(u0 + 0.9), py(y1 - 0.06));
          g.lineTo(px(u0 + 0.5), py(y0 + 0.06));
          g.lineTo(px(u0 + 0.12), py(y0 + 0.06));
          g.closePath();
          g.fill();
          for (let u = u0 + 1.5; u < u1 - 0.3; u += 1.5) rect(u, y0, y1, 0.07, '#34363a');
        };
        const gy1 = G - 0.2;
        if (street) {
          // (the dark fascia under the ledge, the glass either side of the recessed entrance, a pier at the far end)
          rect(0.6, gy1, G, W - 0.6, '#4a4946');
          glassBay(0.7, 2.0, 0.35, gy1);
          // the entrance: a dark recess, a mauve mat on its floor
          rect(2.0, 0, gy1, 1.6, '#3b3835');
          rect(2.05, 0.35, gy1 - 0.05, 1.5, '#7b746d');
          rect(2.05, 0.05, 0.3, 1.5, '#b9aea0');
          for (let u = 2.2; u < 3.5; u += 0.2) rect(u, 0.5, 1.4, 0.1, ['#c93a3a', '#2d4f9b', '#e8d9c0'][Math.floor(u * 5) % 3]);
          rect(2.05, 0.05, 0.12, 1.5, '#7c4a6c');
          glassBay(3.6, W - 0.5, 0.35, gy1);
          rect(W - 0.5, 0, G, 0.5, '#d9d8d3');
        } else {
          // (round the corner: one long window along the lane, the plinth as its sill)
          rect(0, gy1, G, W - 0.6, '#4a4946');
          glassBay(0.35, W - 0.7, 0.4, gy1);
        }
        // the white square pillar at the corner, the house number 5 on it
        rect(pu0, 0, G, 0.6, '#e8e7e2');
        if (street) {
          g.fillStyle = '#26327a';
          g.font = `bold ${Math.round(0.26 * S)}px Arial, sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('5', px(0.3), py(1.45));
        }
        // the name painted just over the ledge, below the upstairs windows: dark grey capitals
        if (street) {
          g.fillStyle = '#4b4e53';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          const mid = Math.min(W - 1.7, 3.7), maxW = (W - 1.8) * S;
          g.font = `bold ${Math.round(0.4 * S)}px Arial, Helvetica, sans-serif`;
          const wide = g.measureText('FRAUENZIMMER').width;
          g.save();
          g.translate(px(mid), py(G + 0.38));
          g.scale(Math.min(1, maxW / wide), 1);
          g.fillText('FRAUENZIMMER', 0, 0);
          g.restore();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(W, H);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        const [fx, fz] = on(f, -wl.along, 0.04);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(f);
        add(m);
        // the slim ledge over the ground floor
        onFace(f, alongOf(W / 2), 0.09, G + 0.04, W, 0.08, 0.18, 0xe6e5e0);
        if (street) {
          // steps up to the recessed entrance, two tall pots with blue-grey grasses
          onFace(f, alongOf(2.8), 0.34, 0.07, 1.6, 0.14, 0.5, 0xd9cfba);
          onFace(f, alongOf(2.8), 0.66, 0.035, 1.8, 0.07, 0.16, 0xcfc4ae);
          for (const u of [2.15, W - 0.75]) {
            onFace(f, alongOf(u), 0.62, 0.25, 0.3, 0.5, 0.3, 0x3a3c40);
            onFace(f, alongOf(u), 0.62, 0.6, 0.34, 0.24, 0.34, 0x8fa59d);
          }
        }
      };
      // (the street wall: the snapped sign; the lane wall: west of the corner)
      facade(s, true);
      facade(onBlock({ x: 84, z: 67, dx: -1, dz: 0, len: 1 }), false);
      continue;
    }
    if (s.kind === 'bank') {
      // the bank, seen down the lane behind the barrier: a tall trimmed hedge with a little iron gate, a few tiles in,
      // fills the lane from wall to wall, the house (light blue-grey) stands behind it with its name up high
      const lane = WALDSEE_BARRIERS.find(b => Math.abs(b.at[0] - 10.36) < 0.1 && Math.abs(b.at[1] - 60.26) < 0.1);
      if (lane) {
        const ax = -lane.dir[1], az = lane.dir[0], yaw = Math.atan2(-az, ax);
        const hx = lane.at[0] + lane.dir[0] * 3.0, hz = lane.at[1] + lane.dir[1] * 3.0;
        // (how far one can go along the barrier's line from the hedge's spot to the real wall, to each side)
        const reach = (sx: number): number => {
          let best = 6;
          for (const w of wallFeet()) {
            const ex = w.x1 - w.x0, ez = w.z1 - w.z0, den = ax * sx * ez - az * sx * ex;
            if (Math.abs(den) < 1e-6) continue;
            const t = ((w.x0 - hx) * ez - (w.z0 - hz) * ex) / den, u = ((w.x0 - hx) * az * sx - (w.z0 - hz) * ax * sx) / den;
            if (t > 0.2 && u >= -0.02 && u <= 1.02 && t < best) best = t;
          }
          return best;
        };
        const left = reach(-1), right = reach(1), width = left + right, mid = (right - left) / 2;
        const gateAt = width * 0.25, gateW = 0.9;
        const hedgePart = (t0: number, t1: number, colour: number) => {
          const t = (t0 + t1) / 2;
          box(hx + ax * (mid + t), 0.8, hz + az * (mid + t), t1 - t0, 1.6, 0.55, colour, yaw);
        };
        const n = Math.max(2, Math.round(width / 0.9));
        for (let k = 0; k < n; k++) {
          const t0 = -width / 2 + (k * width) / n, t1 = t0 + width / n;
          if (t1 > gateAt - gateW / 2 && t0 < gateAt + gateW / 2) {
            if (t0 < gateAt - gateW / 2 - 0.05) hedgePart(t0, gateAt - gateW / 2, 0x3f7a3a);
            if (t1 > gateAt + gateW / 2 + 0.05) hedgePart(gateAt + gateW / 2, t1, 0x478544);
          } else hedgePart(t0, t1, k % 2 ? 0x3f7a3a : 0x478544);
        }
        // (the gate: two posts, a top rail, thin bars)
        for (const side of [-1, 1]) box(hx + ax * (mid + gateAt + side * gateW / 2), 0.5, hz + az * (mid + gateAt + side * gateW / 2), 0.07, 1.0, 0.07, 0x3a3d42, yaw);
        box(hx + ax * (mid + gateAt), 0.95, hz + az * (mid + gateAt), gateW, 0.06, 0.06, 0x3a3d42, yaw);
        for (let k = 0; k < 6; k++) box(hx + ax * (mid + gateAt - gateW / 2 + 0.1 + k * 0.14), 0.45, hz + az * (mid + gateAt - gateW / 2 + 0.1 + k * 0.14), 0.03, 0.9, 0.03, 0x3a3d42, yaw);
      }
      // the whole front on one plane flush on the real wall: light plaster, a glazed ground floor with the entrance,
      // a row of windows per storey, and the name "Bank" in plain letters between the shop windows and the first
      // storey (no brand name)
      // (the whole house front: every wall of the building that looks the same way, side by side)
      let wl = (s as OnWall).wall, mid = -(wl?.along ?? 0);
      let near: ReturnType<typeof wallFeet>[number] | undefined;
      for (const w of wallFeet()) {
        if (w.nx * s.dx + w.nz * s.dz < 0.9) continue;
        const d = Math.hypot((w.x0 + w.x1) / 2 - s.x, (w.z0 + w.z1) / 2 - s.z);
        if (!near || d < Math.hypot((near.x0 + near.x1) / 2 - s.x, (near.z0 + near.z1) / 2 - s.z)) near = w;
      }
      if (near) {
        let lo = Infinity, hi = -Infinity, eave = Infinity;
        for (const w of wallFeet()) {
          // (only the walls in the same plane: an annex set back behind it is not covered)
          if (w.id !== near.id || w.nx * near.nx + w.nz * near.nz < 0.95) continue;
          if (Math.abs((w.x0 - near.x0) * near.nx + (w.z0 - near.z0) * near.nz) > 0.3) continue;
          for (const [x, z] of [[w.x0, w.z0], [w.x1, w.z1]]) {
            const a = -(x - s.x) * s.dz + (z - s.z) * s.dx;
            lo = Math.min(lo, a);
            hi = Math.max(hi, a);
          }
          eave = Math.min(eave, w.eave);
        }
        wl = { width: hi - lo, along: 0, eave };
        mid = (lo + hi) / 2;
      }
      const wB = wl?.width ?? Math.max(3, s.len), H = wl?.eave ?? 6;
      const S = 80, cw = Math.round(wB * S), ch = Math.round(H * S);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const g = canvas.getContext('2d')!;
      const px = (u: number) => (u + wB / 2) * S;
      const py = (y: number) => (H - y) * S;
      g.fillStyle = '#c3ccd3';
      g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#9aa3a9';
      g.fillRect(0, py(0.2), cw, 0.2 * S);
      const shadow = g.createLinearGradient(0, 0, 0, 0.5 * S);
      shadow.addColorStop(0, 'rgba(60,56,48,0.28)');
      shadow.addColorStop(1, 'rgba(60,56,48,0)');
      g.fillStyle = shadow;
      g.fillRect(0, 0, cw, 0.5 * S);
      // upper storeys (about 2 tiles each): grey-framed windows with a dark glass and a pale sill
      const storeys = Math.max(1, Math.round(H / 2) - 1);
      const nUp = Math.max(1, Math.round(wB / 1.4));
      for (let r = 0; r < storeys; r++) {
        const yc = H - (r + 0.5) * ((H - 2.6) / storeys) - 0.15 * 0 - 0.1;
        for (let k = 0; k < nUp; k++) {
          const u = -wB / 2 + (k + 0.5) * (wB / nUp), ww = 0.74, wh = 0.9;
          g.fillStyle = '#8d9096';
          g.fillRect(px(u - ww / 2), py(yc + wh / 2), ww * S, wh * S);
          const glass = g.createLinearGradient(0, py(yc + wh / 2), 0, py(yc - wh / 2));
          glass.addColorStop(0, '#6f8697');
          glass.addColorStop(1, '#46596a');
          g.fillStyle = glass;
          g.fillRect(px(u - ww / 2 + 0.05), py(yc + wh / 2 - 0.05), (ww - 0.1) * S, (wh - 0.1) * S);
          g.fillStyle = '#8d9096';
          g.fillRect(px(u - 0.02), py(yc + wh / 2 - 0.05), 0.04 * S, (wh - 0.1) * S);
          g.fillStyle = '#f2efe6';
          g.fillRect(px(u - ww / 2 - 0.05), py(yc - wh / 2 - 0.02), (ww + 0.1) * S, 0.06 * S);
        }
      }
      // ground floor: a band of glass between grey piers, the entrance in the middle
      const bays = Math.max(2, Math.round(wB / 1.6)), bw = wB / bays;
      for (let k = 0; k < bays; k++) {
        const u = -wB / 2 + (k + 0.5) * bw, door = bays % 2 ? k === (bays - 1) / 2 : false;
        g.fillStyle = '#8d9096';
        g.fillRect(px(u - bw / 2 + 0.1), py(2.2), (bw - 0.2) * S, 2.0 * S);
        const glass = g.createLinearGradient(0, py(2.1), 0, py(0.3));
        glass.addColorStop(0, '#5d7384');
        glass.addColorStop(1, '#34424e');
        g.fillStyle = glass;
        g.fillRect(px(u - bw / 2 + 0.18), py(2.12), (bw - 0.36) * S, door ? 1.92 * S : 1.72 * S);
        g.fillStyle = '#8d9096';
        g.fillRect(px(u - 0.02), py(2.12), 0.04 * S, 1.8 * S);
        if (door) g.fillRect(px(u - bw / 2 + 0.18), py(1.9), (bw - 0.36) * S, 0.05 * S);
      }
      // the name: dark letters on the plaster, halfway between the shop windows and the lowest windows above
      const low = storeys ? H - (storeys - 0.5) * ((H - 2.6) / storeys) - 0.1 - 0.45 : H - 0.3;
      g.fillStyle = '#2c3e5c';
      g.font = `bold ${Math.round(0.42 * S)}px "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Bank', cw / 2, py((2.2 + low) / 2), (wB - 0.6) * S);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(wB, H), mat = new THREE.MeshLambertMaterial({ map: tex });
      disposables.push(tex, geo, mat);
      const m = new THREE.Mesh(geo, mat);
      const [fx, fz] = on(s, mid, 0.04);
      m.position.set(fx, H / 2, fz);
      m.rotation.y = faceYaw(s);
      add(m);
      continue;
    }
    if (s.kind === 'shop') {
      // the little shop "Lädele" (from a photo): one plane flush on the real wall, white rough plaster, mauve shutters
      // on the windows above, a flat grey canopy over the whole width, under it a dark fascia, a big shop window on
      // the left, a double glass door right of the middle, a small window beside it, and the name on a yellow board
      // on the wall left of the window. It covers the whole house front, all the pieces of its wall
      const S = 80, real = (s as OnWall).wall, front = frontOf(s), wB = front?.width ?? real?.width ?? w, H = front?.eave ?? real?.eave ?? 6;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(wB * S);
      canvas.height = Math.round(H * S);
      const g = canvas.getContext('2d')!;
      const X = (f: number) => f * wB * S, py = (y: number) => (H - y) * S;
      g.fillStyle = '#efeadf';
      g.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < canvas.width * canvas.height / 90; i++) {
        g.fillStyle = i % 2 ? 'rgba(120,110,95,0.07)' : 'rgba(255,255,255,0.10)';
        g.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
      }
      const shade = g.createLinearGradient(0, 0, 0, 0.6 * S);
      shade.addColorStop(0, 'rgba(66,58,44,0.30)');
      shade.addColorStop(1, 'rgba(66,58,44,0)');
      g.fillStyle = shade;
      g.fillRect(0, 0, canvas.width, 0.6 * S);
      // upstairs: windows in grey frames with a mauve shutter either side, a storey every 2 tiles up to the eave
      const centres = wB > 3.5 ? [0.19, 0.55, 0.77] : wB > 2 ? [0.3, 0.7] : [0.5];
      for (let yc = 3.4; yc + 0.7 <= H; yc += 2) {
        for (const c of centres) {
          const u = X(c), ww = 0.62 * S, wh = 0.92 * S, top = py(yc + 0.46);
          g.fillStyle = '#a46479';
          for (const side of [-1, 1]) g.fillRect(u + side * (ww / 2 + 0.2 * S) - 0.18 * S, top - 0.04 * S, 0.36 * S, wh + 0.1 * S);
          g.fillStyle = '#8f98a0';
          g.fillRect(u - ww / 2 - 0.05 * S, top - 0.05 * S, ww + 0.1 * S, wh + 0.1 * S);
          g.fillStyle = '#5d717d';
          g.fillRect(u - ww / 2, top, ww, wh);
          g.fillStyle = '#f2f2ee';
          g.fillRect(u - 0.02 * S, top, 0.04 * S, wh);
          g.fillRect(u - ww / 2, top + wh * 0.38, ww, 0.04 * S);
        }
      }
      // downstairs: grey plinth, dark fascia, the shopfront over the whole width
      g.fillStyle = '#a9a7a2';
      g.fillRect(0, py(0.35), canvas.width, 0.35 * S);
      g.fillStyle = '#2f2e2c';
      g.fillRect(X(0.17), py(2.0), X(0.80) - X(0.17), 0.2 * S);
      const glassBox = (f0: number, f1: number, y0: number, y1: number, warm: boolean) => {
        g.fillStyle = '#6f736f';
        g.fillRect(X(f0), py(y1), X(f1) - X(f0), (y1 - y0) * S);
        const glass = g.createLinearGradient(0, py(y1), 0, py(y0));
        glass.addColorStop(0, '#53606a');
        glass.addColorStop(1, warm ? '#8a7650' : '#3f4a52');
        g.fillStyle = glass;
        g.fillRect(X(f0) + 0.06 * S, py(y1) + 0.06 * S, X(f1) - X(f0) - 0.12 * S, (y1 - y0 - 0.12) * S);
      };
      // the big window with shelves of goods
      glassBox(0.18, 0.54, 0.55, 1.8, true);
      const wL = X(0.18) + 0.1 * S, wR = X(0.54) - 0.1 * S;
      const cols = ['#d8322a', '#e8d6a0', '#2f5fbf', '#f2b632', '#9aa0a8', '#2f7a4a'];
      for (const sy of [0.95, 1.4]) {
        g.fillStyle = '#d9c9a2';
        g.fillRect(wL, py(sy), wR - wL, 0.04 * S);
        const n = Math.max(3, Math.round((wR - wL) / (0.3 * S)));
        for (let i = 0; i < n; i++) {
          g.fillStyle = cols[(i + (sy > 1 ? 2 : 0)) % cols.length];
          const hh = (0.16 + ((i * 7) % 3) * 0.06) * S;
          g.fillRect(wL + 0.04 * S + i * ((wR - wL - 0.1 * S) / n), py(sy) - hh, 0.18 * S, hh);
        }
      }
      // the double glass door, and the small window beside it
      glassBox(0.55, 0.73, 0.35, 1.8, false);
      g.fillStyle = '#6f736f';
      g.fillRect(X(0.64) - 0.02 * S, py(1.75), 0.04 * S, 1.35 * S);
      glassBox(0.745, 0.83, 0.75, 1.8, true);
      // the grey flat canopy over the whole width
      g.fillStyle = '#6c7a86';
      g.fillRect(X(0.0), py(2.35), canvas.width, 0.22 * S);
      g.fillStyle = '#9aa4ad';
      g.fillRect(X(0.0), py(2.35), canvas.width, 0.06 * S);
      // the name on a yellow board on the wall left of the window
      const bx = X(0.015), bw = X(0.16) - X(0.015), by = py(1.45), bh = 0.34 * S;
      g.fillStyle = '#f5cf1e';
      g.fillRect(bx, by, bw, bh);
      g.strokeStyle = '#d8a800';
      g.lineWidth = 3;
      g.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
      g.fillStyle = '#9a1b1b';
      g.font = `bold ${Math.round(0.24 * S)}px "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const wide = g.measureText(s.text).width;
      g.save();
      g.translate(bx + bw / 2, by + bh / 2 + 1);
      g.scale(Math.min(1, (bw - 0.1 * S) / wide), 1);
      g.fillText(s.text, 0, 0);
      g.restore();
      if (front) paintFront(canvas, front, H);
      else {
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(wB, H);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        const [fx, fz] = on(s, -(real?.along ?? 0), 0.05);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(s);
        add(m);
      }
      continue;
    }
    if (s.kind === 'nemo') {
      // the kebab shop "Memo Kebap" (no photo found: built from what is known): one textured plane flush on the
      // real wall, pale plaster with windows above, a grey ground floor with round-arched windows and the door at
      // one end, the name in red on a white board over them, and the spit turning in the lit middle window
      const wall = (s as OnWall).wall, wB = wall?.width ?? w + 1, H = wall?.eave ?? 5.4, S = 80;
      const cw = Math.round(wB * S), ch = Math.round(H * S);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const g = canvas.getContext('2d')!;
      const px = (u: number) => (u + wB / 2) * S;
      const py = (y: number) => (H - y) * S;
      g.fillStyle = '#e9e0cc';
      g.fillRect(0, 0, cw, ch);
      const shadow = g.createLinearGradient(0, 0, 0, 0.5 * S);
      shadow.addColorStop(0, 'rgba(66,58,44,0.28)');
      shadow.addColorStop(1, 'rgba(66,58,44,0)');
      g.fillStyle = shadow;
      g.fillRect(0, 0, cw, 0.5 * S);
      // the ground floor: grey render up to a cornice
      const gh = Math.min(2.7, H - 1.5);
      g.fillStyle = '#8e9299';
      g.fillRect(0, py(gh), cw, gh * S);
      g.fillStyle = '#6f7379';
      g.fillRect(0, py(0.2), cw, 0.2 * S);
      g.fillStyle = '#d4cdbd';
      g.fillRect(0, py(gh + 0.06), cw, 0.1 * S);
      // upper storeys: white-framed windows, one per bay, about two tiles a storey
      const storeys = Math.max(1, Math.round((H - gh) / 2));
      const sh = (H - gh) / storeys, nUp = Math.max(1, Math.round(wB / 1.5));
      for (let st = 0; st < storeys; st++) for (let k = 0; k < nUp; k++) {
        const u = -wB / 2 + (k + 0.5) * (wB / nUp), yc = gh + (st + 0.5) * sh, ww = 0.6, wh = Math.min(0.9, sh - 0.5);
        g.fillStyle = '#fbf8f0';
        g.fillRect(px(u - ww / 2), py(yc + wh / 2), ww * S, wh * S);
        g.fillStyle = '#4d626d';
        g.fillRect(px(u - ww / 2 + 0.05), py(yc + wh / 2 - 0.05), (ww - 0.1) * S, (wh - 0.1) * S);
        g.fillStyle = '#fbf8f0';
        g.fillRect(px(u - 0.025), py(yc + wh / 2 - 0.05), 0.05 * S, (wh - 0.1) * S);
        g.fillStyle = '#d9cfba';
        g.fillRect(px(u - ww / 2 - 0.05), py(yc - wh / 2 - 0.04), (ww + 0.1) * S, 0.06 * S);
      }
      // round-arched windows in dark glass (a door in the last bay when the wall is wide enough), the middle one lit
      const bays = wB >= 4.2 ? 4 : 3, bw = (wB - 0.4) / bays;
      for (let k = 0; k < bays; k++) {
        const u = -wB / 2 + 0.2 + (k + 0.5) * bw, ww = bw - 0.3, door = bays === 4 && k === 3;
        const top = door ? 2.25 : 2.0, bot = door ? 0.2 : 0.75;
        const arch = (inset: number, fill: string | CanvasGradient) => {
          g.fillStyle = fill;
          g.beginPath();
          g.moveTo(px(u - ww / 2 + inset), py(bot));
          g.lineTo(px(u - ww / 2 + inset), py(top - ww / 2));
          g.arc(px(u), py(top - ww / 2), (ww / 2 - inset) * S, Math.PI, 0);
          g.lineTo(px(u + ww / 2 - inset), py(bot));
          g.closePath();
          g.fill();
        };
        arch(0, '#d9d5cc');
        const glass = g.createLinearGradient(0, py(top), 0, py(bot));
        const lit = k === 1 || door;
        glass.addColorStop(0, lit ? '#6b4a2a' : '#2f2a28');
        glass.addColorStop(1, lit ? '#e49a50' : '#3a3532');
        arch(0.06, glass);
        g.fillStyle = '#d9d5cc';
        if (door) g.fillRect(px(u - 0.02), py(top - ww / 2), 0.04 * S, (top - ww / 2 - bot) * S);
        else g.fillRect(px(u - ww / 2), py(bot + 0.06), ww * S, 0.08 * S);
        if (k === 1) {
          // the spit: a brown cone of meat on a pole
          g.fillStyle = '#d0d4e0';
          g.fillRect(px(u - 0.015), py(bot + 1.15), 0.03 * S, 1.0 * S);
          g.fillStyle = '#b5653a';
          g.beginPath();
          g.moveTo(px(u - 0.2), py(bot + 0.2));
          g.lineTo(px(u + 0.2), py(bot + 0.2));
          g.lineTo(px(u + 0.08), py(bot + 0.95));
          g.lineTo(px(u - 0.08), py(bot + 0.95));
          g.closePath();
          g.fill();
        }
      }
      // the name in red on a white board over the arches
      const bwid = Math.min(wB - 0.4, 2.8);
      g.fillStyle = '#f4f1ea';
      g.fillRect(px(-bwid / 2), py(gh - 0.05), bwid * S, 0.5 * S);
      g.strokeStyle = '#c0281f';
      g.lineWidth = 4;
      g.strokeRect(px(-bwid / 2) + 4, py(gh - 0.05) + 4, bwid * S - 8, 0.5 * S - 8);
      g.fillStyle = '#c0281f';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round(0.34 * S)}px "Helvetica Neue", Arial, sans-serif`;
      g.fillText('Memo Kebap', cw / 2, py(gh - 0.3));
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(wB, H);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      disposables.push(tex, geo, mat);
      const m = new THREE.Mesh(geo, mat);
      const [fx, fz] = on(s, -(wall?.along ?? 0), 0.05);
      m.position.set(fx, H / 2, fz);
      m.rotation.y = faceYaw(s);
      add(m);
      continue;
    }
    if (s.kind === 'flasche' || s.kind === 'nkd' || s.kind === 'brille' || s.kind === 'empire') {
      // shop fronts built from photos. Each: a plastered ground floor in the house's own tone, windows of dark
      // glass in pale frames, a door, and what one knows it by
      const span = Math.max(3, Math.min(5, s.len));
      if (s.kind === 'flasche') {
        // the inn: its real wall with the gable end to the street, painted whole on one plane flush on it and
        // clipped to the wall's outline: pale mint plaster, a grey plinth and cornice, grey-framed windows; the
        // raspberry timber only in the gable; the name in old letters on the plaster; on the ground floor three
        // small-paned windows and the door in a stone frame. Before it: bistro tables and box trees in pots
        const real = (s as OnWall).wall, W = real?.width ?? span, E = real?.eave ?? 5.3, S = 64;
        const prof: [number, number][] = real?.prof ?? [[-W / 2, 0], [W / 2, 0], [W / 2, E], [-W / 2, E]];
        const H = Math.max(E, ...prof.map(p => p[1]));
        const [mx, mz] = on(s, -(real?.along ?? 0), 0);
        const mid: WaldseeFace = { ...s, x: mx, z: mz };
        const cw = Math.round(W * S), ch = Math.round(H * S);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext('2d')!;
        const px = (u: number) => (u + W / 2) * S;
        const py = (y: number) => (H - y) * S;
        const GF = Math.min(2.5, E * 0.45), TIM = '#c0476a', FR = '#5a2a28', GREY = '#9a9da0';
        g.beginPath();
        prof.forEach(([u, y], i) => (i ? g.lineTo(px(u), py(y)) : g.moveTo(px(u), py(y))));
        g.closePath();
        g.clip();
        g.fillStyle = '#dfe6d6';
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = GREY;
        g.fillRect(0, py(0.3), cw, 0.3 * S);
        // the cornice over the ground floor
        g.fillRect(0, py(GF + 0.12), cw, 0.12 * S);
        const win = (u: number, y0: number, wd: number, h: number, panes: boolean) => {
          g.fillStyle = GREY;
          g.fillRect(px(u - wd / 2 - 0.08), py(y0 + h + 0.08), (wd + 0.16) * S, (h + 0.16) * S);
          g.fillStyle = FR;
          g.fillRect(px(u - wd / 2), py(y0 + h), wd * S, h * S);
          g.fillStyle = '#3a4654';
          const nx = panes ? 3 : 2, ny = panes ? 4 : 2, gap = 0.04;
          for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) g.fillRect(px(u - wd / 2) + (i * wd * S) / nx + gap * S, py(y0 + h) + (j * h * S) / ny + gap * S, (wd * S) / nx - 2 * gap * S, (h * S) / ny - 2 * gap * S);
        };
        // the door on the right
        const doorU = W / 2 - Math.min(1.1, W * 0.17);
        const left = -W / 2 + 0.25, right = doorU - 1.2;
        const n3 = 3, slot = (right - left) / n3;
        for (let k = 0; k < n3; k++) win(left + (k + 0.5) * slot, 0.6, Math.min(1.0, slot - 0.3), 1.2, true);
        g.fillStyle = GREY;
        g.fillRect(px(doorU - 0.55), py(2.15), 1.1 * S, 2.15 * S);
        g.fillStyle = '#6b4a2e';
        g.fillRect(px(doorU - 0.4), py(2.0), 0.8 * S, 2.0 * S);
        g.fillStyle = '#c9a06a';
        g.fillRect(px(doorU + 0.22), py(1.0), 0.06 * S, 0.12 * S);
        g.fillStyle = '#2a2420';
        g.font = `bold ${Math.round(0.26 * S)}px Georgia, serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('5', px(doorU), py(GF - 0.12));
        // a round hanging sign between windows and door, a menu box, the chalkboard right of the door
        g.fillStyle = '#7a4a36';
        g.beginPath();
        g.arc(px(doorU - 0.9), py(1.5), 0.2 * S, 0, 7);
        g.fill();
        g.fillStyle = '#2a2d30';
        g.fillRect(px(doorU + 0.68), py(1.3), 0.5 * S, 0.7 * S);
        g.fillStyle = '#6b6f74';
        g.fillRect(px(doorU + 0.68), py(1.9), 0.3 * S, 0.3 * S);
        // the first floor: four windows with grey surrounds, no timber; the name on the plaster under them
        const f1 = GF + 0.7;
        for (let k = 0; k < 4; k++) win(-W / 2 + (k + 0.5) * (W / 4), f1, Math.min(0.8, W / 4 - 0.35), 1.1, false);
        g.fillStyle = '#7a1f28';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `italic bold ${Math.round(0.36 * S)}px "Old English Text MT", UnifrakturCook, Georgia, "Times New Roman", serif`;
        const wide = g.measureText(s.text).width;
        g.save();
        g.translate(px((left + right) / 2 - 0.2), py(GF + 0.38));
        g.scale(Math.min(1, ((right - left) + 0.6) * S / wide), 1);
        g.fillText(s.text, 0, 0);
        g.restore();
        // the gable: raspberry timber, three small windows and the inscription panel
        const gb = f1 + 1.1 + 0.35;
        if (H > gb + 0.4) {
          const gh = H - gb;
          g.fillStyle = GREY;
          g.fillRect(0, py(gb), cw, 0.1 * S);
          const bar = (x0: number, y0: number, x1: number, y1: number) => {
            g.strokeStyle = TIM;
            g.lineWidth = 0.1 * S;
            g.beginPath();
            g.moveTo(px(x0), py(y0));
            g.lineTo(px(x1), py(y1));
            g.stroke();
          };
          for (const u of [-W / 4, 0, W / 4]) bar(u, gb, u, H);
          bar(-W / 2, gb, -W / 4, gb + gh * 0.5);
          bar(W / 2, gb, W / 4, gb + gh * 0.5);
          bar(-W / 4, gb + gh * 0.5, 0, H);
          bar(W / 4, gb + gh * 0.5, 0, H);
          bar(-W / 2, gb + gh * 0.04, W / 2, gb + gh * 0.04);
          const wy = gb + 0.2;
          for (const u of [-W * 0.375, 0.0, W * 0.375]) if (u !== 0) win(u, wy, 0.4, 0.55, false);
          win(0, wy, 0.4, 0.55, false);
          g.fillStyle = '#f1e4c8';
          g.fillRect(px(-0.3), py(wy + 1.1), 0.6 * S, 0.35 * S);
          g.strokeStyle = TIM;
          g.lineWidth = 3;
          g.strokeRect(px(-0.3), py(wy + 1.1), 0.6 * S, 0.35 * S);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(W, H);
        // (outside the wall's outline the canvas is empty: not drawn)
        const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        const [fx, fz] = on(mid, 0, 0.04);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(mid);
        add(m);
        // (the canvas runs against the face's `along`: a point `u` across the canvas lies at `-u` along it)
        // the lantern on its arm, by the door
        const [lx, lz] = on(mid, -(doorU - 0.75), 0.25);
        box(lx, GF - 0.1, lz, 0.05, 0.05, 0.4, 0x2a2d30, faceYaw(mid));
        lamp(lx, GF - 0.3, lz, 0.18, 0.28, 0.18, 0xffcf7a);
        // bistro tables with chairs centred before the windows, the way to the door free; box trees in big pots
        for (const a of [(left + right) / 2 - 1.0, (left + right) / 2 + 1.0]) {
          const [x, z] = on(mid, -a, 1.4);
          box(x, 0.36, z, 0.1, 0.72, 0.1, 0x4a4f5c);
          box(x, 0.74, z, 0.7, 0.06, 0.7, 0x8a5a36);
          for (const t of [0, 2.1, 4.2]) box(x + Math.cos(t) * 0.6, 0.25, z + Math.sin(t) * 0.6, 0.3, 0.5, 0.3, 0x6b4a32, t);
        }
        for (const a of [left + 0.3, doorU - 1.0, doorU + 1.3]) {
          const [x, z] = on(mid, -a, 0.55);
          box(x, 0.3, z, 0.5, 0.6, 0.5, 0xb5653a, 0.4);
          box(x, 0.95, z, 0.6, 0.7, 0.6, 0x3f7a3a, 0.6);
        }
      } else if (s.kind === 'nkd') {
        // the clothes shop: the whole real wall painted flush, pale plaster with plain windows above, below a long
        // glass shopfront with the door in the middle and a dark grey fascia carrying the red name
        // (the street front may be several wall pieces with slight kinks: each gets its part of the shopfront, the
        // door and the name on the piece the shop snapped to)
        const wall = (s as OnWall).wall;
        const front = (face: WaldseeFace, wB: number, H: number, main: boolean) => {
        const S = 64, cw = Math.max(64, Math.round(wB * S)), ch = Math.round(H * S);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext('2d')!;
        const px = (u: number) => (u + wB / 2) * S;
        const py = (y: number) => (H - y) * S;
        g.fillStyle = '#c9d0d8';
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#9a9fa6';
        g.fillRect(0, py(0.18), cw, 0.18 * S);
        const shadow = g.createLinearGradient(0, 0, 0, 0.5 * S);
        shadow.addColorStop(0, 'rgba(60,54,44,0.28)');
        shadow.addColorStop(1, 'rgba(60,54,44,0)');
        g.fillStyle = shadow;
        g.fillRect(0, 0, cw, 0.5 * S);
        // the shopfront: the fascia sits at 2.55-3.15, glass below it, a window either side of the door in the middle
        const fasciaTop = 3.15, fasciaBot = 2.5;
        const doorW = main ? Math.min(1.3, wB * 0.25) : 0, gap = main ? 0.15 : 0.05;
        g.fillStyle = '#3d4046';
        g.fillRect(0, py(fasciaTop), cw, (fasciaTop - fasciaBot) * S);
        g.fillStyle = '#8f949c';
        g.fillRect(0, py(fasciaBot), cw, 0.05 * S);
        const wide = (wB - doorW) / 2 - 0.2 - gap;
        for (let k = 0; k < 2; k++) {
          const ww = wide, x0 = k ? doorW / 2 + gap : -wB / 2 + 0.2;
          g.fillStyle = '#f4f1ea';
          g.fillRect(px(x0), py(2.4), ww * S, 2.0 * S);
          const glass = g.createLinearGradient(0, py(2.3), 0, py(0.45));
          glass.addColorStop(0, '#41505f');
          glass.addColorStop(1, '#6a7480');
          g.fillStyle = glass;
          g.fillRect(px(x0 + 0.06), py(2.34), (ww - 0.12) * S, 1.88 * S);
          // clothes on hangers behind the glass
          const cols = ['#d0202a', '#2f5fbf', '#f2c94c', '#e9b9c6', '#4f9a4a'];
          for (let c = 0; c < 4; c++) {
            g.fillStyle = cols[(k * 2 + c) % 5];
            g.fillRect(px(x0 + 0.14 + c * ((ww - 0.4) / 4)), py(1.9), 0.2 * S, 0.7 * S);
          }
          g.fillStyle = 'rgba(255,255,255,0.14)';
          g.beginPath();
          g.moveTo(px(x0 + 0.1), py(2.3));
          g.lineTo(px(x0 + 0.5), py(2.3));
          g.lineTo(px(x0 + 0.2), py(0.5));
          g.lineTo(px(x0 + 0.1), py(0.5));
          g.closePath();
          g.fill();
        }
        // the glass door with a handle
        if (main) {
        const dx0 = -doorW / 2;
        g.fillStyle = '#f4f1ea';
        g.fillRect(px(dx0), py(2.4), doorW * S, 2.22 * S);
        g.fillStyle = '#41505f';
        g.fillRect(px(dx0 + 0.07), py(2.33), (doorW - 0.14) * S, 2.08 * S);
        g.fillStyle = '#c9ccd2';
        g.fillRect(px(dx0 + doorW - 0.22), py(1.3), 0.05 * S, 0.5 * S);
        }
        // the name: red letters on the fascia, left of centre, as on the real one
        if (main) {
        g.fillStyle = '#d0202a';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${Math.round(0.5 * S)}px "Helvetica Neue", Arial, sans-serif`;
        g.fillText(s.text, px(-wB * 0.14), py((fasciaTop + fasciaBot) / 2) + 2);
        }
        // upper storeys, two tiles apart: pale-framed windows over the shopfront bays
        const nUp = Math.max(1, Math.round(wB / 1.7));
        for (let y = 4.55; y + 0.55 < H - 0.15; y += 2) {
          for (let k = 0; k < nUp; k++) {
            const u = -wB / 2 + (k + 0.5) * (wB / nUp), ww = 0.7, wh = 1.0;
            g.fillStyle = '#fbf8f0';
            g.fillRect(px(u - ww / 2), py(y + wh / 2), ww * S, wh * S);
            g.fillStyle = '#4d626d';
            g.fillRect(px(u - ww / 2 + 0.06), py(y + wh / 2 - 0.06), (ww - 0.12) * S, (wh - 0.12) * S);
            g.fillStyle = '#fbf8f0';
            g.fillRect(px(u - 0.025), py(y + wh / 2 - 0.06), 0.05 * S, (wh - 0.12) * S);
          }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(wB, H);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        const [fx, fz] = on(face, 0, 0.04);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(face);
        add(m);
        };
        const pieces = wall?.id === undefined ? [] : wallFeet().filter(w => w.id === wall.id && w.nx * s.dx + w.nz * s.dz >= 0.5);
        if (!pieces.length) front(s, wall?.width ?? span, wall?.eave ?? 3.6, true);
        // (the piece the shop snapped to is the one whose middle is nearest the snapped point)
        const near = pieces.reduce((best, w) => (Math.hypot((w.x0 + w.x1) / 2 - s.x, (w.z0 + w.z1) / 2 - s.z) < Math.hypot((best.x0 + best.x1) / 2 - s.x, (best.z0 + best.z1) / 2 - s.z) ? w : best), pieces[0]);
        for (const w of pieces) front({ x: (w.x0 + w.x1) / 2, z: (w.z0 + w.z1) / 2, dx: w.nx, dz: w.nz, len: 1 }, Math.hypot(w.x1 - w.x0, w.z1 - w.z0), w.eave, w === near);
      } else if (s.kind === 'brille') {
        // the optician: the real white house painted flush on its wall, dark red shutters upstairs, two great
        // windows hung with red cloth either side of a glass door up four steps, grey planters with little
        // firs, its name on a pale board
        const wall = (s as OnWall).wall;
        const W = wall?.width ?? span, H = wall?.eave ?? 6.4, along = wall?.along ?? 0, S = 64;
        const cw = Math.round(W * S), ch = Math.round(H * S), canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext('2d')!;
        const rect = (u0: number, u1: number, y0: number, y1: number, c: string) => {
          g.fillStyle = c;
          g.fillRect((u0 + W / 2) * S, (H - y1) * S, (u1 - u0) * S, (y1 - y0) * S);
        };
        // white plaster, a grey plinth, the shadow under the eaves
        rect(-W / 2, W / 2, 0, H, '#f1efe8');
        rect(-W / 2, W / 2, 0, 0.25, '#b9bcc2');
        const shadow = g.createLinearGradient(0, 0, 0, 0.6 * S);
        shadow.addColorStop(0, 'rgba(60,56,50,0.28)');
        shadow.addColorStop(1, 'rgba(60,56,50,0)');
        g.fillStyle = shadow;
        g.fillRect(0, 0, cw, 0.6 * S);
        // the door (at the snapped point, where the name hangs) and a great window each side, red cloth in them
        const door = Math.max(-W / 2 + 0.4, Math.min(W / 2 - 0.4, along));
        const bays: [number, number][] = [[-W / 2 + 0.3, door - 0.55], [door + 0.55, W / 2 - 0.3]];
        for (const [u0, u1] of bays) {
          if (u1 - u0 < 0.7) continue;
          rect(u0, u1, 0.6, 2.4, '#4a4f5c');
          rect(u0 + 0.06, u1 - 0.06, 0.66, 2.34, '#33404f');
          rect(u0 + 0.06, u1 - 0.06, 1.25, 2.34, '#b02a5a');
          rect((u0 + u1) / 2 - 0.03, (u0 + u1) / 2 + 0.03, 0.6, 2.4, '#4a4f5c');
        }
        rect(door - 0.4, door + 0.4, 0.25, 2.5, '#6a7480');
        rect(door - 0.34, door + 0.34, 0.31, 2.44, '#9fb0b8');
        rect(door - 0.02, door + 0.02, 0.31, 2.44, '#6a7480');
        // upstairs: a window per bay and storey in a pale frame, dark red shutters either side
        const nUp = Math.max(1, Math.round(W / 1.5));
        for (let y = 3.9; y + 0.6 < H - 0.2; y += 1.7) {
          for (let k = 0; k < nUp; k++) {
            const u = -W / 2 + (k + 0.5) * (W / nUp);
            rect(u - 0.36, u + 0.36, y - 0.5, y + 0.5, '#fbf8f0');
            rect(u - 0.3, u + 0.3, y - 0.44, y + 0.44, '#4d626d');
            rect(u - 0.02, u + 0.02, y - 0.44, y + 0.44, '#fbf8f0');
            rect(u - 0.64, u - 0.38, y - 0.5, y + 0.5, '#8a2a30');
            rect(u + 0.38, u + 0.64, y - 0.5, y + 0.5, '#8a2a30');
          }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(W, H), mat = new THREE.MeshLambertMaterial({ map: tex });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        // (the plane is centred on the wall's middle, which lies `along` behind the snapped point)
        const [fx, fz] = on(s, -along, 0.04);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(s);
        add(m);
        [0.2, 0.4, 0.6, 0.8].forEach((o, k) => onFace(s, door - along, o, 0.5 - k * 0.12, 0.9, 0.12, 0.2, 0x3a3f46));
        for (const a of [-W / 2 + 0.2, W / 2 - 0.2]) {
          onFace(s, a - along, 0.4, 0.4, 0.4, 0.8, 0.4, 0x8e9299);
          onFace(s, a - along, 0.4, 1.1, 0.3, 0.6, 0.3, 0x3f7a3a);
        }
        sign(s, 'die brille', 2.7, Math.min(2.2, W), { back: '#e9ecef', ink: '#3a3f46', rim: '#3a3f46' }, 'bold 84px "Helvetica Neue", Arial, sans-serif');
      } else {
        // the tattoo shop at the corner, painted flush on the real wall: light grey rough plaster on a grey plinth;
        // at the left corner a deep recessed entrance (grey stone reveal) up five steps to a glass door, the black
        // street sign on the corner beside it; right of it two shop windows with the name on dark boards in the
        // glass, a pale plaster band above them with two small lamps on arms, a small plaque between door and
        // windows; further right a plain window and another house door; simple dark-framed windows above
        // (over the whole house front, all the pieces of its wall up to the AmannLabs house)
        const real = (s as OnWall).wall, front = frontOf(s), W = front?.width ?? real?.width ?? span, H = front?.eave ?? real?.eave ?? 6, S = 64;
        const cw = Math.round(W * S), ch = Math.round(H * S);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext('2d')!;
        const px = (u: number) => (u + W / 2) * S;
        const py = (y: number) => (H - y) * S;
        const rect = (u0: number, u1: number, y0: number, y1: number, c: string) => {
          g.fillStyle = c;
          g.fillRect(px(u0), py(y1), (u1 - u0) * S, (y1 - y0) * S);
        };
        const text = (str: string, u: number, y: number, size: number, c: string, maxW: number) => {
          g.fillStyle = c;
          g.font = `bold ${Math.round(size * S)}px "Helvetica Neue", Arial, sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          const wide = g.measureText(str).width;
          g.save();
          g.translate(px(u), py(y));
          g.scale(Math.min(1, (maxW * S) / wide), 1);
          g.fillText(str, 0, 0);
          g.restore();
        };
        rect(-W / 2, W / 2, 0, H, '#d3d1cb');
        // (a little grain in the plaster, a grey plinth and the shadow under the eaves)
        for (let k = 0; k < (cw * ch) / 70; k++) {
          g.fillStyle = k % 2 ? 'rgba(90,88,82,0.10)' : 'rgba(255,255,250,0.14)';
          g.fillRect(hash(k, 3) * cw, hash(k, 7) * ch, 2, 2);
        }
        rect(-W / 2, W / 2, 0, 0.3, '#8e9299');
        const eave = g.createLinearGradient(0, 0, 0, 0.5 * S);
        eave.addColorStop(0, 'rgba(66,58,44,0.28)');
        eave.addColorStop(1, 'rgba(66,58,44,0)');
        g.fillStyle = eave;
        g.fillRect(0, 0, cw, 0.5 * S);
        const L = -W / 2;
        // the recessed entrance: stone reveal, dark depth, a glass door at the back
        const eu = L + Math.max(0.9, W * 0.17), ew = Math.min(1.4, W * 0.2);
        rect(eu - ew / 2 - 0.12, eu + ew / 2 + 0.12, 0.3, 2.55, '#7b7f86');
        rect(eu - ew / 2, eu + ew / 2, 0.3, 2.45, '#23262c');
        rect(eu - ew / 2 + 0.15, eu + ew / 2 - 0.15, 0.4, 2.3, '#5d7684');
        rect(eu - 0.02, eu + 0.02, 0.4, 2.3, '#cfd3d8');
        // the street's name, black with white letters, on the corner left of the entrance
        const su = L + 0.4;
        rect(su - 0.34, su + 0.34, 2.45, 2.85, '#16181c');
        text('Hochstatt', su, 2.65, 0.15, '#ffffff', 0.6);
        // the small grey plaque between door and windows
        const pu = eu + ew / 2 + 0.3;
        rect(pu - 0.16, pu + 0.16, 1.45, 1.85, '#8e9299');
        rect(pu - 0.11, pu + 0.11, 1.5, 1.8, '#a9adb3');
        // the two shop windows, their name on dark boards inside the glass; a pale sign band above both
        const w0 = pu + 0.45, ww = Math.min(1.1, (W * 0.62 - (w0 - L)) / 2 - 0.1);
        const wu = [w0 + ww / 2, w0 + ww * 1.5 + 0.15];
        for (const u of wu) {
          rect(u - ww / 2 - 0.08, u + ww / 2 + 0.08, 0.75, 2.0, '#8e9299');
          rect(u - ww / 2, u + ww / 2, 0.82, 1.94, '#46586a');
          rect(u - ww / 2 + 0.08, u + ww / 2 - 0.08, 1.12, 1.78, '#1d1f24');
          text('TATTOO', u, 1.58, 0.15, '#e9e4d6', ww - 0.2);
          text('NK...', u, 1.34, 0.15, '#e9e4d6', ww - 0.2);
          rect(u - ww / 2, u + ww / 2, 0.82, 1.0, 'rgba(255,255,255,0.12)');
        }
        const bu0 = wu[0] - ww / 2 - 0.14, bu1 = wu[1] + ww / 2 + 0.14;
        rect(bu0, bu1, 2.1, 2.62, '#e6e4de');
        rect(bu0, bu1, 2.1, 2.14, '#a9adb3');
        text('TATTOO LADEN', (bu0 + bu1) / 2, 2.36, 0.26, '#3a3f46', bu1 - bu0 - 0.2);
        // further right: a plain window and another house door with steps
        const pw = bu1 + 0.55;
        if (pw + 0.5 < W / 2) {
          rect(pw - 0.34, pw + 0.34, 1.0, 2.1, '#8e9299');
          rect(pw - 0.28, pw + 0.28, 1.06, 2.04, '#46586a');
          rect(pw - 0.02, pw + 0.02, 1.06, 2.04, '#d3d1cb');
        }
        const du = Math.min(W / 2 - 0.45, pw + 0.95);
        const hasDoor = du - 0.35 > pw + 0.3 && du + 0.35 < W / 2;
        if (hasDoor) {
          rect(du - 0.4, du + 0.4, 0.3, 2.35, '#8e9299');
          rect(du - 0.33, du + 0.33, 0.3, 2.28, '#4a3426');
        }
        // the floors above: simple windows in dark grey frames, a floor about two tiles high, fitted under the eave
        for (let y = 3.55; y + 0.55 < H - 0.15; y += 1.95) {
          const n = Math.max(1, Math.round(W / 1.5));
          for (let k = 0; k < n; k++) {
            const u = L + (k + 0.5) * (W / n);
            rect(u - 0.35, u + 0.35, y - 0.5, y + 0.5, '#3b3f46');
            rect(u - 0.29, u + 0.29, y - 0.44, y + 0.44, '#5a6f80');
            rect(u - 0.02, u + 0.02, y - 0.44, y + 0.44, '#3b3f46');
          }
        }
        // (a spot `u` across the canvas, from its middle: the face of its piece and how far along it)
        const mid = -(real?.along ?? 0);
        const at = (u: number): [WaldseeFace, number] => (front ? frontAt(front, u + W / 2) : [s, mid - u]);
        if (front) paintFront(canvas, front, H);
        else {
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          const geo = new THREE.PlaneGeometry(W, H), mat = new THREE.MeshLambertMaterial({ map: tex });
          disposables.push(tex, geo, mat);
          const m = new THREE.Mesh(geo, mat);
          const [fx, fz] = on(s, mid, 0.04);
          m.position.set(fx, H / 2, fz);
          m.rotation.y = faceYaw(s);
          add(m);
        }
        // five grey stone steps up to the glass door, two to the house door
        for (let k = 0; k < 5; k++) onFace(...at(eu), 0.62 - k * 0.12, (0.1 + k * 0.1) / 2, ew + 0.2, 0.1 + k * 0.1, 0.24, 0x8e9299);
        if (hasDoor) for (let k = 0; k < 2; k++) onFace(...at(du), 0.3 - k * 0.12, (0.1 + k * 0.1) / 2, 0.9, 0.1 + k * 0.1, 0.24, 0x8e9299);
        // two small lamps on arms over the sign band
        for (const u of wu) {
          onFace(...at(u), 0.12, 2.82, 0.04, 0.04, 0.24, 0x2a2d33);
          onFace(...at(u), 0.26, 2.78, 0.16, 0.12, 0.14, 0xffe2a0, true);
        }
      }
      continue;
    }
    if (s.kind === 'hasen') {
      // the Hasen: a wooden board with its name and a lantern beside it
      onFace(s, 0, 0.03, 1, 0.9, 2, 0.06, 0x5a3a26);
      onFace(s, w / 2 + 0.2, 0.3, 2.6, 0.2, 0.3, 0.2, 0xffd76a, true);
      sign(s, 'Hasen', 2.95, Math.min(2.6, w + 0.6), { back: '#4a2f1c', ink: '#f6e3b4', rim: '#c9a06a' });
      continue;
    }
    if (s.kind === 'police') {
      // the police post: the real house, white plaster with dark green shutters on every window, painted as one
      // plane flush on the real wall; a round-topped door in a grey frame, set in a bay where no window is (the
      // ground-floor windows leave it free), the blue POLIZEI board and a blue lamp over it
      const wl = (s as OnWall).wall ?? { width: 6, along: 0, eave: 4.6 };
      const S = 80, wB = wl.width, H = wl.eave;
      const cw = Math.round(wB * S), ch = Math.round(H * S);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const g = canvas.getContext('2d')!;
      const px = (u: number) => (u + wB / 2) * S;
      const py = (y: number) => (H - y) * S;
      g.fillStyle = '#f1efe8';
      g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#c9c7bf';
      g.fillRect(0, py(0.25), cw, 0.25 * S);
      const shade = g.createLinearGradient(0, 0, 0, 0.5 * S);
      shade.addColorStop(0, 'rgba(60,56,48,0.28)');
      shade.addColorStop(1, 'rgba(60,56,48,0)');
      g.fillStyle = shade;
      g.fillRect(0, 0, cw, 0.5 * S);
      // bays about 1.7 wide; the door takes the one nearest the front's point (the snapped spot on the wall)
      const bays = Math.max(2, Math.round(wB / 1.7)), bw = wB / bays;
      const mid = -wl.along;
      let doorBay = 0;
      for (let k = 1; k < bays; k++) if (Math.abs(-wB / 2 + (k + 0.5) * bw - mid) < Math.abs(-wB / 2 + (doorBay + 0.5) * bw - mid)) doorBay = k;
      const win = (u: number, y0: number, h: number) => {
        const ww = Math.min(0.8, bw - 0.9);
        g.fillStyle = '#2f5a3c';
        for (const sd of [-1, 1]) g.fillRect(px(u + sd * (ww / 2 + 0.2) - 0.18), py(y0 + h), 0.36 * S, h * S);
        g.fillStyle = '#fbf9f2';
        g.fillRect(px(u - ww / 2 - 0.05), py(y0 + h + 0.05), (ww + 0.1) * S, (h + 0.1) * S);
        g.fillStyle = '#56707e';
        g.fillRect(px(u - ww / 2), py(y0 + h), ww * S, h * S);
        g.fillStyle = '#fbf9f2';
        g.fillRect(px(u - 0.02), py(y0 + h), 0.04 * S, h * S);
        g.fillRect(px(u - ww / 2), py(y0 + h * 0.62), ww * S, 0.04 * S);
        g.fillStyle = '#d6d3ca';
        g.fillRect(px(u - ww / 2 - 0.1), py(y0 - 0.01), (ww + 0.2) * S, 0.07 * S);
      };
      // upper storeys from 3.0 up to just under the eave (clear of the door, its arch and the board), spread evenly
      // over the whole height so no band of bare wall is left at the top
      const top = H - 0.3, storeys = Math.max(1, Math.round((top - 3.0) / 1.6)), step = (top - 3.0) / storeys;
      const wh = Math.max(0.5, Math.min(1.0, step - 0.4));
      for (let st = 0; st < storeys; st++) for (let k = 0; k < bays; k++) win(-wB / 2 + (k + 0.5) * bw, 3.0 + st * step + (step - wh) / 2, wh);
      for (let k = 0; k < bays; k++) if (k !== doorBay) win(-wB / 2 + (k + 0.5) * bw, 0.95, 1.2);
      // the door: a grey stone frame with a round top, a brown leaf, a glass fanlight
      const du = -wB / 2 + (doorBay + 0.5) * bw, dw = 1.0;
      g.fillStyle = '#a9adb3';
      g.fillRect(px(du - dw / 2 - 0.12), py(1.95), (dw + 0.24) * S, 1.95 * S);
      g.beginPath();
      g.arc(px(du), py(1.95), (dw / 2 + 0.12) * S, Math.PI, 0);
      g.fill();
      g.fillStyle = '#5a3a26';
      g.fillRect(px(du - dw / 2), py(1.95), dw * S, 1.95 * S);
      g.beginPath();
      g.arc(px(du), py(1.95), (dw / 2) * S, Math.PI, 0);
      g.fill();
      g.fillStyle = '#56707e';
      g.beginPath();
      g.arc(px(du), py(1.95), (dw / 2 - 0.1) * S, Math.PI, 0);
      g.fill();
      g.fillStyle = '#c9a55a';
      g.fillRect(px(du + 0.32), py(1.05), 0.06 * S, 0.06 * S);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(wB, H), mat = new THREE.MeshLambertMaterial({ map: tex });
      disposables.push(tex, geo, mat);
      const m = new THREE.Mesh(geo, mat);
      const [fx, fz] = on(s, mid, 0.04);
      m.position.set(fx, H / 2, fz);
      m.rotation.y = faceYaw(s);
      add(m);
      // the board and the lamp stand over the door (between its arch and the first upper windows)
      const door = mid + du, [bx, bz] = on(s, door, 0);
      sign({ ...s, x: bx, z: bz }, 'POLIZEI', 2.72, 1.5, { back: '#1f4fa8', ink: '#ffffff', rim: '#1f4fa8' }, 'bold 84px "Helvetica Neue", Arial, sans-serif');
      onFace(s, door + 0.95, 0.1, 2.5, 0.18, 0.3, 0.12, 0x3f7cff, true);
      continue;
    }
    onFace(s, 0, 0.03, 1, 0.9, 2, 0.06, 0x4a4f5c);
    sign(s, s.text, 2.9, Math.min(2.8, w + 0.4), { back: '#e9ecef', ink: '#1f3b63', rim: '#1f3b63' }, 'bold 80px "Helvetica Neue", Arial, sans-serif');
  }

  // ---- across every gap between two houses that one can look into from the plan but not walk through (worked out
  // by tools/waldsee/fences.py, a little way in from the fronts): a fence of upright boards one cannot see through
  {
    const wood = [0x7a5638, 0x6b4a32, 0x86603e];
    // (how far from (ox, oz) along (dx, dz) to the foot of a real wall one sees)
    const toWall = (ox: number, oz: number, dx: number, dz: number, max: number): number => {
      let best = max;
      for (const w of wallFeet()) {
        const ex = w.x1 - w.x0, ez = w.z1 - w.z0, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((w.x0 - ox) * ez - (w.z0 - oz) * ex) / den, u = ((w.x0 - ox) * dz - (w.z0 - oz) * dx) / den;
        if (t > 0 && u >= -0.02 && u <= 1.02 && t < best) best = t;
      }
      return best;
    };
    for (const [rx0, rz0, rx1, rz1] of [...WALDSEE_FENCE_RUNS, ...WALDSEE_EXTRA_FENCES]) {
      // (none in the AmannLabs gap: its alleys end in the dark glass of the house itself)
      if ((rx0 + rx1) / 2 > 21.5 && (rx0 + rx1) / 2 < 30.5 && (rz0 + rz1) / 2 > 44 && (rz0 + rz1) / 2 < 52) continue;
      // (from house to house: both ends carried on to the walls beside the run, a little into them)
      const half = Math.hypot(rx1 - rx0, rz1 - rz0) / 2, ux = (rx1 - rx0) / (2 * half), uz = (rz1 - rz0) / (2 * half);
      const mx = (rx0 + rx1) / 2, mz = (rz0 + rz1) / 2;
      const a = Math.min(toWall(mx, mz, -ux, -uz, half + 1.5), half + 1.5) + 0.1, b = Math.min(toWall(mx, mz, ux, uz, half + 1.5), half + 1.5) + 0.1;
      const x0 = mx - ux * a, z0 = mz - uz * a, x1 = mx + ux * b, z1 = mz + uz * b;
      const len = a + b, yaw = Math.atan2(ux, uz);
      const boards = Math.round(len / 0.25);
      for (let k = 0; k < boards; k++) {
        const t = (k + 0.5) * (len / boards);
        // (boards a little wider than their spacing: no slit to look through)
        box(x0 + ux * t, 1.3 + (k % 3) * 0.04, z0 + uz * t, 0.08, 2.6, len / boards + 0.03, wood[k % 3], yaw);
      }
      // (the rails, on the walkable side)
      for (const y of [0.5, 1.9]) box((x0 + x1) / 2 - uz * 0.06, y, (z0 + z1) / 2 + ux * 0.06, 0.05, 0.1, len, 0x5a3a26, yaw);
    }
  }

  // ---- where a street ends: a barrier of red and white beams on posts, lamps on it. Behind it the street goes on
  for (const b of WALDSEE_BARRIERS) {
    const ax = -b.dir[1], az = b.dir[0], yaw = -Math.atan2(az, ax);
    // (from wall to wall: as far as the real fronts on either side, measured along the barrier)
    const reachFrom = (ox: number, oz: number, sx: number): number => {
      let best = b.half + 2;
      for (const w of wallFeet()) {
        const ex = w.x1 - w.x0, ez = w.z1 - w.z0, den = ax * sx * ez - az * sx * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((w.x0 - ox) * ez - (w.z0 - oz) * ex) / den, u = ((w.x0 - ox) * az * sx - (w.z0 - oz) * ax * sx) / den;
        if (t > 0.2 && u >= -0.02 && u <= 1.02 && t < best) best = t;
      }
      return best;
    };
    // (no wider than the lane just behind it either: where a house front stands back, the barrier does not run on
    // in front of the house beside the lane; a wall that only slants into the lane is met where the barrier stands)
    const reach = (sx: number) => {
      const here = reachFrom(b.at[0], b.at[1], sx);
      const behind = Math.min(reachFrom(b.at[0] + b.dir[0] * 0.8, b.at[1] + b.dir[1] * 0.8, sx), reachFrom(b.at[0] + b.dir[0] * 1.6, b.at[1] + b.dir[1] * 1.6, sx));
      return here - behind > 0.8 ? behind : here;
    };
    const left = reach(-1), right = reach(1), width = left + right, mid = (right - left) / 2;
    const at = [b.at[0] + ax * mid, b.at[1] + az * mid];
    const n = Math.max(2, Math.round(width / 0.6));
    for (const y of [0.55, 1.05])
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        box(at[0] + ax * t * width, y, at[1] + az * t * width, width / n + 0.01, 0.2, 0.08, k % 2 ? 0xf4f1ea : 0xd8322a, yaw);
      }
    for (let k = 0; k <= 3; k++) {
      const t = (k / 3 - 0.5) * (1 - 0.3 / width), x = at[0] + ax * t * width, z = at[1] + az * t * width;
      box(x, 0.6, z, 0.1, 1.2, 0.1, 0x4a4f5c);
      box(x, 0.06, z, 0.5, 0.12, 0.3, 0x2a2d33, yaw);
      lamp(x, 1.28, z, 0.16, 0.16, 0.16, 0xffa52b);
    }
  }

  // ---- out on the lake behind the police lane: two pedal boats side by side, rods out toward the barrier, so
  // Mario (red) and Dom (black) can be seen from it
  const textTag = (x: number, y: number, z: number, yaw: number, text: string, w = 0.7, ink = '#ffffff') => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = ink;
    g.font = 'bold 62px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const wide = g.measureText(text).width;
    g.save();
    g.translate(128, 52);
    g.scale(Math.min(1, 230 / wide), 1);
    g.fillText(text, 0, 0);
    g.restore();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(w, w / 2.667), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    disposables.push(tex, geo, mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    add(m);
  };
  const boat = (x: number, z: number, turn: number, shirt: number, cap: number, name: string, ink: string) => {
    const at = (lx: number, lz: number): [number, number] => [x + Math.cos(turn) * lx + Math.sin(turn) * lz, z - Math.sin(turn) * lx + Math.cos(turn) * lz];
    const part = (lx: number, y: number, lz: number, sx: number, sy: number, sz: number, color: number, lean = 0) => {
      const [px, pz] = at(lx, lz);
      box(px, y, pz, sx, sy, sz, color, turn, lean);
    };
    for (const side of [-1, 1]) part(side * 0.55, 0.02, 0, 0.4, 0.3, 2.6, 0xf4f1ea);
    part(0, 0.2, 0, 1.5, 0.1, 2.0, 0xffd23f);
    part(0, 0.42, -0.5, 1.2, 0.36, 0.12, 0xd8322a);
    for (const side of [-1, 1]) part(side * 0.32, 0.34, -0.2, 0.46, 0.1, 0.5, 0x2f5fbf);
    part(0, 0.36, 0.75, 0.5, 0.3, 0.5, 0xd8322a);
    // the angler: blue overalls, his shirt, a cap with a mark on the front, the rod held out over the water
    part(0.1, 0.5, 0.2, 0.3, 0.5, 0.22, 0x2f5fbf);
    part(0.1, 0.98, 0.2, 0.36, 0.5, 0.24, shirt);
    part(0.1, 1.36, 0.2, 0.24, 0.24, 0.24, 0xe9b98f);
    part(0.1, 1.52, 0.2, 0.36, 0.06, 0.36, cap);
    part(0.1, 1.6, 0.2, 0.24, 0.12, 0.24, cap);
    part(0.225, 1.6, 0.2, 0.02, 0.08, 0.08, 0xffffff);
    part(0.34, 1.05, 0.34, 0.1, 0.1, 0.4, shirt);
    part(1.2, 1.55, 0.5, 2.0, 0.04, 0.04, 0x3a2a1c, 0.5);
    const [lx, lz] = at(2.05, 0.5);
    lamp(lx, 1.05, lz, 0.015, 1.95, 0.015, 0xffffff);
    lamp(lx, 0.02, lz, 0.1, 0.08, 0.1, 0xd8322a);
    // the name on the white side of the boat, low on the hull and turned to the shore (the +x side)
    const [nx, nz] = at(0.8, 0);
    textTag(nx, 0.09, nz, turn + Math.PI / 2, name, 0.62, ink);
  };
  if (WALDSEE_BOAT) boat(WALDSEE_BOAT[0] + 0.5, WALDSEE_BOAT[1] + 0.5, 3.23, 0xe0312a, 0xd8322a, 'Mario', '#b3261e');
  if (WALDSEE_BOAT2) boat(WALDSEE_BOAT2[0] + 0.5, WALDSEE_BOAT2[1] + 0.5, 3.07, 0x1b1b1b, 0x1b1b1b, 'Dom', '#141414');
  // a small shark's fin breaking the water to the right of the boats
  if (WALDSEE_SHARK) {
    const x = WALDSEE_SHARK[0] + 0.5, z = WALDSEE_SHARK[1] + 0.5, grey = 0x5f6a72, dark = 0x474e56;
    // its back just under the surface
    box(x, 0.05, z + 0.05, 0.32, 0.1, 0.9, dark);
    // the fin: thin slices that narrow and sweep back toward the tip
    for (let k = 0; k < 6; k++) {
      const t = k / 5, y = 0.08 + t * 0.72, w = 0.68 - t * 0.58, zc = z + t * 0.22;
      box(x, y, zc, 0.1, 0.16, w, k < 2 ? grey : dark);
    }
    // a little white wake ahead of it
    lamp(x, 0.03, z - 0.5, 0.42, 0.02, 0.24, 0xdff1ff);
  }

  // ---- the lakeside promenade: a footpath all round the lake as drawn (see LAKE), about 2.4 m wide, with a low
  // stone rim at the water and a lantern every ten metres or so; behind it a strip of meadow and a few trees, then
  // the houses. The meadow of the plan is laid flat too, so no dark seams show between its blocks.
  {
    const water = (tx: number, tz: number) => waldseeLake(tx, tz);
    const PATH = [0xd0c8b4, 0xc9c1ac, 0xd5ceba];
    const FLOOR = -0.42, MEADOW_TOP = 0.02, PATH_TOP = 0.035, RIM_TOP = 0.13;
    // (a slab from the ground up to a level: it stands on the ground beyond the map and in the water blocks alike)
    const slab = (x: number, z: number, sx: number, sz: number, top: number, color: number) => box(x, (top + FLOOR) / 2, z, sx, top - FLOOR, sz, color);
    // how far (tiles, to the middle of the nearest water tile) a land tile lies from the lake, up to 3
    const near = (tx: number, tz: number): number => {
      let d = 9;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (water(tx + dx, tz + dz)) d = Math.min(d, Math.hypot(dx, dz));
      return d;
    };
    const isPath = (tx: number, tz: number) => !water(tx, tz) && near(tx, tz) <= 1.5;
    const lanterns: [number, number][] = [], trees: [number, number][] = [];
    const lantern = (lx: number, lz: number) => {
      box(lx, 0.9, lz, 0.09, 1.8, 0.09, 0x2a2d33);
      box(lx, 1.86, lz, 0.32, 0.08, 0.32, 0x2a2d33);
      lamp(lx, 1.74, lz, 0.2, 0.2, 0.2, 0xffd76a);
      box(lx, 1.99, lz, 0.16, 0.08, 0.16, 0x2a2d33);
    };
    for (let tz = LAKE_WIN.z0; tz < LAKE_WIN.z1; tz++) for (let tx = LAKE_WIN.x0; tx < LAKE_WIN.x1; tx++) {
      if (water(tx, tz)) continue;
      if (waldseeIslet(tx, tz)) {
        slab(tx + 0.5, tz + 0.5, 1.02, 1.02, MEADOW_TOP, MEADOW[(tx * 7 + tz * 3) % 3]);
        continue;
      }
      const x = tx + 0.5, z = tz + 0.5, d = near(tx, tz), k = (tx * 7 + tz * 3) % 3;
      // (the green of the plan by the lake: laid flat, ground that was water as well)
      const g = tx < MAP_W && tz >= 0 ? waldseeGround(tx, tz) : 'street';
      const planGreen = tx >= 84 && tz >= 0 && tz < 62 && (g === 'meadow' || g === 'gravel');
      if (d > 3 && !planGreen) continue;
      if (d <= 1.5) {
        slab(x, z, 1.02, 1.02, PATH_TOP, PATH[k]);
        // the rim: a low stone kerb along each edge that meets the water
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!water(tx + dx, tz + dz)) continue;
          box(x + dx * 0.46, (RIM_TOP + FLOOR) / 2, z + dz * 0.46, dx ? 0.16 : 1.04, RIM_TOP - FLOOR, dz ? 0.16 : 1.04, 0xb9b2a2);
        }
        if (near(tx, tz) === 1 && !lanterns.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 6.2)) {
          lanterns.push([x, z]);
          // (on the land side of the path)
          let ax = 0, az = 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (water(tx + dx, tz + dz)) ((ax -= dx), (az -= dz));
          const len = Math.hypot(ax, az) || 1;
          lantern(x + (ax / len) * 0.36, z + (az / len) * 0.36);
        }
        continue;
      }
      slab(x, z, 1.02, 1.02, MEADOW_TOP, g === 'gravel' && !(d <= 3) ? 0xcfc4ae : MEADOW[k]);
      // (the path is 1.5 tiles wide: this tile lends it a half where it lies behind the path)
      if (d <= 2.2) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isPath(tx + dx, tz + dz)) continue;
        slab(x + dx * 0.25, z + dz * 0.25, dx ? 0.52 : 1.02, dz ? 0.52 : 1.02, PATH_TOP, PATH[k]);
      }
      // a tree here and there on the outer strip, none in the view from the police lane
      const viewed = tx < 112 && tz > 34 && tz < 60;
      if (d >= 3 && !viewed && hash(tx, tz) < 0.35 && !trees.some(([qx, qz]) => Math.hypot(qx - x, qz - z) < 7)) {
        trees.push([x, z]);
        const q = 0.7 + hash(tz, tx) * 0.5, turn = hash(tz, tx) * 1.5;
        box(x, 1.0 * q, z, 0.26 * q, 2.0 * q, 0.26 * q, bark, turn);
        [[1.7, 2.1], [2.2, 2.6], [1.8, 3.1], [1.0, 3.55]].forEach(([w, y], j) => box(x, y * q, z, w * q, 0.6 * q, w * q, leaf[(tx + tz + j) % 3], turn + j * 0.4));
      }
    }
  }

  const o = new THREE.Object3D(), c = new THREE.Color();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(geo);
  for (const [pieces, mat] of [[lit, new THREE.MeshLambertMaterial({ color: 0xffffff })], [glow, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })]] as const) {
    if (pieces.length === 0) continue;
    disposables.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, pieces.length);
    mesh.castShadow = mat instanceof THREE.MeshLambertMaterial;
    mesh.receiveShadow = true;
    pieces.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(0, p.yaw, p.lean, 'YXZ');
      o.scale.set(p.sx, p.sy, p.sz);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.setHex(p.color));
    });
    add(mesh);
  }
}
