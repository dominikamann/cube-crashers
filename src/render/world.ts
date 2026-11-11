import * as THREE from 'three';
import { Tile, type FloorMap } from '../sim/map/tilemap';
import { padAt } from '../sim/systems/towers';
import type { SimState } from '../sim/types';
import { box, glowMat, lambert } from './pool';
import type { Theme } from './theme';

export const WALL_HEIGHT = 1.4;
export const LOW_WALL_HEIGHT = 0.5;

export interface World {
  update(s: SimState, theme: Theme, time: number): void;
}

/** deterministic 0..1 per tile, for small visual variation */
function hash(tx: number, tz: number): number {
  const n = Math.sin(tx * 127.1 + tz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Builds the static tile world. Every tile is exactly one box and boxes never overlap,
 * so there are no coplanar faces that could flicker.
 */
export function createWorld(scene: THREE.Scene, map: FloorMap): World {
  const cells: { tx: number; tz: number; tile: Tile }[] = [];
  for (let tz = 0; tz < map.h; tz++) {
    for (let tx = 0; tx < map.w; tx++) cells.push({ tx, tz, tile: map.tiles[tz * map.w + tx] });
  }
  const o = new THREE.Object3D();
  const unit = new THREE.BoxGeometry(1, 1, 1);

  function layer(filter: (t: Tile) => boolean, material: THREE.Material, height: (c: { tx: number; tz: number }) => number, yBase: number, shadows: boolean) {
    const list = cells.filter(c => filter(c.tile));
    const mesh = new THREE.InstancedMesh(unit, material, Math.max(1, list.length));
    mesh.count = list.length;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    list.forEach((c, i) => {
      const h = height(c);
      o.position.set(c.tx + 0.5, yBase + h / 2, c.tz + 0.5);
      o.scale.set(1, h, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, new THREE.Color(0xffffff));
    });
    scene.add(mesh);
    return { mesh, list };
  }

  const floor = layer(t => t === Tile.Floor, lambert(0xffffff), () => 0.4, -0.4, false);
  const walls = layer(t => t === Tile.Wall, lambert(0xffffff), c => WALL_HEIGHT + Math.floor(hash(c.tx, c.tz) * 3) * 0.2, -0.4, true);
  const lowWalls = layer(t => t === Tile.LowWall, lambert(0xffc94a), () => LOW_WALL_HEIGHT + 0.4, -0.4, true);
  const hazardMat = glowMat(0xff2bd6, 1.1);
  layer(t => t === Tile.Hazard, hazardMat, () => 0.36, -0.4, false);
  const boostMat = glowMat(0x2bf0ff, 0.9);
  layer(t => t === Tile.Boost, boostMat, () => 0.42, -0.4, false);
  const rampMat = glowMat(0xffe14a, 0.5);
  layer(t => t === Tile.Ramp, rampMat, () => 0.55, -0.4, false);

  // build pads
  const padMat = glowMat(0x2bd8ff, 0.7);
  const padMatActive = glowMat(0x7ffcff, 2.4);
  const padBase = lambert(0x5a6378);
  const pads = map.pads.map(p => {
    const g = new THREE.Group();
    const base = box(1.6, 0.1, 1.6, padBase, 0, 0.05, 0);
    base.receiveShadow = true;
    const glow = box(1.3, 0.05, 1.3, padMat, 0, 0.125, 0);
    glow.castShadow = false;
    g.add(base, glow);
    g.position.set(p.pos.x, 0, p.pos.z);
    scene.add(g);
    return { id: p.id, glow };
  });

  const color = new THREE.Color();
  let lastKey = '';

  return {
    update(s, theme, time) {
      const key = `${theme.roadA}-${theme.wallA}`;
      if (key !== lastKey) {
        lastKey = key;
        floor.list.forEach((c, i) => floor.mesh.setColorAt(i, color.setHex((c.tx + c.tz) & 1 ? theme.roadA : theme.roadB)));
        floor.mesh.instanceColor!.needsUpdate = true;
        walls.list.forEach((c, i) => walls.mesh.setColorAt(i, color.setHex(hash(c.tz, c.tx) > 0.5 ? theme.wallA : theme.wallB)));
        walls.mesh.instanceColor!.needsUpdate = true;
      }
      hazardMat.emissiveIntensity = (0.8 + 0.4 * Math.sin(time * 5)) * Math.min(theme.glow, 1.4);
      boostMat.emissiveIntensity = (0.6 + 0.4 * Math.abs(Math.sin(time * 3))) * Math.min(theme.glow, 1.4);
      rampMat.emissiveIntensity = 0.5 * Math.min(theme.glow, 1.4);
      void lowWalls;

      const activePads = new Set(s.players.filter(p => p.downUntil === null).map(p => padAt(s, p.pos)).filter(id => id !== null));
      const occupied = new Set(s.towers.map(t => t.padId));
      for (const p of pads) {
        const active = activePads.has(p.id) && !occupied.has(p.id);
        p.glow.material = active ? padMatActive : padMat;
        p.glow.scale.setScalar(active ? 1 + Math.sin(time * 8) * 0.04 : 1);
      }
      padMat.emissiveIntensity = 0.7 * Math.min(theme.glow, 1.1);
      padMatActive.emissiveIntensity = 2.4 * Math.min(theme.glow, 1.3);
    },
  };
}
