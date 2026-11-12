import * as THREE from 'three';
import type { SimState } from '../sim/types';
import { ENEMY_LOOK } from './entities';
import { MONSTER_LIFT } from './monster-parts';
import { wallTop } from './world';
import { palette } from './palette';

const MAX_BARS = 400;
const BAR_H = 0.07;

/**
 * Small health bars over hurt monsters and over other players, turned toward each camera before it draws,
 * so in first person you see at a glance whether a shot landed. Depth-tested: no seeing them through walls.
 */
export interface HealthBars {
  update(s: SimState): void;
  /** turn the bars toward `camera`; the players in `hide` (whose eyes these are) get none */
  face(camera: THREE.Camera, hide: number[]): void;
}

interface Bar {
  x: number;
  y: number;
  z: number;
  w: number;
  frac: number;
  playerId: number | null;
}

export function createHealthBars(scene: THREE.Scene): HealthBars {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  // see-through: a faint backing and a soft fill, not a hard black bar
  const make = (color: number, opacity: number, order: number) => {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity, depthWrite: false });
    const m = new THREE.InstancedMesh(geo, mat, MAX_BARS);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = order;
    scene.add(m);
    return m;
  };
  const back = make(0x1a1530, 0.28, 1);
  const fill = make(0xffffff, 0.75, 2);
  fill.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BARS * 3), 3);
  const bars: Bar[] = [];
  const o = new THREE.Object3D();
  const right = new THREE.Vector3();
  const color = new THREE.Color();

  return {
    update(s) {
      bars.length = 0;
      const bossIds = new Set([s.boss?.enemyId, ...(s.boss?.worms.flat() ?? [])]);
      for (const e of s.enemies) {
        if (e.hp >= e.maxHp || e.hp <= 0 || bossIds.has(e.id) || bars.length >= MAX_BARS) continue;
        const l = ENEMY_LOOK[e.kind];
        const scale = e.elite ? 1.4 : 1;
        bars.push({ x: e.pos.x, y: (l.h + (MONSTER_LIFT[e.kind] ?? 0)) * scale + (e.kind === 'swarmer' ? 1.6 : 0.4), z: e.pos.z, w: Math.max(0.6, Math.min(1.4, l.w * scale)), frac: e.hp / e.maxHp, playerId: null });
      }
      for (const p of s.players) {
        if (p.downUntil !== null || p.hp <= 0) continue;
        bars.push({ x: p.pos.x, y: 1.95 + (p.flying || (p.descent ?? 0) > 0 ? 2.5 : 0) + (p.perched ? wallTop(s.map, p.pos.x, p.pos.z) : 0), z: p.pos.z, w: 0.9, frac: Math.max(0, p.hp / p.maxHp), playerId: p.id });
      }
    },
    face(camera, hide) {
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      const pal = palette();
      let n = 0;
      for (const b of bars) {
        if (b.playerId !== null && hide.includes(b.playerId)) continue;
        o.quaternion.copy(camera.quaternion);
        o.position.set(b.x, b.y, b.z);
        o.scale.set(b.w + 0.04, BAR_H + 0.03, 0.02);
        o.updateMatrix();
        back.setMatrixAt(n, o.matrix);
        // the fill shrinks toward the left end, a little in front of the back
        o.position.addScaledVector(right, -((1 - b.frac) * b.w) / 2);
        o.scale.set(Math.max(0.001, b.w * b.frac), BAR_H, 0.03);
        o.updateMatrix();
        fill.setMatrixAt(n, o.matrix);
        color.setHex(pal.health(b.frac));
        fill.setColorAt(n, color);
        n++;
      }
      back.count = fill.count = n;
      back.instanceMatrix.needsUpdate = fill.instanceMatrix.needsUpdate = true;
      if (fill.instanceColor) fill.instanceColor.needsUpdate = true;
    },
  };
}
