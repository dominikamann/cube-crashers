import * as THREE from 'three';
import type { EnemyKind, SimEvent, SimState } from '../sim/types';
import { FLASH, glowMat, InstancedPool, lambert } from './pool';
import type { Theme } from './theme';
import { addMonsterParts, MONSTER_LIFT, RHINO_LIFT, RHINO_PARTS, WORM_PARTS } from './monster-parts';
import { voxelBody } from './voxel-body';
import { BOSS } from '../sim/systems/boss';
import { TREX } from '../sim/config/balance';
import { TICK_RATE } from '../sim/types';
import { palette } from './palette';
import { allBosses } from '../sim/util';
import { wallTop } from './world';

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
  shielder: { w: 0.75, h: 0.85, d: 0.6, day: 0x6f7d8c, night: 0x9fb2c8, eyeY: 0.6, eyeX: 0.16, eye: 0.12 },
  healer: { w: 0.55, h: 0.75, d: 0.55, day: 0x5fd38a, night: 0x7fffb0, eyeY: 0.55, eyeX: 0.12, eye: 0.12 },
  teleporter: { w: 0.55, h: 0.7, d: 0.55, day: 0x7a5cff, night: 0xa98cff, eyeY: 0.5, eyeX: 0, eye: 0.2 },
  croc: { w: 0.8, h: 0.5, d: 2.0, day: 0x3f9b4b, night: 0x5fe07a, eyeY: 0.48, eyeX: 0.22, eye: 0.13 },
  monkey: { w: 0.7, h: 0.9, d: 0.6, day: 0x9b6a3c, night: 0xc98a52, eyeY: 0.66, eyeX: 0.13, eye: 0.11 },
  fish: { w: 0.3, h: 0.4, d: 0.6, day: 0xffa23b, night: 0xffb85c, eyeY: 0.26, eyeX: 0.1, eye: 0.08 },
  shark: { w: 0.7, h: 0.6, d: 1.6, day: 0x6f8fb0, night: 0x8fb4dc, eyeY: 0.4, eyeX: 0.22, eye: 0.1 },
  kraken: { w: 3.0, h: 2.2, d: 2.6, day: 0xd04a8a, night: 0xff6ab0, eyeY: 1.5, eyeX: 0.6, eye: 0.45 },
  phantom: { w: 0.7, h: 0.85, d: 0.7, day: 0x6af0ff, night: 0x8ff8ff, eyeY: 0.6, eyeX: 0.15, eye: 0.14 },
  trex: { w: 1.1, h: 2.0, d: 2.2, day: 0x6a8f3a, night: 0x9fd35a, eyeY: 1.8, eyeX: 0.26, eye: 0.16 },
};

const CANDY_COLORS = [0xff4d6d, 0x4dd2ff, 0xffe14a, 0x7dff6b, 0xff8cf0, 0xff9f43];
const KINDS = Object.keys(ENEMY_LOOK) as EnemyKind[];

/** the tall-grass tiles of a map as a lookup, made once per map */
const grassTiles = new WeakMap<object, Set<number>>();
function grassAt(s: SimState, pos: { x: number; z: number }): boolean {
  const list = s.map.grass;
  if (!list) return false;
  let set = grassTiles.get(s.map);
  if (!set) grassTiles.set(s.map, (set = new Set(list.map(g => Math.floor(g.z) * s.map.w + Math.floor(g.x)))));
  return set.has(Math.floor(pos.z) * s.map.w + Math.floor(pos.x));
}
/** monsters that hop: they squash when they land */
const HOPPERS = new Set<EnemyKind>(['blob', 'splitter', 'splitling', 'healer', 'shielder', 'monkey']);

export interface Entities {
  update(s: SimState, theme: Theme, time: number, events: SimEvent[], frameDt: number): void;
  setDamageNumbers(on: boolean): void;
}

/** the Rhino: grey, long and heavy, with small eyes on its head */
const RHINO_LOOK = { w: 1, h: 0.9, d: 1.6, day: 0x8d9299, night: 0xa7aebb, eyeY: 0.56, eyeX: 0.2, eye: 0.1 };

/** `overlay` is drawn on top of the finished image (no post-processing), for text like damage numbers */
export function createEntities(scene: THREE.Scene, overlay: THREE.Scene): Entities {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bodyMats = new Map<EnemyKind, THREE.MeshLambertMaterial>();
  const bodies = new Map<EnemyKind, InstancedPool>();
  const faceAt = new Map<EnemyKind, number>();
  for (const k of KINDS) {
    const l = ENEMY_LOOK[k];
    const mat = lambert(l.day);
    // built from many small cubes, each a slightly different shade
    const body = voxelBody(k, l.w, l.h, l.d);
    mat.vertexColors = body.geometry.hasAttribute('color');
    // the big ones are drawn from both sides: a camera that ends up inside one sees its walls, not through it
    if (k === 'megaBlock' || k === 'kraken' || k === 'trex') mat.side = THREE.DoubleSide;
    bodyMats.set(k, mat);
    bodies.set(k, new InstancedPool(scene, body.geometry, mat, k === 'megaBlock' || k === 'trex' || k === 'croc' ? 16 : 128));
    // where the face is: the eyes sit on the body's surface there
    faceAt.set(k, body.frontAt(l.eyeX, l.eyeY - l.h / 2));
  }
  // the Rhino has a body of its own (in the rules it is a rammer)
  const rhinoShape = voxelBody('rhino', RHINO_LOOK.w, RHINO_LOOK.h, RHINO_LOOK.d);
  const rhinoMat = lambert(RHINO_LOOK.day);
  rhinoMat.vertexColors = true;
  rhinoMat.side = THREE.DoubleSide;
  const rhinoBodies = new InstancedPool(scene, rhinoShape.geometry, rhinoMat, 8);
  const rhinoFace = rhinoShape.frontAt(RHINO_LOOK.eyeX, RHINO_LOOK.eyeY - RHINO_LOOK.h / 2);
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
  // the shielder's shield, and the healer's green cross
  const shields = new InstancedPool(scene, new THREE.BoxGeometry(1.0, 0.95, 0.12), lambert(0xd8dde8), 128);
  const crosses = new InstancedPool(scene, new THREE.BoxGeometry(0.42, 0.13, 0.13), glowMat(0x5fff9a, 1.4), 256, false);
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
  // feet, arms, tails, wings: small voxels around the body (see monster-parts.ts)
  const partsLit = new InstancedPool(scene, unit, lambert(0xffffff), 2048);
  const partsGlow = new InstancedPool(scene, unit, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 512, false);
  // eyes that glow red the moment before an attack
  const angryEyes = new InstancedPool(scene, unit, redEyeMat, 256, false);
  const redEyes = new InstancedPool(scene, new THREE.BoxGeometry(0.28, 0.18, 0.06), redEyeMat, 64, false);
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

  /** when each monster was first drawn, for its pop-in */
  const bornAt = new Map<number, number>();
  /** 0..1 → a little past 1 and back: the pop-in curve */
  const popIn = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
  const bob = (id: number, time: number, amp: number) => Math.abs(Math.sin(time * 8 + id * 1.7)) * amp;

  const tmpFrom = new THREE.Vector3();
  // a boss roars while its blasts are telegraphed and strikes when they land: the sim only sets the time
  // of the next attack, so the moment it changes is the moment the attack began
  const bossCues = new Map<number, { attackAt: number; roarTime: number }>();
  let bossRoarTime = -1e9;

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
      rhinoMat.color.setHex(night > 0.5 ? RHINO_LOOK.night : RHINO_LOOK.day);
      rhinoBodies.begin();
      const pal = palette();
      eyeMat.color.setHex(night > 0.5 ? 0xffffff : pal.eyes);
      // colour-blind mode: angry eyes and warnings flash hard on and off instead of only being red
      const flash = Math.floor(time * 8) % 2 === 0;
      redEyeMat.color.setHex(pal.angryEyes);
      redEyeMat.emissive.setHex(pal.angryEyes);
      redEyeMat.emissiveIntensity = pal.blinkWarnings ? (flash ? 3 : 0.3) * Math.min(theme.glow, 1.4) : 1.6;
      warnMat.color.setHex(pal.warn);
      hostileMat.color.setHex(pal.hostileShot);
      hostileMat.emissive.setHex(pal.hostileShot);
      boltMat.color.setHex(pal.playerShot);
      boltMat.emissive.setHex(pal.playerShot);
      eyeMat.emissive.copy(eyeMat.color);
      eyeMat.emissiveIntensity = 1.3 * Math.min(theme.glow, 1.5);
      boomerangMat.emissiveIntensity = 1.5 * theme.glow;
      boltMat.emissiveIntensity = 3 * theme.glow;
      eyes.begin();
      pupils.begin();
      plates.begin();
      const leapOf = (id: number) => allBosses(s).find(b => b.enemyId === id)?.leap ?? null;
      const heads = new Set(allBosses(s).flatMap(b => b.worms.map(w => w[0])));
      // where each segment sits in its worm: [index, length]
      const wormAt = new Map<number, [number, number]>();
      for (const b of allBosses(s)) for (const w of b.worms) w.forEach((id, i) => wormAt.set(id, [i, w.length]));
      const extra = [shields, crosses, bossHorns, redEyes, eliteRings, horns, fuses, lanes, blastRings, hostile, bananas, mineLights, bombs, jetGlow, gums, saws, peps, ice];
      for (const p of extra) p.begin();
      blastFills.begin();
      warnMat.opacity = pal.blinkWarnings ? (flash ? 0.7 : 0.12) : 0.35 + 0.25 * Math.abs(Math.sin(time * 14));
      tmpFrom.y = 0.06;

      const slowed = (until: number) => until > s.tick;
      angryEyes.begin();
      partsLit.begin();
      partsGlow.begin();
      const isNight = theme.pointLights > 0.5;
      const awake = s.players.filter(p => p.downUntil === null);
      // every boss has its own cue (two of them in a brawl), by its body's id
      const cueOf = new Map<number, number>();
      for (const b of allBosses(s)) {
        const key = b.enemyId ?? b.worms[0]?.[0] ?? -1;
        let c = bossCues.get(key);
        // the first frame of a fight only arms the timer (no roar at spawn)
        if (!c) bossCues.set(key, (c = { attackAt: b.nextAttackAt, roarTime: -1e9 }));
        if (b.nextAttackAt !== c.attackAt) {
          c.roarTime = time;
          c.attackAt = b.nextAttackAt;
        }
        const since = time - c.roarTime;
        const cue = since < BOSS.warnTicks / TICK_RATE ? 1 : since < BOSS.warnTicks / TICK_RATE + 0.4 ? 2 : 0;
        for (const id of [b.enemyId, ...b.worms.flat()]) if (id !== null) cueOf.set(id, cue);
        if (b === allBosses(s)[0]) bossRoarTime = c.roarTime;
      }
      const sinceRoar = time - bossRoarTime;
      // King Rex leans back into the roar slowly and comes out of it slowly: at boss size a sudden tilt swings the whole screen
      const roarSeconds = BOSS.warnTicks / TICK_RATE;
      const roarEase = Math.min(1, sinceRoar / 0.35, Math.max(0, roarSeconds - sinceRoar) / 0.3);
      for (const e of s.enemies) {
        // King Rex is a T-Rex grown to boss size
        const kingRex = allBosses(s).some(b => b.kind === 'rex' && b.enemyId === e.id);
        const rhinoBoss = e.kind === 'rammer' && allBosses(s).some(b => b.kind === 'rhino' && b.enemyId === e.id);
        const l = rhinoBoss ? RHINO_LOOK : ENEMY_LOOK[e.kind];
        const boss = e.kind === 'wormSegment' || e.kind === 'megaBlock' || e.kind === 'kraken' || kingRex || rhinoBoss;
        // in the jungle's tall grass a monster cannot be seen until you are close
        if (grassAt(s, e.pos) && Math.min(Infinity, ...awake.map(p => Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z))) > 3.5 && (flashUntil.get(e.id) ?? 0) <= time) continue;
        // a glitch ghost is hard to see from afar: it flickers in and out, jumping about, until it is close
        if (e.kind === 'phantom') {
          const near = Math.min(Infinity, ...awake.map(p => Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z)));
          const seen = near < 4 || (Math.floor(time * 12 + e.id * 3.1) % 5 === 0 && Math.sin(time * 7 + e.id) > -0.3);
          if (!seen && (flashUntil.get(e.id) ?? 0) <= time) continue;
        }
        // a new monster pops out of the floor with a little overshoot
        let born = bornAt.get(e.id);
        if (born === undefined) bornAt.set(e.id, (born = time));
        const pop = boss ? 1 : popIn(Math.min(1, (time - born) / 0.3));
        // hurt monsters have lost some of their pixels: they shrink a little (bosses keep their size)
        const worn = boss ? 1 : 0.72 + 0.28 * Math.max(0, e.hp / e.maxHp);
        // the Rhino: a rammer grown to boss size
        // the worm: a big head, a body that tapers into the tail
        const seg = e.kind === 'wormSegment' ? wormAt.get(e.id) : undefined;
        const fromTail = seg ? seg[1] - 1 - seg[0] : 0;
        const wormScale = seg ? (seg[0] === 0 ? 1.3 : fromTail < 3 ? 0.66 + 0.12 * fromTail : 1) : 1;
        const scale = (kingRex ? 2.4 : rhinoBoss ? 2.5 : e.elite ? 1.4 : wormScale) * worn * pop;
        const held = e.frozenUntil > s.tick || e.stuckUntil > s.tick || e.state === 'stunned';
        // squash and stretch: hoppers squash when they land and stretch on the way up; swarmers flap
        const hop = Math.abs(Math.sin(time * 8 + e.id * 1.7));
        // a T-Rex that has just stomped, a boss between its roar and its strike
        const stomped = e.kind === 'trex' && e.cooldownUntil - s.tick > TREX.cooldownTicks - 20;
        const attack = e.state === 'windup' ? 1 : e.state === 'charge' || stomped ? 2 : boss ? (cueOf.get(e.id) ?? 0) : 0;
        // Mega Block rears up on its roar and comes down flat on the stomp
        const squash = HOPPERS.has(e.kind) && !held ? 0.84 + 0.26 * hop : e.kind === 'megaBlock' && attack === 2 ? 0.8 : e.kind === 'megaBlock' && attack === 1 ? 1.1 : 1;
        const flap = e.kind === 'swarmer' ? 1 + 0.35 * Math.sin(time * 34 + e.id) : 1;
        const sxz = 1 / Math.sqrt(squash);
        // the teleporter floats; fish and sharks swim a little above the sea bed
        const hover = e.kind === 'teleporter' ? 0.25 + 0.1 * Math.sin(time * 3 + e.id) : e.kind === 'fish' || e.kind === 'shark' ? 0.45 + 0.12 * Math.sin(time * 2.5 + e.id) : e.kind === 'megaBlock' && leapOf(e.id) ? Math.sin(Math.PI * Math.min(1, (s.tick - leapOf(e.id)!.start) / (leapOf(e.id)!.land - leapOf(e.id)!.start))) * 3.2 : e.kind === 'megaBlock' && attack === 1 ? 0.35 : 0;
        const y = (l.h / 2) * scale * squash + (rhinoBoss ? RHINO_LIFT : (MONSTER_LIFT[e.kind] ?? 0)) * scale + hover + (e.kind === 'swarmer' ? 1.3 + Math.sin(time * 9 + e.id) * 0.25 : held ? 0 : seg ? 0.06 + 0.1 * (1 + Math.sin(time * 6 - seg[0] * 0.9)) : bob(e.id, time, e.kind === 'tank' || e.kind === 'rammer' ? 0.06 : 0.2));
        const yaw = Math.atan2(e.dir.x, e.dir.z);
        const winding = e.state === 'windup' || e.state === 'fuse';
        const flashing = (flashUntil.get(e.id) ?? 0) > time;
        // lean into a run or a charge, rear back before one (the Rhino lowers its head and points its horn ahead); a hit makes it wobble; a tank sways under its weight
        // a T-Rex throws its head back for the roar
        const lean = held ? 0 : rhinoBoss && (e.state === 'charge' || winding) ? (winding ? 0.16 : 0.26) : e.state === 'charge' ? 0.4 : e.kind === 'rammer' && winding ? -0.18 : e.kind === 'hunter' ? 0.22 : e.kind === 'trex' && attack === 1 ? (boss ? -0.08 * roarEase : -0.22) : e.kind === 'trex' && attack === 2 ? (boss ? 0.06 : 0.15) : 0;
        const tilt = (flashing ? Math.sin(time * 45) * 0.2 : 0) + ((e.kind === 'tank' || e.kind === 'trex') && !held ? Math.sin(time * 3 + e.id) * (boss ? 0.02 : 0.05) : 0);
        // maze ghosts turn blue (and blink as the power runs out) while they can be crashed
        const maze = s.run.maze;
        const scared = e.kind === 'ghost' && maze && s.tick < maze.powerUntil;
        const blinkOut = scared && maze!.powerUntil - s.tick < 120 && Math.floor(time * 8) % 2 === 0;
        // a teleporter about to blink flickers
        const blinking = e.kind === 'teleporter' && winding && Math.floor(time * 20) % 2 === 0;
        const tint = flashing || blinking ? FLASH : scared ? (blinkOut ? 0xffffff : 0x3d6bff) : e.state === 'stunned' ? 0x777777 : slowed(e.slowUntil) && e.kind !== 'ghost' ? 0x9fe8ff : undefined;
        const pulse = winding ? 1 + 0.12 * Math.abs(Math.sin(time * (e.state === 'fuse' ? 40 : 20))) : 1;
        (rhinoBoss ? rhinoBodies : bodies.get(e.kind)!).addScaled(e.pos.x, y * pulse, e.pos.z, yaw, scale * pulse * sxz * flap, scale * pulse * squash, scale * pulse * sxz, tint, lean, tilt);
        addMonsterParts(partsLit, partsGlow, e.kind, isNight ? l.night : l.day, e.id, {
          x: e.pos.x, y: y * pulse, z: e.pos.z, yaw,
          sx: scale * pulse * sxz, sy: scale * pulse * squash, sz: scale * pulse * sxz,
          lean, tilt, tint, phase: time * 8 + e.id * 1.7, time, still: held || winding,
          attack,
        }, rhinoBoss ? RHINO_PARTS : seg ? WORM_PARTS[seg[0] === 0 ? 'head' : fromTail === 0 ? 'tail' : 'body'] : undefined);
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
        if (e.kind === 'croc' && (e.state === 'windup' || e.state === 'charge')) {
          tmpFrom.set(e.pos.x, 0.06, e.pos.z);
          lanes.addStretched(tmpFrom, yaw, e.radius * 2, e.state === 'charge' ? e.chargeLeft : 5.5);
        }
        if (e.kind === 'rammer') {
          if (!rhinoBoss) for (const side of [-1, 1]) horns.add(e.pos.x + Math.cos(yaw) * side * 0.4 + Math.sin(yaw) * 0.6, y + 0.1, e.pos.z - Math.sin(yaw) * side * 0.4 + Math.cos(yaw) * 0.6, yaw, scale);
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
        if (e.kind === 'shielder') {
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          shields.add(e.pos.x + fx * (l.d / 2 + 0.12) * scale, y, e.pos.z + fz * (l.d / 2 + 0.12) * scale, yaw, scale);
        }
        if (e.kind === 'healer') {
          const top = y + (l.h / 2) * scale + 0.25;
          crosses.add(e.pos.x, top, e.pos.z, time * 2, scale);
          crosses.add(e.pos.x, top, e.pos.z, time * 2 + Math.PI / 2, scale);
        }
        const ey = y - (l.h / 2 - l.eyeY) * scale * squash;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const front = ((rhinoBoss ? rhinoFace : faceAt.get(e.kind)!) + 0.02) * scale * sxz;
        // a blink every few seconds; the pupils follow the nearest player
        const blink = (time + e.id * 0.37) % 4 < 0.12 ? 0.12 : 1;
        let look = 0;
        let nearest = Infinity;
        for (const p of awake) {
          const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < nearest && d > 1e-3) {
            nearest = d;
            look = Math.max(-1, Math.min(1, (dx * fz - dz * fx) / d));
          }
        }
        for (const side of l.eyeX === 0 ? [0] : [-1, 1]) {
          const ox = side * l.eyeX * scale;
          const ex = e.pos.x + fx * front + fz * ox, ez = e.pos.z + fz * front - fx * ox;
          const size = l.eye * scale;
          if (winding || attack === 1) angryEyes.addScaled(ex, ey, ez, yaw, size, size * 0.7, size);
          else eyes.addScaled(ex, ey, ez, yaw, size, size * blink, size);
          const px = look * l.eye * 0.25 * scale;
          pupils.addScaled(ex + fx * 0.03 + fz * px, ey - l.eye * 0.15 * scale * blink, ez + fz * 0.03 - fx * px, yaw, size * 0.5, size * 0.5 * blink, size * 0.5);
        }
      }
      for (const k of KINDS) bodies.get(k)!.end();
      rhinoBodies.end();
      // the Kraken's grab: a tentacle from its body to the player it holds, wriggling as it drags them in
      const grabber = allBosses(s).find(b => b.kind === 'kraken' && b.grab);
      const grab = grabber?.grab ?? null;
      const kraken = grab ? s.enemies.find(e => e.id === grabber!.enemyId) : undefined;
      const held = grab ? s.players.find(p => p.id === grab.playerId) : undefined;
      if (kraken && held) {
        const dx = held.pos.x - kraken.pos.x, dz = held.pos.z - kraken.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const look = ENEMY_LOOK.kraken;
        const color = theme.pointLights > 0.5 ? look.night : look.day;
        const n = Math.max(4, Math.round(d / 0.45));
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const wave = Math.sin(time * 14 - t * 9) * 0.3 * (1 - t * 0.5);
          const x = kraken.pos.x + dx * t - (dz / d) * wave, z = kraken.pos.z + dz * t + (dx / d) * wave;
          const size = 0.62 - 0.32 * t;
          partsLit.addScaled(x, 0.55 + 0.45 * Math.sin(Math.PI * t), z, Math.atan2(dx, dz), size, size, 0.5, i === n ? 0xffd0e4 : color);
        }
      }
      for (const p of [eyes, pupils, plates, angryEyes]) p.end();
      // forget monsters that are gone
      if (bornAt.size > 600) {
        const alive = new Set(s.enemies.map(e => e.id));
        for (const id of bornAt.keys()) if (!alive.has(id)) bornAt.delete(id);
      }
      hostileMat.emissiveIntensity = 4 * Math.min(theme.glow, 1.4);

      for (const p of [bolts, candies, hotdogs, boomerangs, popcorns, puddles]) p.begin();
      for (const p of s.projectiles) {
        if (p.hostile) {
          // colour-blind mode: monster shots are also bigger than the players' bolts
          hostile.add(p.pos.x, 0.7, p.pos.z, time * 8, pal.blinkWarnings ? 1.35 : 1, undefined, time * 6);
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
        if (p.kind === 'bubblegumBazooka' || p.kind === 'bubbleWand') {
          gums.add(p.pos.x, 0.7, p.pos.z, 0, p.kind === 'bubbleWand' ? 0.25 + 0.03 * Math.sin(time * 12) : 0.35);
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
      if (s.heart && s.run.stage === 'floor') {
        // the hidden heart on its wall top: a small red heart of cubes that turns and bobs
        const h = s.heart.pos, rot = time * 1.5, c = Math.cos(rot), sn = Math.sin(rot);
        const y0 = wallTop(s.map, h.x, h.z) + 0.75 + Math.sin(time * 3) * 0.1;
        const put = (lx: number, ly: number, w: number, hh: number) => partsGlow.addScaled(h.x + lx * c, y0 + ly, h.z - lx * sn, rot, w, hh, 0.2, 0xff3b6b);
        put(-0.17, 0.2, 0.3, 0.26);
        put(0.17, 0.2, 0.3, 0.26);
        put(0, 0.02, 0.62, 0.24);
        put(0, -0.18, 0.36, 0.2);
        put(0, -0.34, 0.14, 0.14);
      }
      for (const j of s.jetpacks) {
        // a little jetpack built from cubes: it floats, turns slowly, its burners flicker and sparks rise from the pad
        const rot = time * 1.2 + j.id, c = Math.cos(rot), sn = Math.sin(rot);
        const y0 = 0.95 + Math.sin(time * 3 + j.id) * 0.12;
        const put = (pool: InstancedPool, lx: number, ly: number, lz: number, w: number, h: number, d: number, color: number) =>
          pool.addScaled(j.pos.x + lx * c + lz * sn, y0 + ly, j.pos.z - lx * sn + lz * c, rot, w, h, d, color);
        const flick = 0.1 + 0.1 * Math.abs(Math.sin(time * 23 + j.id));
        for (const side of [-1, 1]) {
          put(partsLit, side * 0.17, 0, 0, 0.2, 0.55, 0.2, 0xd0d4e0);
          put(partsLit, side * 0.17, 0.32, 0, 0.16, 0.1, 0.16, 0xff5a5f);
          put(partsLit, side * 0.17, -0.33, 0, 0.14, 0.12, 0.14, 0x2a2a35);
          put(partsLit, side * 0.34, 0.05, 0.03, 0.14, 0.22, 0.04, 0xff5a5f);
          put(partsLit, side * 0.1, 0.05, -0.12, 0.05, 0.42, 0.04, 0x8a5a2b);
          put(partsGlow, side * 0.17, -0.42 - flick / 2, 0, 0.1, flick, 0.1, 0xff9f2e);
          put(partsGlow, side * 0.17, -0.41 - flick / 4, 0, 0.05, flick / 2, 0.05, 0xfff2a0);
        }
        put(partsLit, 0, 0.02, 0, 0.16, 0.36, 0.16, 0x444455);
        put(partsGlow, 0, 0.12, -0.09, 0.07, 0.07, 0.03, 0x2bf0ff);
        // the pad underneath, and sparks spiralling up from it
        jetGlow.add(j.pos.x, 0.08, j.pos.z, time * 1.5, 1.3 + 0.15 * Math.sin(time * 6));
        for (let i = 0; i < 5; i++) {
          const t = (time * 0.6 + i / 5 + j.id * 0.13) % 1;
          const a = time * 2 + (i * Math.PI * 2) / 5;
          const size = 0.07 * (1 - t);
          partsGlow.addScaled(j.pos.x + Math.cos(a) * 0.45, 0.15 + t * 1.5, j.pos.z + Math.sin(a) * 0.45, a, size, size, size, i % 2 ? 0xff9f2e : 0xfff2a0);
        }
      }
      for (const b of s.bubbles) {
        const left = Math.max(0, b.popAt - s.tick);
        gums.add(b.pos.x, 0.9, b.pos.z, 0, 2.5 * (1 + (left < 30 ? 0.12 * Math.sin(time * 40) : 0.04 * Math.sin(time * 4))));
      }
      partsLit.end();
      partsGlow.end();
      jetGlowMat.emissiveIntensity = 1.2 * Math.min(theme.glow, 1.4);
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
