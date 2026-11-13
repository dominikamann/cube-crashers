import * as THREE from 'three';
import {
  WALDSEE_BARRIERS, WALDSEE_BOAT, WALDSEE_CARS, WALDSEE_CZARDAS, WALDSEE_FOUNTAIN, WALDSEE_HOUSES, WALDSEE_ROOFS, WALDSEE_SIGNS, WALDSEE_TABLES, WALDSEE_TILES,
  WALDSEE_TREES, type WaldseeFace, type WaldseeHouse,
} from '../sim/config/waldsee-town';

/**
 * How the Town looks (the map `waldsee`, see floor-waldsee.ts): every wall tile is part of a house with its own
 * plaster colour, height and tiled roof, a walled yard, the lake, or the street going on behind a barrier. On
 * top of that come the things one knows the place by: the Czardas with its terrace, the Federle-Brunnen, the
 * trees with benches round them, the Wurzacher Tor, the police car, the names over the doors, the shop of
 * AmannLabs with robots in its window, and a pedal boat out on the lake.
 */
export type WaldseeGround = 'water' | 'yard' | 'street' | 'house';

const codeAt = (tx: number, tz: number): number => {
  const row = WALDSEE_TILES[tz];
  return row && tx >= 0 && tx * 2 < row.length ? parseInt(row.substr(tx * 2, 2), 36) : 1;
};
export const waldseeGround = (tx: number, tz: number): WaldseeGround => {
  const c = codeAt(tx, tz);
  return c === 0 ? 'water' : c === 3 ? 'street' : c < 4 ? 'yard' : 'house';
};
export const waldseeHouse = (tx: number, tz: number): WaldseeHouse | null => {
  const c = codeAt(tx, tz);
  return c >= 4 ? WALDSEE_HOUSES[c - 4] ?? null : null;
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
  return g === 'water' ? 0.26 : g === 'street' ? 0.4 : 1.5;
}

const WATER = [0x4f9fd6, 0x4592cc, 0x58a8dd];
const STREET = [0xb6b0a4, 0xaea89c, 0xbdb7ab];
/** the colour of the block at a wall tile: the plaster of its house, a yard wall, water, or the cobbles of the street beyond */
export function waldseeBlockColor(tx: number, tz: number): number {
  const h = waldseeHouse(tx, tz);
  if (h) return parseInt(h.col, 16);
  const g = waldseeGround(tx, tz);
  return g === 'water' ? WATER[Math.floor(hash(tx, tz) * 3)] : g === 'street' ? STREET[Math.floor(hash(tx, tz) * 3)] : 0xcfc4ae;
}

/** plaster with windows and their shutters, white so the house's own colour shows through */
export function paintWaldseeWall(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  // the foot of the house, a little darker
  g.fillStyle = '#d9d6d0';
  g.fillRect(0, 58, 64, 6);
  // three floors of windows: dark glass, a light frame and cross, a shutter on each side
  for (const y of [5, 23, 41]) {
    g.fillStyle = '#f7f5f0';
    g.fillRect(22, y - 1, 20, 13);
    g.fillStyle = '#3d4a5c';
    g.fillRect(24, y + 1, 16, 9);
    g.fillStyle = '#f7f5f0';
    g.fillRect(31, y + 1, 2, 9);
    g.fillRect(24, y + 5, 16, 1);
    g.fillStyle = '#5d6f58';
    g.fillRect(15, y, 6, 11);
    g.fillRect(43, y, 6, 11);
    g.fillStyle = '#4c5c48';
    for (let k = 2; k < 11; k += 3) {
      g.fillRect(15, y + k, 6, 1);
      g.fillRect(43, y + k, 6, 1);
    }
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
  const sign = (f: WaldseeFace, text: string, y: number, width: number, colors: { back: string; ink: string; rim: string }, font = 'italic bold 84px Georgia, "Times New Roman", serif') => {
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
    g.save();
    g.translate(256, 68);
    g.scale(Math.min(1, 440 / wide), 1);
    g.fillText(text, 0, 0);
    g.restore();
    const tex = new THREE.CanvasTexture(canvas);
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
      if (!h || h.kind === 'gate') continue;
      const top = h.wall + waldseeRoof(tx, tz);
      box(tx + 0.5, top - 0.28, tz + 0.5, 1.07, 0.72, 1.07, shade(parseInt(h.roof, 16), 0.96 + 0.08 * hash(tx, tz)));
    }
  });

  // ---- the Wurzacher Tor, the old town gate: a tall white tower with grey stones up its corners, a round archway
  // through it, a green clock with golden hands, over the clock a little red oriel with a green cap, and on top a
  // stepped gable with a weather vane
  for (const h of WALDSEE_HOUSES) {
    if (h.kind !== 'gate') continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    WALDSEE_TILES.forEach((_row, tz) => {
      for (let tx = 0; tx < WALDSEE_TILES[tz].length / 2; tx++)
        if (waldseeHouse(tx, tz) === h) {
          x0 = Math.min(x0, tx);
          x1 = Math.max(x1, tx + 1);
          z0 = Math.min(z0, tz);
          z1 = Math.max(z1, tz + 1);
        }
    });
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, D = x1 - x0, W = z1 - z0, top = h.wall;
    const white = 0xf4f1ea, grey = 0x8e9299, dark = 0x2f3540;
    // the stones up the corners, long and short in turn
    for (const [qx, qz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]])
      for (let k = 0; k * 0.5 < top - 0.4; k++) box(qx, 0.25 + k * 0.5, qz, k % 2 ? 0.5 : 0.72, 0.46, k % 2 ? 0.72 : 0.5, grey);
    // the band under the gable, with its row of little arches
    box(cx, top - 0.12, cz, D + 0.36, 0.3, W + 0.36, grey);
    for (const fx of [x0 - 0.14, x1 + 0.14]) for (let k = 0; k < W * 2.5; k++) box(fx, top - 0.42, z0 + 0.2 + (k * (W - 0.4)) / (W * 2.5 - 1), 0.1, 0.3, 0.14, grey);
    // the gable: steps going in from both sides, a grey cap on each, and the top block with the vane
    const steps = 6, rise = 0.62;
    for (let k = 0; k < steps; k++) {
      const w = W * (1 - k / (steps + 0.6));
      box(cx, top + rise * (k + 0.5), cz, D + 0.04, rise, w, white);
      for (const side of [-1, 1]) box(cx, top + rise * (k + 1) + 0.05, cz + (side * w) / 2 - side * 0.14, D + 0.16, 0.12, 0.42, grey);
    }
    box(cx, top + rise * steps + 0.35, cz, D * 0.5, 0.7, 0.6, grey);
    box(cx, top + rise * steps + 1.05, cz, 0.06, 0.8, 0.06, dark);
    lamp(cx, top + rise * steps + 1.5, cz, 0.3, 0.12, 0.05, 0xd4a73a);
    // the face toward the town (west): windows, the clock, the oriel, and the archway
    const fx = x0 - 0.05;
    for (const [y, dz] of [[2.6, -0.5], [2.6, 0.5], [4.3, 0], [5.9, -0.45], [5.9, 0.45], [6.9, 0], [top + rise * 1.5, -0.6], [top + rise * 1.5, 0.6], [top + rise * 3.4, 0]]) box(fx, y, cz + dz, 0.08, 0.42, 0.24, dark);
    box(fx - 0.02, top - 1.35, cz, 0.1, 1.05, 1.05, 0x1f5f3a);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      lamp(fx - 0.09, top - 1.35 + Math.cos(a) * 0.42, cz + Math.sin(a) * 0.42, 0.03, 0.09, 0.09, 0xf2c94c);
    }
    lamp(fx - 0.1, top - 1.2, cz, 0.03, 0.34, 0.06, 0xf2c94c);
    lamp(fx - 0.1, top - 1.32, cz + 0.14, 0.03, 0.06, 0.3, 0xf2c94c);
    for (const dz of [-0.75, 0.75]) box(fx, top - 1.2, cz + dz, 0.08, 0.36, 0.22, dark);
    // (the oriel: a red box on the wall, tapering to a point below, a green cap above)
    box(fx - 0.2, top + 0.55, cz, 0.5, 1.1, 0.5, 0xc2452d);
    [0.4, 0.28, 0.16].forEach((w, k) => box(fx - 0.2, top - 0.12 - k * 0.2, cz, w, 0.2, w, 0xc2452d));
    [0.6, 0.42, 0.24, 0.1].forEach((w, k) => box(fx - 0.2, top + 1.2 + k * 0.18, cz, w, 0.18, w, 0x2f7a4a));
    box(fx - 0.46, top + 0.6, cz, 0.04, 0.3, 0.16, dark);
    // (the archway: round at the top, a grey rim, dark inside with the pale wall of the passage behind)
    const half = Math.min(1.25, W / 2 - 0.5);
    box(fx - 0.01, 1.05, cz, 0.12, 2.1, half * 2, 0x3a3630);
    [0.92, 0.72, 0.42].forEach((f, k) => box(fx - 0.01, 2.25 + k * 0.28, cz, 0.12, 0.3, half * 2 * f, 0x3a3630));
    box(fx + 0.03, 0.9, cz, 0.06, 1.8, half * 1.2, 0xe9d9a0);
    for (const side of [-1, 1]) box(fx - 0.06, 1.05, cz + side * (half + 0.12), 0.16, 2.1, 0.22, grey);
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI;
      box(fx - 0.06, 2.1 + Math.sin(a) * 0.95, cz - Math.cos(a) * (half + 0.12), 0.16, 0.24, 0.3, grey);
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
    const f = WALDSEE_CZARDAS, w = f.len;
    for (let k = 0; k < w * 4; k++) onFace(f, -w / 2 + (k + 0.5) / 4, 0.44, 2.3, 0.25, 0.07, 0.9, k % 2 ? 0xf4ecd8 : 0xb8322a);
    for (const side of [-1, 1]) onFace(f, (side * w) / 2, 0.84, 1.15, 0.06, 2.3, 0.06, 0x3a3f52);
    onFace(f, 0, 0.03, 1, 0.9, 2, 0.06, 0x5a3a26);
    for (const side of [-1, 1]) onFace(f, side * 1.3, 0.03, 1.25, 0.9, 1.1, 0.05, 0xffd08a, true);
    sign(f, 'Czardas', 2.95, Math.min(3.2, w), { back: '#3a1512', ink: '#ffe9b0', rim: '#f2c94c' });
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
    const [cx, cz] = on(f, w / 2 + 1.9, 2.6);
    box(cx, 0.45, cz, 0.5, 0.9, 0.08, 0x2a2d33, 0.5);
    box(cx, 0.45, cz + 0.05, 0.4, 0.5, 0.02, 0xf4f1ea, 0.5);
  }

  // ---- names over doors, each with what belongs to the place
  for (const s of WALDSEE_SIGNS) {
    const w = Math.max(2, Math.min(4, s.len));
    if (s.kind === 'amannlabs') {
      // the shop of AmannLabs: one big lit window the width of the house, robots standing in it, the name above
      const ww = Math.max(3, Math.min(5, s.len)) - 0.4;
      onFace(s, 0, 0.04, 1.3, ww, 2.1, 0.06, 0xcfefff, true);
      for (const a of [-ww / 2, ww / 2]) onFace(s, a, 0.08, 1.3, 0.14, 2.3, 0.14, 0x1a1840);
      onFace(s, 0, 0.08, 0.2, ww + 0.14, 0.14, 0.2, 0x1a1840);
      onFace(s, 0, 0.08, 2.42, ww + 0.14, 0.14, 0.2, 0x1a1840);
      const robots = [0x2bf0ff, 0xff2bd6, 0xffc928, 0x7fe0c0];
      const count = Math.max(3, Math.floor(ww / 0.9));
      for (let k = 0; k < count; k++) {
        const a = -ww / 2 + ((k + 0.5) * ww) / count, c = robots[k % robots.length], tall = 0.9 + 0.25 * (k % 2);
        onFace(s, a, 0.26, 0.34, 0.34, 0.1, 0.3, 0x3a3f52);
        for (const leg of [-1, 1]) onFace(s, a + leg * 0.1, 0.26, 0.55, 0.1, 0.34, 0.12, 0x9aa3b5);
        onFace(s, a, 0.26, 0.72 + tall * 0.22, 0.4, tall * 0.44, 0.26, 0xd0d4e0);
        onFace(s, a, 0.4, 0.74 + tall * 0.22, 0.16, 0.12, 0.02, c, true);
        for (const arm of [-1, 1]) onFace(s, a + arm * 0.26, 0.26, 0.7 + tall * 0.24, 0.08, tall * 0.36, 0.1, 0x9aa3b5);
        onFace(s, a, 0.26, 0.8 + tall * 0.56, 0.32, 0.26, 0.26, 0xe6e8ef);
        for (const eye of [-1, 1]) onFace(s, a + eye * 0.08, 0.4, 0.82 + tall * 0.56, 0.07, 0.07, 0.02, c, true);
        onFace(s, a, 0.26, 1.0 + tall * 0.56, 0.03, 0.16, 0.03, 0x3a3f52);
        onFace(s, a, 0.26, 1.1 + tall * 0.56, 0.08, 0.08, 0.08, c, true);
      }
      sign(s, 'AmannLabs', 2.95, Math.min(ww, 3.6), { back: '#1a1840', ink: '#ffffff', rim: '#2bf0ff' }, 'bold 78px "Helvetica Neue", Arial, sans-serif');
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
      // the ice-cream parlour: a mint and cream awning, the name over it, and a big cone on a post by the door
      for (let k = 0; k < w * 4; k++) onFace(s, -w / 2 + (k + 0.5) / 4, 0.4, 2.3, 0.25, 0.07, 0.82, k % 2 ? 0xfdf6e3 : 0x8fd6c0);
      onFace(s, 0, 0.03, 1, 0.9, 2, 0.06, 0xf4f1ea);
      for (const side of [-1, 1]) onFace(s, side * 1.2, 0.03, 1.2, 0.8, 1.2, 0.05, 0xfff1c0, true);
      sign(s, 'Eisdiele', 2.95, Math.min(3.2, w + 0.4), { back: '#fdf6e3', ink: '#d84a6a', rim: '#8fd6c0' });
      const [cx, cz] = on(s, w / 2 + 0.6, 0.9);
      box(cx, 0.7, cz, 0.08, 1.4, 0.08, 0xe6e8ef);
      [0.36, 0.28, 0.2, 0.12].forEach((r, k) => box(cx, 1.9 - k * 0.2, cz, r, 0.2, r, 0xd9a05a, k * 0.5));
      box(cx, 2.14, cz, 0.44, 0.3, 0.44, 0xffb3c8, 0.3);
      box(cx, 2.42, cz, 0.38, 0.28, 0.38, 0xfff3d0, 0.8);
      box(cx, 2.66, cz, 0.3, 0.24, 0.3, 0x8fd6c0, 0.2);
      lamp(cx, 2.84, cz, 0.12, 0.12, 0.12, 0xd8322a);
      continue;
    }
    if (s.kind === 'shop') {
      // the little shop: a yellow awning, things in the window, its name in friendly letters
      for (let k = 0; k < w * 4; k++) onFace(s, -w / 2 + (k + 0.5) / 4, 0.36, 2.25, 0.25, 0.07, 0.74, k % 2 ? 0xfdf6e3 : 0xf2c94c);
      onFace(s, -0.7, 0.03, 1, 0.8, 2, 0.06, 0x7a5638);
      onFace(s, 0.5, 0.03, 1.25, 1.2, 1.2, 0.05, 0xfff1c0, true);
      for (const [a, c] of [[0.2, 0xd8322a], [0.5, 0x2f7a4a], [0.8, 0x2f5fbf]] as const) onFace(s, a, 0.1, 0.9, 0.16, 0.3, 0.1, c);
      sign(s, s.text, 2.9, Math.min(2.6, w + 0.4), { back: '#fdf6e3', ink: '#b8322a', rim: '#f2c94c' });
      continue;
    }
    if (s.kind === 'hasen') {
      // the Hasen: a wooden board with its name and a lantern beside it
      onFace(s, 0, 0.03, 1, 0.9, 2, 0.06, 0x5a3a26);
      onFace(s, w / 2 + 0.2, 0.3, 2.6, 0.2, 0.3, 0.2, 0xffd76a, true);
      sign(s, 'Hasen', 2.95, Math.min(2.6, w + 0.6), { back: '#4a2f1c', ink: '#f6e3b4', rim: '#c9a06a' });
      continue;
    }
    onFace(s, 0, 0.03, 1, 0.9, 2, 0.06, s.kind === 'police' ? 0x24457f : 0x4a4f5c);
    sign(s, s.text, 2.9, Math.min(2.8, w + 0.4), s.kind === 'police' ? { back: '#1f4fa8', ink: '#ffffff', rim: '#ffffff' } : { back: '#e9ecef', ink: '#1f3b63', rim: '#1f3b63' }, 'bold 80px "Helvetica Neue", Arial, sans-serif');
  }

  // ---- where a street ends: a barrier of red and white beams on posts, lamps on it. Behind it the street goes on
  for (const b of WALDSEE_BARRIERS) {
    const ax = -b.dir[1], az = b.dir[0], yaw = -Math.atan2(az, ax), width = b.half * 2 + 1.5;
    const n = Math.max(2, Math.round(width / 0.6));
    for (const y of [0.55, 1.05])
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        box(b.at[0] + ax * t * width, y, b.at[1] + az * t * width, width / n + 0.01, 0.2, 0.08, k % 2 ? 0xf4f1ea : 0xd8322a, yaw);
      }
    for (let k = 0; k <= 3; k++) {
      const t = k / 3 - 0.5, x = b.at[0] + ax * t * width, z = b.at[1] + az * t * width;
      box(x, 0.6, z, 0.1, 1.2, 0.1, 0x4a4f5c);
      box(x, 0.06, z, 0.5, 0.12, 0.3, 0x2a2d33, yaw);
      lamp(x, 1.28, z, 0.16, 0.16, 0.16, 0xffa52b);
    }
  }

  // ---- out on the lake behind the police lane: a pedal boat, and an angler standing on it with his rod out
  if (WALDSEE_BOAT) {
    const x = WALDSEE_BOAT[0] + 0.5, z = WALDSEE_BOAT[1] + 0.5, turn = 0.5;
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
    // the angler: trousers, a green jacket, a hat, the rod held out over the water
    part(0.1, 0.5, 0.2, 0.3, 0.5, 0.22, 0x3a4a6a);
    part(0.1, 0.98, 0.2, 0.36, 0.5, 0.24, 0x4c6b3a);
    part(0.1, 1.36, 0.2, 0.24, 0.24, 0.24, 0xe9b98f);
    part(0.1, 1.52, 0.2, 0.36, 0.06, 0.36, 0x7a6a4a);
    part(0.1, 1.6, 0.2, 0.24, 0.12, 0.24, 0x7a6a4a);
    part(0.34, 1.05, 0.34, 0.1, 0.1, 0.4, 0x4c6b3a);
    part(1.2, 1.55, 0.5, 2.0, 0.04, 0.04, 0x3a2a1c, 0.5);
    const [lx, lz] = at(2.05, 0.5);
    lamp(lx, 1.05, lz, 0.015, 1.95, 0.015, 0xffffff);
    lamp(lx, 0.02, lz, 0.1, 0.08, 0.1, 0xd8322a);
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
