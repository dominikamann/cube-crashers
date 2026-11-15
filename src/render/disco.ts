import * as THREE from 'three';
import { DISCO } from '../sim/config/weapons';
import type { SimEvent, SimState, Vec2 } from '../sim/types';
import { ENEMY_LOOK } from './entities';
import { InstancedPool } from './pool';

/** the colours of its light */
export const DISCO_COLORS = [0xff3df0, 0x3df0ff, 0xffe53d, 0x5dff6a, 0xff8a3d, 0x9a6bff];
/** its light moves to the beat of its track (see the disco track in audio/music.ts) */
const BEATS_PER_SECOND = 126 / 60;
/** the ball rises for this long (its beams leave it at once, as it goes up: the hit is at once too) */
const RISE = 0.2;
/** a beam: its head flies from the ball to its target, it stands for a moment, then its tail follows the head in */
export const ZAP = { out: 0.07, hold: 0.3, in: 0.1, apart: 0.02 };
/** no more beams than this are drawn at a time, however many balls are up (and half as many on low graphics) */
export const MAX_DISCO_BEAMS = 24;
/** a jump in the game's clock that is a cut to another time, not a late frame */
const CUT_TICKS = 30;
/** how far in front of whoever threw it the ball hangs, and how high */
const AHEAD = 2.8, HEIGHT = 2.1;
const RADIUS = 0.4;
/** how much higher it hangs while its thrower is up on a jetpack (as their shots leave from up there) */
const FLY_LIFT = 2.5;
const airUp = (p: { flying: boolean; descent?: number }) => p.flying || (p.descent ?? 0) > 0;

/** Which part of the line from the ball (0) to the target (1) a beam of this age covers; null before it leaves and once it is gone. */
export function zapSpan(age: number): { from: number; to: number } | null {
  if (age < 0 || age >= ZAP.out + ZAP.hold + ZAP.in) return null;
  const smooth = (k: number) => k * k * (3 - 2 * k);
  return { from: age <= ZAP.out + ZAP.hold ? 0 : smooth((age - ZAP.out - ZAP.hold) / ZAP.in), to: age >= ZAP.out ? 1 : smooth(age / ZAP.out) };
}

interface Zap {
  id: number;
  rival: boolean;
  x: number;
  y: number;
  z: number;
  /** seconds since it left the ball (negative: still waiting for its turn) */
  age: number;
  tint: number;
  landed: boolean;
}

interface Ball {
  ownerId: number;
  x: number;
  z: number;
  age: number;
  /** seconds until it bursts */
  left: number;
  glitter: number;
  /** how far up it rides with whoever threw it (a jetpack takes it along) */
  lift: number;
  zaps: Zap[];
}

/** what the show borrows from the other effects: glitter, and a flash of light at a spot */
export interface DiscoFx {
  burst(pos: Vec2, y: number, count: number, colors: number[], speed: number, size: number, up?: number): void;
  flash(x: number, y: number, z: number, size: number, color: number, life: number, ring: boolean): void;
}

export interface DiscoShow {
  update(s: SimState, events: SimEvent[], dt: number): void;
  /** low graphics: fewer spots, glints and beams, no shafts of light */
  setLow(low: boolean): void;
  /** the light it throws on what is around it right now: where, in which colour and how strongly (0 with no ball up) */
  light(): { x: number; z: number; color: number; k: number };
}

/** a darker tone of a colour: light that is added to the picture is fainter the darker it is */
function dim(color: number, k: number): number {
  return (Math.round(((color >> 16) & 255) * k) << 16) | (Math.round(((color >> 8) & 255) * k) << 8) | Math.round((color & 255) * k);
}

/**
 * The Disco Ball's show: a mirror ball that hangs in front of whoever threw it and turns, beams that shoot out
 * of it to everything it hit, spots of coloured light that sweep the floor round it. Everything is drawn from
 * a few pools that are made once; nothing is made while it runs.
 */
export function createDisco(scene: THREE.Scene, fx: DiscoFx): DiscoShow {
  // light that is added to the picture (it glows in the dark and all but vanishes on a floor in daylight), and
  // plain bright colour that shows on anything
  const light = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const bright = () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  // the ball: a sphere of square mirror tiles, each brighter or darker than the next
  const tiles = new THREE.SphereGeometry(RADIUS, 14, 9).toNonIndexed();
  {
    const at = tiles.getAttribute('position');
    const shade = new Float32Array(at.count * 3);
    for (let f = 0; f < at.count / 3; f++) {
      // (the two halves of a tile lie in the same row and column)
      const x = (at.getX(f * 3) + at.getX(f * 3 + 1) + at.getX(f * 3 + 2)) / 3, y = (at.getY(f * 3) + at.getY(f * 3 + 1) + at.getY(f * 3 + 2)) / 3, z = (at.getZ(f * 3) + at.getZ(f * 3 + 1) + at.getZ(f * 3 + 2)) / 3;
      const row = Math.floor((Math.acos(Math.max(-1, Math.min(1, y / RADIUS))) / Math.PI) * 9), col = Math.floor((Math.atan2(z, x) / (Math.PI * 2) + 1) * 14) % 14;
      const k = 0.3 + 0.7 * Math.abs((Math.sin(row * 12.9898 + col * 78.233) * 43758.5453) % 1);
      for (let v = 0; v < 3; v++) shade.set([k, k, Math.min(1, k * 1.06)], (f * 3 + v) * 3);
    }
    tiles.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  }
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x5a6384, roughness: 0.2, metalness: 0.15, flatShading: true, vertexColors: true });
  const balls = new InstancedPool(scene, tiles, ballMat, 10);
  const halos = new InstancedPool(scene, new THREE.IcosahedronGeometry(0.5, 1), light(), 48, false);
  const glints = new InstancedPool(scene, new THREE.OctahedronGeometry(0.5), bright(), 80, false);
  const beam = new THREE.CylinderGeometry(0.05, 0.05, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  const cores = new InstancedPool(scene, beam, bright(), 32, false);
  const rays = new InstancedPool(scene, beam, light(), 128, false);
  // (a spot on the floor colours it, in daylight too: it is laid over it, not added to it)
  const spots = new InstancedPool(scene, new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }), 96, false);
  const pools = [balls, halos, glints, cores, rays, spots];
  // where the tiles sit that glint, as directions from the middle of the ball
  const GLINTS = Array.from({ length: 7 }, (_, k) => {
    const y = 0.75 - (k / 6) * 1.3, r = Math.sqrt(1 - y * y), a = k * 2.4;
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
  });

  const list: Ball[] = [];
  const from = new THREE.Vector3();
  const glow = { x: 0, z: 0, color: 0xffffff, k: 0 };
  let low = false;
  let lastTick = 0;

  return {
    update(s, events, dt) {
      // another time is shown (the kill cam begins or ends): a ball of the time before does not hang on in it
      if (Math.abs(s.tick - lastTick) > CUT_TICKS) list.length = 0;
      lastTick = s.tick;
      for (const e of events) {
        if (e.type !== 'discoZap') continue;
        const who = s.players.find(p => p.id === e.playerId);
        const front = who ? { x: e.pos.x + who.aim.x * 1.4, z: e.pos.z + who.aim.z * 1.4 } : e.pos;
        // a glittering flash just in front of the shooter when it is thrown: seen from above and in first person alike
        if (!e.pulse) fx.burst(front, 1.3, 14, DISCO_COLORS, 3.5, 0.08, 0.35);
        // one ball for each player: thrown again while it is still up, it stays and lets new beams go
        let ball = list.find(b => b.ownerId === e.playerId);
        if (!ball) {
          ball = { ownerId: e.playerId, x: front.x, z: front.z, age: 0, left: 0, glitter: 0, lift: who && airUp(who) ? FLY_LIFT : 0, zaps: [] };
          list.push(ball);
        }
        // (thrown anew: it hangs on for the whole show again; a later burst of the same ball changes nothing)
        if (!e.pulse) ball.left = DISCO.show;
        const targets = [...e.enemies, ...e.rivals];
        for (let k = 0; k < targets.length && ball.zaps.length < MAX_DISCO_BEAMS; k++) {
          ball.zaps.push({ id: targets[k], rival: k >= e.enemies.length, x: e.at[k].x, y: 0.6, z: e.at[k].z, age: -k * ZAP.apart, tint: k, landed: false });
        }
      }

      for (const p of pools) p.begin();
      glow.k = 0;
      let drawn = 0;
      const maxBeams = low ? MAX_DISCO_BEAMS / 2 : MAX_DISCO_BEAMS;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.age += dt;
        b.left -= dt;
        // it stays with whoever threw it, floating after them
        const owner = s.players.find(p => p.id === b.ownerId);
        // (and goes with them: when they fall it bursts where it hangs, and is not there where they come back)
        if (owner && owner.downUntil !== null) b.left = 0;
        else if (owner) {
          const k = 1 - Math.exp(-dt * 9);
          b.x += (owner.pos.x + owner.aim.x * AHEAD - b.x) * k;
          b.z += (owner.pos.z + owner.aim.z * AHEAD - b.z) * k;
          // (up on a jetpack it goes up with them, and shoots its beams down from there)
          b.lift += ((airUp(owner) ? FLY_LIFT : 0) - b.lift) * (1 - Math.exp(-dt * 5));
        }
        const rise = Math.min(1, b.age / RISE);
        const y = b.lift + 1.1 + (HEIGHT - 1.1) * (1 - (1 - rise) ** 2) + 0.07 * Math.sin(b.age * 4);
        if (b.left <= 0) {
          // it bursts into glitter
          fx.burst({ x: b.x, z: b.z }, y, 22, [...DISCO_COLORS, 0xffffff], 4.5, 0.1, 0.6);
          fx.flash(b.x, y, b.z, 1.6, 0xffffff, 0.16, false);
          list.splice(i, 1);
          continue;
        }
        // the beat: a kick that dies away until the next one
        const beats = b.age * BEATS_PER_SECOND, beat = Math.floor(beats), pulse = Math.exp(-(beats - beat) * 4);
        // (it fades in as it rises and out before it bursts)
        const shine = rise * Math.min(1, b.left / 0.35);
        const color = DISCO_COLORS[beat % DISCO_COLORS.length];
        // the ball turns, a little faster with every beat, in a halo of the beat's colour; some of its tiles glint
        const spin = b.age * 2.4 + 0.25 * (beat + 1 - pulse);
        balls.add(b.x, y, b.z, spin, (0.5 + 0.5 * rise) * (1 + 0.07 * pulse), undefined, 0, 0.22);
        halos.add(b.x, y, b.z, 0, 1.25 + 0.4 * pulse, dim(color, (0.2 + 0.25 * pulse) * shine));
        const cos = Math.cos(spin), sin = Math.sin(spin);
        for (let k = 0; k < (low ? 3 : GLINTS.length); k++) {
          // (a tile flares up as it turns into the light, and is dark again)
          const g = GLINTS[k];
          const flare = Math.max(0, Math.sin(spin * 2.2 + k * 1.9)) ** 8 * shine;
          if (flare < 0.05) continue;
          glints.add(b.x + (g.x * cos + g.z * sin) * RADIUS, y + g.y * RADIUS, b.z + (g.z * cos - g.x * sin) * RADIUS, spin + k, 0.34 * flare, k % 2 ? DISCO_COLORS[(beat + k) % DISCO_COLORS.length] : 0xffffff, 0.6);
        }
        b.glitter -= dt;
        if (b.glitter <= 0) {
          b.glitter = 0.12;
          fx.burst({ x: b.x, z: b.z }, y, 1, [0xffffff, ...DISCO_COLORS], 2, 0.06, 0.2);
        }
        if (glow.k < pulse * shine) {
          glow.x = b.x;
          glow.z = b.z;
          glow.color = color;
          glow.k = pulse * shine;
        }

        // spots of light sweep the floor round it, each at the end of a faint shaft from the ball
        from.set(b.x, y, b.z);
        const n = low ? 4 : 10;
        for (let k = 0; k < n; k++) {
          const a = (k % 2 ? -1 : 1) * b.age * 0.9 + k * 2.4;
          const r = 1.5 + 2.9 * (0.5 + 0.5 * Math.sin(b.age * 1.3 + k * 2.1));
          const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
          const tint = DISCO_COLORS[(k + beat) % DISCO_COLORS.length];
          // (round right under the ball, drawn out the further off they fall; they swell with the beat)
          const size = (0.85 + 0.15 * pulse) * shine;
          spots.addScaled(x, 0.05, z, -a, (0.62 + r * 0.18) * size, 1, 0.62 * size, tint);
          if (low) continue;
          const flat = Math.hypot(x - b.x, z - b.z), len = Math.hypot(flat, y);
          rays.addBeam(from, Math.atan2(x - b.x, z - b.z), Math.asin(y / len), len, dim(tint, 0.16 * shine), 0.8);
        }

        // its beams: out of the ball, onto everything it hit
        for (let k = b.zaps.length - 1; k >= 0; k--) {
          const zap = b.zaps[k];
          zap.age += dt;
          const span = zapSpan(Math.max(0, zap.age));
          if (!span) {
            b.zaps.splice(k, 1);
            continue;
          }
          if (zap.age < 0) continue;
          // (it follows its target while that is still there, and ends where it stood when it is not)
          const rival = zap.rival ? s.players.find(p => p.id === zap.id) : undefined;
          const enemy = zap.rival ? undefined : s.enemies.find(en => en.id === zap.id);
          const at = rival ?? enemy;
          if (at) {
            zap.x = at.pos.x;
            zap.z = at.pos.z;
            // (into the middle of the body, a big boss's too: its size goes by how wide it stands, not by its kind's look)
            zap.y = rival ? (airUp(rival) ? 3.3 : 0.9) : Math.max(ENEMY_LOOK[enemy!.kind].h * 0.55, enemy!.radius * 1.3);
          }
          const tint = DISCO_COLORS[(zap.tint + beat) % DISCO_COLORS.length];
          if (!zap.landed && span.to >= 1) {
            // it lands: a flash on the monster, a ring on the floor under it, sparks
            zap.landed = true;
            fx.flash(zap.x, zap.y, zap.z, 1.3, tint, 0.16, false);
            if (!low) fx.flash(zap.x, 0.06, zap.z, 1.8, tint, 0.3, true);
            fx.burst({ x: zap.x, z: zap.z }, zap.y, 5, [tint, 0xffffff], 3, 0.07, 0.5);
          }
          if (drawn >= maxBeams) continue;
          drawn++;
          const dx = zap.x - b.x, dy = zap.y - y, dz = zap.z - b.z;
          const len = Math.hypot(dx, dy, dz) || 0.001;
          const yaw = Math.atan2(dx, dz), pitch = -Math.asin(dy / len);
          from.set(b.x + dx * span.from, y + dy * span.from, b.z + dz * span.from);
          const flicker = 0.8 + 0.2 * Math.sin(zap.age * 90 + k);
          // a bright core in a wider glow of its colour
          cores.addBeam(from, yaw, pitch, len * (span.to - span.from), tint, 1.1 * flicker);
          if (!low) rays.addBeam(from, yaw, pitch, len * (span.to - span.from), dim(tint, 0.35), 2.8 * flicker);
          // (and a spark of light where it is on the monster)
          if (span.to >= 1) halos.add(zap.x, zap.y, zap.z, 0, 0.45 * flicker, dim(tint, 0.7));
        }
      }
      for (const p of pools) p.end();
    },
    setLow(v) {
      low = v;
    },
    light: () => glow,
  };
}
