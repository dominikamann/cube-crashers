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
const shown = (b: (typeof WALDSEE_LOD2)[number]): boolean => {
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
type Foot = { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number; id: number };
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
      out.push({ x0, z0, x1, z1, nx, nz, id });
    }
  }
  return out;
})());
/** a front put onto the real wall nearest to it that looks about the same way */
const onWall = <F extends WaldseeFace>(f: F): F => {
  let best: { d: number; x: number; z: number; nx: number; nz: number; len: number } | null = null;
  for (const w of wallFeet()) {
    if (w.nx * f.dx + w.nz * f.dz < 0.5) continue;
    const ex = w.x1 - w.x0, ez = w.z1 - w.z0, L2 = ex * ex + ez * ez;
    const u = Math.max(0, Math.min(1, ((f.x - w.x0) * ex + (f.z - w.z0) * ez) / L2));
    const x = w.x0 + ex * u, z = w.z0 + ez * u, d = Math.hypot(f.x - x, f.z - z);
    if (!best || d < best.d) best = { d, x, z, nx: w.nx, nz: w.nz, len: Math.sqrt(L2) };
  }
  if (!best || best.d > 4) return f;
  return { ...f, x: best.x, z: best.z, dx: best.nx, dz: best.nz, len: Math.max(1, Math.min(f.len, Math.floor(best.len))) };
};
const onBlock = <F extends WaldseeFace>(f: F): F => {
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
/** the plan's house at a tile, for its colours (the real building there takes them) */
const houseAt = (tx: number, tz: number): WaldseeHouse | null => {
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
      const h = houseAt(tx, tz);
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

  // ---- the Czardas on the Hochstatt, the place to sit: its name over the door, a striped awning, strings of
  // lights over the terrace, barrels to stand at, flower boxes, and the board with today's offer
  {
    const f = onBlock(WALDSEE_CZARDAS), w = Math.min(5, Math.max(3, f.len));
    for (let k = 0; k < w * 4; k++) onFace(f, -w / 2 + (k + 0.5) / 4, 0.44, 2.3, 0.25, 0.07, 0.9, k % 2 ? 0xf4ecd8 : 0xb8322a);
    for (const side of [-1, 1]) onFace(f, (side * w) / 2, 0.84, 1.15, 0.06, 2.3, 0.06, 0x3a3f52);

    sign(f, 'CZARDAS', 3.05, Math.min(3.2, w), { back: '#f4f1ea', ink: '#c2452d', rim: '#e8862e' }, 'bold 80px Georgia, "Times New Roman", serif');
    // (the portal: white, a round-topped niche with a figure over the wooden door)
    onFace(f, 0, 0.05, 1.3, 1.3, 2.6, 0.08, 0xf4f1ea);
    onFace(f, 0, 0.1, 1.0, 0.8, 2.0, 0.06, 0x7a5638);
    onFace(f, 0, 0.1, 2.3, 0.5, 0.5, 0.06, 0xdfe3e8);
    onFace(f, 0, 0.14, 2.28, 0.18, 0.36, 0.08, 0xc9a06a);
    const out = 5.4, bulbs = [0xffd76a, 0xff8a5a, 0x7fe0c0, 0xfff1c0];
    for (const side of [-1, 0, 1]) {
      const [px, pz] = on(f, side * (w / 2 + 1.6), out);
      box(px, 1.5, pz, 0.07, 3, 0.07, 0x3a3f52);
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, sag = Math.sin(Math.PI * t) * 0.4;
        const [sx, sz] = on(f, side * (w / 2) * (1 - t) + side * (w / 2 + 1.6) * t, 0.1 + (out - 0.1) * t);
        lamp(sx, 2.9 + 0.1 * t - sag, sz, 0.09, 0.09, 0.09, bulbs[k % 4]);
      }
    }
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const [sx, sz] = on(f, -w / 2 - 1.6 + (w + 3.2) * t, out);
      lamp(sx, 3 - Math.sin(Math.PI * ((t * 2) % 1)) * 0.25, sz, 0.09, 0.09, 0.09, bulbs[k % 4]);
    }
    for (const side of [-1, 1]) {
      const [bx, bz] = on(f, side * (w / 2 + 0.9), 1.3);
      box(bx, 0.5, bz, 0.62, 1, 0.62, 0x8a5a36, 0.4);
      for (const y of [0.2, 0.8]) box(bx, y, bz, 0.66, 0.07, 0.66, 0x3a3f52, 0.4);
      box(bx, 1.03, bz, 0.74, 0.06, 0.74, 0xb9895a, 0.4);
      lamp(bx + 0.12, 1.16, bz, 0.1, 0.2, 0.1, 0xf2b84c);
    }
    for (let k = 0; k < 5; k++) {
      const [fx, fz] = on(f, -w / 2 - 1.3 + ((w + 2.6) * (k + 0.5)) / 5, out + 0.7);
      box(fx, 0.2, fz, 1, 0.4, 0.34, 0x6b4a32, faceYaw(f));
      box(fx, 0.46, fz, 0.94, 0.16, 0.3, 0x4f9a4a, faceYaw(f));
      for (let q = -1; q <= 1; q++) box(fx + q * 0.3 * Math.abs(f.dz), 0.58, fz + q * 0.3 * Math.abs(f.dx), 0.16, 0.14, 0.16, q ? 0xd8322a : 0xff6f8a);
    }
    // its second door, on the side toward the Hauptstrasse, a small board with its name over it
    if (WALDSEE_CZARDAS_SIDE) {
      const sd = onBlock(WALDSEE_CZARDAS_SIDE);
      onFace(sd, 0, 0.03, 1, 0.8, 2, 0.06, 0x5a3a26);
      onFace(sd, 0, 0.3, 2.2, 1.2, 0.07, 0.6, 0xb8322a);
      onFace(sd, 0.62, 0.2, 2.0, 0.14, 0.26, 0.14, 0xffd76a, true);
      sign(sd, 'Czardas', 2.7, 1.5, { back: '#3a1512', ink: '#ffe9b0', rim: '#f2c94c' });
    }
    const [cx, cz] = on(f, w / 2 + 1.9, 2.6);
    box(cx, 0.45, cz, 0.5, 0.9, 0.08, 0x2a2d33, 0.5);
    box(cx, 0.45, cz + 0.05, 0.4, 0.5, 0.02, 0xf4f1ea, 0.5);
  }

  // ---- names over doors, each with what belongs to the place
  for (const s0 of WALDSEE_SIGNS) {
    // (the AmannLabs shop is a building of its own: its window and name stay on its own front)
    const s = s0.kind === 'amannlabs' ? s0 : onBlock(s0);
    const w = Math.max(2, Math.min(4, s.len));
    if (s.kind === 'amannlabs') {
      // the house is a modern tech building: a dark glass curtain wall with thin light mullions and a glowing
      // cyan roofline; the lit ground floor holds the shop window with the robots, the name glowing above
      {
        // a modern glass tower, taller than its neighbours, with a hipped roof and PV, in the middle between the house
        // to its left (x 22.6) and the one to its right (x 28.3); the gaps either side are closed by a wall a step
        // back, so they are niches, not ways through
        for (const [g0, g1] of [[22.55, 23.2], [27.7, 28.35]]) box((g0 + g1) / 2, 1.6, 50 - 1.2, g1 - g0, 4, 0.3, 0xe9e4d6);
        const X0 = 23.2, X1 = 27.7, Z0 = 44, Z1 = 50, W = X1 - X0, D = Z1 - Z0, Ht = 9.4, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, S = 80;
        const curtain = (wB: number, hB: number, front: boolean) => {
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
          if (front) {
            const py = (yy: number) => (hB - yy) * S;
          const accent = (ci: number, rj: number, rspan = 1) => {
            const x = ci * colW * S, y = (hB - (rj + rspan) * rowH) * S, w = 2 * colW * S, h = rspan * rowH * S;
            g.fillStyle = 'rgba(43,240,255,0.35)';
            g.fillRect(x, y, w, h);
            g.fillStyle = '#1de6ff';
            g.fillRect(x + 3, y + 3, w - 6, h - 6);
          };
          accent(1, 6, 2);
          accent(6, 6, 2);
          accent(1, 4);
          accent(6, 4);
            g.fillStyle = '#0a1017';
            g.fillRect(0, py(2.5), cw, ch - py(2.5));
            g.fillStyle = '#2bf0ff';
            g.fillRect(0, py(2.5) - 2, cw, 3);
          }
          return c;
        };
        const glassWall = (wB: number, x: number, y: number, z: number, ry: number, front: boolean) => {
          const tex = new THREE.CanvasTexture(curtain(wB, Ht, front));
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          const geo = new THREE.PlaneGeometry(wB, Ht), mat = new THREE.MeshLambertMaterial({ map: tex });
          disposables.push(tex, geo, mat);
          const m = new THREE.Mesh(geo, mat);
          m.position.set(x, y, z);
          m.rotation.y = ry;
          add(m);
        };
        glassWall(W, cx, Ht / 2, Z1 + 0.02, 0, true);
        glassWall(D, X0 - 0.02, Ht / 2, cz, -Math.PI / 2, false);
        glassWall(D, X1 + 0.02, Ht / 2, cz, Math.PI / 2, false);
        for (const ex of [X0, X1]) for (const ez of [Z0, Z1]) box(ex, Ht / 2, ez, 0.16, Ht, 0.16, 0x141c28);
        // a modern glass door on the east side, opening onto the right alley
        {
          const dz = cz, dx = X1 + 0.16;
          box(dx, 1.22, dz, 0.14, 2.44, 1.6, 0x11192a);
          box(dx + 0.16, 2.62, dz, 0.66, 0.12, 1.8, 0x11192a);
          const gd = new THREE.PlaneGeometry(1.05, 2.1);
          const gm = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.5, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
          disposables.push(gd, gm);
          const dm = new THREE.Mesh(gd, gm);
          dm.position.set(dx + 0.09, 1.15, dz);
          dm.rotation.y = Math.PI / 2;
          add(dm);
          lamp(dx + 0.14, 1.15, dz + 0.45, 0.06, 0.5, 0.06, 0x2bf0ff);
        }
        // the two side-alleys are dead ends: a wall closes each one at its far end
        box(22.5, 1.9, 47.05, 1.15, 3.8, 0.3, 0xd6cfc0);
        box(30.5, 1.9, 44.05, 1.25, 3.8, 0.3, 0xd6cfc0);
        // a hipped roof (Walmdach) with a PV array on the sunny south slope
        {
          const yR = Ht + 3.2, rx1 = X0 + D / 2, rx2 = X1 - D / 2;
          const SW: [number, number, number] = [X0, Ht, Z1], SE: [number, number, number] = [X1, Ht, Z1], NE: [number, number, number] = [X1, Ht, Z0], NW: [number, number, number] = [X0, Ht, Z0];
          const R1: [number, number, number] = [rx1, yR, cz], R2: [number, number, number] = [rx2, yR, cz];
          const tris: [number, number, number][][] = [[SW, SE, R2], [SW, R2, R1], [NE, NW, R1], [NE, R1, R2], [NW, SW, R1], [SE, NE, R2]];
          const pos: number[] = [];
          for (const t of tris) for (const v of t) pos.push(v[0], v[1], v[2]);
          const roofGeo = new THREE.BufferGeometry();
          roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          roofGeo.computeVertexNormals();
          const roofMat = new THREE.MeshLambertMaterial({ color: 0xb1503a, side: THREE.DoubleSide });
          disposables.push(roofGeo, roofMat);
          add(new THREE.Mesh(roofGeo, roofMat));
          const pvc = document.createElement('canvas');
          pvc.width = 128;
          pvc.height = 96;
          const pg = pvc.getContext('2d')!;
          pg.fillStyle = '#0f1826';
          pg.fillRect(0, 0, 128, 96);
          pg.strokeStyle = '#2f4a70';
          pg.lineWidth = 2;
          for (let i = 0; i <= 8; i++) {
            pg.beginPath();
            pg.moveTo(i * 16, 0);
            pg.lineTo(i * 16, 96);
            pg.stroke();
          }
          for (let j = 0; j <= 6; j++) {
            pg.beginPath();
            pg.moveTo(0, j * 16);
            pg.lineTo(128, j * 16);
            pg.stroke();
          }
          const pvTex = new THREE.CanvasTexture(pvc);
          pvTex.colorSpace = THREE.SRGBColorSpace;
          const pvMat = new THREE.MeshLambertMaterial({ map: pvTex, side: THREE.DoubleSide });
          disposables.push(pvTex, pvMat);
          const pvFace = (corners: [number, number, number][]) => {
            const mx = corners.reduce((s, p) => s + p[0], 0) / corners.length;
            const my = corners.reduce((s, p) => s + p[1], 0) / corners.length;
            const mz = corners.reduce((s, p) => s + p[2], 0) / corners.length;
            const k = 0.12;
            const q = corners.map(p => [p[0] + (mx - p[0]) * k, p[1] + (my - p[1]) * k + 0.06, p[2] + (mz - p[2]) * k] as [number, number, number]);
            const pos: number[] = [], uv: number[] = [];
            if (q.length === 4) {
              pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
              uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
            } else {
              pos.push(...q[0], ...q[1], ...q[2]);
              uv.push(0, 0, 1, 0, 0.5, 1);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
            geo.computeVertexNormals();
            disposables.push(geo);
            add(new THREE.Mesh(geo, pvMat));
          };
          pvFace([SW, SE, R2, R1]);
          pvFace([NE, NW, R1, R2]);
          pvFace([NW, SW, R1]);
          pvFace([SE, NE, R2]);
        }
      }
      const ww = Math.max(3, Math.min(5, s.len)) - 0.4;
      const dep = 0.7, gy = 1.3, gh = 2.2, topY = gy + gh / 2, botY = gy - gh / 2, bx = 26.5;
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
      // the Amadeus: a dark front, a golden doorway with lanterns, a red carpet out of the door, its name in pink light
      onFace(s, 0, 0.04, 1.4, w, 2.8, 0.05, 0x1c1a24);
      for (const side of [-1, 1]) {
        onFace(s, side * 0.62, 0.1, 1.15, 0.16, 2.3, 0.16, 0xd4a73a);
        onFace(s, side * 0.95, 0.16, 1.9, 0.14, 0.3, 0.14, 0xffd76a, true);
        onFace(s, side * 0.95, 0.16, 1.66, 0.08, 0.2, 0.08, 0x2a2d33);
      }
      onFace(s, 0, 0.1, 2.36, 1.4, 0.16, 0.16, 0xd4a73a);
      onFace(s, 0, 0.1, 2.54, 0.9, 0.2, 0.14, 0xd4a73a);
      onFace(s, 0, 0.07, 1.1, 1.0, 2.2, 0.05, 0x3a1522);
      onFace(s, 0.3, 0.1, 1.1, 0.06, 0.3, 0.05, 0xffd76a, true);
      onFace(s, 0, 1.2, 0.02, 1.1, 0.03, 2.3, 0xb8322a);
      for (const side of [-1, 1]) for (const o of [0.5, 2]) onFace(s, side * 0.7, o, 0.45, 0.07, 0.9, 0.07, 0xd4a73a);
      for (const side of [-1, 1]) onFace(s, side * 0.7, 1.25, 0.82, 0.05, 0.05, 1.5, 0x8a1f2c);
      sign(s, 'Amadeus', 3.2, Math.min(3, w + 0.6), { back: '#14101e', ink: '#ff5fd0', rim: '#ff2bd6' });
      continue;
    }
    if (s.kind === 'eis') {
      // the ice-cream parlour "Eis-Café Italia": a cream front with big glass shopfronts, the name painted over
      // them, a red-brown door at the corner, a striped awning and yellow parasols over the tables — and a plain,
      // windowed side, for the house is only as deep as its front is wide
      const S = 80, H = 6.76;
      const panel = (face: WaldseeFace, wB: number, opts: { shop?: boolean; name?: boolean }) => {
        const cw = Math.round(wB * S), ch = Math.round(H * S);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext('2d')!;
        const px = (u: number) => (u + wB / 2) * S;
        const py = (y: number) => (H - y) * S;
        // cream plaster, a darker plinth and the shadow under the eaves
        g.fillStyle = '#efe3cd';
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#d7cbb4';
        g.fillRect(0, py(0.2), cw, 0.2 * S);
        const eave = g.createLinearGradient(0, 0, 0, 0.6 * S);
        eave.addColorStop(0, 'rgba(66,58,44,0.30)');
        eave.addColorStop(1, 'rgba(66,58,44,0)');
        g.fillStyle = eave;
        g.fillRect(0, 0, cw, 0.6 * S);
        // windows: white frames, dark panes, a cross and a sill
        const upWin = (u: number, yc: number) => {
          const ww = 0.62, wh = 0.88;
          g.fillStyle = '#fbf8f0';
          g.fillRect(px(u - ww / 2), py(yc + wh / 2), ww * S, wh * S);
          const glass = g.createLinearGradient(0, py(yc + wh / 2), 0, py(yc - wh / 2));
          glass.addColorStop(0, '#6d8490');
          glass.addColorStop(1, '#4d626d');
          g.fillStyle = glass;
          g.fillRect(px(u - ww / 2 + 0.05), py(yc + wh / 2 - 0.05), (ww - 0.1) * S, (wh - 0.1) * S);
          g.fillStyle = 'rgba(255,255,255,0.30)';
          g.fillRect(px(u - ww / 2 + 0.05), py(yc + wh / 2 - 0.05), (ww - 0.1) * S * 0.3, (wh - 0.1) * S);
          g.fillStyle = '#fbf8f0';
          g.fillRect(px(u - 0.025), py(yc + wh / 2 - 0.05), 0.05 * S, (wh - 0.1) * S);
          g.fillRect(px(u - ww / 2 + 0.05), py(yc + 0.04), (ww - 0.1) * S, 0.04 * S);
          g.fillStyle = '#d9cfba';
          g.fillRect(px(u - ww / 2 - 0.05), py(yc - wh / 2 - 0.04), (ww + 0.1) * S, 0.06 * S);
        };
        const nUp = Math.max(1, Math.round(wB / 1.3));
        for (const yc of [3.7, 4.76, 5.82]) for (let k = 0; k < nUp; k++) upWin(-wB / 2 + (k + 0.5) * (wB / nUp), yc);
        if (opts.shop === false) {
          // the side: just windows at the foot, as on the plaster wall behind the shopfront
          const nLow = Math.max(1, Math.round(wB / 1.6));
          for (let k = 0; k < nLow; k++) upWin(-wB / 2 + (k + 0.5) * (wB / nLow), 1.55);
        } else {
          // downstairs: big shop windows, dark glass with the warm counter and the tubs behind it
          const bays = Math.max(1, Math.round(wB / 1.7)), bw = wB / bays;
          for (let k = 0; k < bays; k++) {
            const u = -wB / 2 + (k + 0.5) * bw;
            const x0 = u - bw / 2 + 0.16, wx = (bw - 0.32) * S;
            g.fillStyle = '#d8c7a2';
            g.fillRect(px(x0), py(2.42), wx, 2.08 * S);
            const glass = g.createLinearGradient(0, py(2.3), 0, py(0.35));
            glass.addColorStop(0, '#39474f');
            glass.addColorStop(0.6, '#2b363c');
            glass.addColorStop(1, '#5b4a34');
            g.fillStyle = glass;
            g.fillRect(px(x0 + 0.1), py(2.32), wx - 0.2 * S, 1.88 * S);
            // the lit counter, the tubs of ice cream and a little lamp
            g.fillStyle = '#b98546';
            g.fillRect(px(x0 + 0.1), py(1.1), wx - 0.2 * S, 0.62 * S);
            g.fillStyle = '#f6d38a';
            g.fillRect(px(x0 + 0.12), py(1.04), wx - 0.24 * S, 0.08 * S);
            const colours = ['#f2a6c0', '#f6e08a', '#a6d8c0', '#c9a6e8'];
            const tubs = Math.max(2, Math.round(bw / 0.45));
            for (let t = 0; t < tubs; t++) {
              const tu = x0 + 0.24 + (t + 0.5) * ((wx / S - 0.48) / tubs);
              g.fillStyle = colours[t % 4];
              g.fillRect(px(tu - 0.11), py(1.46), 0.22 * S, 0.2 * S);
            }
            // the transom, a vertical bar, and a pale reflection
            g.fillStyle = '#d8c7a2';
            g.fillRect(px(x0 + 0.1), py(2.05), wx - 0.2 * S, 0.06 * S);
            g.fillRect(px(u - 0.03), py(2.32), 0.06 * S, 1.88 * S);
            g.fillStyle = 'rgba(255,255,255,0.14)';
            g.beginPath();
            g.moveTo(px(x0 + 0.26), py(2.28));
            g.lineTo(px(x0 + 0.82), py(2.28));
            g.lineTo(px(x0 + 0.42), py(0.4));
            g.lineTo(px(x0 + 0.2), py(0.4));
            g.closePath();
            g.fill();
          }
        }
        // the name painted on the plaster over the shopfronts
        if (opts.name) {
          g.fillStyle = '#949ca4';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `600 ${Math.round(0.38 * S)}px Georgia, "Times New Roman", serif`;
          const wide = g.measureText('Eis-Café Italia').width;
          g.save();
          g.translate(cw / 2, py(2.86));
          g.scale(Math.min(1, (0.74 * cw) / wide), 1);
          g.fillText('Eis-Café Italia', 0, 0);
          g.restore();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const geo = new THREE.PlaneGeometry(wB, H);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        disposables.push(tex, geo, mat);
        const m = new THREE.Mesh(geo, mat);
        const [fx, fz] = on(face, 0, 0.05);
        m.position.set(fx, H / 2, fz);
        m.rotation.y = faceYaw(face);
        add(m);
      };
      // the front to the square with the shopfront and the name, the plain side toward the street, and the
      // little back wall of the recessed entrance
      panel({ x: 66, z: 65.5, dx: -1, dz: 0, len: 5 }, 5, { name: true });
      panel({ x: 71.5, z: 69, dx: 0, dz: 1, len: 7 }, 7, { shop: false });
      panel({ x: 67, z: 68, dx: 0, dz: 1, len: 2 }, 2, { shop: false });
      // the recessed entrance: a glass door
      onFace(s, 0, 0.03, 3.28, 1.0, H, 0.03, 0xefe3cd);
      onFace(s, 0, 0.08, 1.35, 0.94, 2.7, 0.05, 0xd8c7a2);
      onFace(s, 0, 0.11, 1.3, 0.78, 2.5, 0.04, 0x56707c);
      onFace(s, 0, 0.14, 1.3, 0.05, 2.5, 0.03, 0xd8c7a2);
      onFace(s, 0, 0.14, 1.92, 0.78, 0.05, 0.03, 0xd8c7a2);
      lamp(...on(s, 0, 0.16), 0.55, 0.64, 0.4, 0.03, 0xffcf7a);
      // a striped awning along the square side only
      const squareFace: WaldseeFace = { x: 66, z: 65.5, dx: -1, dz: 0, len: 5 };
      for (let k = 0; k < 14; k++) onFace(squareFace, 1.75 - (k + 0.5) * 0.25, 0.5, 2.46, 0.25, 0.07, 0.9, k % 2 ? 0xf4ecd8 : 0xb8322a);
      // yellow parasols over the tables in front of the shop (the recessed ones stay under the wall)
      const parasol = (x: number, z: number, colour: number) => {
        box(x, 1.05, z, 0.07, 2.1, 0.07, 0x6b5a3a);
        const pgeo = new THREE.ConeGeometry(1.0, 0.52, 8);
        const pmat = new THREE.MeshLambertMaterial({ color: colour });
        disposables.push(pgeo, pmat);
        const pm = new THREE.Mesh(pgeo, pmat);
        pm.position.set(x, 2.14, z);
        add(pm);
        box(x, 2.42, z, 0.1, 0.1, 0.1, 0x8a6a2a);
      };
      const eisTables = WALDSEE_TABLES.find(p => p.name === 'Eisdiele');
      for (const [tx, tz] of eisTables?.at ?? []) if (tz !== 68) parasol(tx + 0.5, tz + 0.5, (tx + tz) % 2 ? 0xe8bb4a : 0xf0d386);
      continue;
    }
    if (s.kind === 'bank') {
      // the bank, seen over the hedge behind the barrier: a hedge before it, its name on the wall
      for (let k = -2; k <= 2; k++) onFace(s, k * 0.9, 1.2, 0.6, 0.86, 1.2, 0.6, k % 2 ? 0x3f7a3a : 0x478544);
      sign(s, s.text, 3.4, 2.4, { back: '#f4f1ea', ink: '#1f4fa8', rim: '#f28c1e' }, 'bold 84px "Helvetica Neue", Arial, sans-serif');
      continue;
    }
    if (s.kind === 'shop') {
      // the little shop: a grey canopy over its windows, things in them, pink shutters upstairs, its name on a blue board
      for (let k = 0; k < w * 4; k++) onFace(s, -w / 2 + (k + 0.5) / 4, 0.36, 2.25, 0.25, 0.07, 0.74, 0x9aa0a8);
      for (const a of [-0.9, 0.2, 1.1]) for (const side of [-1, 1]) onFace(s, a + side * 0.36, 0.05, 3.3, 0.22, 0.62, 0.05, 0xb97a8c);
      onFace(s, -0.7, 0.03, 1, 0.8, 2, 0.06, 0x7a5638);
      onFace(s, 0.5, 0.03, 1.25, 1.2, 1.2, 0.05, 0xfff1c0, true);
      for (const [a, c] of [[0.2, 0xd8322a], [0.5, 0x2f7a4a], [0.8, 0x2f5fbf]] as const) onFace(s, a, 0.1, 0.9, 0.16, 0.3, 0.1, c);
      sign(s, s.text, 2.9, Math.min(2.2, w + 0.2), { back: '#1f3f8f', ink: '#ffd23f', rim: '#ffd23f' });
      continue;
    }
    if (s.kind === 'nemo') {
      // the kebab shop: a grey ground floor with three round arches, its name in red, a spit turning in the window
      onFace(s, 0, 0.04, 1.3, w + 0.2, 2.6, 0.05, 0x8e9299);
      for (let k = -1; k <= 1; k++) {
        onFace(s, k * (w / 3), 0.07, 0.95, w / 3 - 0.3, 1.9, 0.05, 0x2f2a28);
        onFace(s, k * (w / 3), 0.07, 2.0, (w / 3 - 0.3) * 0.7, 0.24, 0.05, 0x2f2a28);
      }
      onFace(s, w / 3, 0.2, 1.1, 0.16, 0.9, 0.16, 0xb5653a);
      onFace(s, w / 3, 0.2, 1.1, 0.04, 1.3, 0.04, 0xd0d4e0);
      onFace(s, w / 3, 0.12, 1.1, 0.5, 1.0, 0.03, 0xffb066, true);
      sign(s, s.text, 2.95, Math.min(2.2, w + 0.4), { back: '#f4f1ea', ink: '#c0281f', rim: '#c0281f' }, 'bold 84px "Helvetica Neue", Arial, sans-serif');
      continue;
    }
    if (s.kind === 'flasche' || s.kind === 'nkd' || s.kind === 'brille' || s.kind === 'empire') {
      // shop fronts built from photos. Each: a plastered ground floor in the house's own tone, windows of dark
      // glass in pale frames, a door, and what one knows it by
      const span = Math.max(3, Math.min(5, s.len));
      const pane = (a: number, wd: number, y: number, h: number, frame = 0xf4f1ea) => {
        onFace(s, a, 0.05, y, wd + 0.12, h + 0.12, 0.05, frame);
        onFace(s, a, 0.07, y, wd, h, 0.05, 0x33404f);
      };
      if (s.kind === 'flasche') {
        // the inn: a cream ground floor with small-paned windows, red timber on white above, its name in old
        // letters, tables and big terracotta pots with little trees before it
        onFace(s, 0, 0.03, 1.3, span, 2.6, 0.05, 0xefe6cf);
        for (const a of [-span * 0.34, -span * 0.08, span * 0.18]) pane(a, 0.8, 1.35, 0.9, 0x7a4a36);
        onFace(s, span * 0.4, 0.06, 1.0, 0.7, 2.0, 0.06, 0x5a3a26);
        onFace(s, 0, 0.04, 4.0, span, 2.6, 0.05, 0xf4f1ea);
        for (const y of [2.72, 3.6, 4.5, 5.3]) onFace(s, 0, 0.07, y, span, 0.12, 0.06, 0xa33a2c);
        for (let k = 0; k <= span * 2; k++) onFace(s, -span / 2 + k / 2, 0.07, 4.0, 0.1, 2.6, 0.06, 0xa33a2c);
        for (let k = 0; k < span * 2; k += 2) {
          const [x, z] = on(s, -span / 2 + k / 2 + 0.25, 0.08);
          box(x, 3.15, z, 0.07, 0.95, 0.07, 0xa33a2c, faceYaw(s), k % 4 ? 0.5 : -0.5);
        }
        for (const a of [-span * 0.3, 0, span * 0.3]) pane(a, 0.5, 4.05, 0.7, 0x7a4a36);
        sign(s, s.text, 2.36, Math.min(3.4, span), { back: '#efe6cf', ink: '#7a2a20', rim: '#efe6cf' }, 'bold 58px Georgia, "Times New Roman", serif');
        for (const [a, o] of [[-1.2, 1.4], [0.3, 1.6], [1.5, 1.2]]) {
          const [x, z] = on(s, a, o);
          box(x, 0.36, z, 0.1, 0.72, 0.1, 0x4a4f5c);
          box(x, 0.74, z, 0.7, 0.06, 0.7, 0x8a5a36);
          for (const t of [0, 2.1, 4.2]) box(x + Math.cos(t) * 0.6, 0.25, z + Math.sin(t) * 0.6, 0.3, 0.5, 0.3, 0x6b4a32, t);
        }
        for (const a of [-2, 2.2]) {
          const [x, z] = on(s, a, 0.9);
          box(x, 0.3, z, 0.5, 0.6, 0.5, 0xb5653a, 0.4);
          box(x, 1.0, z, 0.1, 0.9, 0.1, 0x6b4a32);
          box(x, 1.6, z, 0.6, 0.6, 0.6, 0x4f9a4a, 0.6);
        }
      } else if (s.kind === 'nkd') {
        // the clothes shop: a grey band over wide windows, its three red letters, a red awning, and racks of
        // clothes and red parasols out on the street
        onFace(s, 0, 0.04, 2.55, span, 0.7, 0.06, 0xd9dbe0);
        pane(-span * 0.22, span * 0.4, 1.15, 1.7);
        pane(span * 0.26, span * 0.36, 1.15, 1.7);
        for (let k = 0; k < span * 4; k++) onFace(s, -span / 2 + (k + 0.5) / 4, 0.45, 2.1, 0.26, 0.07, 0.9, 0xd0202a);
        sign(s, s.text, 2.6, 1.5, { back: '#d9dbe0', ink: '#d0202a', rim: '#d9dbe0' }, 'bold 96px "Helvetica Neue", Arial, sans-serif');
        for (const a of [-1.3, 0.4]) {
          const [x, z] = on(s, a, 1.5);
          box(x, 1.25, z, 1.3, 0.05, 0.05, 0xb9bcc2, faceYaw(s));
          for (const e of [-0.6, 0.6]) box(x - s.dz * e, 0.62, z + s.dx * e, 0.05, 1.25, 0.05, 0xb9bcc2);
          [0xd0202a, 0x2f5fbf, 0xf2c94c, 0x4f9a4a, 0xe9b9c6].forEach((col, k) => box(x - s.dz * (k * 0.24 - 0.48), 0.85, z + s.dx * (k * 0.24 - 0.48), 0.2, 0.7, 0.3, col, faceYaw(s)));
          box(x, 1.3, z + 0.0, 0.06, 2.6, 0.06, 0xe6e8ef);
          box(x, 2.55, z, 1.9, 0.1, 1.9, 0xd0202a, 0.3);
        }
      } else if (s.kind === 'brille') {
        // the optician: a white house with dark red shutters, two great windows hung with red cloth either
        // side of a glass door up four steps, grey planters with little firs, its name on a pale board
        pane(-span * 0.27, span * 0.38, 1.4, 1.7, 0x4a4f5c);
        pane(span * 0.29, span * 0.34, 1.4, 1.7, 0x4a4f5c);
        for (const a of [-span * 0.27, span * 0.29]) onFace(s, a, 0.09, 1.25, span * 0.2, 1.1, 0.04, 0xb02a5a);
        onFace(s, 0.02, 0.06, 1.45, 0.6, 1.9, 0.06, 0x9fb0b8);
        [0.2, 0.4, 0.6, 0.8].forEach((o, k) => onFace(s, 0.02, o, 0.5 - k * 0.12, 0.9, 0.12, 0.2, 0x3a3f46));
        for (const a of [-span / 2 + 0.2, span / 2 - 0.2]) {
          onFace(s, a, 0.4, 0.4, 0.4, 0.8, 0.4, 0x8e9299);
          onFace(s, a, 0.4, 1.1, 0.3, 0.6, 0.3, 0x3f7a3a);
        }
        for (const a of [-1.2, 0.1, 1.3]) for (const side of [-1, 1]) onFace(s, a + side * 0.42, 0.05, 3.6, 0.3, 0.8, 0.05, 0x9a1f2c);
        sign(s, 'die brille', 2.7, 2.2, { back: '#e9ecef', ink: '#3a3f46', rim: '#3a3f46' }, 'bold 84px "Helvetica Neue", Arial, sans-serif');
      } else {
        // the tattoo studio at the corner: rough cream plaster, grey painted bands round the windows, a doorway
        // set back up five steps, the street's name on a dark plate, its own name on small grey boards
        onFace(s, span * 0.18, 0.04, 1.75, span * 0.56, 1.6, 0.04, 0xb9bcc2);
        pane(0.1, 0.8, 1.6, 0.9, 0xdcd6c4);
        pane(span * 0.36, 0.7, 1.6, 0.9, 0xdcd6c4);
        onFace(s, -span * 0.3, 0.04, 1.5, 1.2, 2.4, 0.05, 0x2a2d33);
        [0.25, 0.45, 0.65, 0.85, 1.05].forEach((o, k) => onFace(s, -span * 0.3, o, 0.62 - k * 0.12, 1.2, 0.12, 0.2, 0x8e9299));
        onFace(s, -span * 0.3 - 0.9, 0.05, 2.2, 0.7, 0.2, 0.03, 0x1c1e24);
        sign(s, s.text, 1.6, 1.0, { back: '#8e9299', ink: '#f4f1ea', rim: '#f4f1ea' }, 'bold 70px "Helvetica Neue", Arial, sans-serif');
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
      // the police post: the real house, white with dark green shutters (see the walls above); on it a round-topped
      // door in a grey stone frame, the blue sign with POLIZEI beside it and a blue lamp over the door
      onFace(s, 0, 0.04, 1.15, 1.3, 2.3, 0.06, 0xa9adb3);
      onFace(s, 0, 0.07, 1.05, 1.0, 2.1, 0.05, 0x5a3a26);
      [0.9, 0.7, 0.4].forEach((wd, k) => onFace(s, 0, 0.06, 2.3 + k * 0.12, wd * 1.3, 0.13, 0.06, 0xa9adb3));
      onFace(s, 0, 0.12, 2.75, 0.3, 0.16, 0.12, 0x3f7cff, true);
      sign(s, 'POLIZEI', 2.0, 1.4, { back: '#1f4fa8', ink: '#ffffff', rim: '#1f4fa8' }, 'bold 84px "Helvetica Neue", Arial, sans-serif');
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
    const reach = (sx: number): number => {
      let best = b.half + 2;
      for (const w of wallFeet()) {
        const ex = w.x1 - w.x0, ez = w.z1 - w.z0, den = ax * sx * ez - az * sx * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((w.x0 - b.at[0]) * ez - (w.z0 - b.at[1]) * ex) / den, u = ((w.x0 - b.at[0]) * az * sx - (w.z0 - b.at[1]) * ax * sx) / den;
        if (t > 0.2 && u >= -0.02 && u <= 1.02 && t < best) best = t;
      }
      return best;
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

  // ---- a clean lakeside promenade: the green is filled out to a straight shore line, with a path,
  // a stone rim at the water and a few lanterns
  {
    const edgeAt = (tz: number): number => {
      let e = -1;
      for (let tx = 78; tx <= 112; tx++) {
        const g = waldseeGround(tx, tz);
        if ((g === 'meadow' || g === 'gravel') && waldseeGround(tx + 1, tz) === 'water') e = tx;
      }
      if (e < 0) return -1;
      let connected = false;
      for (let tx = e - 1; tx >= 74; tx--) {
        const g = waldseeGround(tx, tz);
        if (g === 'water') break;
        if (g === 'house' || g === 'yard') { connected = true; break; }
      }
      return connected ? e : -1;
    };
    const edge: Record<number, number> = {};
    const pts: [number, number][] = [];
    for (let tz = 33; tz <= 58; tz++) {
      edge[tz] = edgeAt(tz);
      if (edge[tz] >= 0) pts.push([tz, edge[tz]]);
    }
    // a straight shore line through the measured edge (least squares)
    let m = 0, c = 0;
    if (pts.length > 1) {
      const n = pts.length;
      const sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
      const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
      m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      c = (sy - m * sx) / n;
    }
    const MEADOW = [0x7fb866, 0x76ae5e, 0x88c06e];
    const Y = -0.01; // one flat level for the whole promenade
    // the shore is that line, moved out so that no land lies beyond it; the path runs along it in one piece, two
    // tiles wide, from the first row of the shore to the last, the meadow filled out up to it
    if (pts.length > 1) {
      const out = Math.max(...pts.map(([tz, e]) => e - (m * tz + c)));
      const shore = (tz: number) => Math.round(m * tz + c + out);
      const z0 = pts[0][0], z1 = pts[pts.length - 1][0];
      let lastLantern = -99;
      for (let tz = z0; tz <= z1; tz++) {
        const x1 = shore(tz);
        // (from where this row's own land ends, or from the last land of a row beside it)
        let from = x1 - 1;
        for (let tx = x1; tx >= 76; tx--) {
          const g = waldseeGround(tx, tz);
          if (g !== 'water') break;
          from = tx;
        }
        for (let tx = from; tx <= x1 - 2; tx++) box(tx + 0.5, Y, tz + 0.5, 1.02, 0.05, 1.02, MEADOW[(tx + tz) % 3]);
        for (const tx of [x1 - 1, x1]) box(tx + 0.5, Y + 0.02, tz + 0.5, 1.02, 0.06, 1.02, (tx + tz) % 2 ? 0xd0c8b4 : 0xc9c1ac);
        box(x1 + 1.06, Y - 0.04, tz + 0.5, 0.14, 0.2, 1.02, 0xb9b2a2);
        if (tz - lastLantern >= 8) {
          lastLantern = tz;
          const lx = x1 + 0.7, lz = tz + 0.5;
          box(lx, Y + 0.9, lz, 0.09, 1.8, 0.09, 0x2a2d33);
          box(lx, Y + 1.86, lz, 0.32, 0.08, 0.32, 0x2a2d33);
          lamp(lx, Y + 1.74, lz, 0.2, 0.2, 0.2, 0xffd76a);
          box(lx, Y + 1.99, lz, 0.16, 0.08, 0.16, 0x2a2d33);
        }
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
