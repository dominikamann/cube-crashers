import * as THREE from 'three';
import { Tile, type FloorMap } from '../sim/map/tilemap';
import { padAt } from '../sim/systems/towers';
import type { SimState } from '../sim/types';
import { box, glowMat, lambert } from './pool';
import type { Theme } from './theme';
import { RACE_CHECKPOINTS } from '../sim/config/floor-race';
import { LANE_CORE } from '../sim/config/floor-lane';
import { MAZE_CUBES } from '../sim/config/floor-maze';
import { logoSpots, type LogoSpot } from './logo-spots';
import markUrl from './amannlabs-mark.png';

export const WALL_HEIGHT = 1.4;
export const LOW_WALL_HEIGHT = 0.5;

/** top of the wall blocks; floor tops are at 0 */
/** wall heights as multiples of WALL_HEIGHT: low blocks to see over, and taller ones that hide what is behind */
const WALL_STEPS = [1, 1, 1.45, 1.9];

export interface World {
  update(s: SimState, theme: Theme, time: number): void;
  /** removes everything this world added to the scene */
  dispose(): void;
}

/** deterministic 0..1 per tile, for small visual variation */
function hash(tx: number, tz: number): number {
  const n = Math.sin(tx * 127.1 + tz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** how tall the wall block at a tile is (blocks come in a few heights, by 4x4 patch; the race has low rails) */
function wallHeight(map: FloorMap, tx: number, tz: number): number {
  return map.id === 'race' ? 0.9 : WALL_HEIGHT * WALL_STEPS[Math.floor(hash(tx >> 2, (tz >> 2) * 5) * WALL_STEPS.length)];
}

/** the top of the wall block under a point: where someone who landed on it stands */
export function wallTop(map: FloorMap, x: number, z: number): number {
  return wallHeight(map, Math.floor(x), Math.floor(z)) - 0.4;
}

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, pixelated: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (pixelated) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
  }
  tex.anisotropy = 4;
  return tex;
}

/** wall sides: stone courses, seams at the tile edges and a darker plinth at the bottom */
function wallSideTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, g => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#eef0f6';
    g.fillRect(0, 21, 64, 1);
    g.fillRect(0, 42, 64, 1);
    g.fillStyle = '#dfe2ec';
    g.fillRect(0, 0, 1, 64);
    g.fillRect(63, 0, 1, 64);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 52, 64, 1);
    g.fillStyle = '#a9adbd';
    g.fillRect(0, 53, 64, 11);
  }, false);
}

/** jump-over barriers: yellow and dark diagonal stripes */
function barrierTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, g => {
    g.fillStyle = '#2d2b3a';
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#ffcf3a';
    for (let k = -32; k < 64; k += 16) {
      g.beginPath();
      g.moveTo(k, 32);
      g.lineTo(k + 8, 32);
      g.lineTo(k + 40, 0);
      g.lineTo(k + 32, 0);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, 0, 32, 2);
  }, true);
}

/** kart ramps: orange with white chevrons pointing up the slope (toward the top of the texture) */
function rampTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, g => {
    g.fillStyle = '#ff7a2f';
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#c4501a';
    g.fillRect(0, 29, 32, 3);
    g.fillStyle = '#fff4e0';
    for (const y of [4, 15]) {
      g.beginPath();
      g.moveTo(6, y + 9);
      g.lineTo(16, y);
      g.lineTo(26, y + 9);
      g.lineTo(26, y + 12);
      g.lineTo(16, y + 4);
      g.lineTo(6, y + 12);
      g.fill();
    }
  }, true);
}

/** boost tiles: a glowing lightning bolt on every tile, so they read as "speed up here" */
function boostTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, g => {
    g.fillStyle = '#0b2a4a';
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#1d6f9a';
    g.fillRect(2, 2, 28, 28);
    g.fillStyle = '#0b2a4a';
    g.fillRect(4, 4, 24, 24);
    g.fillStyle = '#ffe14a';
    g.beginPath();
    g.moveTo(18, 5);
    g.lineTo(9, 18);
    g.lineTo(15, 18);
    g.lineTo(13, 27);
    g.lineTo(23, 13);
    g.lineTo(17, 13);
    g.closePath();
    g.fill();
  }, true);
}

/** glitch floor: flickering magenta pixels with a crossed-out monster on every tile – monsters cannot cross it */
function glitchTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, g => {
    const shades = ['#2a0636', '#4a0c5a', '#7a1388', '#5a1270', '#3a0a46'];
    for (let y = 0; y < 32; y += 2) {
      for (let x = 0; x < 32; x += 2) {
        g.fillStyle = shades[Math.floor(hash(x * 5 + 1, y * 3 + 2) * shades.length)];
        g.fillRect(x, y, 2, 2);
      }
    }
    g.fillStyle = '#ff4fe0';
    for (let i = 0; i < 8; i++) g.fillRect(Math.floor(hash(i, 9) * 30), Math.floor(hash(9, i) * 30), 3, 1);
    // a little pixel monster: body, two eyes, feet
    g.fillStyle = '#ffd6f6';
    g.fillRect(11, 10, 10, 9);
    g.fillRect(12, 9, 8, 1);
    g.fillRect(11, 19, 3, 2);
    g.fillRect(18, 19, 3, 2);
    g.fillStyle = '#2a0636';
    g.fillRect(13, 12, 2, 3);
    g.fillRect(17, 12, 2, 3);
    // red "no" sign over it
    g.strokeStyle = '#ff2a4a';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(16, 15, 10, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(9, 8);
    g.lineTo(23, 22);
    g.stroke();
  }, true);
}

/** build pads: a ring with a plus in the middle, glowing */
/** the AmannLabs logo, loaded once and painted into each map's floor */
let markImage: Promise<HTMLImageElement> | null = null;
function loadMark(): Promise<HTMLImageElement> {
  markImage ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = markUrl;
  });
  return markImage;
}

/** a quiet floor stamp: the A with "AmannLabs" next to it, like on amannlabs.eu */
function paintLogo(g: CanvasRenderingContext2D, img: HTMLImageElement, spot: { tx: number; tz: number; w: number; h: number }, px: number, alpha = 0.32, ink = '#2a2550') {
  const x = spot.tx * px, y = spot.tz * px, w = spot.w * px, h = spot.h * px;
  const markH = h * 0.78, markW = markH * (img.width / img.height);
  g.save();
  g.globalAlpha = alpha;
  {
    const size = Math.round(h * 0.42);
    g.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const amann = g.measureText('Amann').width;
    g.font = `300 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const labs = g.measureText('Labs').width;
    const gap = h * 0.22;
    const total = markW + gap + amann + labs;
    const left = x + (w - total) / 2;
    g.drawImage(img, left, y + (h - markH) / 2, markW, markH);
    g.fillStyle = ink;
    g.textBaseline = 'middle';
    g.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    g.fillText('Amann', left + markW + gap, y + h / 2);
    g.font = `300 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    g.fillText('Labs', left + markW + gap + amann, y + h / 2);
  }
  g.restore();
}

function padTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, g => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(32, 32, 22, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(29, 20, 6, 24);
    g.fillRect(20, 29, 24, 6);
    for (const [x, y] of [[2, 2], [54, 2], [2, 54], [54, 54]]) {
      g.fillRect(x, y, 8, 3);
      g.fillRect(x + (x > 32 ? 5 : 0), y, 3, 8);
    }
  }, false);
}

/**
 * Builds the static tile world: one textured floor surface for the whole map with soft shading baked in,
 * bevelled-looking wall blocks with trim, striped barriers, kart ramps as real slopes, animated boost and
 * glitch tiles, build pads and decoration.
 */
export function createWorld(scene: THREE.Scene, map: FloorMap): World {
  const cells: { tx: number; tz: number; tile: Tile }[] = [];
  for (let tz = 0; tz < map.h; tz++) {
    for (let tx = 0; tx < map.w; tx++) cells.push({ tx, tz, tile: map.tiles[tz * map.w + tx] });
  }
  const o = new THREE.Object3D();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const added: THREE.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const addToScene = (obj: THREE.Object3D) => {
    scene.add(obj);
    added.push(obj);
  };
  const tileOf = (tx: number, tz: number): Tile => (tx < 0 || tz < 0 || tx >= map.w || tz >= map.h ? Tile.Wall : map.tiles[tz * map.w + tx]);
  const isWall = (tx: number, tz: number) => tileOf(tx, tz) === Tile.Wall;

  function layer(filter: (t: Tile) => boolean, material: THREE.Material | THREE.Material[], height: number | ((tx: number, tz: number) => number), yBase: number, shadows: boolean, geometry: THREE.BufferGeometry = unit) {
    const list = cells.filter(c => filter(c.tile));
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
    mesh.count = list.length;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    list.forEach((c, i) => {
      const h = typeof height === 'number' ? height : height(c.tx, c.tz);
      o.position.set(c.tx + 0.5, yBase + h / 2, c.tz + 0.5);
      o.scale.set(1, h, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, new THREE.Color(0xffffff));
    });
    addToScene(mesh);
    return { mesh, list };
  }

  // ---- floor: one surface, detail and shading painted into a map-sized texture, theme colour per vertex
  const px = Math.max(16, Math.min(48, Math.floor(4096 / Math.max(map.w, map.h))));
  const floorTiles = cells.filter(c => c.tile === Tile.Floor);
  const floorTex = canvasTexture(map.w * px, map.h * px, g => {
    for (const c of floorTiles) {
      const x = c.tx * px, y = c.tz * px;
      const v = Math.round(226 + hash(c.tx * 3, c.tz * 7) * 14);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, px, px);
      // bevel: light top/left edge, dark grout right/bottom
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(x, y, px, 2);
      g.fillRect(x, y, 2, px);
      g.fillStyle = 'rgba(40,40,60,0.16)';
      g.fillRect(x, y + px - 2, px, 2);
      g.fillRect(x + px - 2, y, 2, px);
      // speckles
      g.fillStyle = 'rgba(40,40,60,0.07)';
      for (let k = 0; k < 7; k++) g.fillRect(x + 3 + Math.floor(hash(c.tx + k, c.tz * 5) * (px - 6)), y + 3 + Math.floor(hash(c.tz + k * 7, c.tx) * (px - 6)), 2, 2);
      const h = hash(c.tx * 17, c.tz * 23);
      if (h < 0.035) {
        // a small crack
        g.strokeStyle = 'rgba(40,40,60,0.28)';
        g.lineWidth = 1.5;
        g.beginPath();
        let cx = x + px * (0.2 + 0.6 * hash(c.tx, 1)), cy = y + px * 0.15;
        g.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) {
          cx += (hash(k, c.tx) - 0.5) * px * 0.4;
          cy += px * 0.18;
          g.lineTo(cx, cy);
        }
        g.stroke();
      } else if (h < 0.045) {
        // drain cover
        g.fillStyle = 'rgba(60,60,80,0.35)';
        g.beginPath();
        g.arc(x + px / 2, y + px / 2, px * 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let k = -2; k <= 2; k++) g.fillRect(x + px / 2 - px * 0.18, y + px / 2 + k * px * 0.08, px * 0.36, 1.5);
      }
    }
    // soft contact shadows next to walls and barriers
    const blocks = (tx: number, tz: number) => {
      const t = tileOf(tx, tz);
      return t === Tile.Wall ? 0.34 : t === Tile.LowWall ? 0.2 : 0;
    };
    const reach = px * 0.6;
    for (const c of floorTiles) {
      const x = c.tx * px, y = c.tz * px;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = blocks(c.tx + ox, c.tz + oz);
        if (!a) continue;
        const x0 = ox === 1 ? x + px : x, y0 = oz === 1 ? y + px : y;
        const grad = ox ? g.createLinearGradient(x0, 0, x0 - ox * reach, 0) : g.createLinearGradient(0, y0, 0, y0 - oz * reach);
        grad.addColorStop(0, `rgba(25,20,50,${a})`);
        grad.addColorStop(1, 'rgba(25,20,50,0)');
        g.fillStyle = grad;
        g.fillRect(x, y, px, px);
      }
      for (const [ox, oz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = blocks(c.tx + ox, c.tz + oz);
        if (!a || blocks(c.tx + ox, c.tz) || blocks(c.tx, c.tz + oz)) continue;
        const cx = ox === 1 ? x + px : x, cy = oz === 1 ? y + px : y;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, reach);
        grad.addColorStop(0, `rgba(25,20,50,${a})`);
        grad.addColorStop(1, 'rgba(25,20,50,0)');
        g.fillStyle = grad;
        g.fillRect(x, y, px, px);
      }
    }
  }, false);
  disposables.push(floorTex);
  // the AmannLabs logo once or twice per map, painted in when the image is ready
  let disposed = false;
  const spots = logoSpots(map);
  if (spots.length) {
    loadMark()
      .then(img => {
        if (disposed) return;
        const g = (floorTex.image as HTMLCanvasElement).getContext('2d')!;
        for (const spot of spots) if (spot.kind === 'floor') paintLogo(g, img, spot, px);
        floorTex.needsUpdate = true;
        for (const spot of spots) if (spot.kind === 'wall') addToScene(wallLogo(img, spot));
      })
      .catch(() => {});
  }
  /** a logo on the side of a run of wall blocks: a see-through decal just in front of the face */
  function wallLogo(img: HTMLImageElement, spot: Extract<LogoSpot, { kind: 'wall' }>): THREE.Mesh {
    const h = 0.8, res = 128;
    const tex = canvasTexture(spot.w * res, h * res, g => paintLogo(g, img, { tx: 0, tz: 0, w: spot.w, h }, res, 0.85, '#ffffff'), false);
    const geo = new THREE.PlaneGeometry(spot.w, h);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
    disposables.push(tex, geo, mat);
    const mid = (spot.w - 1) / 2;
    const cx = spot.tx + 0.5 + (spot.along === 'x' ? mid : 0), cz = spot.tz + 0.5 + (spot.along === 'z' ? mid : 0);
    // halfway up the lowest block's visible face (the race track's rails are low)
    const top = map.id === 'race' ? 0.5 : WALL_HEIGHT - 0.4;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx + spot.facing.x * 0.505, Math.min(0.5, top / 2), cz + spot.facing.z * 0.505);
    if (top < h) m.scale.setScalar(top / h);
    m.rotation.y = Math.atan2(spot.facing.x, spot.facing.z);
    return m;
  }
  const floorGeo = (() => {
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const quad = (pts: number[][], uvs: number[][], shadeV: number) => {
      const b = pos.length / 3;
      for (let k = 0; k < 4; k++) {
        pos.push(...pts[k]);
        uv.push(...uvs[k]);
        col.push(shadeV, shadeV, shadeV);
      }
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    };
    for (const c of floorTiles) {
      const x = c.tx, z = c.tz;
      const u0 = x / map.w, u1 = (x + 1) / map.w, v0 = 1 - z / map.h, v1 = 1 - (z + 1) / map.h;
      quad([[x, 0, z], [x + 1, 0, z], [x, 0, z + 1], [x + 1, 0, z + 1]], [[u0, v0], [u1, v0], [u0, v1], [u1, v1]], 1);
      // skirts toward lower neighbours (glitch floor sits a little lower)
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = tileOf(x + ox, z + oz);
        if (t === Tile.Floor || t === Tile.Wall || t === Tile.LowWall) continue;
        const ex = ox === 1 ? x + 1 : x, ez = oz === 1 ? z + 1 : z;
        const a = ox ? [ex, 0, z] : [x, 0, ez];
        const b = ox ? [ex, 0, z + 1] : [x + 1, 0, ez];
        const pts = ox === 1 || oz === -1 ? [b, a, [b[0], -0.4, b[2]], [a[0], -0.4, a[2]]] : [a, b, [a[0], -0.4, a[2]], [b[0], -0.4, b[2]]];
        quad(pts, [[u0, v0], [u0, v0], [u0, v0], [u0, v0]], 0.7);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  })();
  const floorBaseShade = Float32Array.from(floorGeo.getAttribute('color').array as Float32Array);
  const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: floorTex, vertexColors: true }));
  floorMesh.receiveShadow = true;
  addToScene(floorMesh);

  // ground around the map, so the city does not float in the sky
  const outerMat = new THREE.MeshLambertMaterial({ color: 0x88aa66 });
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(map.w + 160, map.h + 160), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(map.w / 2, -0.42, map.h / 2);
  outer.receiveShadow = true;
  addToScene(outer);

  // ---- walls: blocks with a darker foot, a light top and a bright trim along the outer edges
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  {
    const p = wallGeo.getAttribute('position');
    const n = wallGeo.getAttribute('normal');
    const colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const up = n.getY(i) > 0.5;
      const v = up ? 1 : 0.62 + (p.getY(i) + 0.5) * 0.3;
      colors.push(v, v, v);
    }
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  const wallSideTex = wallSideTexture();
  disposables.push(wallSideTex, wallGeo);
  const wallSide = new THREE.MeshLambertMaterial({ map: wallSideTex, vertexColors: true });
  const wallTop = new THREE.MeshLambertMaterial({ vertexColors: true });
  wallTop.color.setScalar(1.12);
  // the race track's walls are low guard rails, so the whole circuit stays in view
  // elsewhere the blocks come in three heights (by 4x4 patch), so in first person you cannot see over all of them
  const wallH = (tx: number, tz: number) => wallHeight(map, tx, tz);
  const wallTopY = (tx: number, tz: number) => wallH(tx, tz) - 0.4;
  const walls = layer(t => t === Tile.Wall, [wallSide, wallSide, wallTop, wallTop, wallSide, wallSide], wallH, -0.4, true, wallGeo);

  const trims: { x: number; z: number; sx: number; sz: number; y: number }[] = [];
  // a trim on every edge that drops: next to the floor or a lower block
  const higher = (c: { tx: number; tz: number }, tx: number, tz: number) => !isWall(tx, tz) || wallH(tx, tz) < wallH(c.tx, c.tz);
  for (const c of walls.list) {
    const cx = c.tx + 0.5, cz = c.tz + 0.5, y = wallTopY(c.tx, c.tz);
    if (higher(c, c.tx + 1, c.tz)) trims.push({ x: cx + 0.45, z: cz, sx: 0.16, sz: 1.04, y });
    if (higher(c, c.tx - 1, c.tz)) trims.push({ x: cx - 0.45, z: cz, sx: 0.16, sz: 1.04, y });
    if (higher(c, c.tx, c.tz + 1)) trims.push({ x: cx, z: cz + 0.45, sx: 1.04, sz: 0.16, y });
    if (higher(c, c.tx, c.tz - 1)) trims.push({ x: cx, z: cz - 0.45, sx: 1.04, sz: 0.16, y });
  }
  const trimMat = lambert(0xffffff);
  const trimMesh = new THREE.InstancedMesh(unit, trimMat, Math.max(1, trims.length));
  trimMesh.count = trims.length;
  trimMesh.castShadow = false;
  trimMesh.receiveShadow = true;
  trims.forEach((t, i) => {
    o.position.set(t.x, t.y + 0.06, t.z);
    o.scale.set(t.sx, 0.12, t.sz);
    o.updateMatrix();
    trimMesh.setMatrixAt(i, o.matrix);
    trimMesh.setColorAt(i, new THREE.Color(0xffffff));
  });
  addToScene(trimMesh);

  // ---- barriers (low walls you can jump over)
  const barrierTex = barrierTexture();
  disposables.push(barrierTex);
  const barrierSide = new THREE.MeshLambertMaterial({ map: barrierTex });
  const barrierTop = lambert(0xe4e1da);
  layer(t => t === Tile.LowWall, [barrierSide, barrierSide, barrierTop, barrierTop, barrierSide, barrierSide], LOW_WALL_HEIGHT + 0.4, -0.4, true);

  // ---- glitch floor and boost tiles
  const glitchTex = glitchTexture();
  const glitchMat = glowMat(0xffffff, 0.6);
  glitchMat.map = glitchTex;
  glitchMat.emissiveMap = glitchTex;
  layer(t => t === Tile.Hazard, glitchMat, 0.36, -0.4, false);
  const boostTex = boostTexture();
  const boostMat = glowMat(0xffffff, 0.5);
  boostMat.map = boostTex;
  boostMat.emissiveMap = boostTex;
  layer(t => t === Tile.Boost, boostMat, 0.42, -0.4, false);
  disposables.push(glitchTex, boostTex);

  // ---- conveyor belts: dark rubber with bright chevrons that scroll in the push direction
  const beltTex = canvasTexture(32, 32, g => {
    g.fillStyle = '#3a3550';
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#ffd34a';
    for (let i = 0; i < 2; i++) {
      const y = i * 16;
      g.beginPath();
      g.moveTo(6, y + 12);
      g.lineTo(16, y + 4);
      g.lineTo(26, y + 12);
      g.lineTo(26, y + 15);
      g.lineTo(16, y + 7);
      g.lineTo(6, y + 15);
      g.fill();
    }
  }, true);
  disposables.push(beltTex);
  const beltMat = new THREE.MeshLambertMaterial({ map: beltTex });
  const belts = cells.filter(c => c.tile >= Tile.ConveyorN && c.tile <= Tile.ConveyorW);
  const beltMesh = new THREE.InstancedMesh(unit, beltMat, Math.max(1, belts.length));
  beltMesh.count = belts.length;
  beltMesh.receiveShadow = true;
  // the chevrons point toward -z of the texture; turn each tile to its push direction
  const beltYaw: Record<number, number> = { [Tile.ConveyorN]: 0, [Tile.ConveyorE]: -Math.PI / 2, [Tile.ConveyorS]: Math.PI, [Tile.ConveyorW]: Math.PI / 2 };
  belts.forEach((c, i) => {
    o.position.set(c.tx + 0.5, -0.2, c.tz + 0.5);
    o.rotation.set(0, beltYaw[c.tile], 0);
    o.scale.set(1, 0.4, 1);
    o.updateMatrix();
    beltMesh.setMatrixAt(i, o.matrix);
  });
  o.rotation.set(0, 0, 0);
  addToScene(beltMesh);

  // ---- kart ramps: real slopes rising toward the barrier they jump
  const rampTex = rampTexture();
  disposables.push(rampTex);
  const rampMat = new THREE.MeshLambertMaterial({ map: rampTex, emissive: 0xff7a2f, emissiveIntensity: 0.15 });
  const rampGeo = (() => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c);
      uv.push(...ua, ...ub, ...uc);
      idx.push(base, base + 1, base + 2);
    };
    const side = [0.5, 0.05];
    for (const c of cells.filter(c => c.tile === Tile.Ramp)) {
      // the slope rises toward the nearest barrier straight ahead (up to 4 tiles away; ramps stand back a little)
      let dir: [number, number] = [0, -1];
      let best = Infinity;
      for (const [ox, oz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]) {
        for (let k = 1; k <= 4; k++) {
          const t = tileOf(c.tx + k * ox, c.tz + k * oz);
          if (t === Tile.Wall) break;
          if (t === Tile.LowWall) {
            if (k < best) {
              best = k;
              dir = [ox, oz];
            }
            break;
          }
        }
      }
      const H = 0.32;
      // corners in local space (along = toward the barrier), mapped to world
      const at = (along: number, across: number, y: number) => {
        const cx = c.tx + 0.5, cz = c.tz + 0.5;
        return [cx + dir[0] * along - dir[1] * across, y, cz + dir[1] * along + dir[0] * across];
      };
      const lo1 = at(-0.5, -0.5, 0), lo2 = at(-0.5, 0.5, 0), hi1 = at(0.5, -0.5, H), hi2 = at(0.5, 0.5, H);
      const f1 = at(0.5, -0.5, 0), f2 = at(0.5, 0.5, 0);
      // slope; the material is double-sided, so the winding does not matter
      tri(lo1, hi1, lo2, [0, 0.15], [0, 1], [1, 0.15]);
      tri(lo2, hi1, hi2, [1, 0.15], [0, 1], [1, 1]);
      // front face and the two side triangles
      tri(hi1, f1, hi2, side, side, side);
      tri(hi2, f1, f2, side, side, side);
      tri(lo1, f1, hi1, side, side, side);
      tri(lo2, hi2, f2, side, side, side);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  })();
  rampMat.side = THREE.DoubleSide;
  const ramps = new THREE.Mesh(rampGeo, rampMat);
  ramps.castShadow = true;
  ramps.receiveShadow = true;
  addToScene(ramps);
  // ramp tiles have no floor box any more: give them a floor under the slope
  layer(t => t === Tile.Ramp, lambert(0xc4501a), 0.4, -0.41, false);

  // ---- build pads
  const padTex = padTexture();
  disposables.push(padTex);
  const padMat = glowMat(0x4fe8ff, 0.3);
  const padMatActive = glowMat(0x9ff6ff, 1.2);
  for (const m of [padMat, padMatActive]) {
    m.color.setHex(0x2a3550);
    m.emissiveMap = padTex;
  }
  const padBase = lambert(0x4a5268);
  const padRim = lambert(0xd8dce8);
  const pads = map.pads.map(p => {
    const g = new THREE.Group();
    const base = box(1.7, 0.08, 1.7, padRim, 0, 0.04, 0);
    base.receiveShadow = true;
    base.castShadow = false;
    const inner = box(1.5, 0.1, 1.5, padBase, 0, 0.05, 0);
    inner.castShadow = false;
    inner.receiveShadow = true;
    const glow = box(1.3, 0.04, 1.3, padMat, 0, 0.115, 0);
    glow.castShadow = false;
    g.add(base, inner, glow);
    g.position.set(p.pos.x, 0, p.pos.z);
    addToScene(g);
    return { id: p.id, glow };
  });

  // ---- decoration: planters, lamps, crates and old cabinets along the walls, never on the paths;
  // vents, air conditioners and plants on the wall tops
  const props = new THREE.Group();
  const keepClear = [map.spawn, map.elevator, ...map.pads.map(p => p.pos), ...map.nestSpots.flatMap(n => [n.pos, ...n.entries]), ...map.vehicleSpots, ...map.powerSpots, ...map.crateSpots];
  const leafA = lambert(0x4caf50), leafB = lambert(0x3e9d47), pot = lambert(0xb5653a), metal = lambert(0x5a6378), wood = lambert(0xb07a3e), cab = lambert(0x6b5bb8);
  const light = lambert(0xe6e8ef), dark = lambert(0x3a3f52);
  const lampGlow = glowMat(0xffe9a8, 1.6), screenGlow = glowMat(0x2bf0ff, 1.2);
  // the minigame maps stay clean: no clutter in the maze, on the track or in the lane
  const decorate = !['maze', 'race', 'lane'].includes(map.id);
  for (const c of decorate ? floorTiles : []) {
    let walls_ = 0;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isWall(c.tx + ox, c.tz + oz)) walls_++;
    if (walls_ < 1 || hash(c.tx * 13, c.tz * 5) > 0.07) continue;
    if (keepClear.some(p => Math.abs(p.x - (c.tx + 0.5)) < 2.6 && Math.abs(p.z - (c.tz + 0.5)) < 2.6)) continue;
    const g = new THREE.Group();
    const kind = Math.floor(hash(c.tx * 7, c.tz * 11) * 4);
    if (kind === 0) {
      // a tree in a planter: a trunk and three layers of leaves, taller than a player
      g.add(box(0.6, 0.3, 0.6, pot, 0, 0.15, 0), box(0.2, 0.95, 0.2, wood, 0, 0.75, 0));
      g.add(box(1.05, 0.55, 1.05, leafA, 0, 1.4, 0), box(0.78, 0.5, 0.78, leafB, 0.05, 1.9, -0.03), box(0.45, 0.4, 0.45, leafA, 0, 2.32, 0.04));
    } else if (kind === 1) {
      g.add(box(0.12, 1.6, 0.12, metal, 0, 0.8, 0), box(0.32, 0.22, 0.32, lampGlow, 0, 1.7, 0));
    } else if (kind === 2) {
      g.add(box(0.55, 0.45, 0.55, wood, 0, 0.23, 0), box(0.4, 0.35, 0.4, wood, 0.1, 0.63, -0.05));
    } else {
      g.add(box(0.6, 1.1, 0.5, cab, 0, 0.55, 0), box(0.45, 0.32, 0.05, screenGlow, 0, 0.78, 0.26));
    }
    g.position.set(c.tx + 0.5, 0, c.tz + 0.5);
    g.rotation.y = Math.floor(hash(c.tz, c.tx * 3) * 4) * (Math.PI / 2);
    props.add(g);
  }
  for (const c of decorate ? walls.list : []) {
    if (c.tx <= 0 || c.tz <= 0 || c.tx >= map.w - 1 || c.tz >= map.h - 1) continue;
    let inner = true;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isWall(c.tx + ox, c.tz + oz)) inner = false;
    if (!inner || hash(c.tx * 29, c.tz * 31) > 0.12) continue;
    const g = new THREE.Group();
    const kind = Math.floor(hash(c.tz * 3, c.tx * 19) * 3);
    if (kind === 0) {
      g.add(box(0.7, 0.4, 0.55, light, 0, 0.2, 0), box(0.4, 0.04, 0.4, dark, 0, 0.42, 0));
    } else if (kind === 1) {
      g.add(box(0.16, 0.5, 0.16, metal, -0.2, 0.25, 0), box(0.16, 0.35, 0.16, metal, 0.15, 0.18, 0.15), box(0.26, 0.06, 0.26, dark, -0.2, 0.52, 0));
    } else {
      g.add(box(0.8, 0.22, 0.4, pot, 0, 0.11, 0), box(0.7, 0.25, 0.32, leafA, 0, 0.32, 0));
    }
    g.position.set(c.tx + 0.5, wallTopY(c.tx, c.tz), c.tz + 0.5);
    g.rotation.y = Math.floor(hash(c.tx, c.tz * 7) * 4) * (Math.PI / 2);
    props.add(g);
  }
  addToScene(props);

  // Kart Rally: a chequered start/finish line with an arch, glowing gates at the other checkpoints
  if (map.id === 'race') {
    const race = new THREE.Group();
    const checker = canvasTexture(16, 16, g => {
      for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) {
        g.fillStyle = (x + y) % 8 === 0 ? '#ffffff' : '#111118';
        g.fillRect(x, y, 4, 4);
      }
    }, true);
    disposables.push(checker);
    const gateMat = glowMat(0x2bf0ff, 1.4);
    const archMat = glowMat(0xff2bd6, 0.7);
    const postMat = lambert(0x2a2d3a);
    RACE_CHECKPOINTS.forEach((c, i) => {
      const w = c.x1 - c.x0 + 1, d = c.z1 - c.z0 + 1;
      const cx = c.x0 + w / 2, cz = c.z0 + d / 2;
      if (i === 0) {
        const tex = checker.clone();
        tex.repeat.set(w, d);
        tex.needsUpdate = true;
        disposables.push(tex);
        const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex }));
        line.position.set(cx, 0.02, cz);
        line.receiveShadow = true;
        race.add(line);
        // an arch over the line: two posts and a glowing banner
        const across = w < d;
        const span = across ? d : w;
        for (const sgn of [-1, 1]) race.add(box(0.4, 3.2, 0.4, postMat, cx + (across ? 0 : (sgn * span) / 2), 1.6, cz + (across ? (sgn * span) / 2 : 0)));
        race.add(box(across ? 0.4 : span, 0.5, across ? span : 0.4, archMat, cx, 3.2, cz));
      } else {
        const gate = box(w, 0.04, d, gateMat, cx, 0.03, cz);
        gate.castShadow = false;
        race.add(gate);
      }
    });
    addToScene(race);
  }

  // Lane Defense: the arcade cabinet the players defend
  if (map.id === 'lane') {
    const cab = new THREE.Group();
    const body = lambert(0x3a2a6a), side = lambert(0xff2bd6), screen = glowMat(0x2bf0ff, 1.6), marquee = glowMat(0xffcf3a, 1.6);
    cab.add(box(1.8, 2.4, 1.2, body, 0, 1.2, 0));
    cab.add(box(0.12, 2.5, 1.25, side, -0.92, 1.25, 0), box(0.12, 2.5, 1.25, side, 0.92, 1.25, 0));
    cab.add(box(1.4, 1.0, 0.08, screen, 0, 1.55, -0.62));
    cab.add(box(1.6, 0.35, 0.1, marquee, 0, 2.3, -0.62));
    cab.add(box(1.5, 0.12, 0.5, lambert(0x1a1a24), 0, 0.95, -0.75));
    cab.position.set(LANE_CORE.x, 0, LANE_CORE.z);
    addToScene(cab);
  }

  // Glitch Maze: a glowing pixel on every tile that still holds one, and the power cubes
  let mazePixels: THREE.InstancedMesh | null = null;
  let mazeCubes: THREE.Mesh[] = [];
  let shownPixels = -1;
  if (map.id === 'maze') {
    const pixMat = glowMat(0xffcf3a, 1.4);
    mazePixels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), pixMat, map.w * map.h);
    mazePixels.count = 0;
    addToScene(mazePixels);
    const cubeMat = glowMat(0x2bf0ff, 2);
    mazeCubes = MAZE_CUBES.map(c => {
      const m = box(0.6, 0.6, 0.6, cubeMat, c.x, 0.7, c.z);
      addToScene(m);
      return m;
    });
  }

  const color = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  let lastKey = '';
  let glitchStep = -1;

  return {
    update(s, theme, time) {
      const key = `${theme.roadA}-${theme.roadB}-${theme.wallA}-${theme.hemiGround}`;
      if (key !== lastKey) {
        lastKey = key;
        const col = floorGeo.getAttribute('color') as THREE.BufferAttribute;
        // vertices are laid out per floor tile: its top quad, then its skirt quads (shade < 1)
        let v = 0;
        for (const c of floorTiles) {
          color.setHex((c.tx + c.tz) & 1 ? theme.roadA : theme.roadB);
          // top quad
          for (let k = 0; k < 4; k++, v++) col.setXYZ(v, color.r * floorBaseShade[v * 3], color.g * floorBaseShade[v * 3], color.b * floorBaseShade[v * 3]);
          // skirts of this tile follow directly
          while (v < col.count && floorBaseShade[v * 3] < 1) {
            col.setXYZ(v, color.r * floorBaseShade[v * 3], color.g * floorBaseShade[v * 3], color.b * floorBaseShade[v * 3]);
            v++;
          }
        }
        col.needsUpdate = true;
        walls.list.forEach((_c, i) => walls.mesh.setColorAt(i, color.setHex(theme.wallA)));
        walls.mesh.instanceColor!.needsUpdate = true;
        for (let i = 0; i < trims.length; i++) trimMesh.setColorAt(i, color.setHex(theme.wallA).lerp(white, 0.6));
        trimMesh.instanceColor!.needsUpdate = true;
        outerMat.color.setHex(theme.hemiGround).multiplyScalar(0.75);
      }
      const maze = s.run.maze;
      if (mazePixels) {
        // only rewrite the instances when a pixel was taken
        if (maze && maze.pixels.length !== shownPixels) {
          shownPixels = maze.pixels.length;
          maze.pixels.forEach((tile, k) => {
            o.position.set((tile % map.w) + 0.5, 0.3, Math.floor(tile / map.w) + 0.5);
            o.rotation.set(0, Math.PI / 4, 0);
            o.scale.set(1, 1, 1);
            o.updateMatrix();
            mazePixels!.setMatrixAt(k, o.matrix);
          });
          o.rotation.set(0, 0, 0);
          mazePixels.count = maze.pixels.length;
          mazePixels.instanceMatrix.needsUpdate = true;
        }
        if (!maze) mazePixels.count = 0;
        mazeCubes.forEach((m, k) => {
          m.visible = !!maze && maze.cubes.includes(k);
          m.rotation.set(time * 1.3, time * 2, 0);
          m.position.y = 0.7 + Math.sin(time * 3 + k) * 0.12;
        });
      }
      const glow = Math.min(theme.glow, 1.4);
      glitchMat.emissiveIntensity = (0.55 + 0.25 * Math.sin(time * 5)) * glow;
      // glitchy flicker: now and then a short bright burst
      const step = Math.floor(time * 10);
      if (step !== glitchStep) glitchStep = step;
      if (hash(glitchStep, 3) > 0.85) glitchMat.emissiveIntensity *= 1.8;
      boostMat.emissiveIntensity = (0.45 + 0.25 * Math.abs(Math.sin(time * 3))) * glow;
      // 2.5 tiles per second, like the sim
      beltTex.offset.y = (time * 2.5) % 1;
      lampGlow.emissiveIntensity = 1.6 * glow;
      screenGlow.emissiveIntensity = (1 + 0.2 * Math.sin(time * 3)) * glow;

      const activePads = new Set(s.players.filter(p => p.downUntil === null).map(p => padAt(s, p.pos)).filter(id => id !== null));
      const occupied = new Set(s.towers.map(t => t.padId));
      for (const p of pads) {
        const active = activePads.has(p.id) && !occupied.has(p.id);
        p.glow.material = active ? padMatActive : padMat;
        p.glow.visible = !occupied.has(p.id);
        p.glow.scale.setScalar(active ? 1 + Math.sin(time * 8) * 0.04 : 1);
      }
      padMat.emissiveIntensity = (0.5 + 0.15 * Math.sin(time * 2)) * Math.min(theme.glow, 1.3);
      padMatActive.emissiveIntensity = 1.4 * Math.min(theme.glow, 1.3);
    },
    dispose() {
      disposed = true;
      for (const obj of added) {
        scene.remove(obj);
        obj.traverse(x => {
          const m = x as THREE.Mesh;
          if (m.geometry && m.geometry !== unit) m.geometry.dispose();
          // every material here belongs to this world (disposing one twice is harmless)
          const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
          for (const mat of mats) mat.dispose();
        });
      }
      unit.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
