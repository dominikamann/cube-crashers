import * as THREE from 'three';
import { WALDSEE_FENCE_RUNS, WALDSEE_LAKES, WALDSEE_LOD2 } from './waldsee-lod2';
import markUrl from './amannlabs-mark.png';
import {
  WALDSEE_BARRIERS, WALDSEE_BOAT, WALDSEE_BOAT2, WALDSEE_CARS, WALDSEE_BUILT, WALDSEE_CZARDAS, WALDSEE_CZARDAS_SIDE, WALDSEE_ALLEY, WALDSEE_DROWNED, WALDSEE_FOUNTAIN, WALDSEE_HIDDEN, WALDSEE_HOUSES, WALDSEE_REPLACED, WALDSEE_ROOFS, WALDSEE_SHARK, WALDSEE_SIGNS, WALDSEE_TABLES, WALDSEE_TILES,
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
type Foot = { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number; id: number; eave: number };
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
      out.push({ x0, z0, x1, z1, nx, nz, id, eave });
    }
  }
  return out;
})());
/**
 * A front put onto the real wall nearest to it that looks about the same way. `wall` tells how the real wall is:
 * `width` along the front, `along` where the front's point lies on it (from the wall's middle, in the front's own
 * `along` direction), and `eave`, the height up to the roof
 */
export type OnWall = { wall?: { width: number; along: number; eave: number } };
const onWall = <F extends WaldseeFace>(f: F): F & OnWall => {
  let best: { d: number; x: number; z: number; nx: number; nz: number; len: number; u: number; eave: number; ex: number; ez: number } | null = null;
  for (const w of wallFeet()) {
    if (w.nx * f.dx + w.nz * f.dz < 0.5) continue;
    const ex = w.x1 - w.x0, ez = w.z1 - w.z0, L2 = ex * ex + ez * ez;
    const u = Math.max(0, Math.min(1, ((f.x - w.x0) * ex + (f.z - w.z0) * ez) / L2));
    const x = w.x0 + ex * u, z = w.z0 + ez * u, d = Math.hypot(f.x - x, f.z - z);
    if (!best || d < best.d) best = { d, x, z, nx: w.nx, nz: w.nz, len: Math.sqrt(L2), u, eave: w.eave, ex, ez };
  }
  if (!best || best.d > 4) return f;
  // (the front's `along` runs (-dz, dx): the sign of the wall's direction in it)
  const sgn = Math.sign(-best.nz * best.ex + best.nx * best.ez) || 1;
  const wall = { width: best.len, along: (best.u - 0.5) * best.len * sgn, eave: best.eave };
  return { ...f, x: best.x, z: best.z, dx: best.nx, dz: best.nz, len: Math.max(1, Math.min(f.len, Math.floor(best.len))), wall };
};
const onBlock = <F extends WaldseeFace>(f: F): F & OnWall => {
  if (WALDSEE_LOD2.length) return onWall(f);
  const b = BUILT.get(codeAt(Math.floor(f.x - f.dx * 0.5 - (f.dx ? 0 : 0.0001)), Math.floor(f.z - f.dz * 0.5 - (f.dz ? 0 : 0.0001))) - 6);
  if (!b) return f;
  const x = f.dx > 0 ? b.x1 + 1 : f.dx < 0 ? b.x0 : Math.min(Math.max(f.x, b.x0 + 1), b.x1);
  const z = f.dz > 0 ? b.z1 + 1 : f.dz < 0 ? b.z0 : Math.min(Math.max(f.z, b.z0 + 1), b.z1);
  return { ...f, x, z, len: f.dx ? b.z1 - b.z0 + 1 : b.x1 - b.x0 + 1 };
};
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
      const h0 = houseAt(tx, tz), h = h0 && h0.col === '6f93c9' && bi !== 280 ? null : h0;
      const plaster = h ? parseInt(h.col, 16) : PALE[bi % PALE.length], tiles = h ? parseInt(h.roof, 16) : TILES[bi % TILES.length];
      const shutters = h?.shut ?? '';
      // (its eaves: the lowest point of its roofs; as many storeys of about two tiles as fit under them)
      let eaves = Infinity;
      for (const [k, q] of b) if (k === 'r') for (let i = 1; i < q.length; i += 3) eaves = Math.min(eaves, q[i]);
      if (!isFinite(eaves)) {
        eaves = 0;
        for (const [, q] of b) for (let i = 1; i < q.length; i += 3) eaves = Math.max(eaves, q[i]);
      }
      const storeys = Math.max(1, Math.round(eaves / 2)), storey = eaves / storeys;
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
          if (!wall || Math.max(...tri.map(p => p.y)) <= eaves + 0.05) for (const p of tri) put(p, false);
          else if (Math.min(...tri.map(p => p.y)) >= eaves - 0.05) for (const p of tri) put(p, true);
          else {
            // (a triangle across the eaves: cut there, windows below, plaster above)
            const cut = (pa: THREE.Vector3, pb: THREE.Vector3) => pa.clone().lerp(pb, (eaves - pa.y) / (pb.y - pa.y));
            const below = tri.filter(p => p.y <= eaves), above = tri.filter(p => p.y > eaves);
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

  // ---- the Czardas on the Hochstatt, the place to sit: a blue-grey house with cream corner strips and bands, red
  // shutters and a round-topped door; its name on a board over the door, strings of lights over the terrace and the
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
      // plaster, the stone plinth, a cream band between the storeys, cream strips at the corners, shadow under the eaves
      rect(-W / 2, 0, W / 2, H, '#8398b4');
      rect(-W / 2, 0, W / 2, 0.5, '#8d8f95');
      rect(-W / 2, 2.38, W / 2, 2.5, '#e6dfcb');
      rect(-W / 2, 0, -W / 2 + 0.3, H, '#e6dfcb');
      rect(W / 2 - 0.3, 0, W / 2, H, '#e6dfcb');
      const sh = g.createLinearGradient(0, 0, 0, 0.5 * S);
      sh.addColorStop(0, 'rgba(30,40,60,0.28)');
      sh.addColorStop(1, 'rgba(30,40,60,0)');
      g.fillStyle = sh;
      g.fillRect(0, 0, cw, 0.5 * S);
      // a window: cream frame, dark panes, a cross, a sill and red shutters either side
      const win = (u: number, yc: number, ww: number, wh: number, shutters: boolean) => {
        if (shutters) for (const e of [-1, 1]) {
          const x0 = u + e * (ww / 2 + 0.04) - (e < 0 ? 0.27 : 0);
          rect(x0, yc - wh / 2, x0 + 0.27, yc + wh / 2, '#b3322a');
          for (let k = 1; k < 6; k++) rect(x0, yc - wh / 2 + (wh * k) / 6, x0 + 0.27, yc - wh / 2 + (wh * k) / 6 + 0.02, '#8a2420');
        }
        rect(u - ww / 2, yc - wh / 2, u + ww / 2, yc + wh / 2, '#ece6d3');
        rect(u - ww / 2 + 0.05, yc - wh / 2 + 0.05, u + ww / 2 - 0.05, yc + wh / 2 - 0.05, '#566a7c');
        rect(u - ww / 2 + 0.05, yc + wh * 0.1, u + ww / 2 - 0.05, yc + wh / 2 - 0.05, '#7890a2');
        rect(u - 0.02, yc - wh / 2 + 0.05, u + 0.02, yc + wh / 2 - 0.05, '#ece6d3');
        rect(u - ww / 2 + 0.05, yc - 0.02, u + ww / 2 - 0.05, yc + 0.02, '#ece6d3');
        rect(u - ww / 2 - 0.05, yc - wh / 2 - 0.05, u + ww / 2 + 0.05, yc - wh / 2, '#d6cfba');
      };
      const d = Math.max(-W / 2 + 0.95, Math.min(W / 2 - 0.95, doorU));
      const n = Math.max(2, Math.round((W - 0.6) / 1.8)), pitch = (W - 0.6) / n;
      let wide = false;
      for (let k = 0; k < n; k++) {
        const u = -W / 2 + 0.3 + (k + 0.5) * pitch;
        win(u, 3.55, 0.66, 0.96, true);
        if (Math.abs(u - d) < 1.0) continue;
        if (big && !wide && Math.abs(u - d) < 2.4) {
          // (the big plain window next to the door)
          win(u, 1.55, 1.25, 1.05, false);
          wide = true;
        } else win(u, 1.6, 0.66, 0.96, true);
      }
      // the door: a cream surround, a round-topped light over a brown wooden door, a step
      rect(d - 0.5, 0, d + 0.5, 2.15, '#ece6d3');
      rect(d - 0.4, 0, d + 0.4, 2.05, '#6a4630');
      rect(d - 0.02, 0, d + 0.02, 2.05, '#4a2f20');
      rect(d - 0.5, 2.15, d + 0.5, 2.28, '#ece6d3');
      g.fillStyle = '#ece6d3';
      g.beginPath();
      g.arc(px(d), py(2.3), 0.5 * S, Math.PI, 0);
      g.fill();
      g.fillStyle = '#6c7f8c';
      g.beginPath();
      g.arc(px(d), py(2.32), 0.4 * S, Math.PI, 0);
      g.fill();
      rect(d - 0.02, 2.3, d + 0.02, 2.72, '#ece6d3');
      rect(d - 0.58, 0, d + 0.58, 0.07, '#b9b6ae');
      // the name painted on the plaster beside the door, over the band, clear of windows and shutters
      g.fillStyle = '#f1ead6';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round(0.36 * S)}px Georgia, "Times New Roman", serif`;
      g.fillText(name, px(d + (d < 0 ? 1 : -1) * 2.0), py(2.66));
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
    // (the front: the door at the end of the wall near the Hochstatt, the big window beside it)
    const alongF = f.wall?.along ?? 0;
    const door = at(f, wallPlane(f, alongF + 0.4, true, 'CZARDAS') - alongF);
    for (const e of [-1, 1]) {
      const [lx, lz] = on(door, e * 0.78, 0.1);
      lamp(lx, 2.0, lz, 0.14, 0.3, 0.14, 0xffd76a);
    }
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
    for (let k = 0; k < 5; k++) {
      const [fx, fz] = on(terrace, -w / 2 - 1.3 + ((w + 2.6) * (k + 0.5)) / 5, out + 0.7);
      box(fx, 0.2, fz, 1, 0.4, 0.34, 0x6b4a32, faceYaw(terrace));
      box(fx, 0.46, fz, 0.94, 0.16, 0.3, 0x4f9a4a, faceYaw(terrace));
      for (let q = -1; q <= 1; q++) box(fx + q * 0.3 * Math.abs(terrace.dz), 0.58, fz + q * 0.3 * Math.abs(terrace.dx), 0.16, 0.14, 0.16, q ? 0xd8322a : 0xff6f8a);
    }
    // its second door, on the side toward the Hauptstrasse: the same house, a small board with its name over it
    if (WALDSEE_CZARDAS_SIDE) {
      const sd = onBlock(WALDSEE_CZARDAS_SIDE), alongS = sd.wall?.along ?? 0;
      wallPlane(sd, alongS, false, 'Czardas');
    }
    const [cx, cz] = on(terrace, w / 2 + 1.9, 2.6);
    box(cx, 0.45, cz, 0.5, 0.9, 0.08, 0x2a2d33, 0.5);
    box(cx, 0.45, cz + 0.05, 0.4, 0.5, 0.02, 0xf4f1ea, 0.5);
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
        // the alleys two wings of the house close them as dead ends, up to the neighbours' walls. A gable roof of red
        // tiles, the eaves as high as the neighbours', plaster sides with windows
        const X0 = 23, X1 = 29, Z0 = 44, Z1 = 50, W = X1 - X0, cx = (X0 + X1) / 2, E = 6.2, RISE = 3.6, S = 80;
        const leftX = (z: number) => 21.65 + Math.max(0, z - 46.55) * 0.193;
        const rightX = (z: number) => 28.31 + (z - 40.09) * 0.245;
        const PLASTER = '#efe4cc';
        // plaster with white-framed windows, one storey of about two tiles each; a ground-floor window unless a door is there
        const plaster = (wB: number, hB: number, groundWindows: boolean): HTMLCanvasElement => {
          const cw = Math.round(wB * S), ch = Math.round(hB * S), c = document.createElement('canvas');
          c.width = cw;
          c.height = ch;
          const g = c.getContext('2d')!;
          g.fillStyle = PLASTER;
          g.fillRect(0, 0, cw, ch);
          g.fillStyle = '#d3c6aa';
          g.fillRect(0, ch - 0.15 * S, cw, 0.15 * S);
          const n = Math.max(1, Math.round(wB / 1.4));
          for (let yc = groundWindows ? 1.5 : 3.5; yc + 0.6 < hB; yc += 2)
            for (let k = 0; k < n; k++) {
              const u = (k + 0.5) * (wB / n), ww = 0.62, wh = 0.9, x = (u - ww / 2) * S, y = (hB - yc - wh / 2) * S;
              g.fillStyle = '#fbf8f0';
              g.fillRect(x, y, ww * S, wh * S);
              g.fillStyle = '#566a76';
              g.fillRect(x + 0.05 * S, y + 0.05 * S, (ww - 0.1) * S, (wh - 0.1) * S);
              g.fillStyle = '#fbf8f0';
              g.fillRect(x + (ww / 2 - 0.025) * S, y + 0.05 * S, 0.05 * S, (wh - 0.1) * S);
              g.fillStyle = '#d3c6aa';
              g.fillRect(x - 0.05 * S, y + wh * S, (ww + 0.1) * S, 0.06 * S);
            }
          return c;
        };
        // the glass front of the house: dark glass, light mullions, a glowing cyan line under the eaves, four lit windows
        const curtain = (wB: number, hB: number): HTMLCanvasElement => {
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
          for (const ci of [1, 5])
            for (const y0 of [3.85, 4.95]) {
              const x = ci * colW * S, y = (hB - y0 - 0.95) * S, w = 2 * colW * S, h = 0.95 * S;
              g.fillStyle = 'rgba(43,240,255,0.35)';
              g.fillRect(x, y, w, h);
              g.fillStyle = '#1de6ff';
              g.fillRect(x + 3, y + 3, w - 6, h - 6);
            }
          g.fillStyle = '#0a1017';
          g.fillRect(0, (hB - 2.5) * S, cw, ch - (hB - 2.5) * S);
          g.fillStyle = '#2bf0ff';
          g.fillRect(0, (hB - 2.5) * S - 2, cw, 3);
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
        wallQ(X0, 47, X0, Z1, E, plaster(Z1 - 47, E, false));
        wallQ(X1, Z1, X1, 49, E, plaster(Z1 - 49, E, true));
        const wl = 21.7, wr = rightX(49), hw = E - 0.2;
        wallQ(leftX(47), 47, X0, 47, hw, plaster(X0 - leftX(47), hw, true));
        wallQ(X1, 49, wr, 49, hw, plaster(wr - X1, hw, true));
        wallQ(rightX(Z0), Z0, wl, Z0, hw, plaster(rightX(Z0) - wl, hw, true));
        for (const ex of [X0, X1]) box(ex, E / 2, Z1, 0.16, E, 0.16, 0x141c28);
        // the wings: flat tiled tops under the eaves of the main roof
        flat([[wl, Z0], [X0, Z0], [X0, 47], [leftX(47), 47]], hw, 0xa9553a);
        flat([[X1, Z0], [rightX(Z0), Z0], [wr, 49], [X1, 49]], hw, 0xa9553a);
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
        // the roof: a gable roof of red tiles, the ridge running back from the street, a little overhang; the gables in plaster
        {
          const ov = 0.3, drop = (ov * RISE) / (W / 2), yE = E - drop, yR = E + RISE;
          const tc = document.createElement('canvas');
          tc.width = 64;
          tc.height = 64;
          const tg = tc.getContext('2d')!;
          tg.fillStyle = '#b25a3e';
          tg.fillRect(0, 0, 64, 64);
          tg.fillStyle = '#8f432c';
          for (let r = 0; r < 4; r++) {
            tg.fillRect(0, r * 16, 64, 2);
            for (let k = 0; k < 4; k++) tg.fillRect(k * 16 + (r & 1) * 8, r * 16, 2, 16);
          }
          const tt = new THREE.CanvasTexture(tc);
          tt.colorSpace = THREE.SRGBColorSpace;
          tt.wrapS = tt.wrapT = THREE.RepeatWrapping;
          const tm = new THREE.MeshLambertMaterial({ map: tt, side: THREE.DoubleSide });
          const pm = new THREE.MeshLambertMaterial({ color: parseInt(PLASTER.slice(1), 16), side: THREE.DoubleSide });
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
          // (the ridge)
          box(cx, yR + 0.04, (zA + zB) / 2, 0.22, 0.12, zA - zB, 0x8f432c);
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
      // the Amadeus: one rough grey-white plaster facade painted flush on its real wall: grey-framed lit windows
      // upstairs with a tinsel garland, the name over a grey canopy band, below it the recessed cream ground floor
      // (a wooden door up three steps, a "Burgers" chalkboard, a wide white-framed glass front lit violet); a black
      // blade sign on an iron arm, an olive tree with fairy lights and a few bistro tables stand before it
      const wl = (s as OnWall).wall, W = wl?.width ?? 4, E = wl?.eave ?? 4.5, S = 80, mid = -(wl?.along ?? 0);
      const cw = Math.round(W * S), ch = Math.round(E * S);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const g = canvas.getContext('2d')!;
      const px = (u: number) => (u + W / 2) * S;
      const py = (y: number) => (E - y) * S;
      g.fillStyle = '#ece6d4';
      g.fillRect(0, 0, cw, ch);
      const shadow = g.createLinearGradient(0, 0, 0, 0.5 * S);
      shadow.addColorStop(0, 'rgba(60,56,50,0.28)');
      shadow.addColorStop(1, 'rgba(60,56,50,0)');
      g.fillStyle = shadow;
      g.fillRect(0, 0, cw, 0.5 * S);
      // windows upstairs: grey frames, warm lit rooms, a tinsel garland along the sills
      const win = (u: number, yc: number) => {
        const ww = 0.7, wh = 0.9;
        g.fillStyle = '#8a8d92';
        g.fillRect(px(u - ww / 2), py(yc + wh / 2), ww * S, wh * S);
        g.fillStyle = '#f0c98a';
        g.fillRect(px(u - ww / 2 + 0.07), py(yc + wh / 2 - 0.07), (ww - 0.14) * S, (wh - 0.14) * S);
        g.fillStyle = '#f7f1e4';
        g.fillRect(px(u - 0.02), py(yc + wh / 2 - 0.07), 0.04 * S, (wh - 0.14) * S);
        g.fillStyle = '#7a7d82';
        g.fillRect(px(u - ww / 2 - 0.06), py(yc - wh / 2 - 0.04), (ww + 0.12) * S, 0.07 * S);
      };
      const nUp = Math.max(1, Math.round(W / 1.5));
      for (let yc = 4.55; yc + 0.6 < E; yc += 2) {
        for (let k = 0; k < nUp; k++) win(-W / 2 + (k + 0.5) * (W / nUp), yc);
        g.fillStyle = '#9aa0a8';
        g.fillRect(0, py(yc - 0.5), cw, 0.03 * S);
      }
      // the grey canopy band along the whole front, then the cream recessed ground floor under it
      g.fillStyle = '#e9e3d2';
      g.fillRect(0, py(2.5), cw, 2.5 * S);
      g.fillStyle = '#c9c1ac';
      g.fillRect(0, py(2.5), cw, 0.12 * S);
      g.fillStyle = '#f2efe8';
      g.fillRect(0, py(3.1), cw, 0.06 * S);
      g.fillStyle = '#5a5d62';
      g.fillRect(0, py(3.04), cw, 0.3 * S);
      // the name: a big red A, the rest smaller, and the trade below it
      g.fillStyle = '#8c1f2a';
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      const big = `${Math.round(0.62 * S)}px Georgia, "Times New Roman", serif`, small = `${Math.round(0.36 * S)}px Georgia, "Times New Roman", serif`;
      g.font = big;
      const wa = g.measureText('A').width;
      g.font = small;
      const wr = g.measureText('MADEUS').width, tot = wa + wr + 2, sc = Math.min(1, (0.7 * cw) / tot);
      const nx = cw * 0.5 + 0.15 * S - (tot * sc) / 2;
      g.save();
      g.translate(nx, py(3.65));
      g.scale(sc, 1);
      g.font = big;
      g.fillText('A', 0, 0);
      g.fillStyle = '#2a2428';
      g.font = small;
      g.fillText('MADEUS', wa + 2, 0);
      g.restore();
      g.fillStyle = '#2a2428';
      g.font = `${Math.round(0.15 * S)}px Georgia, "Times New Roman", serif`;
      g.textAlign = 'center';
      g.fillText('Bar · Lounge · Restaurant', nx + (tot * sc) / 2 + 0.2 * S, py(3.65 - 0.3));
      // downstairs: a wooden glazed door at the left, a black chalkboard, then the glass front lit violet
      const du = -W / 2 + 0.95, dw = 0.85;
      g.fillStyle = '#b97a3e';
      g.fillRect(px(du - dw / 2), py(2.15), dw * S, 1.95 * S);
      g.fillStyle = '#e8c68a';
      for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 3; c2++) g.fillRect(px(du - dw / 2 + 0.1 + c2 * 0.22), py(2.05 - r * 0.28), 0.18 * S, 0.24 * S);
      const bu = du + dw / 2 + 0.45;
      g.fillStyle = '#4a3a2a';
      g.fillRect(px(bu - 0.28), py(2.3), 0.56 * S, 0.96 * S);
      g.fillStyle = '#17171a';
      g.fillRect(px(bu - 0.25), py(2.27), 0.5 * S, 0.9 * S);
      g.fillStyle = '#e8e4da';
      g.font = `${Math.round(0.09 * S)}px Georgia, serif`;
      g.fillText('Delicious', px(bu), py(2.1));
      g.fillText('BURGERS', px(bu), py(1.95));
      g.fillStyle = '#c9a878';
      g.fillRect(px(bu - 0.14), py(1.75), 0.28 * S, 0.22 * S);
      const gx0 = bu + 0.5, gx1 = W / 2 - 0.1;
      if (gx1 - gx0 > 0.6) {
        g.fillStyle = '#f4f1ea';
        g.fillRect(px(gx0), py(2.4), (gx1 - gx0) * S, 1.95 * S);
        const glass = g.createLinearGradient(0, py(2.32), 0, py(0.5));
        glass.addColorStop(0, '#5a2a8a');
        glass.addColorStop(0.6, '#7a3fb0');
        glass.addColorStop(1, '#43275f');
        g.fillStyle = glass;
        g.fillRect(px(gx0 + 0.07), py(2.33), (gx1 - gx0 - 0.14) * S, 1.81 * S);
        // a poster in the right half ("TO GO") and the white frame bars
        g.fillStyle = '#2a1d34';
        g.fillRect(px((gx0 + gx1) / 2 + 0.05), py(2.2), ((gx1 - gx0) / 2 - 0.15) * S, 1.5 * S);
        g.fillStyle = '#f4f1ea';
        g.fillRect(px((gx0 + gx1) / 2 - 0.03), py(2.33), 0.06 * S, 1.81 * S);
        g.textAlign = 'center';
        g.font = `bold ${Math.round(0.13 * S)}px Arial, sans-serif`;
        g.fillText('TO GO', px((gx0 + gx1) / 2 + ((gx1 - gx0) / 4)), py(0.7));
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(W, E);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      disposables.push(tex, geo, mat);
      const m = new THREE.Mesh(geo, mat);
      const [fx, fz] = on(s, mid, 0.04);
      m.position.set(fx, E / 2, fz);
      m.rotation.y = faceYaw(s);
      add(m);
      // the violet glow of the lounge behind the glass
      if (gx1 - gx0 > 0.6) onFace(s, mid + (gx0 + gx1) / 2, 0.06, 1.3, gx1 - gx0 - 0.3, 1.4, 0.03, 0x9a5af0, true);
      // the canopy sticks out a little over the front
      onFace(s, mid, 0.2, 2.62, W - 0.1, 0.1, 0.4, 0x5a5d62);
      // three grey stone steps up to the door
      for (let k = 0; k < 3; k++) onFace(s, mid - W / 2 + 0.95, 0.12 + (2 - k) * 0.17, 0.09 + k * 0.09, 1.1, 0.18 + k * 0.18, 0.17, 0x8c8e90);
      // the black blade sign on its iron arm, upper left
      const bx = mid - W / 2 + 1.3;
      onFace(s, bx, 0.3, 3.9, 0.04, 0.04, 0.55, 0x1a1a1c);
      onFace(s, bx, 0.58, 3.5, 0.05, 0.62, 0.36, 0xf4f1ea);
      onFace(s, bx, 0.6, 3.55, 0.06, 0.34, 0.2, 0xb8322a);
      onFace(s, bx, 0.3, 3.25, 0.05, 0.4, 0.05, 0x1a1a1c);
      // the olive tree with fairy lights left of the steps, and a few bistro tables
      onFace(s, mid - W / 2 + 0.2, 0.8, 0.3, 0.45, 0.6, 0.45, 0x3a3a3e);
      onFace(s, mid - W / 2 + 0.2, 0.8, 1.0, 0.1, 0.8, 0.1, 0x5a4a3a);
      onFace(s, mid - W / 2 + 0.2, 0.8, 1.7, 0.7, 0.8, 0.7, 0x5f7a4a);
      onFace(s, mid - W / 2 + 0.2, 0.8, 1.7, 0.74, 0.5, 0.74, 0xffe9a8, true);
      for (const u of [0.1, 1.1]) {
        onFace(s, mid + (gx0 + gx1) / 2 + u - 0.5, 0.9, 0.55, 0.5, 0.05, 0.5, 0x2a2a2e);
        onFace(s, mid + (gx0 + gx1) / 2 + u - 0.5, 0.9, 0.28, 0.06, 0.55, 0.06, 0x2a2a2e);
        for (const sd of [-1, 1]) {
          onFace(s, mid + (gx0 + gx1) / 2 + u - 0.5 + sd * 0.4, 0.9, 0.3, 0.3, 0.6, 0.3, 0x3a3a3e);
          onFace(s, mid + (gx0 + gx1) / 2 + u - 0.5 + sd * 0.4, 0.9, 0.38, 0.32, 0.06, 0.32, 0xb8322a);
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
    if (s.kind === 'bank') {
      // the bank, seen over the hedge behind the barrier: a hedge before it, its name on the wall
      for (let k = -2; k <= 2; k++) onFace(s, k * 0.9, 1.2, 0.6, 0.86, 1.2, 0.6, k % 2 ? 0x3f7a3a : 0x478544);
      // the whole front on one plane flush on the real wall: light plaster, a glazed ground floor with the entrance,
      // a row of windows per storey, and the blue-and-orange Volksbank board over the doors
      const wl = (s as OnWall).wall, wB = wl?.width ?? Math.max(3, s.len), H = wl?.eave ?? 6;
      const S = 80, cw = Math.round(wB * S), ch = Math.round(H * S);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const g = canvas.getContext('2d')!;
      const px = (u: number) => (u + wB / 2) * S;
      const py = (y: number) => (H - y) * S;
      g.fillStyle = '#e4dfd3';
      g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#b9b4a8';
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
      // the Volksbank board: blue with the orange rim, the name in white
      const bwid = Math.min(wB - 0.4, 2.6), bh = 0.5, by = 2.7;
      g.fillStyle = '#1f4fa8';
      g.fillRect(px(-bwid / 2), py(by + bh / 2), bwid * S, bh * S);
      g.fillStyle = '#f28c1e';
      g.fillRect(px(-bwid / 2), py(by - bh / 2 + 0.06), bwid * S, 0.06 * S);
      g.fillStyle = '#ffffff';
      g.font = `bold ${Math.round(0.3 * S)}px "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Volksbank', cw / 2, py(by + 0.02), (bwid - 0.2) * S);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(wB, H), mat = new THREE.MeshLambertMaterial({ map: tex });
      disposables.push(tex, geo, mat);
      const m = new THREE.Mesh(geo, mat);
      const [fx, fz] = on(s, -(wl?.along ?? 0), 0.04);
      m.position.set(fx, H / 2, fz);
      m.rotation.y = faceYaw(s);
      add(m);
      continue;
    }
    if (s.kind === 'shop') {
      // the little shop: the whole real wall painted flush: a grey canopy over big windows full of things and a
      // glass door, pink shutters on the windows upstairs, its name on a blue board
      const S = 80, real = (s as OnWall).wall, wB = real?.width ?? w, H = real?.eave ?? 6;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(wB * S);
      canvas.height = Math.round(H * S);
      const g = canvas.getContext('2d')!;
      const px = (u: number) => (u + wB / 2) * S;
      const py = (y: number) => (H - y) * S;
      g.fillStyle = '#ece3d0';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = '#d3c9b4';
      g.fillRect(0, py(0.2), canvas.width, 0.2 * S);
      const shade = g.createLinearGradient(0, 0, 0, 0.6 * S);
      shade.addColorStop(0, 'rgba(66,58,44,0.30)');
      shade.addColorStop(1, 'rgba(66,58,44,0)');
      g.fillStyle = shade;
      g.fillRect(0, 0, canvas.width, 0.6 * S);
      // upstairs: a window with a pair of pink shutters per storey and per 1.5 tiles, as many as fit under the eave
      const nUp = Math.max(1, Math.round(wB / 1.6));
      for (let st = 1; (st + 1) * 2 <= H + 0.3; st++) {
        const yc = st * 2 + 1.05;
        for (let k = 0; k < nUp; k++) {
          const u = -wB / 2 + (k + 0.5) * (wB / nUp);
          g.fillStyle = '#b97a8c';
          for (const side of [-1, 1]) g.fillRect(px(u + side * 0.43 - 0.11), py(yc + 0.45), 0.22 * S, 0.9 * S);
          g.fillStyle = '#fbf8f0';
          g.fillRect(px(u - 0.3), py(yc + 0.44), 0.6 * S, 0.88 * S);
          g.fillStyle = '#5d717d';
          g.fillRect(px(u - 0.25), py(yc + 0.39), 0.5 * S, 0.78 * S);
          g.fillStyle = '#fbf8f0';
          g.fillRect(px(u - 0.02), py(yc + 0.39), 0.04 * S, 0.78 * S);
        }
      }
      // downstairs: the door at one end (the left, as one looks at it) and a big window, with the canopy above both
      const doorU = -wB / 2 + 0.75, winL = doorU + 0.75, winR = wB / 2 - 0.15;
      g.fillStyle = '#4a3a30';
      g.fillRect(px(doorU - 0.55), py(2.05), 1.1 * S, 2.05 * S);
      g.fillStyle = '#3b4a54';
      g.fillRect(px(doorU - 0.45), py(1.95), 0.9 * S, 1.85 * S);
      g.fillStyle = '#d8d2c4';
      g.fillRect(px(doorU + 0.28), py(1.0), 0.05 * S, 0.3 * S);
      if (winR - winL > 0.8) {
        g.fillStyle = '#4a3a30';
        g.fillRect(px(winL), py(2.0), (winR - winL) * S, 1.6 * S);
        const glass = g.createLinearGradient(0, py(1.9), 0, py(0.5));
        glass.addColorStop(0, '#46535b');
        glass.addColorStop(1, '#6b5a40');
        g.fillStyle = glass;
        g.fillRect(px(winL + 0.08), py(1.92), (winR - winL - 0.16) * S, 1.44 * S);
        // a lit shelf with boxes in many colours
        g.fillStyle = '#e8c88a';
        g.fillRect(px(winL + 0.08), py(1.0), (winR - winL - 0.16) * S, 0.06 * S);
        const cols = ['#d8322a', '#2f7a4a', '#2f5fbf', '#f2b632', '#8a5a9a'];
        const n = Math.max(2, Math.round((winR - winL - 0.4) / 0.3));
        for (let i = 0; i < n; i++) {
          g.fillStyle = cols[i % cols.length];
          g.fillRect(px(winL + 0.22 + i * ((winR - winL - 0.44) / n)), py(1.0 + 0.2 + (i % 3) * 0.1), 0.16 * S, (0.2 + (i % 3) * 0.1) * S);
        }
      }
      // the canopy: a grey strip over door and window
      g.fillStyle = '#9aa0a8';
      g.fillRect(px(-wB / 2 + 0.1), py(2.3), (wB - 0.2) * S, 0.2 * S);
      g.fillStyle = '#7d838b';
      g.fillRect(px(-wB / 2 + 0.1), py(2.12), (wB - 0.2) * S, 0.04 * S);
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
      const mid = { ...s, x: fx, z: fz };
      sign(mid, s.text, 2.62, Math.min(2.2, wB - 0.2), { back: '#1f3f8f', ink: '#ffd23f', rim: '#ffd23f' });
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
        // the inn: its real wall, painted whole on one plane flush on it: a cream ground floor with small-paned
        // windows and the door, white storeys above with red timber, its name in old letters over the door;
        // tables and big pots with little trees before it
        const real = (s as OnWall).wall;
        const W = real?.width ?? span, H = real?.eave ?? 5.3, S = 64;
        const [mx, mz] = on(s, -(real?.along ?? 0), 0);
        const mid: WaldseeFace = { ...s, x: mx, z: mz };
        const cw = Math.round(W * S), ch = Math.round(H * S);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext('2d')!;
        const px = (u: number) => (u + W / 2) * S;
        const py = (y: number) => (H - y) * S;
        const GF = Math.min(2.6, H * 0.5);
        g.fillStyle = '#f4f1ea';
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#efe6cf';
        g.fillRect(0, py(GF), cw, GF * S);
        // the timber of the storeys above: a band at each floor, uprights between the windows
        const storeys = Math.max(1, Math.round((H - GF) / 1.5));
        const sh = (H - GF) / storeys;
        g.fillStyle = '#a33a2c';
        for (let k = 0; k <= storeys; k++) g.fillRect(0, py(GF + k * sh) - 0.05 * S, cw, 0.1 * S);
        const nUp = Math.max(1, Math.round(W / 1.5));
        for (let k = 0; k <= nUp; k++) g.fillRect(px(-W / 2 + (k * W) / nUp) - 0.05 * S, py(H), 0.1 * S, (H - GF) * S);
        const win = (u: number, y0: number, wd: number, h: number, frame: string) => {
          g.fillStyle = frame;
          g.fillRect(px(u - wd / 2 - 0.06), py(y0 + h + 0.06), (wd + 0.12) * S, (h + 0.12) * S);
          g.fillStyle = '#33404f';
          g.fillRect(px(u - wd / 2), py(y0 + h), wd * S, h * S);
          g.fillStyle = frame;
          g.fillRect(px(u) - 0.02 * S, py(y0 + h), 0.04 * S, h * S);
          g.fillRect(px(u - wd / 2), py(y0 + h / 2) - 0.02 * S, wd * S, 0.04 * S);
        };
        // the door at the right, the windows spread over the rest
        const doorU = W / 2 - Math.min(1.1, W * 0.18);
        const slots = Math.max(1, Math.round((W - 1.8) / 1.5));
        for (let k = 0; k < slots; k++) win(-W / 2 + 0.7 + ((k + 0.5) * (doorU - 0.9 - (-W / 2 + 0.7))) / slots, 0.7, 0.8, 1.0, '#7a4a36');
        g.fillStyle = '#7a4a36';
        g.fillRect(px(doorU - 0.43), py(2.1), 0.86 * S, 2.1 * S);
        g.fillStyle = '#5a3a26';
        g.fillRect(px(doorU - 0.35), py(2.02), 0.7 * S, 2.02 * S);
        g.fillStyle = '#c9a06a';
        g.fillRect(px(doorU + 0.2), py(1.05), 0.06 * S, 0.12 * S);
        for (let st = 0; st < storeys; st++) {
          const y0 = GF + st * sh + (sh - 0.9) / 2;
          for (let k = 0; k < nUp; k++) win(-W / 2 + (k + 0.5) * (W / nUp), y0, Math.min(0.7, W / nUp - 0.3), 0.9, '#7a4a36');
        }
        const eaveShade = g.createLinearGradient(0, 0, 0, 0.5 * S);
        eaveShade.addColorStop(0, 'rgba(66,58,44,0.28)');
        eaveShade.addColorStop(1, 'rgba(66,58,44,0)');
        g.fillStyle = eaveShade;
        g.fillRect(0, 0, cw, 0.5 * S);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(W, H);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        const [fx, fz] = on(mid, 0, 0.04);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(mid);
        add(m);
        // its name on a board over the windows, left of the door
        const left = -W / 2 + 0.1, right = doorU - 0.6, bw = Math.min(3.4, right - left);
        sign({ ...mid, x: on(mid, (left + right) / 2, 0)[0], z: on(mid, (left + right) / 2, 0)[1] }, s.text, 1.95 + bw / 8, bw, { back: '#efe6cf', ink: '#7a2a20', rim: '#efe6cf' }, 'bold 58px Georgia, "Times New Roman", serif');
        for (const [a, o] of [[-1.2, 1.4], [0.3, 1.6], [1.5, 1.2]]) {
          const [x, z] = on(mid, a, o);
          box(x, 0.36, z, 0.1, 0.72, 0.1, 0x4a4f5c);
          box(x, 0.74, z, 0.7, 0.06, 0.7, 0x8a5a36);
          for (const t of [0, 2.1, 4.2]) box(x + Math.cos(t) * 0.6, 0.25, z + Math.sin(t) * 0.6, 0.3, 0.5, 0.3, 0x6b4a32, t);
        }
        for (const a of [-W / 2 + 0.3, W / 2 - 0.3]) {
          const [x, z] = on(mid, a, 0.7);
          box(x, 0.3, z, 0.5, 0.6, 0.5, 0xb5653a, 0.4);
          box(x, 1.0, z, 0.1, 0.9, 0.1, 0x6b4a32);
          box(x, 1.6, z, 0.6, 0.6, 0.6, 0x4f9a4a, 0.6);
        }
      } else if (s.kind === 'nkd') {
        // the clothes shop: the whole real wall painted flush, pale plaster with plain windows above, below a long
        // glass shopfront with a door at one end and a grey fascia carrying the red NKD
        const wall = (s as OnWall).wall;
        const wB = wall?.width ?? span, H = wall?.eave ?? 3.6, mid = -(wall?.along ?? 0);
        const S = 64, cw = Math.max(64, Math.round(wB * S)), ch = Math.round(H * S);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext('2d')!;
        const px = (u: number) => (u + wB / 2) * S;
        const py = (y: number) => (H - y) * S;
        g.fillStyle = '#e4dfd2';
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#b9b5ab';
        g.fillRect(0, py(0.18), cw, 0.18 * S);
        const shadow = g.createLinearGradient(0, 0, 0, 0.5 * S);
        shadow.addColorStop(0, 'rgba(60,54,44,0.28)');
        shadow.addColorStop(1, 'rgba(60,54,44,0)');
        g.fillStyle = shadow;
        g.fillRect(0, 0, cw, 0.5 * S);
        // the shopfront: the fascia sits at 2.55-3.15, glass below it, the door at the right-hand end
        const fasciaTop = 3.15, fasciaBot = 2.5;
        const doorW = Math.min(1.3, wB * 0.25), glassL = -wB / 2 + 0.2, glassR = wB / 2 - doorW - 0.5;
        g.fillStyle = '#d9dbe0';
        g.fillRect(0, py(fasciaTop), cw, (fasciaTop - fasciaBot) * S);
        g.fillStyle = '#8f949c';
        g.fillRect(0, py(fasciaBot), cw, 0.05 * S);
        const bays = Math.max(1, Math.round((glassR - glassL) / 1.5)), bw = (glassR - glassL) / bays;
        for (let k = 0; k < bays; k++) {
          const x0 = glassL + k * bw + 0.04, ww = bw - 0.08;
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
            g.fillStyle = cols[(k + c) % 5];
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
        const dx0 = wB / 2 - doorW - 0.25;
        g.fillStyle = '#f4f1ea';
        g.fillRect(px(dx0), py(2.4), doorW * S, 2.22 * S);
        g.fillStyle = '#41505f';
        g.fillRect(px(dx0 + 0.07), py(2.33), (doorW - 0.14) * S, 2.08 * S);
        g.fillStyle = '#c9ccd2';
        g.fillRect(px(dx0 + doorW - 0.22), py(1.3), 0.05 * S, 0.5 * S);
        // the name: red letters on the fascia, near the left like on the real one
        g.fillStyle = '#d0202a';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${Math.round(0.5 * S)}px "Helvetica Neue", Arial, sans-serif`;
        g.fillText(s.text, px((glassL + glassR) / 2), py((fasciaTop + fasciaBot) / 2) + 2);
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
        const [fx, fz] = on(s, mid, 0.04);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(s);
        add(m);
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
        // the tattoo studio at the corner: the whole wall painted flush on the real house. Rough cream plaster,
        // grey painted bands round the ground-floor windows, a dark doorway up four steps, small windows on every
        // floor above, the street's name on a dark plate and its own name on a small grey board
        const real = (s as OnWall).wall, W = real?.width ?? span, H = real?.eave ?? 6, S = 64;
        const cw = Math.round(W * S), ch = Math.round(H * S);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext('2d')!;
        const px = (u: number) => (u + W / 2) * S;
        const py = (y: number) => (H - y) * S;
        g.fillStyle = '#e6dcc4';
        g.fillRect(0, 0, cw, ch);
        // (a little grain in the plaster, a darker plinth and the shadow under the eaves)
        for (let k = 0; k < (cw * ch) / 90; k++) {
          g.fillStyle = k % 2 ? 'rgba(120,104,80,0.10)' : 'rgba(255,250,236,0.12)';
          g.fillRect(hash(k, 3) * cw, hash(k, 7) * ch, 2, 2);
        }
        g.fillStyle = '#c9bfa8';
        g.fillRect(0, py(0.25), cw, 0.25 * S);
        const eave = g.createLinearGradient(0, 0, 0, 0.5 * S);
        eave.addColorStop(0, 'rgba(66,58,44,0.30)');
        eave.addColorStop(1, 'rgba(66,58,44,0)');
        g.fillStyle = eave;
        g.fillRect(0, 0, cw, 0.5 * S);
        const win = (u: number, yc: number, ww: number, wh: number, band: boolean) => {
          if (band) {
            g.fillStyle = '#a9adb3';
            g.fillRect(px(u - ww / 2 - 0.22), py(yc + wh / 2 + 0.22), (ww + 0.44) * S, (wh + 0.44) * S);
          }
          g.fillStyle = '#f2eee2';
          g.fillRect(px(u - ww / 2), py(yc + wh / 2), ww * S, wh * S);
          g.fillStyle = '#3d4b58';
          g.fillRect(px(u - ww / 2 + 0.06), py(yc + wh / 2 - 0.06), (ww - 0.12) * S, (wh - 0.12) * S);
          g.fillStyle = 'rgba(255,255,255,0.22)';
          g.fillRect(px(u - ww / 2 + 0.06), py(yc + wh / 2 - 0.06), (ww - 0.12) * S * 0.3, (wh - 0.12) * S);
          g.fillStyle = '#f2eee2';
          g.fillRect(px(u - 0.025), py(yc + wh / 2 - 0.06), 0.05 * S, (wh - 0.12) * S);
          g.fillRect(px(u - ww / 2 - 0.05), py(yc - wh / 2 - 0.02), (ww + 0.1) * S, 0.07 * S);
        };
        // the doorway at the left end, the shop windows to its right, clear of it
        const doorU = -W / 2 + Math.min(1.2, W * 0.22);
        g.fillStyle = '#a9adb3';
        g.fillRect(px(doorU - 0.65), py(2.5), 1.3 * S, 2.3 * S);
        g.fillStyle = '#2a2d33';
        g.fillRect(px(doorU - 0.5), py(2.4), 1.0 * S, 2.2 * S);
        g.fillStyle = 'rgba(160,190,205,0.35)';
        g.fillRect(px(doorU - 0.4), py(2.1), 0.8 * S, 1.5 * S);
        const wl = doorU + 1.1, nWin = Math.max(0, Math.min(2, Math.floor((W / 2 - wl) / 1.25)));
        for (let k = 0; k < nWin; k++) win(wl + 0.7 + k * 1.5, 1.45, 0.85, 1.0, true);
        // the floors above: small windows in a row, a floor about two tiles high, fitted under the eave
        for (let y = 3.55; y + 0.55 < H - 0.15; y += 1.95) {
          const n = Math.max(1, Math.round(W / 1.5));
          for (let k = 0; k < n; k++) win(-W / 2 + (k + 0.5) * (W / n), y, 0.62, 0.88, false);
        }
        // the street's name on a dark plate at the corner, over the doorway
        g.fillStyle = '#23262c';
        g.fillRect(px(doorU - 0.55), py(2.99), 1.1 * S, 0.28 * S);
        g.fillStyle = '#f4f1ea';
        g.font = `bold ${Math.round(0.17 * S)}px "Helvetica Neue", Arial, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('HOCHSTATT', px(doorU), py(2.85));
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(W, H), mat = new THREE.MeshLambertMaterial({ map: tex });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        const mid = -(real?.along ?? 0);
        const [fx, fz] = on(s, mid, 0.04);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(s);
        add(m);
        // four stone steps up to the door
        for (let k = 0; k < 4; k++) onFace(s, mid + doorU, 0.5 - k * 0.12, (0.14 + k * 0.14) / 2, 1.3, 0.14 + k * 0.14, 0.24, 0x8e9299);
        // its own name on a small grey board over the shop windows
        const bw = Math.min(1.9, W * 0.4);
        const [bx, bz] = on(s, mid + W / 2 - bw / 2 - 0.25, 0);
        sign({ ...s, x: bx, z: bz }, s.text, 2.72, bw, { back: '#8e9299', ink: '#f4f1ea', rim: '#f4f1ea' }, 'bold 70px "Helvetica Neue", Arial, sans-serif');
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

  // ---- where one can walk up to a wall of the plan that no real building stands on (a gap between two houses
  // a little way in, a yard): a fence of upright boards one cannot see through
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
    for (const [rx0, rz0, rx1, rz1] of WALDSEE_FENCE_RUNS) {
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
    // in front of the house beside the lane)
    const reach = (sx: number) => Math.min(reachFrom(b.at[0], b.at[1], sx), reachFrom(b.at[0] + b.dir[0] * 0.8, b.at[1] + b.dir[1] * 0.8, sx), reachFrom(b.at[0] + b.dir[0] * 1.6, b.at[1] + b.dir[1] * 1.6, sx));
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
