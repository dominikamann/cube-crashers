import * as THREE from 'three';
import { HELI, heliHeight, heliWash } from '../sim/systems/heli';
import { TICK_RATE, type BossState, type SimEvent, type SimState } from '../sim/types';
import { allBosses } from '../sim/util';
import { glowMat, InstancedPool, lambert } from './pool';

/**
 * The attack helicopter: an olive gunship with a stepped canopy, stub wings with missile pods, a gun under its
 * chin and a red eye in its nose. It leans into its flight, its rotors turn, a shadow on the floor shows where it
 * is however high it flies, and a ring marks where it is about to come down. Its wash throws up dust in rings,
 * its missiles fly from its pods to the marked spots trailing smoke, and its gun flickers. Hurt, it smokes, then
 * burns; shot down, it spins to the floor in flames (the blast and the pieces are fx.ts's).
 */
export interface HeliFigures {
  update(s: SimState, events: SimEvent[], time: number, dt: number): void;
  /** fewer bits of smoke and dust on low graphics */
  setParticleScale(k: number): void;
}

/** how big it is drawn, and how high its middle is above the height it flies at */
const SCALE = 1.15;
const BELLY = 0.6;
/** where its rotor sits, and where its gun and its pods are (in its own frame: the nose points along +z) */
const ROTOR = { y: 0.98, z: -0.2 };
const GUN = { y: -0.5, z: 1.8 };
const POD = { x: 1.05, y: -0.25, z: 0.6 };

interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: number;
  /** fire glows and shrinks; smoke and dust grow and thin out */
  fire: boolean;
}

interface Rocket {
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  tz: number;
  at: number;
  lands: number;
}

interface Figure {
  root: THREE.Group;
  hull: THREE.MeshLambertMaterial;
  rotor: THREE.Object3D;
  tail: THREE.Object3D;
  beacon: THREE.Object3D;
  flash: THREE.Object3D;
  /** where it was last frame, and how fast it flies (smoothed), for its lean */
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  yaw: number;
  bank: number;
  hitAt: number;
  gunAt: number;
  /** shot down: spinning to the floor from `since` for `secs` */
  wreck: { since: number; secs: number } | null;
  seen: boolean;
}

const SMOKE = [0x8a8a8a, 0x6c6c6c, 0x555555];
const SOOT = [0x2a2a2a, 0x1c1c1c, 0x3a3432];
const FIRE = [0xff4a0a, 0xff7a14, 0xffa524, 0xffd040];
const DUST = [0xe6e0d2, 0xd2ccc0, 0xf2eee6];

export function createHeliFigures(scene: THREE.Scene): HeliFigures {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const dark = lambert(0x22272a), metal = lambert(0x70757d), blade = lambert(0x15171a);
  const glass = new THREE.MeshStandardMaterial({ color: 0x14303a, emissive: 0x1f7f9a, emissiveIntensity: 0.35, roughness: 0.25 });
  const red = glowMat(0xff3b30, 2.2);
  const muzzle = new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false });
  const disc = new THREE.MeshBasicMaterial({ color: 0x111417, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
  const discGeo = new THREE.CircleGeometry(2.3, 24).rotateX(-Math.PI / 2);
  const figures = new Map<number, Figure>();
  const spare: Figure[] = [];

  // what is on the floor and in the air round it: built once, drawn only while a helicopter is about
  const shadows = new InstancedPool(scene, new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 4, false);
  const ringGeo = new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2);
  const washRings = new InstancedPool(scene, ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), 16, false);
  const landRings = new InstancedPool(scene, new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), 4, false);
  const smoke = new InstancedPool(scene, unit, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }), 256, false);
  const flames = new InstancedPool(scene, unit, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 128, false);
  const rockets = new InstancedPool(scene, new THREE.BoxGeometry(0.14, 0.14, 1).translate(0, 0, 0.5), lambert(0xd8dce2), 32);
  const bits: Bit[] = [];
  const flying: Rocket[] = [];
  const tmp = new THREE.Vector3();
  let particleScale = 1;
  /** something of it was drawn last frame (so the pools are emptied once when it is gone) */
  let drawn = false;
  let rnd = 9151;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

  function build(): Figure {
    const root = new THREE.Group();
    const hull = lambert(0x55623f);
    const box = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, into: THREE.Object3D = root) => {
      const m = new THREE.Mesh(unit, mat);
      m.position.set(x, y, z);
      m.scale.set(w, h, d);
      m.castShadow = mat !== disc && mat !== muzzle;
      into.add(m);
      return m;
    };
    box(hull, 0, 0, 0.2, 0.9, 0.8, 2.4);
    box(hull, 0, -0.1, 1.65, 0.7, 0.55, 0.7);
    box(red, 0, -0.14, 2.02, 0.3, 0.2, 0.08);
    box(glass, 0, 0.44, 0.5, 0.62, 0.42, 0.85);
    box(glass, 0, 0.3, 1.2, 0.56, 0.34, 0.62);
    box(dark, 0, 0.52, -0.4, 0.76, 0.34, 1.1);
    box(hull, 0, 0.12, -1.9, 0.32, 0.34, 2.2);
    box(hull, 0, 0.55, -2.85, 0.12, 0.9, 0.5);
    box(red, 0, 0.92, -2.85, 0.14, 0.18, 0.52);
    box(dark, 0, 0.15, -2.55, 1.0, 0.08, 0.3);
    for (const side of [-1, 1]) {
      box(dark, side * 0.85, -0.05, 0.1, 0.9, 0.1, 0.55);
      box(metal, side * POD.x, POD.y, 0.15, 0.3, 0.3, 0.9);
      box(red, side * POD.x, POD.y, 0.62, 0.2, 0.2, 0.06);
      box(dark, side * 0.5, -0.76, 0.2, 0.1, 0.08, 1.9);
      box(dark, side * 0.5, -0.56, 0.8, 0.07, 0.36, 0.07);
      box(dark, side * 0.5, -0.56, -0.4, 0.07, 0.36, 0.07);
    }
    box(dark, 0, -0.45, 1.0, 0.3, 0.2, 0.3);
    box(blade, 0, GUN.y, 1.4, 0.13, 0.13, 0.8);
    box(dark, 0, 0.8, ROTOR.z, 0.14, 0.34, 0.14);
    const rotor = new THREE.Group();
    rotor.position.set(0, ROTOR.y, ROTOR.z);
    root.add(rotor);
    box(blade, 0, 0, 0, 4.6, 0.05, 0.22, rotor);
    box(blade, 0, 0, 0, 0.22, 0.05, 4.6, rotor);
    const blur = new THREE.Mesh(discGeo, disc);
    blur.position.y = 0.01;
    rotor.add(blur);
    const tail = new THREE.Group();
    tail.position.set(0.14, 0.6, -2.9);
    root.add(tail);
    box(blade, 0, 0, 0, 0.05, 0.95, 0.12, tail);
    const beacon = box(red, 0, 0.74, -1.0, 0.12, 0.12, 0.12);
    const flash = box(muzzle, 0, GUN.y, GUN.z + 0.15, 0.34, 0.34, 0.34);
    root.scale.setScalar(SCALE);
    root.rotation.order = 'YXZ';
    root.visible = false;
    scene.add(root);
    return { root, hull, rotor, tail, beacon, flash, x: 0, z: 0, y: 0, vx: 0, vz: 0, yaw: 0, bank: 0, hitAt: -1e9, gunAt: -1e9, wreck: null, seen: false };
  }

  function bit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, fire = false) {
    if (bits.length >= 360) return;
    bits.push({ x, y, z, vx, vy, vz, life, max: life, size, color, fire });
  }
  const pick = (list: number[]) => list[Math.floor(rand() * list.length)];
  /** the figure that is nearest to a spot on the floor (an event says where, not who) */
  const nearest = (x: number, z: number): Figure | undefined => {
    let best: Figure | undefined, far = 4;
    for (const f of figures.values()) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < far) ((far = d), (best = f));
    }
    return best;
  };

  return {
    setParticleScale(k) {
      particleScale = k;
    },
    update(s, events, time, dt) {
      const bosses = allBosses(s).filter(b => b.heli && b.enemyId !== null);
      const any = bosses.length > 0 || figures.size > 0 || bits.length > 0 || flying.length > 0;
      if (!any && !drawn) return;
      drawn = any;
      for (const p of [shadows, washRings, landRings, smoke, flames, rockets]) p.begin();
      for (const f of figures.values()) f.seen = false;
      const bodyOf = (b: BossState) => s.enemies.find(e => e.id === b.enemyId && e.hp > 0);

      for (const b of bosses) {
        const e = bodyOf(b), h = b.heli!;
        if (!e) continue;
        let f = figures.get(e.id);
        if (!f) {
          f = spare.pop() ?? build();
          Object.assign(f, { x: e.pos.x, z: e.pos.z, vx: 0, vz: 0, bank: 0, wreck: null, yaw: Math.atan2(e.dir.x, e.dir.z) });
          f.hull.color.setHex(0x55623f);
          figures.set(e.id, f);
        }
        f.seen = true;
        const lift = heliHeight(h, s.tick);
        // its lean: nose down the faster it flies ahead, rolled into its turns
        const k = Math.min(1, dt * 6);
        if (dt > 0) {
          f.vx += ((e.pos.x - f.x) / dt - f.vx) * k;
          f.vz += ((e.pos.z - f.z) / dt - f.vz) * k;
        }
        const yaw = Math.atan2(e.dir.x, e.dir.z);
        let turned = yaw - f.yaw;
        turned = Math.atan2(Math.sin(turned), Math.cos(turned));
        f.bank += (Math.max(-0.45, Math.min(0.45, dt > 0 ? (-turned / dt) * 0.16 : 0)) - f.bank) * k;
        const ahead = f.vx * e.dir.x + f.vz * e.dir.z;
        f.x = e.pos.x;
        f.z = e.pos.z;
        f.yaw = yaw;
        f.y = lift + BELLY * SCALE + 0.1 + Math.sin(time * 2.1 + e.id) * 0.07;
        f.root.visible = true;
        f.root.position.set(f.x, f.y, f.z);
        f.root.rotation.set(Math.max(-0.1, Math.min(0.32, ahead * 0.03)), yaw, f.bank);
        f.rotor.rotation.y = time * 24;
        f.tail.rotation.x = time * 31;
        f.beacon.visible = Math.floor(time * 2.4 + e.id) % 2 === 0;
        f.flash.visible = time - f.gunAt < 0.7 && Math.floor(time * 30) % 2 === 0;
        // a white flash for a moment after a hit
        f.hull.emissive.setHex(time - f.hitAt < 0.08 ? 0x9a9a9a : 0);

        // hurt: grey smoke from its engine, then black smoke and flames
        if (b.phase >= 2 && rand() < dt * (b.phase >= 3 ? 26 : 12) * particleScale) {
          const back = { x: f.x - e.dir.x * 0.6 * SCALE, z: f.z - e.dir.z * 0.6 * SCALE };
          bit(back.x + (rand() - 0.5) * 0.4, f.y + 0.5, back.z + (rand() - 0.5) * 0.4, f.vx * 0.2, 1 + rand(), f.vz * 0.2, 0.9 + rand() * 0.7, 0.22 + rand() * 0.16, pick(b.phase >= 3 ? SOOT : SMOKE));
          if (b.phase >= 3 && rand() < 0.5) bit(back.x, f.y + 0.45, back.z, f.vx * 0.3, 0.8 + rand(), f.vz * 0.3, 0.3 + rand() * 0.25, 0.16 + rand() * 0.12, pick(FIRE), true);
        }

        // on the floor: its shadow, the ring where it is about to come down, and its wash
        shadows.add(f.x, 0.04, f.z, 0, 1.9 - 0.7 * Math.min(1, lift / HELI.cruise));
        if (h.mode === 'descend') {
          const t = (s.tick - h.at) / Math.max(1, h.until - h.at);
          landRings.add(h.spot.x, 0.07, h.spot.z, time * 1.5, HELI.radius * (1.9 - 0.9 * t));
        }
        const wash = heliWash(b, s.tick);
        if (wash.push > 0.05) {
          const power = Math.min(1, wash.push / 4);
          for (let i = 0; i < 3; i++) {
            const t = (time * 0.9 + i / 3) % 1, g = Math.round(255 * power * (1 - t) * 0.8);
            washRings.add(f.x, 0.06, f.z, 0, wash.radius * (0.25 + 0.75 * t), (g << 16) | (g << 8) | g);
          }
          const n = wash.push * 9 * dt * particleScale;
          for (let i = Math.floor(n) + (rand() < n % 1 ? 1 : 0); i > 0; i--) {
            const a = rand() * Math.PI * 2, r = 0.8 + rand() * wash.radius * 0.5, sp = 3 + rand() * 3;
            bit(f.x + Math.cos(a) * r, 0.1 + rand() * 0.2, f.z + Math.sin(a) * r, Math.cos(a) * sp, 0.4 + rand() * 0.8, Math.sin(a) * sp, 0.4 + rand() * 0.4, 0.12 + rand() * 0.14, pick(DUST));
          }
        }
      }

      for (const ev of events) {
        if (ev.type === 'enemyHit') {
          const f = figures.get(ev.id);
          if (f) f.hitAt = time;
        } else if (ev.type === 'heliGun') {
          const f = nearest(ev.pos.x, ev.pos.z) ?? [...figures.values()].find(x => !x.wreck);
          if (f) f.gunAt = time;
        } else if (ev.type === 'heliMissiles') {
          // from its pods, left and right in turn, each to its own ring
          const f = nearest(ev.from.x, ev.from.z);
          const yaw = f?.yaw ?? 0, y = (f?.y ?? HELI.cruise) + POD.y * SCALE;
          ev.to.forEach((to, i) => {
            const side = (i % 2 ? 1 : -1) * POD.x * SCALE;
            flying.push({
              fx: ev.from.x + Math.cos(yaw) * side + Math.sin(yaw) * POD.z,
              fy: y,
              fz: ev.from.z - Math.sin(yaw) * side + Math.cos(yaw) * POD.z,
              tx: to.x,
              tz: to.z,
              at: time + i * 0.06,
              lands: time + (ev.at - s.tick + i * HELI.missileGap) / TICK_RATE,
            });
          });
        } else if (ev.type === 'heliCrash') {
          const f = nearest(ev.pos.x, ev.pos.z);
          if (f) {
            f.wreck = { since: time, secs: Math.max(0.2, (ev.at - s.tick) / TICK_RATE) };
            f.hull.color.setHex(0x2c2f28);
            f.hull.emissive.setHex(0);
            f.flash.visible = false;
          }
        }
      }

      // shot down: it spins, faster and faster, sinks to the floor and burns all the way
      for (const [id, f] of figures) {
        const w = f.wreck;
        if (w) {
          const t = Math.min(1, (time - w.since) / w.secs);
          const y = f.y + (BELLY * SCALE + 0.35 - f.y) * t * t;
          f.root.position.set(f.x + Math.sin(time * 9) * 0.15 * t, y, f.z + Math.cos(time * 7) * 0.15 * t);
          f.root.rotation.set(0.25 * t, f.yaw + 14 * t * t * w.secs, 0.5 * Math.sin(time * 6) * t);
          f.rotor.rotation.y = time * 24 * (1 - 0.6 * t);
          f.beacon.visible = false;
          shadows.add(f.x, 0.04, f.z, 0, 1.9);
          const n = 40 * dt * particleScale;
          for (let i = Math.floor(n) + (rand() < n % 1 ? 1 : 0); i > 0; i--) {
            const fire = rand() < 0.55;
            bit(f.x + (rand() - 0.5) * 1.4, y + (rand() - 0.3) * 0.8, f.z + (rand() - 0.5) * 1.4, (rand() - 0.5) * 1.5, 1.2 + rand() * 2, (rand() - 0.5) * 1.5, fire ? 0.3 + rand() * 0.3 : 1 + rand() * 0.8, fire ? 0.2 + rand() * 0.16 : 0.28 + rand() * 0.2, fire ? pick(FIRE) : pick(SOOT), fire);
          }
          if (t < 1) continue;
        } else if (f.seen) continue;
        // gone (blown up, or the floor is over): back to the spares
        f.root.visible = false;
        f.wreck = null;
        figures.delete(id);
        spare.push(f);
      }

      // its missiles: out of the pod level, then down onto their ring, faster and faster, trailing smoke
      for (let i = flying.length - 1; i >= 0; i--) {
        const r = flying[i];
        if (time >= r.lands) {
          flying.splice(i, 1);
          continue;
        }
        if (time < r.at) continue;
        const t = (time - r.at) / Math.max(0.05, r.lands - r.at), e2 = t * t;
        const x = r.fx + (r.tx - r.fx) * t, z = r.fz + (r.tz - r.fz) * t, y = r.fy * (1 - e2) + 0.2 * e2;
        const run = Math.hypot(r.tx - r.fx, r.tz - r.fz) || 0.001;
        tmp.set(x, y, z);
        rockets.addBeam(tmp, Math.atan2(r.tx - r.fx, r.tz - r.fz), Math.atan2(2 * t * r.fy, run), 0.6);
        flames.add(x, y, z, time * 20, 0.2 + 0.08 * Math.sin(time * 50 + i), pick(FIRE));
        if (rand() < dt * 45 * particleScale) bit(x, y, z, 0, 0.3, 0, 0.5 + rand() * 0.3, 0.14 + rand() * 0.1, pick(SMOKE));
      }

      for (let i = bits.length - 1; i >= 0; i--) {
        const p = bits[i];
        p.life -= dt;
        if (p.life <= 0) {
          bits[i] = bits[bits.length - 1];
          bits.pop();
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 1 - 1.5 * dt;
        p.vz *= 1 - 1.5 * dt;
        const k = p.life / p.max;
        if (p.fire) flames.add(p.x, p.y, p.z, p.x * 3, p.size * (0.3 + 0.7 * k), p.color);
        else smoke.add(p.x, p.y, p.z, p.x * 2 + p.z, p.size * (1.7 - 0.9 * k) * Math.min(1, k * 4), p.color);
      }
      for (const p of [shadows, washRings, landRings, smoke, flames, rockets]) p.end();
    },
  };
}
