import * as THREE from 'three';
import { Tile, type FloorMap } from '../sim/map/tilemap';
import type { SimState } from '../sim/types';
import { glowMat, InstancedPool, lambert } from './pool';
import type { Theme } from './theme';

/**
 * What makes the jungle, the server farm and the sunken arcade feel like themselves, on top of the plain
 * world: tall grass and tree crowns, blinking server racks, kelp, coral and rising bubbles. All voxels,
 * drawn as instances so a whole floor of them stays cheap.
 */
export interface WorldExtras {
  update(s: SimState, theme: Theme, time: number): void;
  dispose(): void;
}

/** deterministic 0..1 per spot, so the decoration is the same every time */
const hash = (a: number, b: number) => {
  const n = Math.sin(a * 91.7 + b * 37.3) * 43758.5453;
  return n - Math.floor(n);
};

interface Piece {
  pool: InstancedPool;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color?: number;
  /** sways (grass, kelp), blinks (LEDs) or rises (bubbles) */
  move?: 'sway' | 'blink' | 'rise';
  phase: number;
}

export function createWorldExtras(scene: THREE.Scene, map: FloorMap): WorldExtras {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const pools: InstancedPool[] = [];
  const pool = (mat: THREE.Material, shadows = false) => {
    const p = new InstancedPool(scene, unit, mat, 256, shadows);
    pools.push(p);
    return p;
  };
  const pieces: Piece[] = [];
  const wall = (tx: number, tz: number) => tx < 0 || tz < 0 || tx >= map.w || tz >= map.h || map.tiles[tz * map.w + tx] === Tile.Wall;
  const border = (tx: number, tz: number) => tx <= 0 || tz <= 0 || tx >= map.w - 1 || tz >= map.h - 1;

  if (map.id === 'jungle') {
    const blade = pool(lambert(0x5fbf4a));
    const bladeDark = pool(lambert(0x3f9a38));
    const leaves = pool(lambert(0x3fae4a), true);
    const leavesDark = pool(lambert(0x2f8a3c), true);
    const flower = pool(glowMat(0xff6ab0, 0.6));
    // tall grass: three blades per tile, taller than a monster
    for (const g of map.grass ?? []) {
      for (let k = 0; k < 3; k++) {
        const h = hash(g.x * 3 + k, g.z);
        pieces.push({ pool: k % 2 ? blade : bladeDark, x: g.x - 0.3 + k * 0.3, y: 0.55 + h * 0.2, z: g.z + (h - 0.5) * 0.5, sx: 0.12, sy: 1.1 + h * 0.4, sz: 0.12, move: 'sway', phase: g.x + g.z * 0.7 + k });
      }
    }
    // a crown of leaves on every tree clump, and flowers on the floor here and there
    for (let tz = 1; tz < map.h - 1; tz++)
      for (let tx = 1; tx < map.w - 1; tx++) {
        if (wall(tx, tz) && !border(tx, tz)) {
          const h = hash(tx, tz);
          pieces.push({ pool: h > 0.5 ? leaves : leavesDark, x: tx + 0.5, y: 2.6 + h * 0.6, z: tz + 0.5, sx: 1.6, sy: 0.9, sz: 1.6, phase: 0 });
          if (h > 0.7) pieces.push({ pool: leaves, x: tx + 0.5, y: 3.4 + h * 0.3, z: tz + 0.5, sx: 1, sy: 0.7, sz: 1, phase: 0 });
        } else if (!wall(tx, tz) && map.tiles[tz * map.w + tx] === Tile.Floor && hash(tx * 7, tz * 3) > 0.96) {
          pieces.push({ pool: flower, x: tx + 0.3 + hash(tx, tz * 5) * 0.4, y: 0.12, z: tz + 0.5, sx: 0.14, sy: 0.14, sz: 0.14, phase: 0 });
        }
      }
  }

  if (map.id === 'servers') {
    const ledGreen = pool(glowMat(0x3bff8a, 1.4));
    const ledBlue = pool(glowMat(0x2bb8ff, 1.4));
    const ledAmber = pool(glowMat(0xffb020, 1.2));
    const slot = pool(lambert(0x1c2238));
    const cable = pool(lambert(0x23283a));
    // the long faces of every rack get a column of drive slots with blinking lights
    for (let tz = 1; tz < map.h - 1; tz++)
      for (let tx = 1; tx < map.w - 1; tx++) {
        if (!wall(tx, tz) || border(tx, tz)) continue;
        for (const side of [-1, 1]) {
          if (wall(tx, tz + side)) continue;
          const z = tz + 0.5 + side * 0.51;
          for (let row = 0; row < 3; row++) {
            const y = 0.25 + row * 0.32;
            pieces.push({ pool: slot, x: tx + 0.5, y, z, sx: 0.8, sy: 0.22, sz: 0.04, phase: 0 });
            const h = hash(tx * 5 + row, tz * 3 + side);
            const led = h < 0.6 ? ledGreen : h < 0.85 ? ledBlue : ledAmber;
            pieces.push({ pool: led, x: tx + 0.2 + h * 0.5, y, z: z + side * 0.03, sx: 0.07, sy: 0.07, sz: 0.04, move: 'blink', phase: h * 40 + row });
          }
        }
      }
    // bundles of cable along the floor of the aisles
    for (let tz = 1; tz < map.h - 1; tz++)
      for (let tx = 1; tx < map.w - 1; tx++)
        if (!wall(tx, tz) && map.tiles[tz * map.w + tx] === Tile.Floor && hash(tx, tz * 11) > 0.93) {
          pieces.push({ pool: cable, x: tx + 0.5, y: 0.04, z: tz + 0.5, sx: 0.9, sy: 0.06, sz: 0.12, phase: 0 });
        }
  }

  if (map.id === 'underwater') {
    const kelp = pool(lambert(0x2f9a5a));
    const kelpLight = pool(lambert(0x4fc07a));
    const coral = [pool(lambert(0xff6a8a), true), pool(lambert(0xffa23b), true), pool(lambert(0xb15cff), true), pool(lambert(0x2bd4d4), true)];
    const bubble = pool(new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.55 }));
    for (let tz = 1; tz < map.h - 1; tz++)
      for (let tx = 1; tx < map.w - 1; tx++) {
        const h = hash(tx, tz);
        if (wall(tx, tz) && !border(tx, tz)) {
          // coral grows on the reefs
          for (let k = 0; k < 3; k++) {
            const c = hash(tx * 3 + k, tz * 7);
            pieces.push({ pool: coral[Math.floor(c * coral.length)], x: tx + 0.2 + c * 0.6, y: 1.1 + k * 0.25 + c * 0.3, z: tz + 0.3 + hash(tz, tx + k) * 0.4, sx: 0.22, sy: 0.4 + c * 0.4, sz: 0.22, phase: 0 });
          }
        } else if (map.tiles[tz * map.w + tx] === Tile.Hazard || (map.tiles[tz * map.w + tx] === Tile.Floor && h > 0.94)) {
          // kelp: in the kelp beds, and a strand here and there
          const n = map.tiles[tz * map.w + tx] === Tile.Hazard ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const c = hash(tx + k * 13, tz);
            pieces.push({ pool: c > 0.5 ? kelp : kelpLight, x: tx + 0.25 + c * 0.5, y: 0.9 + c * 0.5, z: tz + 0.5, sx: 0.14, sy: 1.8 + c, sz: 0.14, move: 'sway', phase: tx * 0.5 + tz + k });
          }
        }
        // bubbles rising from the sea bed
        if (!wall(tx, tz) && h > 0.985) {
          for (let k = 0; k < 3; k++) pieces.push({ pool: bubble, x: tx + 0.5, y: 0, z: tz + 0.5, sx: 0.12, sy: 0.12, sz: 0.12, move: 'rise', phase: h * 10 + k * 1.3 });
        }
      }
  }

  return {
    update(_s, _theme, time) {
      for (const p of pools) p.begin();
      for (const p of pieces) {
        if (p.move === 'sway') {
          // bend from the foot: the top moves, the foot stays
          const lean = Math.sin(time * 1.6 + p.phase) * 0.12;
          p.pool.addScaled(p.x + lean * p.sy * 0.5, p.y, p.z, 0, p.sx, p.sy, p.sz, p.color, 0, -lean);
        } else if (p.move === 'blink') {
          if (Math.sin(time * 3 + p.phase) > -0.2 || Math.floor(time * 9 + p.phase) % 7 !== 0) p.pool.addScaled(p.x, p.y, p.z, 0, p.sx, p.sy, p.sz, p.color);
        } else if (p.move === 'rise') {
          const t = (time * 0.35 + p.phase) % 1;
          const size = p.sx * (0.6 + t);
          p.pool.addScaled(p.x + Math.sin(time * 3 + p.phase) * 0.15, 0.2 + t * 5, p.z, 0, size, size, size, p.color);
        } else {
          p.pool.addScaled(p.x, p.y, p.z, 0, p.sx, p.sy, p.sz, p.color);
        }
      }
      for (const p of pools) p.end();
    },
    dispose() {
      for (const p of pools) {
        scene.remove(p.mesh);
        p.mesh.dispose();
      }
      unit.dispose();
    },
  };
}
