import { DOMINIK, DOMINIK_DEATH, dominikGlow, hammerAlong, HAMMER_FLIGHT, hammerGeometry } from './dominik-limbs';
import * as THREE from 'three';
import { TICK_RATE, type BossKind, type PowerupKind, type SimEvent, type SimState, type Vec2 } from '../sim/types';
import { BOSS, laserReach } from '../sim/systems/boss';
import { ENEMY_LOOK } from './entities';
import { playerColor } from './palette';
import { glowMat, InstancedPool } from './pool';
import type { Theme } from './theme';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  spin: number;
  /** a spark: small, bright and unlit, it does not bounce but burns out in the air */
  spark?: boolean;
}

/** a flash of light or a shockwave on the floor: it grows from nothing to `size` and fades as it does */
interface Pop {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  size: number;
  color: number;
  ring: boolean;
}

/** what a monster leaves on the floor where it burst: a stain in its own colour that dries away */
interface Splat {
  x: number;
  z: number;
  age: number;
  life: number;
  size: number;
  color: number;
  turn: number;
}

interface Beam {
  from: THREE.Vector3;
  to: THREE.Vector3;
  life: number;
  color: number;
}

const MAX_PARTICLES = 3000;
/** what he is made of, for the chips that fly off him when he is hit: shirt, skin, shorts */
const DOMINIK_CHIPS = [0x1b1c21, 0x1b1c21, 0xd3936e, 0x20295c];

/** what a boss is made of: the colours of the pieces it bursts into (its body in a few shades, and its horns, teeth or spikes) */
const BOSS_WRECK: Record<BossKind, number[]> = {
  megaBlock: [0x5b4a8a, 0x5b4a8a, 0x7b5fd1, 0x3d3163, 0x3d3163, 0xff3b5c, 0xffe14a],
  worm: [0x7b4fd1, 0x7b4fd1, 0x8f63ff, 0x4f3391, 0xf2ead8, 0xf2ead8, 0x7dfcff],
  rex: [0x6a8f3a, 0x6a8f3a, 0x9fd35a, 0x47632a, 0x47632a, 0xf2ead8, 0xd9c58a],
  kraken: [0xd04a8a, 0xd04a8a, 0xff6ab0, 0x8e2f5e, 0x8e2f5e, 0xffd9e8],
  dominik: [0x1b1c21, 0x1b1c21, 0x1b1c21, 0xd3936e, 0xd3936e, 0x20295c, 0x20295c, 0x2bc8ff, 0xd62bff, 0x8a919e, 0x4a3222],
  spider: [0x3a2a22, 0x3a2a22, 0x241a15, 0x5a4034, 0xd9701e, 0xd9701e, 0xff3b3b],
  rhino: [0x8d9299, 0x8d9299, 0xa7aebb, 0x5d6168, 0x5d6168, 0xf2ead8, 0xfff8ea],
};

/** the colours of the unicorn's trail */
const RAINBOW = [0xff5a5f, 0xffa23b, 0xffe14a, 0x3bd16f, 0x3d8bfd, 0xb15cff];

export const POWERUP_COLOR: Record<PowerupKind, number> = {
  magnet: 0xff4d6d,
  rapid: 0xffe14a,
  bomb: 0xff8c42,
  frost: 0x7fdcff,
  heart: 0xff6fae,
};

export interface Fx {
  update(s: SimState, events: SimEvent[], theme: Theme, frameDt: number, time: number): void;
  /** camera offset for screen shake */
  shake(): THREE.Vector3;
  /** fewer particles on low graphics settings */
  setParticleScale(k: number): void;
}

export function createFx(scene: THREE.Scene): Fx {
  const particles: Particle[] = [];
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, roughness: 0.5 });
  const cubes = new InstancedPool(scene, new THREE.BoxGeometry(1, 1, 1), cubeMat, 1024, false);

  // how a monster bursts: a flash, a shockwave over the floor, sparks, and a stain where it stood
  const pops: Pop[] = [];
  const splats: Splat[] = [];
  const light = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flashes = new InstancedPool(scene, new THREE.IcosahedronGeometry(0.5, 1), light(0xffffff), 64, false);
  const waves = new InstancedPool(scene, new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), light(0xffffff), 64, false);
  const sparks = new InstancedPool(scene, new THREE.BoxGeometry(1, 1, 1), light(0xffffff), 512, false);
  // (a stain is a ragged blot: a disc with an uneven edge)
  const blot = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
  {
    const at = blot.getAttribute('position');
    for (let i = 1; i < at.count; i++) {
      const k = 0.72 + 0.4 * Math.abs(Math.sin(i * 2.7));
      at.setXYZ(i, at.getX(i) * k, at.getY(i), at.getZ(i) * k);
    }
  }
  const stains = new InstancedPool(scene, blot, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 64, false);
  const MAX_SPLATS = 48;
  const tone = (color: number, k: number) => {
    // k < 1 darkens, k > 1 mixes toward white
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    const f = (c: number) => Math.round(k <= 1 ? c * k : c + (255 - c) * (k - 1));
    return (f(r) << 16) | (f(g) << 8) | f(b);
  };
  /**
   * A monster bursts. Pieces of its own body (in its own colours, big and small) fly off and tumble, a flash
   * and a shockwave mark the spot, sparks spray out, and a stain stays on the floor for a while.
   */
  // what the floor of this world gives off when something tears it up: chips in the colours of its tiles and
  // of the earth under them, and dust in a paler tone of the same (set from the theme with every frame)
  let floorChips: number[] = [], floorDust: number[] = [], floorDark = 0;
  let floorOf = -1;
  const readFloor = (theme: Theme) => {
    if (floorOf === theme.roadA * 0x1000000 + theme.roadB) return;
    floorOf = theme.roadA * 0x1000000 + theme.roadB;
    floorChips = [theme.roadA, theme.roadB, tone(theme.roadA, 0.72), tone(theme.roadB, 0.5), tone(theme.roadA, 0.72)];
    const pale = (c: number, k: number) => {
      const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, grey = (r + g + b) / 3;
      const m = (v: number) => Math.min(255, Math.round((v * 0.6 + grey * 0.4) * k));
      return (m(r) << 16) | (m(g) << 8) | m(b);
    };
    floorDust = [pale(theme.roadA, 1.12), pale(theme.roadB, 0.95), pale(theme.roadA, 0.8)];
    floorDark = tone(theme.roadB, 0.32);
  };
  /**
   * The floor is torn up at a spot: chips of it fly and tumble, dust in its colour billows low and rises, a ring
   * of dust runs out along the ground.
   */
  function tearFloor(pos: Vec2, power: number) {
    chunks(pos, 0.1, Math.round(9 * power), floorChips, 3.2 + power * 1.6, 0.06, 0.1 + power * 0.045);
    burst(pos, 0.2, Math.round(12 * power), floorDust, 1.6 + power * 1.1, 0.2 + power * 0.03, 0.45);
    burst(pos, 0.6, Math.round(5 * power), floorDust, 0.7, 0.26 + power * 0.03, 1.5);
    pops.push({ x: pos.x, y: 0.08, z: pos.z, age: 0, life: 0.5, size: 1.6 + power * 1.5, color: floorDust[0], ring: true });
  }

  function burstMonster(pos: Vec2, color: number, size: number, height: number, elite: boolean) {
    const dark = tone(color, 0.55), bright = tone(color, 1.5), glow = tone(color, 1.75);
    const amount = (elite ? 2.2 : 1) * Math.max(0.6, size);
    pops.push({ x: pos.x, y: height * 0.55, z: pos.z, age: 0, life: 0.18, size: (1.5 + size * 1.6) * (elite ? 1.5 : 1), color: glow, ring: false });
    pops.push({ x: pos.x, y: 0.06, z: pos.z, age: 0, life: 0.36, size: (2.4 + size * 2.4) * (elite ? 1.5 : 1), color: bright, ring: true });
    // pieces of the body: a few big ones that tumble, many small ones
    chunks(pos, height * 0.3, Math.round(5 * amount), [color, color, dark, bright], 4.2, 0.16 * Math.max(0.7, size), 0.3 * Math.max(0.7, size));
    burst(pos, height * 0.5, Math.round(12 * amount), [color, dark, bright], elite ? 5.5 : 4, 0.11);
    // sparks: fast and bright, gone in a moment
    const n = Math.ceil((elite ? 26 : 10) * Math.max(0.6, size) * particleScale);
    for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
      const a = rand() * Math.PI * 2, up = 0.3 + rand() * 1.1, sp = 5 + rand() * 6;
      const life = 0.22 + rand() * 0.22;
      particles.push({ x: pos.x, y: height * 0.5, z: pos.z, vx: Math.cos(a) * sp, vy: up * 5, vz: Math.sin(a) * sp, life, maxLife: life, size: 0.07 + rand() * 0.05, color: elite && i % 2 ? 0xff5ae0 : i % 3 ? glow : 0xffffff, spin: 0, spark: true });
    }
    if (splats.length >= MAX_SPLATS) splats.shift();
    splats.push({ x: pos.x, z: pos.z, age: 0, life: 5 + rand() * 2, size: (0.9 + size * 1.1) * (elite ? 1.4 : 1), color: dark, turn: rand() * Math.PI * 2 });
    if (elite) addShake(0.22);
  }

  const beams: Beam[] = [];
  /** Disco Balls in the air: each hangs over its owner for a moment, spinning and throwing light */
  const discos: { ownerId: number; x: number; z: number; age: number; enemies: number[]; rivals: number[] }[] = [];
  const DISCO_COLORS = [0xff4dd2, 0x4dd2ff, 0xffe14a];
  const DISCO_SECONDS = 1.1;
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  const beamPools = new Map<number, InstancedPool>();
  const beamPoolFor = (color: number) => {
    let p = beamPools.get(color);
    if (!p) {
      p = new InstancedPool(scene, beamGeo, glowMat(color, 3), 64, false);
      beamPools.set(color, p);
    }
    return p;
  };

  // Angry Dominik's hammer in the air, and the beams from his eyes: a white core in a wide red glow
  const hammerShape = hammerGeometry();
  const hammerMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const flyingHammers = new InstancedPool(scene, hammerShape.lit, hammerMat, 4);
  const flyingRunes = new InstancedPool(scene, hammerShape.glow, dominikGlow(), 4, false);
  const laserCore = new InstancedPool(scene, new THREE.CylinderGeometry(0.035, 0.05, 1, 8).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff4e0, toneMapped: false }), 8, false);
  const laserGlowMat = new THREE.MeshBasicMaterial({ color: 0xff2414, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const laserGlow = new InstancedPool(scene, new THREE.CylinderGeometry(0.1, 0.17, 1, 10).translate(0, 0.5, 0).rotateX(Math.PI / 2), laserGlowMat, 8, false);
  const laserHaze = new InstancedPool(scene, new THREE.CylinderGeometry(0.2, 0.34, 1, 10).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 8, false);
  // where a beam ends: a white-hot spot on the floor in a red glow
  const heatMat = new THREE.MeshBasicMaterial({ color: 0xff3a14, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const heat = new InstancedPool(scene, new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), heatMat, 8, false);
  const heatCore = new InstancedPool(scene, new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }), 8, false);
  const tmpEye = new THREE.Vector3();
  /** his hammer on its way down to the floor: where he stands, and how long until it lands and its rings follow */
  const slams: { at: Vec2; in: number; rings: number }[] = [];
  /** when each Angry Dominik last lost chips to a hit (they fly sparingly) */
  const chipped = new Map<number, number>();
  /** Angry Dominik has fallen and stands in the lightning: when each one bursts */
  const dying: { at: Vec2; in: number }[] = [];

  const shakeOffset = new THREE.Vector3();
  let shakeAmp = 0;
  let shakeTime = 0;
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

  let particleScale = 1;

  function burst(pos: Vec2, y: number, count: number, colors: number[], speed: number, size: number, up = 1) {
    count = Math.ceil(count * particleScale);
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const a = rand() * Math.PI * 2;
      const sp = speed * (0.4 + rand() * 0.8);
      const life = 0.45 + rand() * 0.35;
      particles.push({
        x: pos.x,
        y,
        z: pos.z,
        vx: Math.cos(a) * sp,
        vy: (2 + rand() * speed) * up,
        vz: Math.sin(a) * sp,
        life,
        maxLife: life,
        size: size * (0.6 + rand() * 0.6),
        color: colors[Math.floor(rand() * colors.length)],
        spin: rand() * 10,
      });
    }
  }

  /** pieces of something that blew apart: thrown high and wide, they tumble, bounce and lie about for a moment */
  function chunks(pos: Vec2, y: number, count: number, colors: number[], speed: number, minSize: number, maxSize: number) {
    count = Math.ceil(count * Math.max(0.5, particleScale));
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const a = rand() * Math.PI * 2;
      const sp = speed * (0.25 + rand() * 0.9);
      const life = 1.3 + rand() * 1.1;
      particles.push({
        x: pos.x + Math.cos(a) * rand() * 1.2,
        y: y + rand() * 1.4,
        z: pos.z + Math.sin(a) * rand() * 1.2,
        vx: Math.cos(a) * sp,
        vy: 5 + rand() * 7,
        vz: Math.sin(a) * sp,
        life,
        maxLife: life,
        size: minSize + rand() * (maxSize - minSize),
        color: colors[Math.floor(rand() * colors.length)],
        spin: 4 + rand() * 10,
      });
    }
  }

  /** a ring of cubes racing outward along the ground */
  function ring(pos: Vec2, radius: number, colors: number[]) {
    const n = Math.round(10 + radius * 8);
    for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
      const a = (i / n) * Math.PI * 2;
      const life = 0.3;
      particles.push({
        x: pos.x,
        y: 0.15,
        z: pos.z,
        vx: (Math.cos(a) * radius) / life,
        vy: 1,
        vz: (Math.sin(a) * radius) / life,
        life,
        maxLife: life,
        size: 0.16,
        color: colors[i % colors.length],
        spin: 3,
      });
    }
  }

  /** a cone of particles along `aim` (slush, wind) */
  function spray(pos: Vec2, aim: Vec2, range: number, colors: number[], count: number) {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const a = Math.atan2(aim.z, aim.x) + (rand() - 0.5) * 0.7;
      const speed = range * (2.2 + rand());
      const life = 0.35 + rand() * 0.15;
      particles.push({
        x: pos.x + aim.x * 0.6,
        y: 0.8,
        z: pos.z + aim.z * 0.6,
        vx: Math.cos(a) * speed,
        vy: 1 + rand() * 2,
        vz: Math.sin(a) * speed,
        life,
        maxLife: life,
        size: 0.1 + rand() * 0.08,
        color: colors[Math.floor(rand() * colors.length)],
        spin: rand() * 10,
      });
    }
  }

  function addShake(amp: number) {
    shakeAmp = Math.max(shakeAmp, amp);
    shakeTime = 0.25;
    shakeOffset.set(amp, amp * 0.5, 0);
  }

  function beam(from: Vec2, fy: number, to: Vec2, ty: number, color: number, life = 0.08) {
    beams.push({ from: new THREE.Vector3(from.x, fy, from.z), to: new THREE.Vector3(to.x, ty, to.z), life, color });
  }

  /** a bolt of lightning from the sky down to `at`: jagged, white with a blue edge, and sparks where it lands */
  function bolt(at: Vec2, big = false) {
    let from = { x: at.x + (rand() - 0.5) * 3, z: at.z + (rand() - 0.5) * 3 };
    let y = 16;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const to = i === steps ? at : { x: at.x + (from.x - at.x) * (1 - k) + (rand() - 0.5) * 1.6, z: at.z + (from.z - at.z) * (1 - k) + (rand() - 0.5) * 1.6 };
      const ty = 16 * (1 - k);
      beam(from, y, to, ty, 0xffffff, big ? 0.22 : 0.14);
      beam({ x: from.x + 0.09, z: from.z }, y, { x: to.x + 0.09, z: to.z }, ty, 0x9fd0ff, big ? 0.3 : 0.18);
      if (big) beam({ x: from.x - 0.09, z: from.z + 0.06 }, y, { x: to.x - 0.09, z: to.z + 0.06 }, ty, 0x9fd0ff, 0.3);
      from = to;
      y = ty;
    }
    burst(at, 0.4, big ? 26 : 12, [0xffffff, 0x9fd0ff, 0x7dfcff], 6, 0.1, 0.8);
    tearFloor(at, big ? 1.6 : 0.7);
    ring(at, big ? 4 : 2, [0xffffff, 0x9fd0ff]);
  }
  /** lightning still to come: a storm is a few bolts one after the other */
  const storm: { at: Vec2; in: number; big: boolean }[] = [];
  const thunderstorm = (at: Vec2, bolts: number, spread: number, seconds: number) => {
    for (let i = 0; i < bolts; i++) {
      const a = rand() * Math.PI * 2, r = i === 0 ? 0 : rand() * spread;
      storm.push({ at: { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r }, in: (i / bolts) * seconds, big: i === 0 });
    }
  };
  /** Angry Dominik's hammer in the air: out along its line and back, after the warning (see boss.ts) */
  const hammers: { from: Vec2; to: Vec2; age: number }[] = [];

  const playerPos = (s: SimState, id: number): Vec2 | undefined => s.players.find(p => p.id === id)?.pos;

  return {
    update(s, events, theme, dt, time) {
      readFloor(theme);
      // a galloping unicorn leaves a rainbow behind it
      for (const v of s.vehicles) {
        if (v.kind !== 'unicorn' || Math.hypot(v.vel.x, v.vel.z) < 3 || Math.floor(time * 30) % 2 !== 0) continue;
        burst({ x: v.pos.x - v.vel.x * 0.06, z: v.pos.z - v.vel.z * 0.06 }, 0.5, 2, RAINBOW, 0.6, 0.11, 0.2);
      }
      for (const e of events) {
        switch (e.type) {
          case 'enemyKilled': {
            // it bursts: pieces of itself, a flash, a shockwave, sparks, and a stain on the floor
            const l = ENEMY_LOOK[e.kind];
            burstMonster(e.pos, theme.pointLights > 0.5 ? l.night : l.day, Math.max(l.w, l.d), l.h, e.elite);
            break;
          }
          case 'enemyHit': {
            // every hit knocks a few pixels off
            const en = s.enemies.find(x => x.id === e.id);
            if (!en) break;
            // (Angry Dominik, big or small, loses only a few small chips of himself, and not with every hit)
            if (en.id === s.mini?.enemyId || [s.boss, ...(s.bosses ?? [])].some(b => b?.kind === 'dominik' && b.enemyId === en.id)) {
              if (time - (chipped.get(en.id) ?? -1e9) < 0.35) break;
              chipped.set(en.id, time);
              burst(e.pos, (en.id === s.mini?.enemyId ? DOMINIK.small : DOMINIK.scale) * 2.2, 3, DOMINIK_CHIPS, 3, 0.07, 0.7);
              break;
            }
            const l = ENEMY_LOOK[en.kind];
            burst(e.pos, l.h * 0.6, Math.max(2, Math.min(8, Math.round(2 + e.amount / 6))), [l.day, l.night], 3, 0.1, 0.7);
            break;
          }
          case 'playerHit':
            addShake(0.06);
            break;
          case 'playerDown':
            addShake(0.3);
            break;
          case 'explosion': {
            // a ball of fire that flashes and is gone, a shockwave as wide as the blast, sparks, a little
            // rubble and smoke, and a scorch mark on the floor
            const r = e.radius;
            pops.push({ x: e.pos.x, y: 0.5 + r * 0.15, z: e.pos.z, age: 0, life: 0.2, size: r * 1.7, color: 0xffd27a, ring: false });
            pops.push({ x: e.pos.x, y: 0.4 + r * 0.1, z: e.pos.z, age: -0.03, life: 0.26, size: r * 1.1, color: 0xff7a2e, ring: false });
            pops.push({ x: e.pos.x, y: 0.06, z: e.pos.z, age: 0, life: 0.34, size: r * 2.3, color: 0xffb34a, ring: true });
            const n = Math.ceil((8 + r * 7) * particleScale);
            for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
              const a = rand() * Math.PI * 2, sp = (3 + rand() * 5) * (0.6 + r * 0.3);
              const life = 0.25 + rand() * 0.3;
              particles.push({ x: e.pos.x, y: 0.4, z: e.pos.z, vx: Math.cos(a) * sp, vy: 2 + rand() * 6, vz: Math.sin(a) * sp, life, maxLife: life, size: 0.08 + rand() * 0.06, color: i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffe14a : 0xff8c42, spin: 0, spark: true });
            }
            tearFloor(e.pos, Math.min(3, 0.5 + r * 0.5));
            burst(e.pos, 0.9, Math.round(2 + r * 1.5), [0x3a3438, 0x55504f], 0.7, 0.24, 1.8);
            if (splats.length >= MAX_SPLATS) splats.shift();
            splats.push({ x: e.pos.x, z: e.pos.z, age: 0, life: 4, size: r * 1.5, color: 0x241c1c, turn: rand() * Math.PI * 2 });
            addShake(Math.min(0.4, 0.08 * r));
            break;
          }
          case 'bossDead': {
            // it blows apart: big pieces of its own body fly off and tumble across the floor, small bits rain
            // down after them, a flash and a shockwave where it stood
            // (Angry Dominik goes in a thunderstorm: bolt after bolt where he stood)
            // (Angry Dominik goes in a thunderstorm: bolt after bolt strikes him where he stands, closer and
            // faster, and only then he bursts; see `dying`)
            if (e.kind === 'dominik') {
              thunderstorm(e.pos, 14, 2.6, DOMINIK_DEATH);
              dying.push({ at: { ...e.pos }, in: DOMINIK_DEATH });
              addShake(0.5);
              break;
            }
            const body = BOSS_WRECK[e.kind ?? 'megaBlock'];
            // (with a flash and a shockwave of its own, far bigger than a monster's, and a stain)
            pops.push({ x: e.pos.x, y: 1.6, z: e.pos.z, age: 0, life: 0.3, size: 9, color: 0xffffff, ring: false });
            pops.push({ x: e.pos.x, y: 0.07, z: e.pos.z, age: 0, life: 0.55, size: 16, color: tone(body[0], 1.6), ring: true });
            pops.push({ x: e.pos.x, y: 0.07, z: e.pos.z, age: -0.12, life: 0.6, size: 11, color: 0xffffff, ring: true });
            splats.push({ x: e.pos.x, z: e.pos.z, age: 0, life: 9, size: 5.5, color: tone(body[0], 0.5), turn: rand() * Math.PI * 2 });
            chunks(e.pos, 1.6, 46, body, 10, 0.34, 0.75);
            chunks(e.pos, 1.2, 150, body, 7, 0.12, 0.24);
            burst(e.pos, 1.5, 30, [0xffffff, 0xffe9a8], 6, 0.2);
            ring(e.pos, 6, [0xffffff, 0xffe14a]);
            addShake(0.8);
            break;
          }
          case 'bossSpawn':
            if (e.kind === 'dominik' && s.boss) thunderstorm(s.boss.lastPos, 4, 3, 0.6);
            break;
          case 'dominikJoined':
            thunderstorm(e.pos, 2, 1.5, 0.3);
            break;
          case 'dominikLeft':
            // back into the wall: a puff and a last spark
            burst(e.pos, 1, 24, [0x17171d, 0xd9966e, 0x2bf0ff, 0xffffff], 4, 0.12, 0.5);
            bolt(e.pos);
            break;
          case 'hammerThrow':
            hammers.push({ from: e.from, to: e.to, age: 0 });
            break;
          case 'lightning':
            bolt(e.pos);
            addShake(0.18);
            break;
          case 'hammerSlam':
            slams.push({ at: { ...e.pos }, in: (e.at - s.tick) / TICK_RATE, rings: 0 });
            break;
          case 'bossBurst':
            // she bursts: pieces of her shell, a splash of green, and the brood runs out of it
            chunks(e.pos, 1.2, 34, BOSS_WRECK[e.kind], 8, 0.22, 0.5);
            burst(e.pos, 1, 40, [0x8fd14a, 0xc8f07a, 0x4a7a22], 6, 0.14, 0.7);
            ring(e.pos, 4, [0xc8f07a, 0xffffff]);
            addShake(0.7);
            break;
          case 'eggHatch':
            // the shell flies apart
            chunks(e.pos, 0.3, 16, [0xf3ecd6, 0xfbf6e6, 0xf3ecd6, 0x6a8f3a], 4.5, 0.07, 0.2);
            burst(e.pos, 0.6, 8, [0xffffff, 0x9fd35a], 3, 0.1);
            break;
          case 'wormSplit':
            burst(e.pos, 0.6, 40, [0x7b4fd1, 0xff2bd6], 5, 0.18);
            addShake(0.2);
            break;
          case 'stomp':
            ring(e.pos, e.radius, [0xffffff, 0x2bf0ff]);
            break;
          case 'nestDestroyed':
            burst(e.pos, 1, 220, [0x2a1040, 0xff2bd6, 0x7b4fd1, 0xffffff], 10, 0.24);
            addShake(0.5);
            break;
          case 'kartRam':
            addShake(0.05);
            break;
          case 'kartLand':
            ring(e.pos, 2.5, [0xffe14a, 0xffffff]);
            addShake(0.2);
            break;
          case 'towerDestroyed':
            burst(e.pos, 1.2, 70, [0x9a9aa8, 0xff8c42, 0x333344], 6, 0.2);
            addShake(0.15);
            break;
          case 'kartDestroyed':
            burst(e.pos, 0.5, 60, [0xe23b3b, 0x333344, 0xffe14a], 6, 0.2);
            addShake(0.3);
            break;
          case 'enemyShot':
            burst(e.pos, 0.7, 6, [0xff3b3b, 0xffffff], 2, 0.1);
            break;
          case 'comboUp': {
            const pos = playerPos(s, e.playerId);
            if (pos) burst(pos, 1.2, 24, [0xffc928, 0xfff3a0, 0xff2bd6], 4, 0.12);
            break;
          }
          case 'cardPicked': {
            const pos = playerPos(s, e.playerId);
            if (pos) burst(pos, 1, 30, [0xffc928, 0x2bf0ff, 0xffffff], 4, 0.12);
            break;
          }
          case 'powerupPicked': {
            const pos = playerPos(s, e.playerId);
            if (pos) burst(pos, 1, 30, [POWERUP_COLOR[e.kind], 0xffffff], 5, 0.14);
            break;
          }
          case 'towerFired':
            if (e.kind === 'laser') beam(e.pos, 2.1, e.target, 0.4, 0xff8c42, 0.09);
            if (e.kind === 'frost') burst(e.pos, 1.8, 12, [0xc8f4ff, 0x7fdcff], 5, 0.1);
            if (e.kind === 'bumper') ring(e.pos, 2.4, [0xff2bd6, 0xffe14a]);
            break;
          case 'rareFired': {
            const p = s.players.find(x => x.id === e.playerId);
            if (!p) break;
            if (e.kind === 'slushMachine') spray(p.pos, p.aim, 5, [0x9fe8ff, 0xffffff, 0x4fc8ff], 18);
            if (e.kind === 'leafBlower') spray(p.pos, p.aim, 6, [0xb8e986, 0x7cc56a, 0xffffff], 12);
            break;
          }
          case 'bubblePop':
            burst(e.pos, 0.9, 50, [0xff7fc8, 0xffb3df, 0xffffff], 6, 0.14);
            break;
          case 'jetpackPicked':
          case 'jetpackEmpty': {
            const pos = playerPos(s, e.playerId);
            if (pos) burst(pos, 1, 24, [0xd0d4e0, 0xff9f2e, 0xffffff], 4, 0.12);
            break;
          }
          case 'rareExpired': {
            const pos = playerPos(s, e.playerId);
            if (pos) burst(pos, 1, 30, [0xffc928, 0xd19a00, 0xffffff], 4, 0.12);
            break;
          }
          case 'enemyHealed':
            // green sparkles rise from every monster that got mended
            for (const t of e.targets) burst(t, 0.8, 5, [0x5fff9a, 0xffffff], 1.5, 0.07, 1.2);
            break;
          case 'enemyBlink':
            // a puff of purple where it vanished and where it appears
            burst(e.from, 0.6, 10, [0x7a5cff, 0xd8ccff], 3, 0.08, 0.8);
            burst(e.to, 0.6, 14, [0x7a5cff, 0xffffff], 3.5, 0.09, 0.8);
            break;
          case 'teslaChain':
            // a jagged bolt from the coil through every monster it jumped to
            for (let i = 1; i < e.points.length; i++) {
              const a = e.points[i - 1], b = e.points[i];
              const mid = { x: (a.x + b.x) / 2 + (Math.random() - 0.5) * 0.6, z: (a.z + b.z) / 2 + (Math.random() - 0.5) * 0.6 };
              beam(a, i === 1 ? 1.95 : 0.8, mid, 1.1, 0x9fd0ff, 0.09);
              beam(mid, 1.1, b, 0.8, 0x9fd0ff, 0.09);
              burst(b, 0.8, 4, [0x9fd0ff, 0xffffff], 2, 0.06, 0.4);
            }
            break;
          case 'magnetPull':
            // a magnetic beam and sparks drawn in where the monsters gather
            beam(e.from, 0.8, e.to, 0.6, 0xff5e8a, 0.1);
            burst(e.to, 0.6, 10, [0xff5e8a, 0x7fb2ff], 2, 0.08, 0.3);
            break;
          case 'railFired':
            // a bright beam along the line, and sparks where it stops
            beam(e.from, 0.9, e.to, 0.9, 0x9ff8ff, 0.16);
            burst(e.to, 0.9, 8, [0x9ff8ff, 0xffffff], 3, 0.08, 0.6);
            break;
          case 'shot':
            if (e.weapon === 'flySwatter') {
              // KLATSCH: a sweep of green bits across the front, and a jolt
              const who = s.players.find(p => p.pos.x === e.pos.x && p.pos.z === e.pos.z);
              const at = who ? { x: e.pos.x + who.aim.x * 1.25, z: e.pos.z + who.aim.z * 1.25 } : e.pos;
              const side = who ? { x: -who.aim.z, z: who.aim.x } : { x: 1, z: 0 };
              for (const k of [-0.8, 0, 0.8]) burst({ x: at.x + side.x * k, z: at.z + side.z * k }, 0.85, 4, [0x3bd16f, 0xb8ffcf, 0xffffff], 3, 0.09, 0.3);
              addShake(0.12);
            }
            if (e.weapon === 'discoBall') {
              const colors = [0xff4dd2, 0x4dd2ff, 0xffe14a];
              // a glittering flash just in front of the shooter: seen from above and in first person alike
              const who = s.players.find(p => p.pos.x === e.pos.x && p.pos.z === e.pos.z);
              const front = who ? { x: e.pos.x + who.aim.x * 1.4, z: e.pos.z + who.aim.z * 1.4 } : e.pos;
              burst(front, 1.3, 14, colors, 3.5, 0.08, 0.35);
              // the ball itself: tossed up in front of the shooter, it spins and throws its light about (below)
              const near = [...s.enemies.map(x => ({ id: x.id, pos: x.pos, rival: false })), ...s.players.filter(p => p !== who && s.versus).map(p => ({ id: p.id, pos: p.pos, rival: true }))]
                .map(o => ({ ...o, d: Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) }))
                .filter(o => o.d <= 7.5)
                .sort((a, b) => a.d - b.d)
                .slice(0, 8);
              discos.push({ ownerId: who?.id ?? -1, x: front.x, z: front.z, age: 0, enemies: near.filter(o => !o.rival).map(o => o.id), rivals: near.filter(o => o.rival).map(o => o.id) });
            }
            break;
        }
      }

      for (let i = storm.length - 1; i >= 0; i--) {
        storm[i].in -= dt;
        if (storm[i].in > 0) continue;
        bolt(storm[i].at, storm[i].big);
        addShake(storm[i].big ? 0.5 : 0.25);
        storm.splice(i, 1);
      }
      for (let i = slams.length - 1; i >= 0; i--) {
        const m = slams[i];
        m.in -= dt;
        if (m.in > 0) continue;
        // where the hammer's head is: on the floor in front of him
        const dom = s.enemies.find(x => Math.hypot(x.pos.x - m.at.x, x.pos.z - m.at.z) < 1.5 && [s.boss, ...(s.bosses ?? [])].some(b => b?.kind === 'dominik' && b.enemyId === x.id));
        const fl = dom ? Math.hypot(dom.dir.x, dom.dir.z) || 1 : 1;
        const hit = dom ? { x: dom.pos.x + (dom.dir.x / fl) * 1.9, z: dom.pos.z + (dom.dir.z / fl) * 1.9 } : m.at;
        if (m.rings === 0) {
          // the blow: the earth shakes, dust and chips of the floor fly, and lightning runs out from the hammer's
          // head along the floor like cracks
          addShake(1.7);
          tearFloor(hit, 4);
          // slabs of the floor are thrown up in a ring round the hammer's head and come down again
          for (let c = 0; c < 9; c++) {
            const a = (c / 9) * Math.PI * 2 + rand() * 0.4, d = 0.9 + rand() * 0.5;
            chunks({ x: hit.x + Math.cos(a) * d, z: hit.z + Math.sin(a) * d }, 0.1, 2, floorChips, 2.2, 0.2, 0.34);
          }
          if (splats.length >= MAX_SPLATS) splats.shift();
          splats.push({ x: hit.x, z: hit.z, age: 0, life: 7, size: 3.4, color: floorDark, turn: rand() * Math.PI * 2 });
          burst(hit, 0.3, 34, [0xffffff, 0x7dfcff, 0x9fd0ff], 9, 0.09, 1.1);
          ring(hit, 2.4, [0xffffff, 0x7dfcff]);
          for (let c = 0; c < 8; c++) {
            const a = (c / 8) * Math.PI * 2 + rand() * 0.6;
            let from = hit, heading = a;
            for (let k = 0; k < 4; k++) {
              heading += (rand() - 0.5) * 1.1;
              const len = 0.7 + rand() * 0.8;
              const to = { x: from.x + Math.cos(heading) * len, z: from.z + Math.sin(heading) * len };
              beam(from, 0.07, to, 0.07, 0xffffff, 0.28 + 0.06 * k);
              beam({ x: from.x + 0.05, z: from.z + 0.05 }, 0.09, { x: to.x + 0.05, z: to.z + 0.05 }, 0.09, 0x7dfcff, 0.4 + 0.06 * k);
              from = to;
            }
          }
        } else {
          // the second and the third ring: the ground still trembles
          addShake(0.55);
          tearFloor(hit, 1.4);
          ring(m.at, BOSS.hammerRings[m.rings] * 0.5, [floorDust[0], 0xffffff]);
        }
        m.rings++;
        m.in += 22 / TICK_RATE;
        if (m.rings >= BOSS.hammerRings.length) slams.splice(i, 1);
      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const d = dying[i];
        d.in -= dt;
        // sparks crawl over him while the lightning holds him
        if (rand() < 0.7) burst({ x: d.at.x + (rand() - 0.5) * 1.2, z: d.at.z + (rand() - 0.5) * 1.2 }, 0.5 + rand() * 3.6, 2, [0xffffff, 0x9fd0ff, 0x7dfcff], 2.5, 0.07, 0.4);
        if (d.in > 0) continue;
        dying.splice(i, 1);
        // the last bolt, the biggest: he bursts into pieces of himself, shirt, skin, shorts and steel, in a
        // white flash and three rings
        bolt(d.at, true);
        bolt(d.at, true);
        const body = BOSS_WRECK.dominik;
        chunks(d.at, 1.2, 70, body, 12, 0.3, 0.7);
        chunks(d.at, 2.4, 190, body, 9, 0.1, 0.24);
        burst(d.at, 2.2, 60, [0xffffff, 0xcfe8ff, 0x7dfcff], 11, 0.22);
        burst(d.at, 1.2, 40, [0x2bc8ff, 0xd62bff], 7, 0.14, 1.6);
        ring(d.at, 4, [0xffffff, 0x7dfcff]);
        ring(d.at, 7, [0x7dfcff, 0x2bc8ff]);
        ring(d.at, 10, [0xd62bff, 0xffffff]);
        thunderstorm(d.at, 6, 7, 0.5);
        addShake(1.4);
      }
      // Angry Dominik's laser eyes: a thin flickering line while he aims, then two thick beams that burn the
      // floor where they end
      for (const p of [laserCore, laserGlow, laserHaze, heat, heatCore, flyingHammers, flyingRunes]) p.begin();
      for (const b of [s.boss, ...(s.bosses ?? [])]) {
        if (!b?.laser || b.enemyId === null) continue;
        const dom = s.enemies.find(e => e.id === b.enemyId);
        if (!dom) continue;
        const l = b.laser;
        const a = l.from + l.sweep * Math.max(0, Math.min(1, (s.tick - l.fireAt) / Math.max(1, l.endAt - l.fireAt)));
        const dir = { x: Math.cos(a), z: Math.sin(a) }, side = { x: -dir.z, z: dir.x };
        // (it ends on the floor of the map: over walls if need be, but never in one or beyond the edge)
        const reach = laserReach(s, b);
        const end = { x: dom.pos.x + dir.x * reach, z: dom.pos.z + dir.z * reach };
        // out of his eyes, wherever he looks: they sit on his face, which is turned the way his body is
        const fl = Math.hypot(dom.dir.x, dom.dir.z) || 1;
        const face = { x: dom.dir.x / fl, z: dom.dir.z / fl };
        const eyeY = (DOMINIK.lift + DOMINIK.eyeY) * DOMINIK.scale;
        const eye = (k: number) => ({ x: dom.pos.x + (face.z * DOMINIK.eyeX * k + face.x * DOMINIK.front) * DOMINIK.scale, z: dom.pos.z + (-face.x * DOMINIK.eyeX * k + face.z * DOMINIK.front) * DOMINIK.scale });
        if (s.tick < l.fireAt) {
          if (Math.floor(time * 24) % 2 === 0) for (const k of [-1, 1]) beam(eye(k), eyeY, end, 0.15, 0xff5a5a, 0.04);
        } else {
          // two beams that meet on the floor: a white core, a red glow round it that flickers, a haze of heat
          laserGlowMat.opacity = 0.38 + 0.14 * Math.sin(time * 47);
          for (const k of [-1, 1]) {
            const from = eye(k);
            const to = { x: end.x + side.x * k * 0.1, z: end.z + side.z * k * 0.1 };
            const flat = Math.hypot(to.x - from.x, to.z - from.z), len = Math.hypot(flat, eyeY - 0.1);
            const yaw = Math.atan2(to.x - from.x, to.z - from.z), pitch = Math.asin((eyeY - 0.1) / len);
            tmpEye.set(from.x, eyeY, from.z);
            laserCore.addBeam(tmpEye, yaw, pitch, len);
            laserGlow.addBeam(tmpEye, yaw, pitch, len);
            laserHaze.addBeam(tmpEye, yaw, pitch, len);
          }
          // where they hit: the floor glows white-hot, sparks fly, smoke rises, and the trail behind the beam
          // stays hot for a moment
          const pulse = 1 + 0.25 * Math.sin(time * 38);
          heat.add(end.x, 0.07, end.z, 0, 1.25 * pulse);
          heat.add(end.x, 0.08, end.z, 0, 0.6 * pulse);
          heatCore.add(end.x, 0.12, end.z, 0, 0.26 * pulse);
          burst(end, 0.2, 3, [0xff2b2b, 0xffe14a, 0xffffff], 4.5, 0.08, 0.9);
          if (rand() < 0.5) burst(end, 0.3, 1, [0x3a3338, 0x55484a], 0.7, 0.2, 0.5);
          burst({ x: end.x - side.x * Math.sign(l.sweep) * rand() * 0.8, z: end.z - side.z * Math.sign(l.sweep) * rand() * 0.8 }, 0.08, 1, [0xff5a2b, 0xffb03a], 0.3, 0.09, 0.15);
          // the floor glows along the beam
          const t = rand();
          burst({ x: dom.pos.x + dir.x * reach * t, z: dom.pos.z + dir.z * reach * t }, 0.1, 1, [0xff5a2b, 0xffe14a], 0.6, 0.07, 0.3);
        }
      }
      // dash trail, jetpack exhaust and smoke from damaged karts
      for (const p of s.players) {
        if (p.dashTicks > 0) burst(p.pos, 0.6, 3, [playerColor(p.color), 0xffffff], 1, 0.14, 0.3);
        if (p.flying) burst(p.pos, 2.3, 2, [0xff9f2e, 0xffe14a, 0x888899], 0.8, 0.14, -0.6);
      }
      for (const v of s.vehicles) {
        if (v.hp < 30 && rand() < 0.3) burst(v.pos, 0.6, 1, [0x333344, 0x666677], 0.5, 0.2);
      }

      cubes.begin();
      sparks.begin();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }
        p.vy -= (p.spark ? 9 : 14) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (!p.spark && p.y < p.size / 2) {
          p.y = p.size / 2;
          p.vy *= -0.35;
          p.vx *= 0.7;
          p.vz *= 0.7;
        }
        const k = Math.min(1, p.life / (p.maxLife * 0.4));
        if (p.spark) sparks.add(p.x, p.y, p.z, 0, p.size * (0.4 + 0.6 * k), p.color);
        else cubes.add(p.x, p.y, p.z, p.spin * p.life, p.size * k, p.color, p.spin * p.life * 0.7);
      }
      sparks.end();
      // the flashes and shockwaves grow fast and fade (their light is added to the picture: a darker colour
      // is a fainter one), the stains dry up
      flashes.begin();
      waves.begin();
      for (let i = pops.length - 1; i >= 0; i--) {
        const f = pops[i];
        f.age += dt;
        if (f.age >= f.life) {
          pops.splice(i, 1);
          continue;
        }
        if (f.age < 0) continue;
        const t = f.age / f.life, grow = 1 - (1 - t) ** 3;
        (f.ring ? waves : flashes).add(f.x, f.y, f.z, 0, f.size * (f.ring ? grow : 0.35 + 0.65 * grow), tone(f.color, (1 - t) ** 1.5));
      }
      flashes.end();
      waves.end();
      stains.begin();
      for (let i = splats.length - 1; i >= 0; i--) {
        const b = splats[i];
        b.age += dt;
        if (b.age >= b.life) {
          splats.splice(i, 1);
          continue;
        }
        // it spreads in a blink, lies there, and shrinks away at the end
        const k = Math.min(1, b.age / 0.12) * Math.min(1, (b.life - b.age) / 1.2);
        stains.add(b.x, 0.035, b.z, b.turn, b.size * k, b.color);
      }
      stains.end();
      for (let i = discos.length - 1; i >= 0; i--) {
        const d = discos[i];
        d.age += dt;
        // it stays with whoever threw it
        const owner = s.players.find(p => p.id === d.ownerId);
        if (owner) {
          d.x = owner.pos.x + owner.aim.x * 1.6;
          d.z = owner.pos.z + owner.aim.z * 1.6;
        }
        const at = { x: d.x, z: d.z };
        const rise = Math.min(1, d.age / 0.22);
        const y = 1.2 + 1.3 * (1 - (1 - rise) ** 2) + 0.08 * Math.sin(d.age * 9);
        if (d.age >= DISCO_SECONDS) {
          // it bursts into glitter
          burst(at, y, 22, [...DISCO_COLORS, 0xffffff], 4.5, 0.1, 0.6);
          discos.splice(i, 1);
          continue;
        }
        // a mirror ball: a silver cube with a second one turned against it, spinning faster and faster
        const spin = d.age * (6 + d.age * 10);
        cubes.add(d.x, y, d.z, spin, 0.46, 0xe8eeff, 0.6);
        cubes.add(d.x, y, d.z, -spin * 0.7 + 0.8, 0.4, DISCO_COLORS[Math.floor(d.age * 8) % 3], 1.1);
        if (rand() < 0.5) burst(at, y, 1, [0xffffff, ...DISCO_COLORS], 2, 0.06, 0.2);
        if (rise < 1) continue;
        // spots of light sweep the floor around it
        for (let k = 0; k < 6; k++) {
          const a = spin * 0.6 + (k / 6) * Math.PI * 2;
          const r = 2.6 + 1.4 * Math.sin(d.age * 5 + k * 1.7);
          beam(at, y, { x: d.x + Math.cos(a) * r, z: d.z + Math.sin(a) * r }, 0.05, DISCO_COLORS[k % 3], 0.05);
        }
        // and beams hold on everything it hit, for a moment
        if (d.age < 0.75) {
          const hit = [...s.enemies.filter(x => d.enemies.includes(x.id)), ...s.players.filter(p => d.rivals.includes(p.id))];
          hit.forEach((o, k) => beam(at, y, o.pos, 0.6, DISCO_COLORS[k % 3], 0.07));
        }
      }
      for (let i = hammers.length - 1; i >= 0; i--) {
        const h = hammers[i];
        h.age += dt;
        // it leaves his hand when the warning is over, flies out, hangs for a moment and comes back: always
        // over the spot the rules strike at that moment
        if (h.age >= HAMMER_FLIGHT[1]) {
          hammers.splice(i, 1);
          continue;
        }
        const far = hammerAlong(h.age);
        if (far === null) continue;
        const reach = Math.hypot(h.to.x - h.from.x, h.to.z - h.from.z) || 1;
        const x = h.from.x + ((h.to.x - h.from.x) / reach) * far, z = h.from.z + ((h.to.z - h.from.z) / reach) * far;
        const spin = h.age * 22;
        // (it lies flat and whirls round its head, the handle sweeping about it, sparks in its wake)
        const size = DOMINIK.scale, off = 0.72 * size;
        for (const pool of [flyingHammers, flyingRunes]) pool.addScaled(x - Math.sin(spin) * off, 1.5, z - Math.cos(spin) * off, spin, size, size, size, undefined, Math.PI / 2);
        burst({ x, z }, 1.5, 1, [0x9fd0ff, 0xffffff, 0x7dfcff], 2, 0.08, 0.2);
      }
      for (const p of [laserCore, laserGlow, laserHaze, heat, heatCore, flyingHammers, flyingRunes]) p.end();
      cubes.end();
      cubeMat.emissiveIntensity = 0.3 * theme.glow;

      for (const p of beamPools.values()) p.begin();
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        b.life -= dt;
        if (b.life <= 0) {
          beams.splice(i, 1);
          continue;
        }
        const len = b.from.distanceTo(b.to);
        const yaw = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
        const pitch = -Math.asin((b.to.y - b.from.y) / Math.max(len, 0.001));
        beamPoolFor(b.color).addBeam(b.from, yaw, pitch, len);
      }
      for (const p of beamPools.values()) p.end();

      if (shakeTime > 0) {
        shakeTime -= dt;
        const a = shakeAmp * Math.max(0, shakeTime / 0.25);
        if (a > 0) shakeOffset.set((rand() - 0.5) * 2 * a, (rand() - 0.5) * 2 * a, (rand() - 0.5) * a);
        else shakeOffset.set(0, 0, 0);
      } else {
        shakeAmp = 0;
        shakeOffset.set(0, 0, 0);
      }
    },
    shake: () => shakeOffset,
    setParticleScale(k) {
      particleScale = k;
    },
  };
}
