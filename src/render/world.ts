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
  /** removes everything this world added to the scene */
  dispose(): void;
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
  const added: THREE.Object3D[] = [];
  const addToScene = (obj: THREE.Object3D) => {
    scene.add(obj);
    added.push(obj);
  };
  const blocked = (tx: number, tz: number) => {
    const t = tx < 0 || tz < 0 || tx >= map.w || tz >= map.h ? Tile.Wall : map.tiles[tz * map.w + tx];
    return t === Tile.Wall;
  };

  /** baked ambient occlusion: floor next to walls gets darker, corners darkest */
  const shade = (tx: number, tz: number) => {
    let n = 0;
    for (const [ox, oz, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 0.6], [1, -1, 0.6], [-1, 1, 0.6], [-1, -1, 0.6]]) {
      if (blocked(tx + ox, tz + oz)) n += w;
    }
    return Math.max(0.7, 1 - n * 0.075);
  };

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
    addToScene(mesh);
    return { mesh, list };
  }

  const floor = layer(t => t === Tile.Floor, lambert(0xffffff), () => 0.4, -0.4, false);
  const walls = layer(t => t === Tile.Wall, lambert(0xffffff), c => WALL_HEIGHT + Math.floor(hash(c.tx, c.tz) * 3) * 0.2, -0.4, true);
  // lighter caps on the walls: crisp top edges, like light catching the blocks
  const capMat = lambert(0xffffff);
  const caps = layer(t => t === Tile.Wall, capMat, () => 0.08, 0, false);
  caps.list.forEach((c, i) => {
    o.position.set(c.tx + 0.5, -0.4 + WALL_HEIGHT + Math.floor(hash(c.tx, c.tz) * 3) * 0.2 + 0.04, c.tz + 0.5);
    o.scale.set(1.001, 0.08, 1.001);
    o.updateMatrix();
    caps.mesh.setMatrixAt(i, o.matrix);
  });
  const lowWalls = layer(t => t === Tile.LowWall, lambert(0xffc94a), () => LOW_WALL_HEIGHT + 0.4, -0.4, true);
  const hazardMat = glowMat(0xd81fb8, 0.6);
  layer(t => t === Tile.Hazard, hazardMat, () => 0.36, -0.4, false);
  const boostMat = glowMat(0x1fb8d8, 0.5);
  layer(t => t === Tile.Boost, boostMat, () => 0.42, -0.4, false);
  const rampMat = glowMat(0xffe14a, 0.5);
  layer(t => t === Tile.Ramp, rampMat, () => 0.55, -0.4, false);

  // build pads
  const padMat = glowMat(0x157a94, 0.3);
  const padMatActive = glowMat(0x4fe8ff, 1.2);
  const padBase = lambert(0x5a6378);
  const pads = map.pads.map(p => {
    const g = new THREE.Group();
    const base = box(1.6, 0.1, 1.6, padBase, 0, 0.05, 0);
    base.receiveShadow = true;
    const glow = box(1.3, 0.05, 1.3, padMat, 0, 0.125, 0);
    glow.castShadow = false;
    g.add(base, glow);
    g.position.set(p.pos.x, 0, p.pos.z);
    addToScene(g);
    return { id: p.id, glow };
  });

  const color = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  const floorShade = floor.list.map(c => shade(c.tx, c.tz));
  let lastKey = '';

  // decoration: planters, lamps, crates and old cabinets along the walls, never on the paths themselves
  const props = new THREE.Group();
  const keepClear = [map.spawn, map.elevator, ...map.pads.map(p => p.pos), ...map.nestSpots.flatMap(n => [n.pos, ...n.entries]), ...map.vehicleSpots, ...map.powerSpots, ...map.crateSpots];
  const leafA = lambert(0x4caf50), leafB = lambert(0x3e9d47), pot = lambert(0xb5653a), metal = lambert(0x5a6378), wood = lambert(0xb07a3e), cab = lambert(0x6b5bb8);
  const lampGlow = glowMat(0xffe9a8, 1.6), screenGlow = glowMat(0x2bf0ff, 1.2);
  for (const c of floor.list) {
    let walls_ = 0;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (blocked(c.tx + ox, c.tz + oz)) walls_++;
    if (walls_ < 1 || hash(c.tx * 13, c.tz * 5) > 0.07) continue;
    if (keepClear.some(p => Math.abs(p.x - (c.tx + 0.5)) < 2.6 && Math.abs(p.z - (c.tz + 0.5)) < 2.6)) continue;
    const g = new THREE.Group();
    const kind = Math.floor(hash(c.tx * 7, c.tz * 11) * 4);
    if (kind === 0) {
      g.add(box(0.5, 0.35, 0.5, pot, 0, 0.18, 0), box(0.6, 0.45, 0.6, leafA, 0, 0.55, 0), box(0.35, 0.3, 0.35, leafB, 0.05, 0.9, 0));
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
  addToScene(props);

  return {
    update(s, theme, time) {
      const key = `${theme.roadA}-${theme.wallA}`;
      if (key !== lastKey) {
        lastKey = key;
        floor.list.forEach((c, i) => {
          color.setHex((c.tx + c.tz) & 1 ? theme.roadA : theme.roadB).multiplyScalar(floorShade[i] * (0.97 + 0.06 * hash(c.tx * 3, c.tz * 7)));
          floor.mesh.setColorAt(i, color);
        });
        floor.mesh.instanceColor!.needsUpdate = true;
        walls.list.forEach((c, i) => walls.mesh.setColorAt(i, color.setHex(hash(c.tz, c.tx) > 0.5 ? theme.wallA : theme.wallB)));
        walls.mesh.instanceColor!.needsUpdate = true;
        caps.list.forEach((_c, i) => caps.mesh.setColorAt(i, color.setHex(theme.wallA).lerp(white, 0.35)));
        caps.mesh.instanceColor!.needsUpdate = true;
      }
      hazardMat.emissiveIntensity = (0.5 + 0.25 * Math.sin(time * 5)) * Math.min(theme.glow, 1.4);
      boostMat.emissiveIntensity = (0.35 + 0.25 * Math.abs(Math.sin(time * 3))) * Math.min(theme.glow, 1.4);
      rampMat.emissiveIntensity = 0.5 * Math.min(theme.glow, 1.4);
      void lowWalls;
      lampGlow.emissiveIntensity = 1.6 * Math.min(theme.glow, 1.4);
      screenGlow.emissiveIntensity = (1 + 0.2 * Math.sin(time * 3)) * Math.min(theme.glow, 1.4);

      const activePads = new Set(s.players.filter(p => p.downUntil === null).map(p => padAt(s, p.pos)).filter(id => id !== null));
      const occupied = new Set(s.towers.map(t => t.padId));
      for (const p of pads) {
        const active = activePads.has(p.id) && !occupied.has(p.id);
        p.glow.material = active ? padMatActive : padMat;
        p.glow.scale.setScalar(active ? 1 + Math.sin(time * 8) * 0.04 : 1);
      }
      padMat.emissiveIntensity = 0.35 * Math.min(theme.glow, 1.3);
      padMatActive.emissiveIntensity = 1.2 * Math.min(theme.glow, 1.3);
    },
    dispose() {
      for (const obj of added) {
        scene.remove(obj);
        obj.traverse(x => {
          const m = x as THREE.Mesh;
          if (m.geometry && m.geometry !== unit) m.geometry.dispose();
        });
      }
    },
  };
}
