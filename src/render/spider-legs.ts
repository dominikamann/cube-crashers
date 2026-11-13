import * as THREE from 'three';
import { InstancedPool } from './pool';

/**
 * The Tarantula Queen's legs. They are not part of her body's pose: every foot stands on the ground where it
 * is, at the height the ground has there (the floor, a barrier, the top of a wall), and stays planted while the
 * body moves on. When a foot has fallen too far behind where it should be, it lifts and steps ahead, four feet
 * at a time, like a real spider's. So she walks over whatever is under her, each leg bending to it.
 */
const PAIRS = [0.62, 0.3, -0.02, -0.34];
const REACH = 1.75, HIP = 0.42, STEP_SECONDS = 0.13;

interface Foot {
  x: number;
  y: number;
  z: number;
  /** stepping: where from, where to, how far along (1 = planted) */
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
}

export interface SpiderLegs {
  begin(): void;
  /**
   * her legs for this frame: her body's middle is at (x, y, z), turned by `yaw`, `scale` times life size;
   * `ground(x, z)` is how high the ground is at a spot; `air`: she is in a pounce, the legs hang under her
   */
  add(id: number, x: number, y: number, z: number, yaw: number, scale: number, ground: (x: number, z: number) => number, dt: number, air: boolean, tint?: number): void;
  end(): void;
}

export function createSpiderLegs(scene: THREE.Scene, dark: THREE.Material, joint: THREE.Material): SpiderLegs {
  // a piece of leg is a bar along +z from its near end, stretched to its length
  const thighs = new InstancedPool(scene, new THREE.BoxGeometry(0.23, 0.23, 1).translate(0, 0, 0.5), dark, 32);
  const shins = new InstancedPool(scene, new THREE.BoxGeometry(0.16, 0.16, 1).translate(0, 0, 0.5), dark, 32);
  const joints = new InstancedPool(scene, new THREE.BoxGeometry(1, 1, 1), joint, 64);
  const pools = [thighs, shins, joints];
  const feet = new Map<number, { feet: Foot[]; seen: boolean }>();
  const a = new THREE.Vector3();
  const bar = (pool: InstancedPool, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tint?: number) => {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz) || 0.001;
    pool.addBeam(a.set(x0, y0, z0), Math.atan2(dx, dz), -Math.asin(dy / len), len);
    void tint;
  };
  return {
    begin() {
      for (const p of pools) p.begin();
      for (const f of feet.values()) f.seen = false;
    },
    add(id, x, y, z, yaw, scale, ground, dt, air, tint) {
      let mine = feet.get(id);
      if (!mine) feet.set(id, (mine = { feet: [], seen: true }));
      mine.seen = true;
      const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) }, right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const world = (lx: number, lz: number) => ({ x: x + (right.x * lx + fwd.x * lz) * scale, z: z + (right.z * lx + fwd.z * lz) * scale });
      const stride = 0.55 * scale;
      // (a foot may only lift while the feet of the other group stand: 0 and 1 are the two groups)
      const group = (i: number, side: number) => ((i % 2 === 0) === side > 0 ? 0 : 1);
      const stepping = [false, false];
      mine.feet.forEach((f, k) => {
        if (f.t < 1) stepping[group(k >> 1, k % 2 ? 1 : -1)] = true;
      });
      PAIRS.forEach((lz, i) => {
        for (const side of [-1, 1]) {
          const k = i * 2 + (side > 0 ? 1 : 0);
          const splay = (1.5 - i) * REACH * 0.24;
          const rest = world(side * REACH, lz + splay);
          let f = mine!.feet[k];
          if (!f) {
            f = mine!.feet[k] = { x: rest.x, y: ground(rest.x, rest.z), z: rest.z, fx: rest.x, fy: 0, fz: rest.z, tx: rest.x, tz: rest.z, t: 1 };
          }
          const hip = world(side * HIP, lz * 0.75);
          if (air) {
            // in the air the legs hang under her, a little drawn in
            const hang = world(side * REACH * 0.7, lz + splay * 0.8);
            f.x = hang.x;
            f.z = hang.z;
            f.y = y - 0.75 * scale;
            f.t = 1;
          } else if (f.t < 1) {
            f.t = Math.min(1, f.t + dt / STEP_SECONDS);
            const e = f.t * f.t * (3 - 2 * f.t);
            f.x = f.fx + (f.tx - f.fx) * e;
            f.z = f.fz + (f.tz - f.fz) * e;
            const land = ground(f.tx, f.tz);
            f.y = f.fy + (land - f.fy) * e + Math.sin(Math.PI * f.t) * (0.35 * scale + Math.abs(land - f.fy) * 0.5);
          } else {
            const far = Math.hypot(f.x - rest.x, f.z - rest.z);
            const g = group(i, side);
            if (far > stride * 2.2 || (far > stride && !stepping[1 - g])) {
              // it steps past where it should be, in the direction she is going
              const ahead = Math.min(1, stride / (far || 1)) * 0.6;
              f.fx = f.x;
              f.fy = f.y;
              f.fz = f.z;
              f.tx = rest.x + (rest.x - f.x) * ahead;
              f.tz = rest.z + (rest.z - f.z) * ahead;
              f.t = 0;
              stepping[g] = true;
            } else f.y = ground(f.x, f.z);
          }
          // the knee: over the way from hip to foot, well above both
          const hy = y + 0.05 * scale;
          const kx = hip.x + (f.x - hip.x) * 0.5, kz = hip.z + (f.z - hip.z) * 0.5;
          const ky = Math.max(hy, f.y) + 0.62 * scale;
          bar(thighs, hip.x, hy, hip.z, kx, ky, kz, tint);
          bar(shins, kx, ky, kz, f.x, f.y + 0.08, f.z, tint);
          joints.add(kx, ky, kz, yaw, 0.3 * scale * 0.6);
          joints.add(f.x, f.y + 0.1, f.z, yaw, 0.2 * scale * 0.6);
        }
      });
    },
    end() {
      for (const p of pools) p.end();
      for (const [id, f] of feet) if (!f.seen) feet.delete(id);
    },
  };
}
