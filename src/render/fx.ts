import * as THREE from 'three';
import type { SimEvent, SimState, Vec2 } from '../sim/types';
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

const MAX_PARTICLES = 2500;

export interface Fx {
  update(s: SimState, events: SimEvent[], theme: Theme, frameDt: number): void;
  /** camera offset for screen shake */
  shake(): THREE.Vector3;
}

export function createFx(scene: THREE.Scene): Fx {
  const particles: Particle[] = [];
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, roughness: 0.5 });
  const cubes = new InstancedPool(scene, new THREE.BoxGeometry(1, 1, 1), cubeMat, 1024, false);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2b4b, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xff2b4b, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const rings = new InstancedPool(scene, new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2), ringMat, 32, false);
  const fills = new InstancedPool(scene, new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), fillMat, 32, false);

  const beams: Beam[] = [];
  const beamMat = glowMat(0xffffff, 3);
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  const beamPool = new InstancedPool(scene, beamGeo, beamMat, 64, false);
  const beamColors = new Map<number, InstancedPool>();
  const beamPoolFor = (color: number) => {
    let p = beamColors.get(color);
    if (!p) {
      p = new InstancedPool(scene, beamGeo, glowMat(color, 3), 64, false);
      beamColors.set(color, p);
    }
    return p;
  };

  const shakeOffset = new THREE.Vector3();
  let shakeAmp = 0;
  let shakeTime = 0;
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

  function burst(pos: Vec2, y: number, count: number, colors: number[], speed: number, size: number) {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const a = rand() * Math.PI * 2;
      const sp = speed * (0.4 + rand() * 0.8);
      const life = 0.45 + rand() * 0.35;
      particles.push({
        x: pos.x,
        y,
        z: pos.z,
        vx: Math.cos(a) * sp,
        vy: 2 + rand() * speed,
        vz: Math.sin(a) * sp,
        life,
        maxLife: life,
        size: size * (0.6 + rand() * 0.6),
        color: colors[Math.floor(rand() * colors.length)],
        spin: rand() * 10,
      });
    }
  }

  function addShake(amp: number) {
    shakeAmp = Math.max(shakeAmp, amp);
    shakeTime = 0.25;
  }

  function beam(from: Vec2, fy: number, to: Vec2, ty: number, color: number, life = 0.08) {
    beams.push({ from: new THREE.Vector3(from.x, fy, from.z), to: new THREE.Vector3(to.x, ty, to.z), life, color });
  }

  return {
    update(s, events, theme, dt) {
      for (const e of events) {
        switch (e.type) {
          case 'enemyKilled': {
            const l = ENEMY_LOOK[e.kind];
            const big = e.kind === 'miniboss' ? 60 : e.kind === 'tank' ? 26 : e.kind === 'wormSegment' ? 22 : 14;
            burst(e.pos, l.h / 2, big, [l.day, l.night, 0xffffff], e.kind === 'miniboss' ? 6 : 4, e.kind === 'splitling' ? 0.1 : 0.16);
            break;
          }
          case 'bossDead':
            burst(e.pos, 1, 300, [0x7b4fd1, 0xff2bd6, 0xffe14a, 0x2bf0ff, 0xffffff], 9, 0.22);
            addShake(0.5);
            break;
          case 'crateOpened': {
            const p = s.players.find(x => x.id === e.playerId);
            if (p) burst(p.pos, 1, 30, [0xff9f2e, 0xfff6d0, 0xffe14a], 4, 0.12);
            break;
          }
          case 'bossSpawn':
            addShake(0.4);
            break;
          case 'baseHit':
            addShake(0.15);
            break;
          case 'bossImpact':
            burst(e.pos, 0.2, 40, [0xff2b4b, 0xffa040, 0x553344], 5, 0.18);
            addShake(0.4);
            break;
          case 'playerHit':
            addShake(0.06);
            break;
          case 'towerFired':
            if (e.kind === 'laser') beam(e.pos, 2.1, e.target, 0.4, 0xff8c42, 0.09);
            if (e.kind === 'frost') burst(e.pos, 1.8, 12, [0xc8f4ff, 0x7fdcff], 5, 0.1);
            break;
          case 'shot':
            if (e.weapon === 'discoBall') {
              const t = performance.now() / 1000;
              const from = { x: e.pos.x + Math.cos(t * 2.5) * 2, z: e.pos.z + Math.sin(t * 2.5) * 2 };
              const near = s.enemies
                .filter(x => x.hp > 0)
                .map(x => ({ x, d: Math.hypot(x.pos.x - e.pos.x, x.pos.z - e.pos.z) }))
                .filter(o => o.d <= 6)
                .sort((a, b) => a.d - b.d)
                .slice(0, 3);
              const colors = [0xff4dd2, 0x4dd2ff, 0xffe14a];
              near.forEach((o, i) => beam(from, 1.4, o.x.pos, 0.4, colors[i % colors.length], 0.12));
            }
            break;
        }
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

      rings.begin();
      fills.begin();
      for (const t of s.boss?.telegraphs ?? []) {
        const total = Math.max(1, t.impactAt - t.createdAt);
        const left = Math.max(0, t.impactAt - s.tick);
        const k = 1 - Math.min(1, left / total);
        rings.add(t.pos.x, 0.05, t.pos.z, 0, t.radius);
        fills.add(t.pos.x, 0.04, t.pos.z, 0, t.radius * Math.max(0.05, k));
      }
      rings.end();
      fills.end();
      ringMat.opacity = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 80));

      beamPool.begin();
      for (const p of beamColors.values()) p.begin();
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
        const pool = beamPoolFor(b.color);
        pool.addBeam(b.from, yaw, pitch, len);
      }
      beamPool.end();
      for (const p of beamColors.values()) p.end();

      if (shakeTime > 0) {
        shakeTime -= dt;
        const a = shakeAmp * Math.max(0, shakeTime / 0.25);
        shakeOffset.set((rand() - 0.5) * 2 * a, (rand() - 0.5) * 2 * a, (rand() - 0.5) * a);
      } else {
        shakeAmp = 0;
        shakeOffset.set(0, 0, 0);
      }
    },
    shake: () => shakeOffset,
  };
}
