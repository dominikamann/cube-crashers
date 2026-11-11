import * as THREE from 'three';
import type { MapDef, SimState } from '../sim/types';
import { padAt } from '../sim/systems/towers';
import { box, glowMat, lambert } from './pool';
import type { Theme } from './theme';

const GROUND = { minX: -9, maxX: 9, minZ: -36, maxZ: 13 };

export interface World {
  update(s: SimState, theme: Theme, time: number): void;
}

export function createWorld(scene: THREE.Scene, map: MapDef): World {
  // ground tiles: one instanced mesh, coloured per tile
  const tiles: { road: boolean; odd: boolean; x: number; z: number }[] = [];
  for (let x = GROUND.minX; x <= GROUND.maxX; x++) {
    for (let z = GROUND.minZ; z <= GROUND.maxZ; z++) {
      tiles.push({ road: Math.abs(x) <= Math.floor(map.laneHalfWidth), odd: ((x + z) & 1) === 1, x, z });
    }
  }
  const ground = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert(0xffffff), tiles.length);
  ground.receiveShadow = true;
  const o = new THREE.Object3D();
  tiles.forEach((t, i) => {
    o.position.set(t.x, t.road ? -0.5 : -0.35, t.z);
    o.updateMatrix();
    ground.setMatrixAt(i, o.matrix);
    ground.setColorAt(i, new THREE.Color(0xffffff));
  });
  scene.add(ground);

  // neon lane edges
  const edgeMat = glowMat(0x2bf0ff, 0.6);
  const laneLen = GROUND.maxZ - GROUND.minZ;
  for (const side of [-1, 1]) {
    const e = box(0.1, 0.12, laneLen, edgeMat, side * (map.laneHalfWidth + 0.05), 0.06, (GROUND.minZ + GROUND.maxZ) / 2);
    e.castShadow = false;
    scene.add(e);
  }

  // decor: voxel trees and rocks outside the lane, deterministic layout
  const trunkMat = lambert(0x8a5a3b);
  const leafMat = lambert(0x4caf50);
  const leafMat2 = lambert(0x3e9d47);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (7.2 + rnd() * 1.6);
    const z = GROUND.minZ + 2 + rnd() * (laneLen - 6);
    if (map.pads.some(p => Math.abs(p.pos.x - x) < 1.5 && Math.abs(p.pos.z - z) < 1.5)) continue;
    const tree = new THREE.Group();
    const h = 0.8 + rnd() * 0.8;
    tree.add(box(0.35, h, 0.35, trunkMat, 0, h / 2, 0));
    tree.add(box(1.3, 1, 1.3, rnd() > 0.5 ? leafMat : leafMat2, 0, h + 0.5, 0));
    tree.add(box(0.8, 0.6, 0.8, leafMat, 0, h + 1.2, 0));
    tree.position.set(x, -0.1, z);
    scene.add(tree);
  }

  // build pads
  const padMat = glowMat(0x2bd8ff, 0.7);
  const padMatActive = glowMat(0x7ffcff, 2.4);
  const pads = map.pads.map(p => {
    const g = new THREE.Group();
    const base = box(1.8, 0.16, 1.8, lambert(0x5a6378), 0, 0.08, 0);
    base.receiveShadow = true;
    const glow = box(1.5, 0.05, 1.5, padMat, 0, 0.18, 0);
    glow.castShadow = false;
    g.add(base, glow);
    for (const [cx, cz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      g.add(box(0.2, 0.3, 0.2, padMat, cx, 0.2, cz));
    }
    g.position.set(p.pos.x, 0, p.pos.z);
    scene.add(g);
    return { id: p.id, glow };
  });

  // the base: a voxel arcade cabinet behind the player
  const cabinet = new THREE.Group();
  const bodyMat = lambert(0x3a2f6b);
  cabinet.add(box(2.4, 3, 1.6, bodyMat, 0, 1.5, 0));
  cabinet.add(box(2.6, 0.6, 1.8, glowMat(0xff2bd6, 1.2), 0, 3.2, 0));
  const screenMat = glowMat(0x3bff6b, 1.5);
  const screen = box(1.8, 1.1, 0.1, screenMat, 0, 2.1, -0.82);
  cabinet.add(screen);
  cabinet.add(box(2.4, 0.3, 0.8, lambert(0x2a2250), 0, 1.25, -1.1));
  cabinet.add(box(0.12, 0.35, 0.12, glowMat(0xff3b3b, 1.5), -0.5, 1.55, -1.1));
  cabinet.add(box(0.2, 0.08, 0.2, glowMat(0xffe14a, 1.5), 0.3, 1.45, -1.2));
  cabinet.add(box(0.2, 0.08, 0.2, glowMat(0x2bf0ff, 1.5), 0.65, 1.45, -1.2));
  cabinet.position.set(0, 0, map.baseZ + 1.6);
  scene.add(cabinet);

  const tileColor = new THREE.Color();
  let lastKey = '';

  return {
    update(s, theme, time) {
      const key = `${theme.roadA}-${theme.grassA}`;
      if (key !== lastKey) {
        lastKey = key;
        tiles.forEach((t, i) => {
          const c = t.road ? (t.odd ? theme.roadA : theme.roadB) : t.odd ? theme.grassA : theme.grassB;
          ground.setColorAt(i, tileColor.setHex(c));
        });
        ground.instanceColor!.needsUpdate = true;
      }
      edgeMat.emissiveIntensity = theme.laneEdgeIntensity;

      const activePads = new Set(
        s.players.filter(p => p.downUntil === null).map(p => padAt(s, p.pos)).filter(id => id !== null),
      );
      const occupied = new Set(s.towers.map(t => t.padId));
      for (const p of pads) {
        const active = activePads.has(p.id) && !occupied.has(p.id);
        p.glow.material = active ? padMatActive : padMat;
        p.glow.scale.setScalar(active ? 1 + Math.sin(time * 8) * 0.04 : 1);
      }
      padMat.emissiveIntensity = 0.7 * Math.min(theme.glow, 1.1);
      padMatActive.emissiveIntensity = 2.4 * Math.min(theme.glow, 1.3);

      const f = s.base.hp / s.base.maxHp;
      screenMat.color.setHSL(0.33 * f, 1, 0.5);
      screenMat.emissive.copy(screenMat.color);
      screenMat.emissiveIntensity = 1.5 * theme.glow * (f < 0.3 ? 0.6 + 0.4 * Math.abs(Math.sin(time * 6)) : 1);
    },
  };
}
