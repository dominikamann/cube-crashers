import * as THREE from 'three';
import type { PowerupKind, SimEvent, SimState, Vec2 } from '../sim/types';
import { ENEMY_LOOK } from './entities';
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
}

interface Beam {
  from: THREE.Vector3;
  to: THREE.Vector3;
  life: number;
  color: number;
}

const MAX_PARTICLES = 3000;

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

  const beams: Beam[] = [];
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

  const playerPos = (s: SimState, id: number): Vec2 | undefined => s.players.find(p => p.id === id)?.pos;

  return {
    update(s, events, theme, dt, time) {
      // a galloping unicorn leaves a rainbow behind it
      for (const v of s.vehicles) {
        if (v.kind !== 'unicorn' || Math.hypot(v.vel.x, v.vel.z) < 3 || Math.floor(time * 30) % 2 !== 0) continue;
        burst({ x: v.pos.x - v.vel.x * 0.06, z: v.pos.z - v.vel.z * 0.06 }, 0.5, 2, RAINBOW, 0.6, 0.11, 0.2);
      }
      for (const e of events) {
        switch (e.type) {
          case 'enemyKilled': {
            // it falls apart: chunky cubes that bounce away, then a puff of pixel dust
            const l = ENEMY_LOOK[e.kind];
            const big = e.elite ? 50 : e.kind === 'tank' || e.kind === 'rammer' ? 26 : 14;
            burst(e.pos, l.h / 2, big, [l.day, l.night, 0xffffff], e.elite ? 6 : 4, e.kind === 'splitling' ? 0.1 : 0.16);
            burst(e.pos, l.h * 0.6, Math.round(big * 0.8), [l.day, l.night], 1.6, 0.06, 1.4);
            break;
          }
          case 'enemyHit': {
            // every hit knocks a few pixels off
            const en = s.enemies.find(x => x.id === e.id);
            if (!en) break;
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
          case 'explosion':
            burst(e.pos, 0.3, Math.round(20 + e.radius * 14), [0xff8c42, 0xffe14a, 0xff3b3b, 0x553344], 3 + e.radius * 1.5, 0.2);
            ring(e.pos, e.radius, [0xffe14a, 0xff8c42]);
            addShake(Math.min(0.4, 0.08 * e.radius));
            break;
          case 'bossDead':
            burst(e.pos, 1.5, 300, [0x7b4fd1, 0xff2bd6, 0xffe14a, 0x2bf0ff, 0xffffff], 9, 0.22);
            addShake(0.6);
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
              // light beams to everything it reached: monsters, and rivals in versus
              const from = { x: e.pos.x + Math.cos(time * 2.5) * 0.8, z: e.pos.z + Math.sin(time * 2.5) * 0.8 };
              const near = [...s.enemies.map(x => x.pos), ...s.players.filter(p => p !== who && s.versus).map(p => p.pos)]
                .map(pos => ({ pos, d: Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z) }))
                .filter(o => o.d <= 7.5)
                .sort((a, b) => a.d - b.d)
                .slice(0, 8);
              near.forEach((o, i) => beam(from, 1.1, o.pos, 0.6, colors[i % colors.length], 0.18));
            }
            break;
        }
      }

      // dash trail, jetpack exhaust and smoke from damaged karts
      for (const p of s.players) {
        if (p.dashTicks > 0) burst(p.pos, 0.6, 3, [0x2bf0ff, 0xffffff], 1, 0.14, 0.3);
        if (p.flying) burst(p.pos, 2.3, 2, [0xff9f2e, 0xffe14a, 0x888899], 0.8, 0.14, -0.6);
      }
      for (const v of s.vehicles) {
        if (v.hp < 30 && rand() < 0.3) burst(v.pos, 0.6, 1, [0x333344, 0x666677], 0.5, 0.2);
      }

      cubes.begin();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }
        p.vy -= 14 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < p.size / 2) {
          p.y = p.size / 2;
          p.vy *= -0.35;
          p.vx *= 0.7;
          p.vz *= 0.7;
        }
        const k = Math.min(1, p.life / (p.maxLife * 0.4));
        cubes.add(p.x, p.y, p.z, p.spin * p.life, p.size * k, p.color, p.spin * p.life * 0.7);
      }
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
