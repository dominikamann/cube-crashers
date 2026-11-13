import * as THREE from 'three';
import { WALDSEE_FOUNTAINS, WALDSEE_HOUSES, WALDSEE_ROOFS, WALDSEE_TABLES, WALDSEE_TILES, WALDSEE_TREES, type WaldseeHouse } from '../sim/config/waldsee-town';

/**
 * How Bad Waldsee looks (the map `waldsee`, see floor-waldsee.ts): every wall tile is part of a house with its
 * own plaster colour, height and tiled roof, or a garden, or the lake. On top of that come the things one knows
 * the town by: the twin towers of St. Peter, the stepped gables of the Rathaus and the Kornhaus, the
 * Federle-Brunnen, the trees with benches round them, and tables and chairs in front of the cafés.
 */
export type WaldseeGround = 'water' | 'garden' | 'house';

const codeAt = (tx: number, tz: number): number => {
  const row = WALDSEE_TILES[tz];
  return row && tx >= 0 && tx * 2 < row.length ? parseInt(row.substr(tx * 2, 2), 36) : 1;
};
export const waldseeGround = (tx: number, tz: number): WaldseeGround => {
  const c = codeAt(tx, tz);
  return c === 0 ? 'water' : c < 3 ? 'garden' : 'house';
};
export const waldseeHouse = (tx: number, tz: number): WaldseeHouse | null => {
  const c = codeAt(tx, tz);
  return c >= 3 ? WALDSEE_HOUSES[c - 3] ?? null : null;
};
/** how high the roof stands over the walls at a tile, in blocks */
export const waldseeRoof = (tx: number, tz: number): number => (waldseeHouse(tx, tz) ? Number(WALDSEE_ROOFS[tz]?.[tx] ?? 0) * 0.2 : 0);

const hash = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** the height of the block at a wall tile, from its foot (0.4 under the floor): a house up to its roof, a garden bed, the lake */
export function waldseeBlockHeight(tx: number, tz: number): number {
  const h = waldseeHouse(tx, tz);
  if (h) return h.wall + waldseeRoof(tx, tz) + 0.4;
  return waldseeGround(tx, tz) === 'water' ? 0.26 : 0.72 + 0.1 * hash(tx >> 1, tz >> 1);
}

const WATER = [0x4f9fd6, 0x4592cc, 0x58a8dd];
const GRASS = [0x6fae58, 0x7ab862, 0x64a350];
/** the colour of the block at a wall tile: the plaster of its house, grass, or water */
export function waldseeBlockColor(tx: number, tz: number): number {
  const h = waldseeHouse(tx, tz);
  if (h) return parseInt(h.col, 16);
  return (waldseeGround(tx, tz) === 'water' ? WATER : GRASS)[Math.floor(hash(tx, tz) * 3)];
}

/** plaster with a window and its shutters, white so the house's own colour shows through */
export function paintWaldseeWall(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  // the foot of the house, a little darker
  g.fillStyle = '#d9d6d0';
  g.fillRect(0, 56, 64, 8);
  // two floors of windows: dark glass, a light frame and cross, a shutter on each side
  for (const y of [8, 32]) {
    g.fillStyle = '#f7f5f0';
    g.fillRect(21, y - 1, 22, 18);
    g.fillStyle = '#3d4a5c';
    g.fillRect(23, y + 1, 18, 14);
    g.fillStyle = '#f7f5f0';
    g.fillRect(31, y + 1, 2, 14);
    g.fillRect(23, y + 7, 18, 2);
    g.fillStyle = '#5d6f58';
    g.fillRect(13, y, 7, 16);
    g.fillRect(44, y, 7, 16);
    g.fillStyle = '#4c5c48';
    for (let k = 2; k < 16; k += 3) {
      g.fillRect(13, y + k, 7, 1);
      g.fillRect(44, y + k, 7, 1);
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
  yaw?: number;
}

/** Everything that stands on the plan: roofs, landmarks, trees, fountains, café tables. Two meshes of boxes. */
export function buildWaldseeTown(add: (o: THREE.Object3D) => void, disposables: { dispose(): void }[]): void {
  const lit: Piece[] = [], glow: Piece[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, yaw = 0) => lit.push({ x, y, z, sx, sy, sz, color, yaw });
  const shade = (color: number, k: number) => {
    const c = new THREE.Color(color).multiplyScalar(k);
    return c.getHex();
  };

  // ---- the roofs: a slab of tiles on every house tile, thick enough to hide the step to the next one down
  WALDSEE_TILES.forEach((_row, tz) => {
    for (let tx = 0; tx < WALDSEE_TILES[tz].length / 2; tx++) {
      const h = waldseeHouse(tx, tz);
      if (!h) continue;
      const top = h.wall + waldseeRoof(tx, tz);
      box(tx + 0.5, top - 0.28, tz + 0.5, 1.07, 0.72, 1.07, shade(parseInt(h.roof, 16), 0.9 + 0.2 * hash(tx, tz)));
    }
  });

  // ---- the landmarks
  for (const h of WALDSEE_HOUSES) {
    if (h.kind === 'house') continue;
    // its tiles, and how far it reaches along and across its ridge
    const tiles: [number, number][] = [];
    WALDSEE_TILES.forEach((_row, tz) => {
      for (let tx = 0; tx < WALDSEE_TILES[tz].length / 2; tx++) if (waldseeHouse(tx, tz) === h) tiles.push([tx, tz]);
    });
    const ax = Math.cos(h.ang), az = Math.sin(h.ang);
    const along = (x: number, z: number) => (x - h.cx) * ax + (z - h.cz) * az;
    const across = (x: number, z: number) => -(x - h.cx) * az + (z - h.cz) * ax;
    let a0 = Infinity, a1 = -Infinity, half = 0, ridge = 0;
    for (const [tx, tz] of tiles) {
      a0 = Math.min(a0, along(tx + 0.5, tz + 0.5));
      a1 = Math.max(a1, along(tx + 0.5, tz + 0.5));
      half = Math.max(half, Math.abs(across(tx + 0.5, tz + 0.5)));
      ridge = Math.max(ridge, h.wall + waldseeRoof(tx, tz));
    }
    const at = (a: number, c: number): [number, number] => [h.cx + ax * a - az * c, h.cz + az * a + ax * c];
    const yaw = -h.ang;
    const plaster = parseInt(h.col, 16);
    if (h.kind === 'rathaus' || h.kind === 'kornhaus') {
      // a stepped gable at each end: slabs across the house, each shorter than the one below, a pinnacle on
      // every step. The Kornhaus's is laced with red timber, the Rathaus's is white with a bell turret
      const red = 0xc2452d;
      for (const end of [a0 - 0.45, a1 + 0.45]) {
        const steps = 6, rise = (ridge + 0.9 - h.wall) / steps;
        for (let k = 0; k < steps; k++) {
          const w = (half + 0.6) * 2 * (1 - k / steps);
          const [x, z] = at(end, 0);
          box(x, h.wall + rise * (k + 0.5), z, 0.34, rise, w, plaster, yaw);
          for (const side of [-1, 1]) {
            const [px, pz] = at(end, (side * w) / 2 - side * 0.18);
            box(px, h.wall + rise * (k + 1) + 0.16, pz, 0.36, 0.32, 0.3, h.kind === 'kornhaus' ? red : 0xf7f5f0, yaw);
          }
          if (h.kind === 'kornhaus') {
            // the red lacing: a band along the top of every step and posts under it
            box(x, h.wall + rise * (k + 1) - 0.06, z, 0.38, 0.1, w, red, yaw);
            for (let p = -2; p <= 2; p++) {
              const [qx, qz] = at(end, (p * w) / 5.2);
              box(qx, h.wall + rise * (k + 0.5), qz, 0.38, rise, 0.09, red, yaw);
            }
          }
        }
        const [tx, tz] = at(end, 0);
        box(tx, ridge + 1.25, tz, 0.3, 0.7, 0.3, h.kind === 'kornhaus' ? red : 0xf7f5f0, yaw);
      }
      if (h.kind === 'rathaus') {
        // the little bell turret on the ridge
        const [x, z] = at((a0 + a1) / 2, 0);
        box(x, ridge + 0.5, z, 0.5, 1, 0.5, 0xf7f5f0, yaw);
        box(x, ridge + 1.2, z, 0.7, 0.4, 0.7, 0x5f8f7f, yaw);
        box(x, ridge + 1.6, z, 0.4, 0.4, 0.4, 0x5f8f7f, yaw);
        glow.push({ x, y: ridge + 2, z, sx: 0.14, sy: 0.4, sz: 0.14, color: 0xffd76a });
      }
    } else if (h.kind === 'church') {
      // St. Peter: two towers side by side at one end of the nave, slanted toward each other, each with a
      // green onion dome and a golden tip
      const copper = 0x5f8f7f, stone = 0xf3ead2;
      for (const side of [-1, 1]) {
        const [x, z] = at(a1 - 0.6, side * (half * 0.5 + 0.4));
        const turn = yaw + side * 0.28;
        box(x, 3.4, z, 2.3, 6.8, 2.3, stone, turn);
        box(x, 6.95, z, 2.6, 0.3, 2.6, 0xfbf6e6, turn);
        // windows and a clock
        box(x + Math.cos(-turn) * 1.17, 5.6, z + Math.sin(-turn) * 1.17, 0.06, 1.1, 0.6, 0x3d4a5c, turn);
        box(x + Math.cos(-turn) * 1.17, 4, z + Math.sin(-turn) * 1.17, 0.06, 0.7, 0.7, 0x2f3540, turn);
        glow.push({ x: x + Math.cos(-turn) * 1.2, y: 4, z: z + Math.sin(-turn) * 1.2, sx: 0.05, sy: 0.5, sz: 0.5, color: 0xffd76a, yaw: turn });
        [1.9, 2.3, 2.5, 2.2, 1.7, 1.1, 0.6].forEach((w, k) => box(x, 7.25 + k * 0.36, z, w, 0.37, w, shade(copper, 0.92 + 0.04 * k), turn));
        box(x, 9.95, z, 0.3, 0.5, 0.3, copper, turn);
        glow.push({ x, y: 10.5, z, sx: 0.16, sy: 0.6, sz: 0.16, color: 0xffd76a });
      }
      // the gable between the towers
      const [gx, gz] = at(a1 - 0.6, 0);
      box(gx, ridge + 0.6, gz, 1.6, 1.6, half * 0.9, stone, yaw);
    } else if (h.kind === 'tower') {
      // a tower of the old town wall: a pointed roof on top
      [1.5, 1.1, 0.7, 0.3].forEach((w, k) => box(h.cx, ridge + 0.2 + k * 0.4, h.cz, w, 0.4, w, 0x8a4a33));
    }
  }

  // ---- trees: a trunk, a crown of leaves, and a bench all round the trunk
  const leaf = [0x4f9a4a, 0x5aa653, 0x468c42], wood = 0x8a5a36, bark = 0x6b4a32;
  for (const [tx, tz] of WALDSEE_TREES) {
    const x = tx + 0.5, z = tz + 0.5, turn = hash(tx, tz) * 1.5;
    box(x, 0.9, z, 0.26, 1.8, 0.26, bark, turn);
    [[1.15, 1.95], [1.55, 2.4], [1.3, 2.85], [0.8, 3.25]].forEach(([w, y], k) => box(x, y, z, w, 0.5, w, leaf[(tx + tz + k) % 3], turn + k * 0.4));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      box(x + Math.cos(a) * 0.62, 0.42, z + Math.sin(a) * 0.62, 0.3, 0.1, 0.52, wood, -a);
      if (k % 2 === 0) box(x + Math.cos(a) * 0.62, 0.2, z + Math.sin(a) * 0.62, 0.1, 0.4, 0.1, 0x3a3f52, -a);
    }
  }

  // ---- fountains: an eight-sided basin of stone full of water, a column in the middle, and on the
  // Federle-Brunnen the Federle himself, the fool of the Waldsee carnival
  const stone = 0xcfc8ba;
  for (const f of WALDSEE_FOUNTAINS) {
    const x = f.at[0] + 0.5, z = f.at[1] + 0.5;
    box(x, 0.3, z, 2.1, 0.6, 0.9, stone);
    box(x, 0.3, z, 0.9, 0.6, 2.1, stone);
    box(x, 0.3, z, 1.6, 0.6, 1.6, stone, Math.PI / 4);
    glow.push({ x, y: 0.56, z, sx: 1.25, sy: 0.12, sz: 1.25, color: 0x4fb4e6, yaw: Math.PI / 4 });
    box(x, 1.1, z, 0.34, 1.7, 0.34, stone);
    box(x, 1.9, z, 0.6, 0.14, 0.6, shade(stone, 0.9));
    if (f.name.includes('Federle')) {
      // white clothes sewn over with coloured patches, a pointed cap, an arm raised
      box(x, 2.32, z, 0.34, 0.7, 0.26, 0xf4f1ea);
      box(x, 2.82, z, 0.26, 0.26, 0.26, 0xe9b98f);
      box(x, 3.06, z, 0.3, 0.22, 0.3, 0xc2452d);
      box(x, 3.24, z, 0.16, 0.2, 0.16, 0xc2452d);
      box(x + 0.26, 2.62, z, 0.12, 0.5, 0.12, 0xf4f1ea, 0);
      for (const [dx, dy, c] of [[-0.1, 2.2, 0xc2452d], [0.1, 2.44, 0x3f8f5a], [-0.06, 2.5, 0xf2c94c], [0.08, 2.14, 0x3f6fbf]] as const) box(x + dx, dy, z + 0.14, 0.1, 0.1, 0.03, c);
    } else box(x, 2.1, z, 0.3, 0.3, 0.3, shade(stone, 0.85));
    // four spouts
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      box(x + Math.cos(a) * 0.3, 1.3, z + Math.sin(a) * 0.3, 0.3, 0.07, 0.07, 0x5a5f6a, -a);
    }
  }

  // ---- tables and chairs in front of the cafés, a parasol over some of them
  const parasols = [0xf4ecd8, 0xc2452d, 0x5d6f58];
  WALDSEE_TABLES.forEach((cafe, ci) => {
    cafe.at.forEach(([tx, tz], k) => {
      const x = tx + 0.5, z = tz + 0.5, turn = hash(tx, tz) * 3;
      box(x, 0.36, z, 0.1, 0.72, 0.1, 0x4a4f5c);
      box(x, 0.74, z, 0.66, 0.06, 0.66, 0xb9895a, turn);
      for (const a of [turn, turn + Math.PI, turn + Math.PI / 2]) {
        const cx = x + Math.cos(a) * 0.62, cz = z + Math.sin(a) * 0.62;
        box(cx, 0.24, cz, 0.3, 0.06, 0.3, wood, -a);
        box(cx, 0.12, cz, 0.24, 0.24, 0.24, shade(wood, 0.7), -a);
        box(cx + Math.cos(a) * 0.14, 0.5, cz + Math.sin(a) * 0.14, 0.05, 0.5, 0.3, wood, -a);
      }
      // (no parasols at the Czardas: it has its strings of lights)
      if (k % 2 === 0 && cafe.name !== 'Czardas') {
        box(x, 1.2, z, 0.06, 2.4, 0.06, 0xe6e8ef);
        box(x, 2.34, z, 1.7, 0.1, 1.7, parasols[ci % 3], turn);
        box(x, 2.44, z, 1, 0.1, 1, shade(parasols[ci % 3], 0.93), turn);
      }
    });
  });

  // ---- the Czardas on the Hochstatt, the place to sit: its name over the door, a striped awning, strings of
  // lights over the terrace, barrels to stand at, flower boxes, and the board with today's offer
  const czardas = WALDSEE_TABLES.find(t => t.name === 'Czardas');
  if (czardas) {
    const mid = czardas.at.reduce((a, p) => [a[0] + p[0] / czardas.at.length, a[1] + p[1] / czardas.at.length], [0, 0]);
    // the front of the house: the longest run of its tiles with floor to the south, nearest the terrace
    let best: { x0: number; x1: number; tz: number } | null = null;
    WALDSEE_TILES.forEach((_row, tz) => {
      let start = -1;
      for (let tx = 0; tx <= WALDSEE_TILES[tz].length / 2; tx++) {
        const front = !!waldseeHouse(tx, tz) && codeAt(tx, tz + 1) === 2;
        if (front && start < 0) start = tx;
        if (!front && start >= 0) {
          const run = { x0: start, x1: tx, tz };
          const far = (r: { x0: number; x1: number; tz: number }) => Math.hypot((r.x0 + r.x1) / 2 - mid[0], r.tz + 1 - mid[1]) - (r.x1 - r.x0);
          if (!best || far(run) < far(best)) best = run;
          start = -1;
        }
      }
    });
    const front = best as { x0: number; x1: number; tz: number } | null;
    if (front) {
      const cx = (front.x0 + front.x1) / 2, fz = front.tz + 1, w = Math.min(4, front.x1 - front.x0);
      // the awning: red and cream stripes
      for (let k = 0; k < w * 4; k++) box(cx - w / 2 + (k + 0.5) / 4, 1.22 - 0.0, fz + 0.42, 0.25, 0.07, 0.86, k % 2 ? 0xf4ecd8 : 0xb8322a);
      for (const side of [-1, 1]) box(cx + (side * w) / 2, 0.62, fz + 0.8, 0.06, 1.24, 0.06, 0x3a3f52);
      // the door and two lit windows under it
      box(cx, 0.5, fz + 0.02, 0.5, 1, 0.06, 0x5a3a26);
      for (const side of [-1, 1]) glow.push({ x: cx + side * 1.1, y: 0.62, z: fz + 0.02, sx: 0.7, sy: 0.6, sz: 0.05, color: 0xffd08a });
      // its name, lit, over the awning
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#3a1512';
      g.fillRect(0, 0, 512, 128);
      g.strokeStyle = '#f2c94c';
      g.lineWidth = 6;
      g.strokeRect(7, 7, 498, 114);
      g.fillStyle = '#ffe9b0';
      g.font = 'italic bold 84px Georgia, "Times New Roman", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Czardas', 256, 68);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const signGeo = new THREE.PlaneGeometry(2.4, 0.6), signMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      disposables.push(tex, signGeo, signMat);
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(cx, 1.72, fz + 0.03);
      add(sign);
      // strings of lights from the house out over the terrace, on posts
      const out = 3.4;
      for (const side of [-1, 0, 1]) {
        const px = cx + side * (w / 2 + 1.2);
        box(px, 1.15, fz + out, 0.07, 2.3, 0.07, 0x3a3f52);
        for (let k = 0; k <= 10; k++) {
          const t = k / 10, sag = Math.sin(Math.PI * t) * 0.3;
          glow.push({ x: (cx + side * (w / 2)) * (1 - t) + px * t, y: 2.1 + 0.2 * t - sag, z: fz + 0.1 + (out - 0.1) * t, sx: 0.09, sy: 0.09, sz: 0.09, color: [0xffd76a, 0xff8a5a, 0x7fe0c0, 0xfff1c0][k % 4] });
        }
      }
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        glow.push({ x: cx - w / 2 - 1.2 + (w + 2.4) * t, y: 2.28 - Math.sin(Math.PI * ((t * 2) % 1)) * 0.22, z: fz + out, sx: 0.09, sy: 0.09, sz: 0.09, color: [0xffd76a, 0xff8a5a, 0x7fe0c0, 0xfff1c0][k % 4] });
      }
      // barrels to stand at, with a glass on each
      for (const [bx, bz] of [[cx - w / 2 - 0.7, fz + 1.2], [cx + w / 2 + 0.7, fz + 1.2]]) {
        box(bx, 0.5, bz, 0.62, 1, 0.62, 0x8a5a36, 0.4);
        for (const y of [0.2, 0.8]) box(bx, y, bz, 0.66, 0.07, 0.66, 0x3a3f52, 0.4);
        box(bx, 1.03, bz, 0.74, 0.06, 0.74, 0xb9895a, 0.4);
        glow.push({ x: bx + 0.12, y: 1.16, z: bz, sx: 0.1, sy: 0.2, sz: 0.1, color: 0xf2b84c });
      }
      // flower boxes along the edge of the terrace: red geraniums
      for (let k = 0; k < 4; k++) {
        const fx = cx - w / 2 - 1 + ((w + 2) * (k + 0.5)) / 4;
        box(fx, 0.2, fz + out + 0.6, 1, 0.4, 0.34, 0x6b4a32);
        box(fx, 0.46, fz + out + 0.6, 0.94, 0.16, 0.3, 0x4f9a4a);
        for (let q = -1; q <= 1; q++) box(fx + q * 0.3, 0.58, fz + out + 0.6 + (q % 2) * 0.05, 0.16, 0.14, 0.16, q ? 0xd8322a : 0xff6f8a);
      }
      // the board with today's offer
      box(cx + w / 2 + 1.5, 0.45, fz + 2.2, 0.5, 0.9, 0.08, 0x2a2d33, 0.5);
      box(cx + w / 2 + 1.5, 0.45, fz + 2.26, 0.4, 0.5, 0.02, 0xf4f1ea, 0.5);
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
      o.rotation.set(0, p.yaw ?? 0, 0);
      o.scale.set(p.sx, p.sy, p.sz);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.setHex(p.color));
    });
    add(mesh);
  }
}
