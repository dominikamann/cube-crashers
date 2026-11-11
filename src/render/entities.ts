import * as THREE from 'three';
import type { EnemyKind, SimState } from '../sim/types';
import { glowMat, InstancedPool, lambert } from './pool';
import type { Theme } from './theme';

/** Look of each enemy kind: body box size, colours, eye height and spacing. */
export const ENEMY_LOOK: Record<EnemyKind, { w: number; h: number; d: number; day: number; night: number; eyeY: number; eyeX: number; eye: number }> = {
  blob: { w: 0.7, h: 0.7, d: 0.7, day: 0xe85d75, night: 0xff3b6b, eyeY: 0.5, eyeX: 0.15, eye: 0.14 },
  dasher: { w: 0.55, h: 0.35, d: 0.85, day: 0xf29e4c, night: 0xffb13b, eyeY: 0.25, eyeX: 0.12, eye: 0.1 },
  tank: { w: 1.25, h: 1.05, d: 1.25, day: 0x8a8fa3, night: 0x9aa6d0, eyeY: 0.7, eyeX: 0.28, eye: 0.18 },
  splitter: { w: 0.8, h: 0.8, d: 0.8, day: 0x9b6bd6, night: 0xb07cff, eyeY: 0.55, eyeX: 0.18, eye: 0.14 },
  splitling: { w: 0.42, h: 0.42, d: 0.42, day: 0xc9a6f0, night: 0xd8b8ff, eyeY: 0.3, eyeX: 0.09, eye: 0.08 },
  miniboss: { w: 2.4, h: 2.2, d: 2.2, day: 0x5b4a8a, night: 0x7b5fd1, eyeY: 1.5, eyeX: 0.55, eye: 0.4 },
  wormSegment: { w: 0.95, h: 0.85, d: 0.95, day: 0x7b4fd1, night: 0x8f63ff, eyeY: 0.6, eyeX: 0.22, eye: 0.16 },
};

const CANDY_COLORS = [0xff4d6d, 0x4dd2ff, 0xffe14a, 0x7dff6b, 0xff8cf0, 0xff9f43];
const KINDS = Object.keys(ENEMY_LOOK) as EnemyKind[];

export interface Entities {
  update(s: SimState, theme: Theme, time: number): void;
}

export function createEntities(scene: THREE.Scene): Entities {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bodyMats = new Map<EnemyKind, THREE.MeshLambertMaterial>();
  const bodies = new Map<EnemyKind, InstancedPool>();
  for (const k of KINDS) {
    const l = ENEMY_LOOK[k];
    const mat = lambert(l.day);
    bodyMats.set(k, mat);
    bodies.set(k, new InstancedPool(scene, new THREE.BoxGeometry(l.w, l.h, l.d), mat));
  }
  const eyeMat = glowMat(0xfff27a, 2.5);
  const eyes = new InstancedPool(scene, unit, eyeMat, 1024, false);
  const pupilMat = lambert(0x111111);
  const pupils = new InstancedPool(scene, unit, pupilMat, 1024, false);
  const hornMat = glowMat(0xff2bd6, 1.5);
  const horns = new InstancedPool(scene, new THREE.BoxGeometry(0.22, 0.45, 0.22), hornMat, 64);
  const redEyeMat = glowMat(0xff2b2b, 3);
  const redEyes = new InstancedPool(scene, new THREE.BoxGeometry(0.26, 0.16, 0.06), redEyeMat, 64, false);
  const plateMat = lambert(0x5f6478);
  const plates = new InstancedPool(scene, new THREE.BoxGeometry(1.35, 0.18, 1.35), plateMat, 128);

  const boltMat = glowMat(0xfff27a, 3);
  const bolts = new InstancedPool(scene, new THREE.BoxGeometry(0.18, 0.18, 0.5), boltMat, 512, false);
  const candyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333, roughness: 0.4 });
  const candies = new InstancedPool(scene, new THREE.BoxGeometry(0.22, 0.22, 0.22), candyMat, 512, false);
  const hotdogMat = lambert(0xd9773a);
  const hotdogs = new InstancedPool(scene, new THREE.BoxGeometry(0.25, 0.2, 0.7), hotdogMat, 64);
  const boomerangMat = glowMat(0x2bf0ff, 1.5);
  const boomerangs = new InstancedPool(scene, new THREE.BoxGeometry(0.8, 0.1, 0.18), boomerangMat, 64);
  const popcornMat = lambert(0xfff6e0);
  const popcorns = new InstancedPool(scene, new THREE.BoxGeometry(0.35, 0.35, 0.35), popcornMat, 64);
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0xffd400,
    emissive: 0xffb000,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.75,
  });
  const puddles = new InstancedPool(scene, new THREE.CylinderGeometry(1, 1, 0.05, 16), puddleMat, 64, false);

  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc928, emissive: 0xffa000, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.35 });
  coinMat.userData.baseGlow = 0.35;
  const coins = new InstancedPool(scene, new THREE.BoxGeometry(0.34, 0.34, 0.08), coinMat, 512);
  const coinInnerMat = glowMat(0xfff3a0, 1.2);
  const coinInner = new InstancedPool(scene, new THREE.BoxGeometry(0.12, 0.2, 0.1), coinInnerMat, 512, false);

  const crateTex = makeCrateTexture();
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, emissive: 0xffffff, emissiveMap: crateTex, emissiveIntensity: 0.35 });
  const crates = new InstancedPool(scene, new THREE.BoxGeometry(0.85, 0.85, 0.85), crateMat, 32);

  const bob = (id: number, time: number, amp: number) => Math.abs(Math.sin(time * 8 + id * 1.7)) * amp;

  return {
    update(s, theme, time) {
      const night = theme.pointLights;
      for (const k of KINDS) {
        const l = ENEMY_LOOK[k];
        bodyMats.get(k)!.color.setHex(night > 0.5 ? l.night : l.day);
        bodies.get(k)!.begin();
      }
      eyeMat.color.setHex(night > 0.5 ? 0xffffff : 0xfff27a);
      eyeMat.emissive.copy(eyeMat.color);
      eyeMat.emissiveIntensity = 2.5 * theme.glow;
      hornMat.emissiveIntensity = 1.5 * theme.glow;
      boomerangMat.emissiveIntensity = 1.5 * theme.glow;
      boltMat.emissiveIntensity = 3 * theme.glow;
      eyes.begin();
      pupils.begin();
      horns.begin();
      redEyes.begin();
      plates.begin();

      const heads = new Set(s.boss?.worms.map(w => w.segmentIds[0]) ?? []);
      const slowed = (until: number) => until > s.tick;
      for (const e of s.enemies) {
        const l = ENEMY_LOOK[e.kind];
        const isSegment = e.kind === 'wormSegment';
        const y = l.h / 2 + (isSegment || e.kind === 'miniboss' ? 0.05 : bob(e.id, time, e.kind === 'tank' ? 0.08 : 0.22));
        const wobble = e.kind === 'dasher' ? Math.sin(time * 20 + e.id) * 0.15 : 0;
        const tint = slowed(e.slowUntil) ? 0x9fe8ff : undefined;
        bodies.get(e.kind)!.add(e.pos.x, y, e.pos.z, wobble, 1, tint);
        if (e.kind === 'tank') plates.add(e.pos.x, y + l.h / 2 - 0.05, e.pos.z);
        if (isSegment && heads.has(e.id)) {
          horns.add(e.pos.x - 0.3, y + 0.6, e.pos.z);
          horns.add(e.pos.x + 0.3, y + 0.6, e.pos.z);
          redEyes.add(e.pos.x - 0.22, y + 0.15, e.pos.z + l.d / 2 + 0.03);
          redEyes.add(e.pos.x + 0.22, y + 0.15, e.pos.z + l.d / 2 + 0.03);
          continue;
        }
        if (isSegment) continue;
        const ey = y - l.h / 2 + l.eyeY;
        const ez = e.pos.z + l.d / 2 + 0.02;
        for (const side of [-1, 1]) {
          eyes.add(e.pos.x + side * l.eyeX, ey, ez, 0, l.eye);
          pupils.add(e.pos.x + side * l.eyeX, ey - l.eye * 0.15, ez + 0.03, 0, l.eye * 0.5);
        }
      }
      for (const k of KINDS) bodies.get(k)!.end();
      for (const p of [eyes, pupils, horns, redEyes, plates]) p.end();

      for (const p of [bolts, candies, hotdogs, boomerangs, popcorns, puddles]) p.begin();
      for (const p of s.projectiles) {
        if (p.behavior === 'lob') {
          const t = Math.min(1, (s.tick - p.launchedAt!) / (p.until - p.launchedAt!));
          const y = 0.6 + 4 * 2.5 * t * (1 - t);
          if (p.kind === 'popcorn') popcorns.add(p.pos.x, y, p.pos.z, time * 6, 1, undefined, time * 5);
          else hotdogs.add(p.pos.x, y, p.pos.z, time * 4, 1, undefined, time * 8);
          continue;
        }
        const yaw = Math.atan2(p.vel.x, p.vel.z);
        if (p.behavior === 'boomerang') {
          boomerangs.add(p.pos.x, 0.7, p.pos.z, time * 18);
          boomerangs.add(p.pos.x, 0.7, p.pos.z, time * 18 + Math.PI / 2);
        } else if (p.kind === 'candyCannon') {
          candies.add(p.pos.x, 0.6, p.pos.z, time * 10, 1, CANDY_COLORS[p.id % CANDY_COLORS.length]);
        } else {
          bolts.add(p.pos.x, 0.6, p.pos.z, yaw);
        }
      }
      for (const a of s.areas) {
        const fade = Math.min(1, (a.until - s.tick) / 30);
        puddles.add(a.pos.x, 0.03, a.pos.z, 0, a.radius * (0.85 + 0.15 * fade));
      }
      for (const p of [bolts, candies, hotdogs, boomerangs, popcorns, puddles]) p.end();

      coins.begin();
      coinInner.begin();
      coinMat.emissiveIntensity = 0.35 * theme.glow;
      for (const c of s.coins) {
        const y = 0.35 + Math.sin(time * 4 + c.id) * 0.08;
        const rot = time * 3 + c.id;
        coins.add(c.pos.x, y, c.pos.z, rot);
        coinInner.add(c.pos.x, y, c.pos.z, rot);
      }
      coins.end();
      coinInner.end();

      crates.begin();
      crateMat.emissiveIntensity = 0.35 * theme.glow;
      for (const c of s.crates) crates.add(c.pos.x, 0.5 + Math.sin(time * 3 + c.id) * 0.1, c.pos.z, time * 1.2);
      crates.end();
    },
  };
}

/** 16x16 pixel crate face with a "?" (original art). */
function makeCrateTexture(): THREE.CanvasTexture {
  const rows = [
    'oooooooooooooooo',
    'obbbbbbbbbbbbbbo',
    'obyyyyyyyyyyyybo',
    'obyyyywwwwyyyybo',
    'obyyywwyywwyyybo',
    'obyyyyyyywwyyybo',
    'obyyyyyywwyyyybo',
    'obyyyyywwyyyyybo',
    'obyyyyywwyyyyybo',
    'obyyyyyyyyyyyybo',
    'obyyyyywwyyyyybo',
    'obyyyyywwyyyyybo',
    'obyyyyyyyyyyyybo',
    'obyyyyyyyyyyyybo',
    'obbbbbbbbbbbbbbo',
    'oooooooooooooooo',
  ];
  const pal: Record<string, string> = { o: '#5a2d0c', b: '#c2671f', y: '#ff9f2e', w: '#fff6d0' };
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    ctx.fillStyle = pal[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
