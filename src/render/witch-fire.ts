import * as THREE from 'three';
import type { SimEvent, SimState, Vec2 } from '../sim/types';
import { allBosses } from '../sim/util';
import { InstancedPool, lambert } from './pool';

/**
 * The Schrättele's bonfire: logs in a ring of stones, voxel flames that leap and flicker, sparks that rise, a glow on
 * the floor where its heat reaches (it hurts, see witch.ts: the ring shows how far), and its light. While she dances
 * it burns higher. The twigs she throws burn on the floor for a while with small flames of their own.
 * When she falls, the fire flares up once more and burns down to embers and smoke.
 */
export interface WitchFires {
  update(s: SimState, events: SimEvent[], time: number, dt: number, night: number): void;
}

interface Spark {
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
}

const FLAME = [0xff4a0a, 0xff7a14, 0xffa524, 0xffd040];
const EMBER = [0xff6a1a, 0xffb43a, 0xffe08a];

export function createWitchFires(scene: THREE.Scene): WitchFires {
  const add = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const logs = new InstancedPool(scene, unit, lambert(0x5a3a22), 64);
  const stones = new InstancedPool(scene, unit, lambert(0x77736c), 64);
  // (the flames are solid blocks of colour, lit by nothing: additive ones wash out to white against a bright day)
  const flames = new InstancedPool(scene, unit, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 256, false);
  const sparks = new InstancedPool(scene, unit, add(0xffffff), 512, false);
  const smoke = new InstancedPool(scene, unit, new THREE.MeshLambertMaterial({ color: 0x6e6866, transparent: true, opacity: 0.35, depthWrite: false }), 96, false);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const rings = new InstancedPool(scene, new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), ringMat, 8, false);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const glows = new InstancedPool(scene, new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), glowMat, 64, false);
  const list: Spark[] = [];
  const smokes: Spark[] = [];
  // her light: added while a fire burns (a light that comes and goes makes the scene's shaders recompile, so only then)
  let light: THREE.PointLight | null = null;
  /** where each Schrättele's fire was last seen (by boss body), for the finale */
  const lastFire = new Map<number, { pos: Vec2; heat: number }>();
  /** fires burning down after she fell: where, and since when */
  const dying: { pos: Vec2; heat: number; since: number }[] = [];
  let rnd = 4242;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

  function spark(at: Vec2, y: number, speed: number, up: number, color: number, life = 0.9 + rand() * 0.8) {
    if (list.length >= 480) return;
    const a = rand() * Math.PI * 2, sp = speed * rand();
    list.push({ x: at.x + Math.cos(a) * 0.2, y, z: at.z + Math.sin(a) * 0.2, vx: Math.cos(a) * sp, vy: up * (0.6 + rand() * 0.8), vz: Math.sin(a) * sp, life, max: life, size: 0.05 + rand() * 0.06, color });
  }
  function puff(at: Vec2, y: number) {
    if (smokes.length >= 90) return;
    const life = 2 + rand() * 1.5;
    smokes.push({ x: at.x + (rand() - 0.5) * 0.6, y, z: at.z + (rand() - 0.5) * 0.6, vx: (rand() - 0.5) * 0.3, vy: 0.8 + rand() * 0.5, vz: (rand() - 0.5) * 0.3, life, max: life, size: 0.3 + rand() * 0.25, color: 0 });
  }

  /** the bonfire itself: `power` 1 is a fire as it burns, more is higher, less is burning down */
  function bonfire(at: Vec2, power: number, time: number, seed: number) {
    // the ring of stones and the logs laid crosswise, leaning in
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      stones.addScaled(at.x + Math.cos(a) * 0.95, 0.12, at.z + Math.sin(a) * 0.95, a + i, 0.32, 0.24, 0.26);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      logs.addScaled(at.x + Math.cos(a) * 0.35, 0.28, at.z + Math.sin(a) * 0.35, -a + Math.PI / 2, 0.16, 0.16, 1.1, undefined, 0.5, 0);
    }
    if (power <= 0.02) return;
    // flames: blocks that rise from the logs, shrink and go, each at its own pace, the hottest in the middle
    const n = Math.round(10 + 8 * Math.min(2, power));
    for (let i = 0; i < n; i++) {
      const life = 0.55 + ((i * 7) % 5) * 0.08;
      const k = ((time + i * 0.137 + seed) / life) % 1;
      const a = i * 2.39 + seed, r = (0.42 - 0.3 * k) * (0.6 + (i % 3) * 0.25) * Math.min(1.4, power);
      const size = (0.34 - 0.27 * k) * Math.min(1.6, 0.5 + power * 0.6);
      const y = 0.35 + k * 1.7 * Math.min(1.8, power);
      const color = FLAME[Math.min(FLAME.length - 1, Math.floor((1 - k) * FLAME.length * 0.8 + (i % 2)))];
      flames.add(at.x + Math.cos(a) * r, y, at.z + Math.sin(a) * r, a + k * 3, size, k > 0.6 ? FLAME[0] : color, k * 2);
    }
    // a white-hot heart
    flames.add(at.x, 0.42, at.z, time * 2, 0.32 * Math.min(1.5, power), 0xfff0b0);
  }

  return {
    update(s, events, time, dt, night) {
      for (const p of [logs, stones, flames, sparks, smoke, rings, glows]) p.begin();
      const live: { pos: Vec2; heat: number }[] = [];
      for (const b of allBosses(s)) {
        const w = b.witch;
        if (!w) continue;
        live.push({ pos: w.fire, heat: w.heat });
        if (b.enemyId !== null) lastFire.set(b.enemyId, { pos: { ...w.fire }, heat: w.heat });
        const power = w.heat / 2.1;
        bonfire(w.fire, power, time, b.enemyId ?? 0);
        // where its heat reaches: a glowing ring on the floor that breathes, and a faint glow inside it
        rings.add(w.fire.x, 0.06, w.fire.z, time * 0.3, w.heat * (1 + 0.025 * Math.sin(time * 5)));
        glows.add(w.fire.x, 0.04, w.fire.z, 0, w.heat);
        // sparks fly up all the time, more of them while she dances
        const rate = (w.dance ? 40 : 18) * dt;
        for (let k = rate + rand() - 1; k > 0; k--) spark(w.fire, 0.8, 0.8, 2.2 + power, EMBER[Math.floor(rand() * EMBER.length)]);
        if (rand() < dt * 3) puff(w.fire, 2.2);
        // the twigs burning on the floor
        for (const e of w.embers) {
          if (s.tick < e.from) continue;
          const left = Math.min(1, (e.until - s.tick) / 40, (s.tick - e.from) / 8 + 0.2);
          glows.add(e.pos.x, 0.05, e.pos.z, 0, e.radius * left);
          for (let i = 0; i < 4; i++) {
            const life = 0.4 + i * 0.07, k = ((time + i * 0.21 + e.id) / life) % 1;
            const a = e.id + i * 1.9;
            flames.add(e.pos.x + Math.cos(a) * 0.35, 0.12 + k * 0.6 * left, e.pos.z + Math.sin(a) * 0.35, a, (0.24 - 0.18 * k) * left, FLAME[(i + 1) % FLAME.length], k);
          }
          for (let i = 0; i < 3; i++) logs.addScaled(e.pos.x + Math.cos(e.id + i * 2.1) * 0.25, 0.04, e.pos.z + Math.sin(e.id + i * 2.1) * 0.25, e.id + i * 1.3, 0.05, 0.05, 0.5, 0x2a1c12);
          if (rand() < dt * 4 * left) spark(e.pos, 0.3, 0.6, 1.6, EMBER[0], 0.6);
        }
      }
      // she fell: her fire flares up and burns down, with smoke; the burning-down takes a few seconds
      for (const ev of events) {
        if (ev.type !== 'bossDead' || ev.kind !== 'witch') continue;
        let best: [number, { pos: Vec2; heat: number }] | null = null;
        for (const entry of lastFire) if (!best || Math.hypot(entry[1].pos.x - ev.pos.x, entry[1].pos.z - ev.pos.z) < Math.hypot(best[1].pos.x - ev.pos.x, best[1].pos.z - ev.pos.z)) best = entry;
        if (!best) continue;
        lastFire.delete(best[0]);
        dying.push({ pos: best[1].pos, heat: best[1].heat, since: time });
        for (let i = 0; i < 90; i++) spark(best[1].pos, 0.8, 4, 7, i % 3 ? EMBER[i % EMBER.length] : 0xffffff, 1.2 + rand());
      }
      for (const ev of events) {
        // a drumbeat or a crackle sends a spray of sparks up out of it
        if (ev.type === 'witchDrum' || ev.type === 'fireCrackle') for (let i = 0; i < (ev.type === 'witchDrum' ? 8 : 5); i++) spark(ev.pos, 0.9, 1.6, 4, EMBER[i % EMBER.length]);
        if (ev.type === 'witchDance' || ev.type === 'witchDanceEnd') for (let i = 0; i < 40; i++) spark(ev.pos, 0.8, 3, 6, EMBER[i % EMBER.length]);
      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const d = dying[i], age = time - d.since;
        const DOWN = 6;
        if (age > DOWN + 3) {
          dying.splice(i, 1);
          continue;
        }
        // a flare, then lower and lower; the embers glow on, smoke rises
        const power = age < 0.8 ? 2.6 - age : Math.max(0, 1.8 * (1 - (age - 0.8) / (DOWN - 0.8)));
        bonfire(d.pos, power, time, 7);
        glows.add(d.pos.x, 0.04, d.pos.z, 0, Math.max(0.5, d.heat * Math.min(1, power)));
        if (rand() < dt * 6) puff(d.pos, 0.8 + power);
        if (rand() < dt * 10 * Math.max(0.2, power)) spark(d.pos, 0.6, 1, 2.5, EMBER[0]);
        live.push({ pos: d.pos, heat: Math.max(0.3, d.heat * Math.min(1, power)) });
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        // (they drift up on the heat, wander a little, and slow down)
        p.vx += (Math.sin(time * 3 + i) * 0.6 - p.vx * 0.8) * dt;
        p.vz += (Math.cos(time * 2.6 + i) * 0.6 - p.vz * 0.8) * dt;
        p.vy -= 0.6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = p.life / p.max;
        sparks.add(p.x, p.y, p.z, 0, p.size * (0.4 + 0.6 * k), k > 0.3 ? p.color : FLAME[0]);
      }
      for (let i = smokes.length - 1; i >= 0; i--) {
        const p = smokes[i];
        p.life -= dt;
        if (p.life <= 0) {
          smokes.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = 1 - p.life / p.max;
        smoke.add(p.x, p.y, p.z, k * 2, p.size * (1 + 1.4 * k));
      }
      for (const p of [logs, stones, flames, sparks, smoke, rings, glows]) p.end();
      // the light of the fire (the first one, if there are several), flickering; brighter by night
      if (live.length > 0) {
        if (!light) {
          light = new THREE.PointLight(0xff8a3a, 0, 16, 1.6);
          light.castShadow = false;
          scene.add(light);
        }
        const f = live[0];
        light.position.set(f.pos.x, 1.6, f.pos.z);
        light.intensity = (night > 0.5 ? 9 : 3.5) * (f.heat / 2.1) * (0.85 + 0.15 * Math.sin(time * 17) * Math.sin(time * 7.3));
      } else if (light && dying.length === 0) {
        scene.remove(light);
        light.dispose();
        light = null;
      }
      ringMat.opacity = 0.32 + 0.12 * Math.sin(time * 6);
    },
  };
}
