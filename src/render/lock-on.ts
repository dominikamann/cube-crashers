import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAYER_RADIUS } from '../sim/config/balance';
import { RARE } from '../sim/config/rare';
import type { SimState, Vec2 } from '../sim/types';
import { InstancedPool } from './pool';

/** the box round a target: yellow while the launcher still locks on, red once it has */
export const LOCK_COLORS = { seeking: 0xffd23d, locked: 0xff2b2b };
/** how much wider than its last size the box is when it first shows (it closes in on the target as the lock grows) */
const OPEN = 1.7;
/** a missile's trail: puffs a second, and how long one hangs there */
const PUFFS = 60, PUFF_LIFE = 0.55, MAX_PUFFS = 120;
/** a missile lays no smoke for its first ticks */
const CLEAR_TICKS = 12;

/** the eight corners of a cube with edges of 1 round the origin, each as three short bars */
function brackets(): THREE.BufferGeometry {
  const bars: THREE.BufferGeometry[] = [], len = 0.28, thick = 0.035;
  for (const x of [-0.5, 0.5])
    for (const y of [-0.5, 0.5])
      for (const z of [-0.5, 0.5]) {
        bars.push(new THREE.BoxGeometry(len, thick, thick).translate(x - Math.sign(x) * (len / 2), y, z));
        bars.push(new THREE.BoxGeometry(thick, len, thick).translate(x, y - Math.sign(y) * (len / 2), z));
        bars.push(new THREE.BoxGeometry(thick, thick, len).translate(x, y, z - Math.sign(z) * (len / 2)));
      }
  return mergeGeometries(bars, false);
}

/** a missile that flies along +x: a white body, a red nose, four fins */
function missile(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, color: number) => {
    const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    return g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  };
  return mergeGeometries(
    [
      paint(new THREE.BoxGeometry(0.5, 0.16, 0.16), 0xf2f4ff),
      paint(new THREE.BoxGeometry(0.14, 0.12, 0.12).translate(0.32, 0, 0), 0xff3b3b),
      paint(new THREE.BoxGeometry(0.06, 0.08, 0.08).translate(0.42, 0, 0), 0xff3b3b),
      paint(new THREE.BoxGeometry(0.14, 0.36, 0.04).translate(-0.2, 0, 0), 0xff3b3b),
      paint(new THREE.BoxGeometry(0.14, 0.04, 0.36).translate(-0.2, 0, 0), 0xff3b3b),
    ],
    false,
  );
}

export interface LockOn {
  /** `ids`: the players on this screen (only their own lock shows a box) */
  update(s: SimState, ids: number[], time: number, dt: number): void;
}

/**
 * The Lock-On Launcher on the screen: the box round what the player on this screen locks on to (it closes in,
 * yellow, and turns red when the lock is there), and its missiles with their flame and their trail of smoke.
 * Everything is drawn from pools that are made once.
 */
export function createLockOn(scene: THREE.Scene): LockOn {
  // (the box shows through walls and monsters: it is a sight, not a thing in the world)
  const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false, transparent: true });
  const boxes = new InstancedPool(scene, brackets(), boxMat, 4, false);
  boxes.mesh.renderOrder = 20;
  const bodies = new InstancedPool(scene, missile(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true, emissive: 0x30323c }), 8);
  const flames = new InstancedPool(scene, new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 16, false);
  const smoke = new InstancedPool(scene, new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), MAX_PUFFS, false);
  const puffs: { x: number; y: number; z: number; age: number }[] = [];
  let owed = 0;

  return {
    update(s, ids, time, dt) {
      for (const p of [boxes, bodies, flames, smoke]) p.begin();

      for (const id of ids) {
        const p = s.players.find(x => x.id === id), lock = p?.lock;
        if (!p || !lock) continue;
        const at: { pos: Vec2; radius?: number } | undefined = lock.rival ? s.players.find(x => x.id === lock.id) : s.enemies.find(e => e.id === lock.id);
        if (!at) continue;
        const k = Math.min(1, lock.ticks / RARE.missile.lockTicks), has = k >= 1;
        const size = Math.max(1.5, 2 * (at.radius ?? PLAYER_RADIUS) + 0.7);
        // it turns and closes in while it locks, then stands still and blinks
        const scale = size * (has ? 1 + 0.05 * Math.sin(time * 18) : OPEN - (OPEN - 1) * k);
        boxes.add(at.pos.x, size / 2 + 0.05, at.pos.z, has ? 0 : time * 3, scale, has ? LOCK_COLORS.locked : LOCK_COLORS.seeking);
      }

      owed += dt * PUFFS;
      const lay = Math.floor(owed);
      owed -= lay;
      for (const m of s.projectiles) {
        if (m.behavior !== 'missile') continue;
        const a = Math.atan2(m.vel.z, m.vel.x), bx = Math.cos(a), bz = Math.sin(a);
        bodies.add(m.pos.x, 0.85, m.pos.z, -a, 1.25, undefined, time * 9);
        const flick = 0.75 + 0.25 * Math.sin(time * 60 + m.id);
        flames.add(m.pos.x - bx * 0.5, 0.85, m.pos.z - bz * 0.5, time * 20, 0.34 * flick, 0xffb13d);
        flames.add(m.pos.x - bx * 0.72, 0.85, m.pos.z - bz * 0.72, -time * 14, 0.2 * flick, 0xff5a2b);
        // (no smoke right at the launcher: in first person it would hang in front of the eyes)
        if (s.tick - (m.launchedAt ?? 0) < CLEAR_TICKS) continue;
        for (let i = 0; i < lay && puffs.length < MAX_PUFFS; i++) puffs.push({ x: m.pos.x - bx * 0.7, y: 0.85, z: m.pos.z - bz * 0.7, age: 0 });
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const f = puffs[i];
        f.age += dt;
        if (f.age >= PUFF_LIFE) {
          puffs[i] = puffs[puffs.length - 1];
          puffs.pop();
          continue;
        }
        const t = f.age / PUFF_LIFE, grey = Math.round(235 - 110 * t);
        smoke.add(f.x, f.y + 0.5 * t, f.z, f.age * 3, 0.16 + 0.34 * t, (grey << 16) | (grey << 8) | grey);
      }
      for (const p of [boxes, bodies, flames, smoke]) p.end();
    },
  };
}
