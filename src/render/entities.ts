import * as THREE from 'three';
import type { EnemyKind, SimEvent, SimState } from '../sim/types';
import { FLASH, glowMat, InstancedPool, lambert } from './pool';
import type { Theme } from './theme';

/** Look of each enemy kind: body box size, colours, eye height and spacing. */
export const ENEMY_LOOK: Record<EnemyKind, { w: number; h: number; d: number; day: number; night: number; eyeY: number; eyeX: number; eye: number }> = {
  blob: { w: 0.7, h: 0.7, d: 0.7, day: 0xe85d75, night: 0xff3b6b, eyeY: 0.5, eyeX: 0.15, eye: 0.14 },
  hunter: { w: 0.5, h: 0.35, d: 0.85, day: 0xf29e4c, night: 0xffb13b, eyeY: 0.25, eyeX: 0.12, eye: 0.1 },
  tank: { w: 1.2, h: 1.05, d: 1.2, day: 0x8a8fa3, night: 0x9aa6d0, eyeY: 0.7, eyeX: 0.28, eye: 0.18 },
  splitter: { w: 0.8, h: 0.8, d: 0.8, day: 0x9b6bd6, night: 0xb07cff, eyeY: 0.55, eyeX: 0.18, eye: 0.14 },
  splitling: { w: 0.42, h: 0.42, d: 0.42, day: 0xc9a6f0, night: 0xd8b8ff, eyeY: 0.3, eyeX: 0.09, eye: 0.08 },
  shooter: { w: 0.55, h: 1.0, d: 0.55, day: 0x2fb8a6, night: 0x3bffe0, eyeY: 0.75, eyeX: 0, eye: 0.26 },
  bomber: { w: 0.7, h: 0.6, d: 0.7, day: 0xd93a2f, night: 0xff5a3b, eyeY: 0.4, eyeX: 0.16, eye: 0.12 },
  rammer: { w: 1.1, h: 0.8, d: 1.3, day: 0x4a6fa5, night: 0x6f9fe0, eyeY: 0.55, eyeX: 0.3, eye: 0.16 },
  megaBlock: { w: 3.2, h: 2.8, d: 3.2, day: 0x5b4a8a, night: 0x7b5fd1, eyeY: 2.0, eyeX: 0.7, eye: 0.5 },
  wormSegment: { w: 0.95, h: 0.85, d: 0.95, day: 0x7b4fd1, night: 0x8f63ff, eyeY: 0.6, eyeX: 0.22, eye: 0.16 },
  swarmer: { w: 0.6, h: 0.3, d: 0.45, day: 0xb15cff, night: 0xd08cff, eyeY: 0.2, eyeX: 0.1, eye: 0.09 },
  ghost: { w: 0.8, h: 0.9, d: 0.8, day: 0xff4fd8, night: 0xff4fd8, eyeY: 0.6, eyeX: 0.18, eye: 0.16 },
};

const CANDY_COLORS = [0xff4d6d, 0x4dd2ff, 0xffe14a, 0x7dff6b, 0xff8cf0, 0xff9f43];
const KINDS = Object.keys(ENEMY_LOOK) as EnemyKind[];

export interface Entities {
  update(s: SimState, theme: Theme, time: number, events: SimEvent[], frameDt: number): void;
  setDamageNumbers(on: boolean): void;
}

/** `overlay` is drawn on top of the finished image (no post-processing), for text like damage numbers */
export function createEntities(scene: THREE.Scene, overlay: THREE.Scene): Entities {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bodyMats = new Map<EnemyKind, THREE.MeshLambertMaterial>();
  const bodies = new Map<EnemyKind, InstancedPool>();
  for (const k of KINDS) {
    const l = ENEMY_LOOK[k];
    const mat = lambert(l.day);
    bodyMats.set(k, mat);
    bodies.set(k, new InstancedPool(scene, new THREE.BoxGeometry(l.w, l.h, l.d), mat));
  }
  const eyeMat = glowMat(0xfff27a, 1.3);
  const eyes = new InstancedPool(scene, unit, eyeMat, 1024, false);
  const pupilMat = lambert(0x111111);
  const pupils = new InstancedPool(scene, unit, pupilMat, 1024, false);
  const plateMat = lambert(0x5f6478);
  const plates = new InstancedPool(scene, new THREE.BoxGeometry(1.35, 0.18, 1.35), plateMat, 128);

  const eliteMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const eliteRings = new InstancedPool(scene, new THREE.RingGeometry(0.85, 1, 20).rotateX(-Math.PI / 2), eliteMat, 32, false);
  const hornMat = glowMat(0xffe14a, 1.2);
  const horns = new InstancedPool(scene, new THREE.BoxGeometry(0.16, 0.16, 0.5), hornMat, 64);
  const fuseMat = glowMat(0xffe14a, 3);
  const fuses = new InstancedPool(scene, new THREE.BoxGeometry(0.12, 0.3, 0.12), fuseMat, 64, false);
  // telegraphs: where a rammer will charge, where a bomber will blow, where a shooter aims
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2b4b, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const lanes = new InstancedPool(scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), warnMat, 32, false);
  const blastRings = new InstancedPool(scene, new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2), warnMat, 32, false);
  const blastFills = new InstancedPool(scene, new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), warnMat, 32, false);
  const bossHornMat = glowMat(0xff2bd6, 1.6);
  const bossHorns = new InstancedPool(scene, new THREE.BoxGeometry(0.25, 0.6, 0.25), bossHornMat, 64);
  const redEyeMat = glowMat(0xff2b2b, 1.6);
  const redEyes = new InstancedPool(scene, new THREE.BoxGeometry(0.28, 0.18, 0.06), redEyeMat, 64, false);
  const jetMat = lambert(0xd0d4e0);
  const jetItems = new InstancedPool(scene, new THREE.BoxGeometry(0.55, 0.7, 0.3), jetMat, 8);
  const jetGlowMat = glowMat(0xff9f2e, 2);
  const jetGlow = new InstancedPool(scene, new THREE.BoxGeometry(0.4, 0.12, 0.4), jetGlowMat, 8, false);
  const gumMat = new THREE.MeshStandardMaterial({ color: 0xff7fc8, transparent: true, opacity: 0.45, roughness: 0.2, depthWrite: false });
  const gums = new InstancedPool(scene, new THREE.SphereGeometry(1, 20, 14), gumMat, 16, false);
  const sawMat = lambert(0xf2c14e);
  const saws = new InstancedPool(scene, new THREE.CylinderGeometry(0.5, 0.5, 0.08, 10), sawMat, 16);
  const pepMat = lambert(0xc0392b);
  const peps = new InstancedPool(scene, new THREE.BoxGeometry(0.16, 0.1, 0.16), pepMat, 64, false);
  const iceMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false });
  const ice = new InstancedPool(scene, new THREE.BoxGeometry(1, 1, 1), iceMat, 128, false);
  const hostileMat = glowMat(0xff3b3b, 2.2);
  const hostile = new InstancedPool(scene, new THREE.BoxGeometry(0.28, 0.28, 0.28), hostileMat, 128, false);
  const bananaMat = lambert(0xffe135);
  const bananas = new InstancedPool(scene, new THREE.BoxGeometry(0.5, 0.16, 0.2), bananaMat, 64);
  const mineLightMat = glowMat(0xff3b3b, 3);
  const mineLights = new InstancedPool(scene, new THREE.BoxGeometry(0.1, 0.1, 0.1), mineLightMat, 64, false);
  const bombMat = lambert(0x2a2a35);
  const bombs = new InstancedPool(scene, new THREE.BoxGeometry(0.45, 0.45, 0.45), bombMat, 32);

  const boltMat = glowMat(0xfff27a, 1.6);
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

  const tmpFrom = new THREE.Vector3();

  // white flash for a moment after a hit
  const flashUntil = new Map<number, number>();
  const FLASH_SECONDS = 0.08;

  // floating damage numbers: a small pool of sprites with their own canvas each
  let showNumbers = true;
  const numbers = Array.from({ length: 48 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(0.9, 0.45, 1);
    sprite.visible = false;
    overlay.add(sprite);
    return { sprite, canvas, tex, life: 0, vx: 0 };
  });
  let nextNumber = 0;
  function popNumber(x: number, y: number, z: number, amount: number) {
    const n = numbers[nextNumber++ % numbers.length];
    const ctx = n.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 32);
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1b1440';
    const text = String(Math.round(amount));
    ctx.strokeText(text, 32, 16);
    ctx.fillStyle = amount >= 30 ? '#ffc928' : '#fffdf5';
    ctx.fillText(text, 32, 16);
    n.tex.needsUpdate = true;
    n.sprite.position.set(x, y, z);
    n.sprite.visible = true;
    n.life = 0.7;
    n.vx = (Math.random() - 0.5) * 0.8;
  }

  return {
    setDamageNumbers(on) {
      showNumbers = on;
      if (!on) for (const n of numbers) n.sprite.visible = false;
    },
    update(s, theme, time, events, frameDt) {
      for (const e of events) {
        if (e.type !== 'enemyHit') continue;
        flashUntil.set(e.id, time + FLASH_SECONDS);
        if (showNumbers && e.amount >= 1) popNumber(e.pos.x, 1.4, e.pos.z, e.amount);
      }
      for (const n of numbers) {
        if (!n.sprite.visible) continue;
        n.life -= frameDt;
        n.sprite.position.y += frameDt * 1.6;
        n.sprite.position.x += n.vx * frameDt;
        (n.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, n.life / 0.3);
        if (n.life <= 0) n.sprite.visible = false;
      }
      if (flashUntil.size > 300) for (const [id, until] of flashUntil) if (until < time) flashUntil.delete(id);
      const night = theme.pointLights;
      for (const k of KINDS) {
        const l = ENEMY_LOOK[k];
        bodyMats.get(k)!.color.setHex(night > 0.5 ? l.night : l.day);
        bodies.get(k)!.begin();
      }
      eyeMat.color.setHex(night > 0.5 ? 0xffffff : 0xfff27a);
      eyeMat.emissive.copy(eyeMat.color);
      eyeMat.emissiveIntensity = 2.5 * theme.glow;
      boomerangMat.emissiveIntensity = 1.5 * theme.glow;
      boltMat.emissiveIntensity = 3 * theme.glow;
      eyes.begin();
      pupils.begin();
      plates.begin();
      const heads = new Set(s.boss?.worms.map(w => w[0]) ?? []);
      const extra = [bossHorns, redEyes, eliteRings, horns, fuses, lanes, blastRings, hostile, bananas, mineLights, bombs, jetItems, jetGlow, gums, saws, peps, ice];
      for (const p of extra) p.begin();
      blastFills.begin();
      warnMat.opacity = 0.35 + 0.25 * Math.abs(Math.sin(time * 14));
      tmpFrom.y = 0.06;

      const slowed = (until: number) => until > s.tick;
      for (const e of s.enemies) {
        const l = ENEMY_LOOK[e.kind];
        // hurt monsters have lost some of their pixels: they shrink a little (bosses keep their size)
        const worn = e.kind === 'wormSegment' || e.kind === 'megaBlock' ? 1 : 0.72 + 0.28 * Math.max(0, e.hp / e.maxHp);
        const scale = (e.elite ? 1.4 : 1) * worn;
        const y = (l.h / 2) * scale + (e.kind === 'swarmer' ? 1.3 + Math.sin(time * 9 + e.id) * 0.25 : bob(e.id, time, e.kind === 'tank' || e.kind === 'rammer' ? 0.06 : 0.2));
        const yaw = Math.atan2(e.dir.x, e.dir.z);
        const winding = e.state === 'windup' || e.state === 'fuse';
        const flashing = (flashUntil.get(e.id) ?? 0) > time;
        // maze ghosts turn blue (and blink as the power runs out) while they can be crashed
        const maze = s.run.maze;
        const scared = e.kind === 'ghost' && maze && s.tick < maze.powerUntil;
        const blinkOut = scared && maze!.powerUntil - s.tick < 120 && Math.floor(time * 8) % 2 === 0;
        const tint = flashing ? FLASH : scared ? (blinkOut ? 0xffffff : 0x3d6bff) : e.state === 'stunned' ? 0x777777 : slowed(e.slowUntil) && e.kind !== 'ghost' ? 0x9fe8ff : undefined;
        const pulse = winding ? 1 + 0.12 * Math.abs(Math.sin(time * (e.state === 'fuse' ? 40 : 20))) : 1;
        bodies.get(e.kind)!.add(e.pos.x, y * pulse, e.pos.z, yaw, scale * pulse, tint);
        if (e.frozenUntil > s.tick) ice.add(e.pos.x, y, e.pos.z, yaw, Math.max(l.w, l.h, l.d) * scale * 1.3);
        if (e.kind === 'wormSegment' || e.kind === 'megaBlock') {
          const big = e.kind === 'megaBlock';
          if (!big && !heads.has(e.id)) continue;
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          const sx = Math.cos(yaw), sz = -Math.sin(yaw);
          const hw = big ? 1.1 : 0.32, top = y + (l.h / 2) * scale + (big ? 0.2 : 0.15);
          for (const side of [-1, 1]) {
            bossHorns.add(e.pos.x + sx * side * hw, top, e.pos.z + sz * side * hw, yaw, big ? 1.8 : 1);
            const ex = e.pos.x + fx * ((l.d / 2) * scale + 0.03) + sx * side * (big ? 0.7 : 0.22);
            const ez = e.pos.z + fz * ((l.d / 2) * scale + 0.03) + sz * side * (big ? 0.7 : 0.22);
            redEyes.add(ex, y + (big ? 0.4 : 0.1), ez, yaw, big ? 2.2 : 1);
          }
          if (big) eliteRings.add(e.pos.x, 0.05, e.pos.z, time * 1.5, 3.4 * (1 + 0.06 * Math.sin(time * 5)));
          continue;
        }
        if (e.elite) eliteRings.add(e.pos.x, 0.05, e.pos.z, time * 2, e.radius * 2.2 * (1 + 0.08 * Math.sin(time * 6)));
        if (e.kind === 'rammer') {
          for (const side of [-1, 1]) horns.add(e.pos.x + Math.cos(yaw) * side * 0.4 + Math.sin(yaw) * 0.6, y + 0.1, e.pos.z - Math.sin(yaw) * side * 0.4 + Math.cos(yaw) * 0.6, yaw, scale);
          if (e.state === 'windup' || e.state === 'charge') {
            tmpFrom.set(e.pos.x, 0.06, e.pos.z);
            lanes.addStretched(tmpFrom, yaw, e.radius * 2, e.state === 'charge' ? e.chargeLeft : 12);
          }
        }
        if (e.kind === 'bomber') {
          fuses.add(e.pos.x, y + 0.45 * scale, e.pos.z, time * 10, scale * (e.state === 'fuse' ? 1.6 : 1));
          if (e.state === 'fuse') blastRings.add(e.pos.x, 0.06, e.pos.z, 0, 2);
        }
        if (e.kind === 'shooter' && e.state === 'windup') {
          tmpFrom.set(e.pos.x, 0.06, e.pos.z);
          lanes.addStretched(tmpFrom, yaw, 0.12, 8);
        }
        if (e.kind === 'tank') plates.add(e.pos.x, y + (l.h / 2) * scale - 0.05, e.pos.z, yaw, scale);
        const ey = y - (l.h / 2 - l.eyeY) * scale;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const front = (l.d / 2 + 0.02) * scale;
        for (const side of l.eyeX === 0 ? [0] : [-1, 1]) {
          const ox = side * l.eyeX * scale;
          const ex = e.pos.x + fx * front + fz * ox, ez = e.pos.z + fz * front - fx * ox;
          eyes.add(ex, ey, ez, yaw, l.eye * scale);
          pupils.add(ex + fx * 0.03, ey - l.eye * 0.15 * scale, ez + fz * 0.03, yaw, l.eye * 0.5 * scale);
        }
      }
      for (const k of KINDS) bodies.get(k)!.end();
      for (const p of [eyes, pupils, plates]) p.end();
      hostileMat.emissiveIntensity = 4 * Math.min(theme.glow, 1.4);

      for (const p of [bolts, candies, hotdogs, boomerangs, popcorns, puddles]) p.begin();
      for (const p of s.projectiles) {
        if (p.hostile) {
          hostile.add(p.pos.x, 0.7, p.pos.z, time * 8, 1, undefined, time * 6);
          continue;
        }
        if (p.behavior === 'saw') {
          saws.add(p.pos.x, 0.5, p.pos.z, time * 25);
          for (let i = 0; i < 4; i++) {
            const a = time * 25 + (i * Math.PI) / 2;
            peps.add(p.pos.x + Math.cos(a) * 0.28, 0.56, p.pos.z + Math.sin(a) * 0.28, a);
          }
          continue;
        }
        if (p.kind === 'bubblegumBazooka') {
          gums.add(p.pos.x, 0.7, p.pos.z, 0, 0.35);
          continue;
        }
        if (p.behavior === 'lob') {
          const t = Math.min(1, (s.tick - p.launchedAt!) / (p.until - p.launchedAt!));
          const y = 0.6 + 4 * 2.5 * t * (1 - t);
          if (p.kind === 'popcorn') popcorns.add(p.pos.x, y, p.pos.z, time * 6, 1, undefined, time * 5);
          else if (p.kind === 'bomb') bombs.add(p.pos.x, y, p.pos.z, time * 5, 1, undefined, time * 7);
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
      for (const m of s.mines) {
        bananas.add(m.pos.x, 0.1, m.pos.z, m.id);
        bananas.add(m.pos.x, 0.18, m.pos.z, m.id + 0.5, 0.8);
        if (s.tick >= m.armedAt && Math.floor(time * 4) % 2 === 0) mineLights.add(m.pos.x, 0.32, m.pos.z);
      }
      for (const b of s.blasts) {
        blastRings.add(b.pos.x, 0.06, b.pos.z, 0, b.radius);
        blastFills.add(b.pos.x, 0.05, b.pos.z, 0, b.radius * Math.max(0.05, (s.tick - b.createdAt) / (b.at - b.createdAt)));
      }
      blastFills.end();
      for (const j of s.jetpacks) {
        jetItems.add(j.pos.x, 0.7 + Math.sin(time * 3 + j.id) * 0.12, j.pos.z, time * 1.5);
        jetGlow.add(j.pos.x, 0.12, j.pos.z, time * 1.5, 1 + 0.15 * Math.sin(time * 6));
      }
      for (const b of s.bubbles) {
        const left = Math.max(0, b.popAt - s.tick);
        gums.add(b.pos.x, 0.9, b.pos.z, 0, 2.5 * (1 + (left < 30 ? 0.12 * Math.sin(time * 40) : 0.04 * Math.sin(time * 4))));
      }
      jetGlowMat.emissiveIntensity = 2 * Math.min(theme.glow, 1.4);
      for (const p of extra) p.end();

      coins.begin();
      coinInner.begin();
      coinMat.emissiveIntensity = 0.35 * theme.glow;
      for (const c of s.coins) {
        // about to vanish: blink
        if (c.expiresAt - s.tick < 180 && Math.floor(time * 8) % 2 === 0) continue;
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

/** 16x16 pixel face of the token chest: purple with a gold star (original art). */
function makeCrateTexture(): THREE.CanvasTexture {
  const rows = [
    'oooooooooooooooo',
    'oppppppppppppppo',
    'opddddddddddddpo',
    'opdddddyydddddpo',
    'opdddddyydddddpo',
    'opddddyyyyddddpo',
    'opyyyyyyyyyyyypo',
    'opdyyyyyyyyyydpo',
    'opddyyyyyyyyddpo',
    'opdddyyyyyydddpo',
    'opddyyyyyyyyddpo',
    'opddyyydyyyyddpo',
    'opdyyydddyyyydpo',
    'opddddddddddddpo',
    'oppppppppppppppo',
    'oooooooooooooooo',
  ];
  const pal: Record<string, string> = { o: '#1b1440', p: '#b07cff', d: '#5a2fa8', y: '#ffc928' };
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
