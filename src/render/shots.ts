import * as THREE from 'three';
import { CANDY, falloff, MAGNET, MINE, SWATTER, SWORD } from '../sim/config/weapons';
import { Tile, tileAt } from '../sim/map/tilemap';
import { shotHeight } from '../sim/systems/shot-height';
import { TICK_RATE, type DamageSource, type Player, type Projectile, type SimEvent, type SimState, type Vec2 } from '../sim/types';
import { BLADE_COLORS, bladeFlicker, bladeReach, bladeStep } from './blade';
import { palette } from './palette';
import { InstancedPool } from './pool';
import type { Theme } from './theme';

/** the colours of the sweets the Candy Cannon fires */
export const CANDY_COLORS = [0xff4d6d, 0x4dd2ff, 0xffe14a, 0x7dff6b, 0xff8cf0, 0xff9f43];
/** a ball of fire as it burns out: white-hot, yellow, orange, red, then smoke */
const FIRE_RAMP = [0xfff6c0, 0xffd040, 0xffb020, 0xff8a1a, 0xff5a14, 0xd83a14, 0x8a2a1a, 0x4a3a3c, 0x2e2a30];
const KETCHUP = [0xd8261c, 0xb81a14, 0xff4a3a];
const MUSTARD = [0xffd400, 0xffe76a, 0xe0a800];
/** the sword's slash from its edge to its tail */
const SLASH_RAMP = [0xffffff, 0xffe0fa, 0xffa6f0, 0xff6be6, 0xff3bd9, 0xff2bd6, 0xe022c4, 0xc01cb0, 0x9c1a9c, 0x7a1890, 0x5c1478, 0x400f5c];
/** a line the sword burnt into a wall as it cools: white-hot, pink, deep red, a dark scar, gone */
const SCORCH_RAMP = [0xffffff, 0xffc8f4, 0xff5ae0, 0xd02aa8, 0x8a1a6a, 0x4a1438, 0x2e1424, 0x241820];
const RAIL_RAMP = [0xffffff, 0xd8fdff, 0x9ff8ff, 0x5fe0ff, 0x3aa8ff];
/** no more bits of light than this fly at a time */
export const MAX_PIXELS = 700;
/** a jump in the game's clock that is a cut to another time, not a late frame */
const CUT_TICKS = 30;
/** how long each of these is on show, in seconds */
const SLASH_SECONDS = 0.2, SWAT_SECONDS = 0.24, RAIL_SECONDS = 0.34, MAGNET_SECONDS = 0.4, CUT_SECONDS = 0.14, SCORCH_SECONDS = 1.6, CRACKLE_SECONDS = 0.14;
/** the part of a slash in which the blade sweeps through the arc (the rest, its trail fades) */
const SWEEP = 0.7;
/** where a blade in a swing starts, out from the middle of whoever swings it (the hand) */
const BLADE_ROOT = 0.45;
/** how high above the floor a hand is: where shots leave from, where blades cut */
const HAND = 0.9;

/** a box of a model: its size, its middle, its colour; `glow`: unlit and bright; `tint`: takes the colour of the instance; `turn`: turned about the upright axis */
export interface Voxel {
  size: [number, number, number];
  at: [number, number, number];
  color: number;
  glow?: boolean;
  tint?: boolean;
  turn?: number;
}

const vox = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, more: Partial<Voxel> = {}): Voxel => ({ size: [w, h, d], at: [x, y, z], color, ...more });

/** Boxes merged into one geometry, each in its own colour. */
export function voxelGeometry(parts: Voxel[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = new THREE.BoxGeometry(...p.size);
    if (p.turn) g.rotateY(p.turn);
    g.translate(...p.at);
    const base = pos.length / 3;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    c.setHex(p.color);
    for (let i = 0; i < g.getAttribute('position').count; i++) col.push(c.r, c.g, c.b);
    for (const i of g.getIndex()!.array) idx.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

// what the shots are built from. Every model points along +z (the way it flies) with its middle at the origin.

/** a wrapped sweet: a fat middle with a white band, the paper twisted to a fan at both ends */
export const BONBON: Voxel[] = [
  vox(0.2, 0.2, 0.24, 0, 0, 0, 0xffffff, { tint: true }),
  vox(0.16, 0.24, 0.2, 0, 0, 0, 0xe8e8e8, { tint: true }),
  vox(0.215, 0.215, 0.07, 0, 0, 0, 0xffffff),
  ...[-1, 1].flatMap(k => [
    vox(0.07, 0.07, 0.07, 0, 0, k * 0.15, 0xd8d8d8, { tint: true }),
    vox(0.2, 0.14, 0.05, 0, 0, k * 0.2, 0xffffff, { tint: true }),
    vox(0.24, 0.07, 0.04, 0, 0, k * 0.235, 0xffffff),
  ]),
];
/** a lollipop: a flat round sweet with a white swirl, on a stick */
export const LOLLY: Voxel[] = [
  vox(0.3, 0.09, 0.3, 0, 0, 0.04, 0xffffff, { tint: true }),
  vox(0.2, 0.09, 0.38, 0, 0, 0.04, 0xe8e8e8, { tint: true }),
  vox(0.38, 0.09, 0.2, 0, 0, 0.04, 0xe8e8e8, { tint: true }),
  vox(0.08, 0.11, 0.08, 0, 0, 0.04, 0xffffff),
  vox(0.2, 0.105, 0.05, 0, 0, 0.13, 0xffffff),
  vox(0.05, 0.105, 0.14, 0.1, 0, 0.065, 0xffffff),
  vox(0.2, 0.105, 0.05, 0, 0, -0.05, 0xffffff),
  vox(0.05, 0.105, 0.14, -0.1, 0, 0.015, 0xffffff),
  vox(0.045, 0.045, 0.3, 0, 0, -0.29, 0xfff8ea),
];
/** a sausage in a bun, a zigzag of mustard on it */
export const HOTDOG_MODEL: Voxel[] = [
  vox(0.32, 0.09, 0.6, 0, -0.07, 0, 0xd99a48),
  vox(0.1, 0.17, 0.6, -0.12, 0.02, 0, 0xe8b25e),
  vox(0.1, 0.17, 0.6, 0.12, 0.02, 0, 0xe8b25e),
  vox(0.07, 0.04, 0.5, -0.12, 0.115, 0, 0xf6cd84),
  vox(0.07, 0.04, 0.5, 0.12, 0.115, 0, 0xf6cd84),
  vox(0.15, 0.15, 0.78, 0, 0.05, 0, 0xc0432f),
  vox(0.11, 0.11, 0.86, 0, 0.05, 0, 0xa8361f),
  ...[-2, -1, 0, 1, 2].map(k => vox(0.07, 0.035, 0.09, k % 2 ? 0.035 : -0.035, 0.14, k * 0.13, 0xffd400)),
];
/** a round black bomb with a steel cap and a burning fuse */
export const BOMB_MODEL: Voxel[] = [
  vox(0.36, 0.36, 0.36, 0, 0, 0, 0x26262e),
  vox(0.46, 0.26, 0.26, 0, 0, 0, 0x1c1c22),
  vox(0.26, 0.46, 0.26, 0, 0, 0, 0x1c1c22),
  vox(0.26, 0.26, 0.46, 0, 0, 0, 0x1c1c22),
  vox(0.09, 0.09, 0.02, -0.08, 0.08, 0.185, 0x8088a0),
  vox(0.16, 0.07, 0.16, 0, 0.26, 0, 0x8a90a8),
  vox(0.06, 0.1, 0.06, 0, 0.33, 0, 0xc8a060),
  vox(0.06, 0.06, 0.1, 0, 0.38, 0.05, 0xc8a060),
  vox(0.1, 0.1, 0.1, 0, 0.4, 0.12, 0xffffff, { glow: true, tint: true }),
];
/** a banana, bent, with a dark stalk: the mine */
export const BANANA_MODEL: Voxel[] = [
  ...[-2, -1, 0, 1, 2].map(k => vox(0.15 - 0.012 * k * k, 0.14 - 0.012 * k * k, 0.17, 0.045 * k * k - 0.09, 0, k * 0.13, k % 2 ? 0xffe135 : 0xffd21f, { turn: -k * 0.32 })),
  ...[-1, 0, 1].map(k => vox(0.04, 0.03, 0.16, 0.045 * k * k - 0.09, 0.07, k * 0.13, 0xfff2a0, { turn: -k * 0.32 })),
  vox(0.07, 0.07, 0.09, 0.13, 0, 0.36, 0x6b4a1f, { turn: -0.8 }),
  vox(0.06, 0.06, 0.05, 0.12, 0, -0.35, 0x3a2a12, { turn: 0.8 }),
  vox(0.17, 0.155, 0.07, -0.09, 0.005, 0, 0x2a2a35),
];
/** a boomerang with a joystick's red knob at each end and a strip of light along its arms */
export const BOOMERANG_MODEL: Voxel[] = [
  ...[-1, 1].flatMap(k => [
    vox(0.16, 0.08, 0.5, k * 0.17, 0, -0.07, 0x2a2550, { turn: k * 0.72 }),
    vox(0.06, 0.03, 0.42, k * 0.17, 0.05, -0.07, 0x2bf0ff, { turn: k * 0.72, glow: true }),
    vox(0.15, 0.15, 0.15, k * 0.36, 0.03, -0.27, 0xff3b3b, { glow: true }),
    vox(0.07, 0.07, 0.07, k * 0.36, 0.11, -0.27, 0xffb0a0, { glow: true }),
  ]),
  vox(0.2, 0.1, 0.2, 0, 0, 0.12, 0x3a3470, { turn: Math.PI / 4 }),
  vox(0.1, 0.03, 0.1, 0, 0.06, 0.12, 0xffe14a, { glow: true, turn: Math.PI / 4 }),
];
/** a yo-yo: two round halves on an axle, a star on each side (it rolls along +z) */
export const YOYO_MODEL: Voxel[] = [
  ...[-1, 1].flatMap(k => [
    vox(0.08, 0.3, 0.3, k * 0.075, 0, 0, 0x2bd4ff),
    vox(0.08, 0.2, 0.4, k * 0.075, 0, 0, 0x1fb4e8),
    vox(0.08, 0.4, 0.2, k * 0.075, 0, 0, 0x1fb4e8),
    vox(0.02, 0.2, 0.06, k * 0.12, 0, 0, 0xffe14a, { glow: true }),
    vox(0.02, 0.06, 0.2, k * 0.12, 0, 0, 0xffe14a, { glow: true }),
  ]),
  vox(0.08, 0.12, 0.12, 0, 0, 0, 0xffcf3a),
];
/** a pizza that cuts: cheese, a crust all round, slices of pepperoni, and teeth of light on its rim (it lies flat and spins) */
export const PIZZA_MODEL: Voxel[] = [
  vox(0.8, 0.07, 0.8, 0, 0, 0, 0xf2c14e),
  vox(0.56, 0.07, 1.0, 0, 0, 0, 0xd9953a),
  vox(1.0, 0.07, 0.56, 0, 0, 0, 0xd9953a),
  vox(0.5, 0.08, 0.86, 0, 0, 0, 0xf2c14e),
  vox(0.86, 0.08, 0.5, 0, 0, 0, 0xf2c14e),
  ...[0, 1, 2, 3, 4].map(k => vox(0.16, 0.05, 0.16, Math.cos(k * 1.26) * 0.26, 0.05, Math.sin(k * 1.26) * 0.26, 0xc0392b)),
  vox(0.14, 0.05, 0.14, 0, 0.05, 0, 0xc0392b),
  ...[0, 1, 2, 3].map(k => vox(0.12, 0.05, 0.12, Math.cos(k * 1.571 + 0.785) * 0.5, 0, Math.sin(k * 1.571 + 0.785) * 0.5, 0xfff6c8, { glow: true, turn: 0.785 })),
];
/** a piece of popcorn: a few puffs grown together */
export const POPCORN_MODEL: Voxel[] = [
  vox(0.24, 0.22, 0.24, 0, 0, 0, 0xfff6e0),
  vox(0.18, 0.18, 0.18, 0.11, 0.08, 0.04, 0xfffdf2),
  vox(0.17, 0.17, 0.17, -0.1, 0.06, -0.07, 0xfffdf2),
  vox(0.16, 0.15, 0.16, 0.02, -0.07, 0.11, 0xffeebb),
  vox(0.1, 0.08, 0.1, -0.04, -0.12, -0.04, 0xe8b25e),
];
/** a bolt of the Pixel Blaster: a white-hot head, a body in the shot's colour, a few pixels of it trailing behind */
export const BOLT_MODEL: Voxel[] = [
  vox(0.11, 0.11, 0.2, 0, 0, 0.17, 0xffffff, { glow: true }),
  vox(0.06, 0.06, 0.1, 0, 0, 0.3, 0xffffff, { glow: true }),
  vox(0.15, 0.15, 0.3, 0, 0, 0, 0xffe08a, { glow: true, tint: true }),
  vox(0.11, 0.11, 0.14, 0, 0, -0.27, 0xffb84a, { glow: true, tint: true }),
  vox(0.08, 0.08, 0.1, 0.02, 0.02, -0.45, 0xf08a2a, { glow: true, tint: true }),
  vox(0.06, 0.06, 0.07, -0.02, -0.02, -0.61, 0xc8601a, { glow: true, tint: true }),
];

/** a shot as the show last saw it */
export interface SeenShot {
  kind: DamageSource;
  behavior: Projectile['behavior'];
  x: number;
  z: number;
  /** how high above the floor it was drawn */
  y: number;
  vx: number;
  vz: number;
  until: number;
  /** the game's clock when it was seen */
  tick: number;
  tint: number;
  /** where a thrown one comes down */
  target?: Vec2;
}

/**
 * How a bolt ended that is not there any more: against a `wall`, at the end of its reach (`spent`), or in
 * something it `hit`: there is no word of it from the game, but it follows from where the bolt was and how it
 * flew. (`x`, `z`: where it ended.)
 */
export function shotEnd(last: Pick<SeenShot, 'x' | 'z' | 'vx' | 'vz' | 'until' | 'tick'>, tick: number, wall: (x: number, z: number) => boolean): { how: 'wall' | 'spent' | 'hit'; x: number; z: number } {
  let x = last.x, z = last.z;
  for (let i = 1; i <= Math.max(1, tick - last.tick); i++) {
    const nx = x + last.vx / TICK_RATE, nz = z + last.vz / TICK_RATE;
    // (it stops in front of the wall, not in it)
    if (wall(nx, nz)) return { how: 'wall', x, z };
    x = nx;
    z = nz;
    if (last.tick + i - 1 >= last.until) return { how: 'spent', x, z };
  }
  return { how: 'hit', x, z };
}

/**
 * The sword's slash at `t` (0 to 1): how far round its edge is, from one side of the arc (-1) to the other (1).
 * Fast out of the hand, slower at the end.
 */
export function slashSweep(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return 1 - 2 * (1 - (1 - k) ** 3);
}

/** when (0 to 1, as for slashSweep) the edge of a slash passes the spot `u` of its arc (-1 to 1): the inverse of slashSweep */
export function slashPasses(u: number): number {
  return 1 - Math.cbrt((1 + Math.max(-1, Math.min(1, u))) / 2);
}

/**
 * Where a sword swung from `x`, `z` along `ax`, `az` (`half`: half its arc in radians) meets a wall within
 * `radius`: a spot on the face of the wall for every step of the arc, the way the face looks (`nx`, `nz`), and
 * where in the arc (-1 to 1) it is. Spots that would sit on one another are left out.
 */
export function bladeOnWalls(wall: (x: number, z: number) => boolean, x: number, z: number, ax: number, az: number, radius: number, half: number): { x: number; z: number; nx: number; nz: number; u: number }[] {
  const out: { x: number; z: number; nx: number; nz: number; u: number }[] = [];
  const steps = Math.max(2, Math.ceil((2 * half * radius) / 0.22));
  for (let i = 0; i <= steps; i++) {
    const u = 1 - (2 * i) / steps, a = u * half;
    const dx = ax * Math.cos(a) - az * Math.sin(a), dz = az * Math.cos(a) + ax * Math.sin(a);
    let px = x + dx * BLADE_ROOT, pz = z + dz * BLADE_ROOT;
    // (one standing in a wall cuts nothing more on it)
    if (wall(px, pz)) continue;
    for (let r = BLADE_ROOT + 0.06; r <= radius; r += 0.06) {
      const qx = x + dx * r, qz = z + dz * r;
      if (!wall(qx, qz)) {
        px = qx;
        pz = qz;
        continue;
      }
      // (which face it came through: the tile line it crossed)
      const across = Math.floor(px) !== Math.floor(qx);
      const nx = across ? Math.sign(px - qx) : 0, nz = across ? 0 : Math.sign(pz - qz);
      const fx = across ? Math.floor(qx) + (nx > 0 ? 1 : 0) + nx * 0.02 : qx, fz = across ? qz : Math.floor(qz) + (nz > 0 ? 1 : 0) + nz * 0.02;
      const last = out[out.length - 1];
      if (!last || Math.hypot(last.x - fx, last.z - fz) > 0.12) out.push({ x: fx, z: fz, nx, nz, u });
      break;
    }
  }
  return out;
}

/** a bit of light: a small bright cube that flies, falls, grows or burns out (`ramp`: its colours from first to last) */
interface Pixel {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  ramp: number[];
  /** how hard it falls, how fast it slows, how much it grows over its life (1: stays as it is) */
  fall: number;
  drag: number;
  grow: number;
  /** drawn out along its way so many times its size (a streak) */
  long: number;
  spin: number;
}

/** a square ring on the floor or in the air that grows or draws in */
interface Hoop {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  from: number;
  to: number;
  color: number;
}

interface Slash { id: number; x: number; z: number; ax: number; az: number; radius: number; age: number }
/** a line burnt into a wall (`age` below 0: the blade has not got there yet); `along`: which way it runs on the face */
interface Scorch { x: number; y: number; z: number; along: number; long: number; age: number; nx: number; nz: number }
/** a crackle where the blade met something */
interface Crackle { x: number; y: number; z: number; age: number }
interface Swat { x: number; z: number; yaw: number; size: number; age: number }
interface Rail { x: number; z: number; yaw: number; len: number; age: number }
interface Pull { id: number; x: number; z: number; tx: number; tz: number; age: number }
interface Cut { x: number; y: number; z: number; yaw: number; age: number; color: number }

/** what the show borrows from the other effects: bits that fly and bounce, a flash of light, a stain on the floor, a jolt */
export interface ShotFx {
  burst(pos: Vec2, y: number, count: number, colors: number[], speed: number, size: number, up?: number): void;
  chunks(pos: Vec2, y: number, count: number, colors: number[], speed: number, minSize: number, maxSize: number): void;
  flash(x: number, y: number, z: number, size: number, color: number, life: number, ring: boolean): void;
  stain(x: number, z: number, size: number, color: number, life: number): void;
  shake(amp: number): void;
}

/**
 * Whether the ring that shows where a bomb will land is drawn on this screen: always in co-op; in a versus match
 * only for the one who threw it and, in a team match, their team.
 */
export function ringFor(s: SimState, ownerId: number, viewers: ReadonlySet<number>): boolean {
  if (!s.versus) return true;
  if (viewers.has(ownerId)) return true;
  const owner = s.players.find(p => p.id === ownerId);
  return s.versus.mode === 'team' && owner?.team !== undefined && s.players.some(p => viewers.has(p.id) && p.team === owner.team);
}

/**
 * Who fired a shot that left from `pos`: the player the game names, else whoever stands nearest (within a step or
 * two: a player who walks has moved on a little by the time the shot is drawn).
 */
export function shooterOf(s: SimState, pos: Vec2, id?: number): Player | undefined {
  if (id !== undefined) return s.players.find(p => p.id === id);
  let best: Player | undefined, d = 1.5;
  for (const p of s.players) {
    const far = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
    if (far < d) {
      d = far;
      best = p;
    }
  }
  return best;
}

export interface Shots {
  update(s: SimState, events: SimEvent[], theme: Theme, dt: number, time: number): void;
  /**
   * Something blew up at `pos`. A hot dog that came down there bursts into ketchup and mustard instead of fire
   * (true: that is all of it); anything else gets its ball of fire here, a banana its peel as well.
   */
  explode(pos: Vec2, radius: number): boolean;
  /** low graphics: fewer bits, no glow round the shots */
  setLow(low: boolean): void;
  /** the players whose eyes a view looks through (first person) */
  setEyes(ids: number[]): void;
  /** the players this screen shows the game of (what only they should know is drawn for them alone) */
  setViewers(ids: number[]): void;
  /** how many bits of light are in the air (for tests) */
  pixels(): number;
}

/**
 * The weapons' shots: what flies (a sweet, a hot dog, a bomb, a bolt), what it leaves in the air behind it, the
 * flash where it leaves the hand and what happens where it ends; the slash of the sword, the beam of the rail,
 * the pull of the magnet. Everything is drawn from pools that are made once; nothing is made while it runs.
 */
export function createShots(scene: THREE.Scene, fx: ShotFx): Shots {
  const lit = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333, vertexColors: true });
  const bright = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
  const added = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const all: InstancedPool[] = [];
  const pool = (geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, shadows = false) => {
    const p = new InstancedPool(scene, geometry, material, capacity, shadows);
    all.push(p);
    return p;
  };
  /** a model as up to four pools: lit or glowing, in its own colours or in the colour of each instance */
  const model = (parts: Voxel[], capacity: number, shadows = false) => {
    const layers: { pool: InstancedPool; tint: boolean }[] = [];
    for (const glow of [false, true])
      for (const tint of [false, true]) {
        const mine = parts.filter(p => !!p.glow === glow && !!p.tint === tint);
        if (mine.length > 0) layers.push({ pool: pool(voxelGeometry(mine), glow ? bright : lit, capacity, shadows && !glow), tint });
      }
    return {
      /** turned by `yaw`, then leaned (`lean`) and rolled (`roll`) in its own frame */
      add(x: number, y: number, z: number, yaw: number, scale = 1, tint?: number, lean = 0, roll = 0) {
        for (const l of layers) l.pool.addScaled(x, y, z, yaw, scale, scale, scale, l.tint ? tint : undefined, lean, roll);
      },
    };
  };

  const bolts = model(BOLT_MODEL, 256);
  const bonbons = model(BONBON, 256);
  const lollies = model(LOLLY, 128);
  const hotdogs = model(HOTDOG_MODEL, 32, true);
  const bombs = model(BOMB_MODEL, 16, true);
  const bananas = model(BANANA_MODEL, 32, true);
  const boomerangs = model(BOOMERANG_MODEL, 16, true);
  const yoyos = model(YOYO_MODEL, 16, true);
  const pizzas = model(PIZZA_MODEL, 8, true);
  const popcorns = model(POPCORN_MODEL, 32, true);
  // bits of light, in plain bright colour (they show on a floor in daylight) and as light added to the picture
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const pix = pool(unit, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 1024);
  const auras = pool(new THREE.IcosahedronGeometry(0.5, 1), added(), 256);
  // beams and strings: a unit long along +z, from its start
  const rod = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
  const rods = pool(rod, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 64);
  // (the glow round a beam is a tube open at both ends: seen along it from the hand, it has no lid)
  const hazes = pool(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).rotateX(Math.PI / 2).translate(0, 0, 0.5), added(), 32);
  // the rail's rings: square frames round its beam
  const frames = pool(voxelGeometry([vox(1, 0.12, 0.12, 0, 0.44, 0, 0xffffff), vox(1, 0.12, 0.12, 0, -0.44, 0, 0xffffff), vox(0.12, 0.76, 0.12, 0.44, 0, 0, 0xffffff), vox(0.12, 0.76, 0.12, -0.44, 0, 0, 0xffffff)]), bright, 64);
  // square rings on the floor: where a bomb will land, a mine that is armed, a magnet's pull
  const hoops = pool(new THREE.RingGeometry(0.465, 0.5, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 64);
  // the shadow of what is thrown, on the floor under it
  const shades = pool(new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 32);
  // soap bubbles and balls of gum: faceted, see-through, with a glint
  const soap = pool(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0x6fc8ff, emissiveIntensity: 0.35, transparent: true, opacity: 0.42, roughness: 0.1, flatShading: true, depthWrite: false }), 64);
  const gum = pool(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xff7fc8, emissive: 0xff4fa8, emissiveIntensity: 0.3, transparent: true, opacity: 0.6, roughness: 0.2, flatShading: true, depthWrite: false }), 16);
  // the mustard a hot dog leaves: a ragged puddle with a darker rim
  const blot = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  {
    const at = blot.getAttribute('position');
    for (let i = 1; i < at.count; i++) {
      const k = 0.93 + 0.07 * Math.sin(i * 0.98) + 0.04 * Math.sin(i * 2.36);
      at.setXYZ(i, at.getX(i) * k, at.getY(i), at.getZ(i) * k);
    }
  }
  const puddleMat = (color: number, opacity: number, offset: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: offset });
  const rims = pool(blot, puddleMat(0xd99a00, 0.8, -1), 32);
  const puddles = pool(blot, puddleMat(0xffd91a, 0.88, -2), 32);
  // the glow of a sword: boxes of light added to the picture round its blade and its trail
  const glows = pool(unit, added(), 128);
  // and the light it throws on the floor round it: a disc that is brightest in its middle and fades to nothing at
  // its rim (the colour of its vertices, times that of each one; added light, so black is no light)
  const pond = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
  {
    const at = pond.getAttribute('position'), shade = new Float32Array(at.count * 3);
    for (let i = 0; i < at.count; i++) shade.fill((1 - Math.min(1, Math.hypot(at.getX(i), at.getZ(i)) * 2)) ** 1.5, i * 3, i * 3 + 3);
    pond.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  }
  const ponds = pool(pond, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 }), 16);

  const pixels: Pixel[] = [];
  const hoopList: Hoop[] = [];
  const slashes: Slash[] = [];
  const swats: Swat[] = [];
  const rails: Rail[] = [];
  const pulls: Pull[] = [];
  const cuts: Cut[] = [];
  const scorches: Scorch[] = [];
  const crackles: Crackle[] = [];
  /** how far each player's sword is out of its hilt (0 to 1), for the light it throws */
  const blades = new Map<number, number>();
  /** the players whose swords are in a swing this frame: their light goes with the blade */
  const swinging = new Map<number, { x: number; z: number }>();
  /** the shots and the mines of the frame before: what is missing from them now has ended */
  let seen = new Map<number, SeenShot>();
  let mines = new Map<number, Vec2>();
  const from = new THREE.Vector3();
  let low = false;
  let eyes = new Set<number>();
  let viewers = new Set<number>();
  let lastTick = 0;
  let mapId = '';
  let wallColor = 0x888888;
  let rnd = 4711;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  /** so many bits on full graphics, half of them (but one at least) on low */
  const some = (n: number) => (low ? Math.max(1, Math.ceil(n / 2)) : n);

  function emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, ramp: number[], more: Partial<Pixel> = {}) {
    if (pixels.length >= MAX_PIXELS) return;
    pixels.push({ x, y, z, vx, vy, vz, age: 0, life, size, ramp, fall: 6, drag: 0, grow: 1, long: 0, spin: rand() * 6, ...more });
  }
  /** bits sprayed along a direction, in a cone `wide` (radians) round it */
  function spray(x: number, y: number, z: number, dx: number, dz: number, wide: number, count: number, speed: number, life: number, size: number, colors: number[], more: Partial<Pixel> = {}) {
    const a0 = Math.atan2(dz, dx);
    for (let i = 0; i < count; i++) {
      const a = a0 + (rand() - 0.5) * wide, sp = speed * (0.45 + rand() * 0.75);
      emit(x, y, z, Math.cos(a) * sp, (rand() - 0.3) * speed * 0.45, Math.sin(a) * sp, life * (0.6 + rand() * 0.6), size * (0.7 + rand() * 0.6), [colors[Math.floor(rand() * colors.length)]], more);
    }
  }
  const hoop = (x: number, y: number, z: number, from: number, to: number, life: number, color: number, wait = 0) => hoopList.push({ x, y, z, age: -wait, life, from, to, color });
  /** a ball of fire: puffs that swell, rise and burn out to smoke */
  function fire(pos: Vec2, radius: number, ramp = FIRE_RAMP) {
    // (not all of it is equally hot: some puffs are white, some already red)
    const n = some(Math.min(36, Math.round(8 + radius * 9)));
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = rand() * radius * 0.5, sp = (0.8 + rand() * 2.2) * Math.sqrt(radius);
      emit(pos.x + Math.cos(a) * r, 0.3 + rand() * radius * 0.35, pos.z + Math.sin(a) * r, Math.cos(a) * sp, 1.2 + rand() * 2.4, Math.sin(a) * sp, 0.4 + rand() * 0.35, (0.1 + rand() * 0.13) * Math.sqrt(radius), ramp.slice(Math.floor(rand() * 3)), { fall: -1.5, drag: 2.5, grow: 1.6 });
    }
    // (and streaks of it thrown out along the floor)
    for (let i = 0; i < some(8); i++) {
      const a = rand() * Math.PI * 2, sp = (5 + rand() * 5) * Math.sqrt(radius);
      emit(pos.x, 0.25, pos.z, Math.cos(a) * sp, 1 + rand() * 3, Math.sin(a) * sp, 0.2 + rand() * 0.15, 0.07, [0xffffff, 0xffe14a, 0xff8c42], { long: 4, drag: 3 });
    }
  }
  /** ketchup and mustard where a hot dog comes down: a red splash, yellow drops, crumbs of the bun */
  function splat(pos: Vec2, radius: number) {
    fx.stain(pos.x, pos.z, radius * 1.5, 0xb81a14, 5);
    fx.burst(pos, 0.3, 16, KETCHUP, 4.5, 0.12, 0.9);
    fx.burst(pos, 0.3, 8, MUSTARD, 3.5, 0.1, 1.2);
    fx.chunks(pos, 0.2, 4, [0xe8b25e, 0xd99a48, 0xc0432f], 3, 0.08, 0.16);
    for (let i = 0; i < some(14); i++) {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3, sp = radius * (3 + rand() * 2.5);
      emit(pos.x, 0.15, pos.z, Math.cos(a) * sp, 0.6 + rand() * 1.6, Math.sin(a) * sp, 0.22 + rand() * 0.12, 0.11, i % 3 ? KETCHUP : MUSTARD, { long: 3, drag: 4 });
    }
    hoop(pos.x, 0.07, pos.z, 0.4, radius * 2.1, 0.22, 0xff4a3a);
    fx.shake(0.07);
  }
  /** a sweet bursts: sprinkles in its colour and sugar */
  function crumble(x: number, y: number, z: number, tint: number, dx: number, dz: number, hard: boolean) {
    spray(x, y, z, dx, dz, hard ? 2.6 : 5, some(hard ? 7 : 5), 4, 0.3, 0.07, [tint, tint, 0xffffff]);
    if (hard) fx.burst({ x, z }, y, 2, [tint], 2.2, 0.09, 0.6);
    else fx.flash(x, y, z, 0.7, tint, 0.12, false);
  }

  /** a shot has ended: what it does where it did */
  function end(shot: SeenShot, s: SimState) {
    const speed = Math.hypot(shot.vx, shot.vz) || 1;
    const dx = shot.vx / speed, dz = shot.vz / speed;
    if (shot.kind === 'pizzaCutter') {
      fx.burst({ x: shot.x, z: shot.z }, shot.y, 8, [0xf2c14e, 0xd9953a, 0xc0392b], 3.5, 0.1, 0.8);
      return;
    }
    if (shot.behavior !== 'bolt') return;
    const e = shotEnd(shot, s.tick, (x, z) => tileAt(s.map, x, z) === Tile.Wall);
    switch (shot.kind) {
      case 'candyCannon':
        if (e.how === 'spent') spray(e.x, shot.y, e.z, dx, dz, 1.2, some(2), 2, 0.25, 0.06, [shot.tint, 0xffffff]);
        else crumble(e.x, shot.y, e.z, shot.tint, e.how === 'wall' ? -dx : dx, e.how === 'wall' ? -dz : dz, e.how === 'wall');
        break;
      case 'bubbleWand':
        // it pops: a ring of drops
        hoop(e.x, shot.y, e.z, 0.3, 1.1, 0.16, 0xd8f6ff);
        spray(e.x, shot.y, e.z, dx, dz, 6.3, some(7), 2.6, 0.3, 0.06, [0xffffff, 0xbfefff, 0x8fdcff], { fall: 3 });
        break;
      case 'bubblegumBazooka':
        fx.burst({ x: e.x, z: e.z }, shot.y, 10, [0xff7fc8, 0xffb3df, 0xffffff], 4, 0.12, 0.6);
        break;
      default:
        if (e.how === 'spent') {
          // out of reach: it fizzles
          spray(e.x, shot.y, e.z, dx, dz, 0.9, some(3), 3, 0.16, 0.06, [shot.tint, 0xffffff], { fall: 1 });
          break;
        }
        // sparks: thrown back off a wall with chips of it, sprayed on through what it hit
        fx.flash(e.x, shot.y, e.z, e.how === 'wall' ? 0.9 : 1.1, shot.tint, 0.12, false);
        if (e.how === 'wall') {
          spray(e.x, shot.y, e.z, -dx, -dz, 2.4, some(6), 7, 0.2, 0.055, [0xffffff, shot.tint], { long: 3.5, fall: 9 });
          fx.burst({ x: e.x, z: e.z }, shot.y, 2, [wallColor], 2.5, 0.08, 0.6);
        } else {
          spray(e.x, shot.y, e.z, dx, dz, 2.8, some(5), 6, 0.18, 0.055, [0xffffff, shot.tint], { long: 3, fall: 4 });
          // (and a cross of pixels where it struck)
          for (let k = 0; k < 4; k++) emit(e.x, shot.y, e.z, Math.cos(k * 1.571 + 0.785) * 3.4, 0, Math.sin(k * 1.571 + 0.785) * 3.4, 0.16, 0.1, [0xffffff, shot.tint], { fall: 0, drag: 5 });
        }
    }
  }

  /** who fired: the one the game names, or (an older host says only where from) whoever stands nearest that spot */
  const shooter = (s: SimState, pos: Vec2, id?: number): Player | undefined => shooterOf(s, pos, id);

  /** the flash where a shot leaves the hand, and whatever a swing or a beam shows as it goes off */
  function fired(e: Extract<SimEvent, { type: 'shot' }>, s: SimState, events: SimEvent[]) {
    const who = shooter(s, e.pos, e.playerId);
    if (!who) return;
    const ax = who.aim.x, az = who.aim.z;
    const y = HAND + (who.flying ? 2.5 : 0);
    // (a little way in front: in first person the eyes are where the shooter stands)
    const mx = e.pos.x + ax * 1.05, mz = e.pos.z + az * 1.05;
    const level = who.weapons[who.selected]?.level ?? 1;
    // (whoever is looked through sees the flash on the weapon in their own hand: one in the air in front of the eyes would fill the view)
    const far = !eyes.has(who.id);
    switch (e.weapon) {
      case 'pixelBlaster': {
        const tint = palette().playerShot;
        if (far) fx.flash(mx, y - 0.3, mz, 0.6, tint, 0.07, false);
        if (far) spray(mx, y - 0.3, mz, ax, az, 0.9, some(3), 9, 0.08, 0.05, [0xffffff, tint], { long: 4, fall: 0 });
        break;
      }
      case 'candyCannon':
        // a puff of sugar and a spray of sprinkles
        for (let i = 0; far && i < some(4); i++) emit(mx, y - 0.3, mz, ax * (1 + rand() * 2) + (rand() - 0.5), 0.4 + rand(), az * (1 + rand() * 2) + (rand() - 0.5), 0.3 + rand() * 0.15, 0.1, [0xffffff, 0xffd9f0, 0xffb3df], { fall: -0.5, drag: 3, grow: 1.8 });
        spray(mx, y - 0.3, mz, ax, az, (CANDY.spreadDeg * Math.PI) / 180, some(10), 7, 0.22, 0.05, CANDY_COLORS);
        break;
      case 'hotdogSlinger':
        if (far) spray(mx, y, mz, ax, az, 1.2, some(5), 3, 0.3, 0.07, MUSTARD);
        break;
      case 'bubbleWand':
        spray(mx, y - 0.2, mz, ax, az, 1.6, some(5), 2.2, 0.5, 0.08, [0xffffff, 0xbfefff], { fall: -1, drag: 2 });
        break;
      case 'bananaMine':
        fx.burst(e.pos, 0.15, 5, [0xffe135, 0xfff2a0], 1.6, 0.06, 0.5);
        break;
      case 'laserSword': {
        const radius = SWORD.radius + SWORD.radiusPerLevel * (level - 1);
        slashes.push({ id: who.id, x: e.pos.x, z: e.pos.z, ax, az, radius, age: 0 });
        const half = (SWORD.halfArcDeg * Math.PI) / 180, minDot = Math.cos(half);
        // what it cut (a monster; in a versus match a rival it dealt the hit to): a flash where the blade met it, a
        // bright nick across it, sparks thrown on along the swing and a crackle of light that jumps about the spot
        for (const h of events) {
          const at = h.type === 'enemyHit' ? h.pos : h.type === 'playerHit' && h.by === who.id ? h.pos : null;
          if (!at) continue;
          const dx = at.x - e.pos.x, dz = at.z - e.pos.z, d = Math.hypot(dx, dz);
          if (d > radius + 2 || (d > 0.6 && (dx * ax + dz * az) / d < minDot - 0.05)) continue;
          // (on its near side, where the blade came in)
          const cx = d > 0.5 ? at.x - (dx / d) * 0.35 : at.x, cz = d > 0.5 ? at.z - (dz / d) * 0.35 : at.z, cy = y - 0.1;
          fx.flash(cx, cy, cz, 0.8, 0xffffff, 0.06, false);
          fx.flash(cx, cy, cz, 1.5, BLADE_COLORS.glow, 0.14, false);
          if (cuts.length < 24) cuts.push({ x: at.x, y: cy, z: at.z, yaw: Math.atan2(ax, az) + 0.9, age: 0, color: 0xff6be6 });
          if (crackles.length < 12) crackles.push({ x: cx, y: cy, z: cz, age: 0 });
          spray(cx, cy, cz, -az, ax, 1.4, some(6), 7, 0.22, 0.05, [0xffffff, 0xffffff, 0xff6be6, 0xff2bd6], { long: 3.5, fall: 4 });
        }
        // a wall in the arc: the blade burns a line into it as it passes
        if (scorches.length < 60)
          for (const w of bladeOnWalls((x, z) => tileAt(s.map, x, z) === Tile.Wall, e.pos.x, e.pos.z, ax, az, radius, half)) {
            const t = slashPasses(w.u) * SWEEP * SLASH_SECONDS;
            scorches.push({ x: w.x, y: y - 0.1 + (rand() - 0.5) * 0.04, z: w.z, along: w.nx !== 0 ? 0 : Math.PI / 2, long: 0.3, age: -t, nx: w.nx, nz: w.nz });
          }
        break;
      }
      case 'flySwatter': {
        // KLATSCH: the print of the paddle in the air in front, green bits off its edges, and a jolt
        const reach = SWATTER.radius + SWATTER.radiusPerLevel * (level - 1);
        const at = { x: e.pos.x + ax * reach * 0.8, z: e.pos.z + az * reach * 0.8 };
        swats.push({ x: at.x, z: at.z, yaw: Math.atan2(ax, az), size: reach * 0.95, age: 0 });
        for (const k of [-0.8, 0, 0.8]) fx.burst({ x: at.x - az * k, z: at.z + ax * k }, 0.85, 4, [0x3bd16f, 0xb8ffcf, 0xffffff], 3, 0.09, 0.3);
        spray(at.x, 0.6, at.z, ax, az, 6.3, some(10), 6, 0.18, 0.06, [0xffffff, 0xb8ffcf], { long: 3, fall: 2 });
        fx.shake(0.12);
        break;
      }
    }
  }

  return {
    explode(pos, radius) {
      let what: DamageSource | 'mine' | undefined;
      // (what went up here: a thrown one by where it was to come down, which holds however far it got since it
      // was last seen; with a frame or a snapshot that spans a few ticks its last spot can be a tile short)
      for (const shot of seen.values()) {
        const at = shot.target ?? shot;
        if (shot.behavior === 'lob' && Math.hypot(at.x - pos.x, at.z - pos.z) < 0.6) what = shot.kind;
      }
      for (const at of mines.values()) if (Math.hypot(at.x - pos.x, at.z - pos.z) < 0.01) what = 'mine';
      if (what === 'hotdogSlinger') {
        splat(pos, radius);
        return true;
      }
      if (what === 'mine') {
        // the banana goes up with it: bits of peel
        fx.chunks(pos, 0.2, 7, [0xffe135, 0xffd21f, 0xfff2a0, 0x6b4a1f], 5, 0.08, 0.2);
        fire(pos, radius, [0xfff9c0, 0xffe135, 0xffe135, 0xffb020, 0xff7a14, 0x8a4a1a, 0x4a3a3c, 0x2e2a30]);
      } else fire(pos, radius);
      if (what === 'bomb') {
        // a bomb throws its shards far, and a second ring runs after the first
        fx.flash(pos.x, 0.07, pos.z, radius * 2.9, 0xffe9b0, 0.5, true);
        fx.chunks(pos, 0.3, 6, [0x26262e, 0x1c1c22, 0x8a90a8], 7, 0.07, 0.15);
      }
      return false;
    },
    update(s, events, theme, dt, time) {
      // another time is shown (the kill cam begins or ends), or another floor: nothing of before goes on in it
      const cut = Math.abs(s.tick - lastTick) > CUT_TICKS || s.map.id !== mapId;
      lastTick = s.tick;
      mapId = s.map.id;
      wallColor = theme.wallA;
      if (cut) {
        seen.clear();
        mines.clear();
        pixels.length = hoopList.length = slashes.length = swats.length = rails.length = pulls.length = cuts.length = scorches.length = crackles.length = 0;
      }
      const pal = palette();

      for (const e of events) {
        if (e.type === 'shot') fired(e, s, events);
        else if (e.type === 'railFired') {
          // a beam along the line: a flash where it leaves, a burn and sparks where it stops, a spark on all it went through
          const dx = e.to.x - e.from.x, dz = e.to.z - e.from.z, len = Math.hypot(dx, dz) || 0.001;
          const ax = dx / len, az = dz / len, start = Math.min(1, len);
          rails.push({ x: e.from.x + ax * start, z: e.from.z + az * start, yaw: Math.atan2(ax, az), len: len - start, age: 0 });
          if (!eyes.has(shooter(s, e.from, e.playerId)?.id ?? -1)) fx.flash(e.from.x + ax * (start + 0.5), HAND, e.from.z + az * (start + 0.5), 1.1, 0x9ff8ff, 0.12, false);
          fx.flash(e.to.x, HAND, e.to.z, 1.7, 0xffffff, 0.16, false);
          fx.flash(e.to.x, 0.07, e.to.z, 2.2, 0x9ff8ff, 0.3, true);
          fx.stain(e.to.x, e.to.z, 0.7, 0x1c2a33, 2.5);
          spray(e.to.x, HAND, e.to.z, -ax, -az, 2.8, some(10), 8, 0.26, 0.06, RAIL_RAMP, { long: 4, fall: 7 });
          for (let d = 0.5; d < len - start; d += low ? 1.6 : 0.8) emit(e.from.x + ax * (start + d), HAND + (rand() - 0.5) * 0.2, e.from.z + az * (start + d), (rand() - 0.5) * 0.8, 0.3 + rand() * 0.8, (rand() - 0.5) * 0.8, 0.35 + rand() * 0.3, 0.07, RAIL_RAMP, { fall: -1 });
          for (const h of events) {
            if (h.type !== 'enemyHit') continue;
            const qx = h.pos.x - e.from.x, qz = h.pos.z - e.from.z, along = qx * ax + qz * az;
            if (along < 0 || along > len + 2 || Math.abs(qz * ax - qx * az) > 2) continue;
            fx.flash(h.pos.x, HAND, h.pos.z, 1.3, 0x9ff8ff, 0.14, false);
            if (cuts.length < 24) cuts.push({ x: h.pos.x, y: HAND, z: h.pos.z, yaw: Math.atan2(ax, az) + Math.PI / 2, age: 0, color: 0x9ff8ff });
          }
          fx.shake(0.05);
        } else if (e.type === 'magnetPull') {
          // what is in front is drawn to the spot: bits of red and blue fly in to it, rings close round it
          const who = shooter(s, e.from);
          pulls.push({ id: who?.id ?? -1, x: e.from.x, z: e.from.z, tx: e.to.x, tz: e.to.z, age: 0 });
          const a0 = Math.atan2(e.to.z - e.from.z, e.to.x - e.from.x), half = (MAGNET.halfArcDeg * Math.PI) / 180;
          for (let i = 0; i < some(18); i++) {
            const a = a0 + (rand() * 2 - 1) * half, r = 1 + rand() * (MAGNET.range - 1), life = 0.2 + rand() * 0.18;
            const x = e.from.x + Math.cos(a) * r, z = e.from.z + Math.sin(a) * r;
            emit(x, 0.3 + rand() * 0.8, z, (e.to.x - x) / life, 0, (e.to.z - z) / life, life, 0.08, [i % 2 ? 0xff3b3b : 0x5f9bff, 0xffffff], { fall: 0, long: 3 });
          }
          hoop(e.to.x, 0.08, e.to.z, 3.4, 0.3, 0.3, 0xff3b3b);
          hoop(e.to.x, 0.09, e.to.z, 3.4, 0.3, 0.3, 0x5f9bff, 0.09);
          fx.flash(e.to.x, 0.6, e.to.z, 1.2, 0xff8ab0, 0.2, false);
        } else if (e.type === 'rareFired') {
          const p = s.players.find(x => x.id === e.playerId);
          if (!p) continue;
          const x = p.pos.x + p.aim.x * 0.8, z = p.pos.z + p.aim.z * 0.8;
          if (e.kind === 'slushMachine') {
            // a cone of crushed ice: shards that glitter, and a cold mist
            spray(x, HAND, z, p.aim.x, p.aim.z, 0.7, some(12), 13, 0.36, 0.08, [0xffffff, 0x9fe8ff, 0x4fc8ff, 0xd8f6ff], { fall: 3 });
            for (let i = 0; i < some(3); i++) emit(x, HAND, z, p.aim.x * (5 + rand() * 4), 0.5, p.aim.z * (5 + rand() * 4), 0.5, 0.2, [0xffffff, 0xd8f6ff, 0x9fe8ff], { fall: -0.5, drag: 2, grow: 2.2 });
          } else if (e.kind === 'leafBlower') {
            // a gust: streaks of wind, and leaves tumbling in it
            spray(x, HAND, z, p.aim.x, p.aim.z, 0.8, some(6), 16, 0.3, 0.04, [0xffffff, 0xe8fff0], { long: 9, fall: 0 });
            spray(x, HAND, z, p.aim.x, p.aim.z, 0.9, some(7), 11, 0.5, 0.1, [0x7cc56a, 0xb8e986, 0x4f9a3f, 0xd9a43a], { fall: 2 });
          }
        }
      }

      for (const p of all) p.begin();

      // what flies
      const now = new Map<number, SeenShot>();
      for (const p of s.projectiles) {
        // (a monster's shot is drawn with the monsters; a missile has its own look, see lock-on.ts)
        if (p.hostile || p.behavior === 'missile') continue;
        const up = shotHeight(p);
        const yaw = Math.atan2(p.vel.x, p.vel.z);
        let y = 0.6 + up, tint = 0xffffff;
        // (a shot grows out of the hand that fired it: it starts where its owner stands, which in first person
        // is right under the eyes)
        const owner = s.players.find(pl => pl.id === p.ownerId);
        const out = owner ? Math.max(0, Math.min(1, (Math.hypot(p.pos.x - owner.pos.x, p.pos.z - owner.pos.z) - 0.5) / 0.8)) : 1;
        if (p.behavior === 'lob') {
          const t = Math.min(1, (s.tick - p.launchedAt!) / (p.until - p.launchedAt!));
          y = 0.6 + up + 4 * 2.5 * t * (1 - t);
          const dir = Math.atan2(p.target!.x - p.from!.x, p.target!.z - p.from!.z);
          shades.add(p.pos.x, 0.045, p.pos.z, 0, 0.5 + 0.06 * y);
          if (p.kind === 'popcorn') popcorns.add(p.pos.x, y, p.pos.z, time * 6 + p.id, 1, undefined, time * 5);
          else if (p.kind === 'bomb') {
            // it tumbles, its fuse spits sparks, and a ring on the floor closes on the spot where it will come down
            bombs.add(p.pos.x, y, p.pos.z, dir, 1, Math.floor(time * 30) % 2 ? 0xffffff : 0xffb020, time * 9 + p.id);
            if (t > 0.12 && Math.floor(time * 60) % 2 === 0) emit(p.pos.x, y + 0.2, p.pos.z, (rand() - 0.5) * 2, 1 + rand() * 2, (rand() - 0.5) * 2, 0.2 + rand() * 0.15, 0.05, [0xffffff, 0xffe14a, 0xff8c42], { fall: 5 });
            // (in a versus match only whoever threw it and their team see where: a rival is not warned)
            if (ringFor(s, p.ownerId, viewers)) {
              const r = p.land?.radius ?? 3;
              hoops.add(p.target!.x, 0.06, p.target!.z, 0, r * 2, 0xff5a2b);
              hoops.add(p.target!.x, 0.07, p.target!.z, time * 3, r * 2 * (1 - 0.85 * t), Math.floor(time * (6 + 14 * t)) % 2 ? 0xffe14a : 0xff3b3b);
            }
            // (it glows red, faster and faster, the closer it is to the floor)
            if (!low) auras.add(p.pos.x, y, p.pos.z, 0, 0.9, Math.sin(time * (14 + 40 * t)) > 0 ? 0x7a1a0a : 0x1a0502);
          } else {
            // the hot dog turns end over end and drips
            hotdogs.add(p.pos.x, y, p.pos.z, dir, 1, undefined, time * 11 + p.id);
            // (not before it is well out of the hand: the first drops would fall in front of the thrower's eyes)
            if (t > 0.2 && Math.floor(time * 60) % 4 === 0) emit(p.pos.x, y, p.pos.z, (rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8, 0.4, 0.06, rand() < 0.5 ? KETCHUP : MUSTARD, { fall: 12 });
          }
        } else if (p.behavior === 'saw') {
          pizzas.add(p.pos.x, 0.5 + up, p.pos.z, time * 25, 1);
          y = 0.5 + up;
          if (Math.floor(time * 60) % 2 === 0) emit(p.pos.x, y, p.pos.z, -p.vel.x * 0.15 + (rand() - 0.5) * 2, 0.5 + rand(), -p.vel.z * 0.15 + (rand() - 0.5) * 2, 0.25, 0.06, [0xfff6c8, 0xf2c14e, 0xd9953a], { fall: 4 });
        } else if (p.kind === 'bubblegumBazooka') {
          gum.addScaled(p.pos.x, 0.7 + up, p.pos.z, yaw, 0.32 * out, 0.32 * out, 0.4 * out);
          pix.add(p.pos.x - 0.1, 0.92 + up, p.pos.z - 0.08, 0, 0.07 * out, 0xffffff);
          y = 0.7 + up;
        } else if (p.kind === 'bubbleWand') {
          // a soap bubble: it wobbles as it floats, a glint on it, small ones in its wake
          y = 0.75 + up + 0.05 * Math.sin(time * 5 + p.id);
          const wob = 0.05 * Math.sin(time * 13 + p.id);
          soap.addScaled(p.pos.x, y, p.pos.z, yaw, 0.3 * (1 + wob) * out, 0.3 * (1 - wob) * out, 0.3 * (1 + wob) * out);
          pix.add(p.pos.x - 0.1, y + 0.14, p.pos.z - 0.06, 0, 0.07 * out, 0xffffff);
          pix.add(p.pos.x - 0.16, y + 0.06, p.pos.z - 0.02, 0, 0.04 * out, 0xffffff);
          const speed = Math.hypot(p.vel.x, p.vel.z) || 1;
          for (let k = 1; k <= (low ? 1 : 3); k++) {
            const back = 0.34 * k + 0.1 * Math.sin(time * 7 + k * 2 + p.id);
            soap.add(p.pos.x - (p.vel.x / speed) * back + Math.sin(time * 9 + k * 1.7) * 0.07, y + Math.sin(time * 6 + k * 2.3 + p.id) * 0.12, p.pos.z - (p.vel.z / speed) * back + Math.cos(time * 8 + k) * 0.07, 0, (0.11 - 0.022 * k) * out);
          }
        } else if (p.behavior === 'boomerang') {
          y = 0.7 + up;
          if (p.kind === 'yoyoLauncher') {
            // the yo-yo rolls along its string, out and back to the hand that holds it
            yoyos.add(p.pos.x, y, p.pos.z, yaw, 1.3, undefined, time * 30 * (p.returning ? -1 : 1));
            const owner = s.players.find(pl => pl.id === p.ownerId);
            if (owner) {
              const oy = HAND + (owner.flying ? 2.5 : 0);
              const hx = owner.pos.x + owner.aim.x * 0.5, hz = owner.pos.z + owner.aim.z * 0.5;
              const dx = p.pos.x - hx, dy = y - oy, dz = p.pos.z - hz, len = Math.hypot(dx, dy, dz) || 0.001;
              from.set(hx, oy, hz);
              rods.addBeam(from, Math.atan2(dx, dz), -Math.asin(dy / len), len, 0xfffdf5, 0.035);
            }
          } else {
            // it whirls flat, the lights of its knobs drawn out into a ring behind them
            const spin = time * 20 + p.id;
            boomerangs.add(p.pos.x, y, p.pos.z, spin, 1.15);
            for (let k = 1; k <= (low ? 2 : 5); k++)
              for (const side of [-1, 1]) {
                const a = spin - k * 0.3 + (side > 0 ? 0 : 1.86);
                pix.add(p.pos.x + Math.sin(a - 0.93) * 0.52, y + 0.03, p.pos.z + Math.cos(a - 0.93) * 0.52, a, 0.13 - 0.02 * k, k < 3 ? 0xff5a4a : 0xa0221a);
              }
          }
        } else if (p.kind === 'candyCannon') {
          // sweets, every one in its colour: wrapped ones and lollipops, tumbling
          tint = CANDY_COLORS[p.id % CANDY_COLORS.length];
          const spin = time * 9 + p.id * 1.3;
          if (p.id % 3 === 0) lollies.add(p.pos.x, y, p.pos.z, spin, 1.05 * out, tint, 0.5 * Math.sin(spin));
          else bonbons.add(p.pos.x, y, p.pos.z, yaw + 0.6 * Math.sin(spin), 1.1 * out, tint, 0, spin);
        } else {
          // the Pixel Blaster's bolt (and whatever else is a plain bolt), in a glow of its colour
          tint = pal.playerShot;
          const arc = p.arc;
          const dive = arc && Math.hypot(p.pos.x - arc.x, p.pos.z - arc.z) < arc.reach ? Math.atan2(arc.lift - arc.end, arc.reach) : 0;
          // (past its full reach it burns out: smaller and darker with every tile, until it is spent)
          const left = p.from && p.range !== undefined && p.tail === undefined ? falloff(Math.hypot(p.pos.x - p.from.x, p.pos.z - p.from.z), p.range) : 1;
          if (left < 1) tint = dim(tint, 0.35 + 0.65 * left);
          bolts.add(p.pos.x, y, p.pos.z, yaw, 1.2 * out * (0.45 + 0.55 * left), tint, dive);
          if (!low && out >= 1 && left >= 1) auras.addScaled(p.pos.x, y, p.pos.z, yaw, 0.4, 0.4, 1, dim(tint, 0.2), dive);
        }
        now.set(p.id, { kind: p.kind, behavior: p.behavior, x: p.pos.x, z: p.pos.z, y, vx: p.vel.x, vz: p.vel.z, until: p.until, tick: s.tick, tint, target: p.target });
      }
      if (!cut) for (const [id, shot] of seen) if (!now.has(id)) end(shot, s);
      seen = now;

      // the mustard a hot dog left: it spreads, bubbles, and dries up at the end
      for (const a of s.areas) {
        const k = Math.min(1, (a.until - s.tick) / 30) * (0.85 + 0.15 * Math.min(1, (a.until - s.tick) / 30));
        rims.add(a.pos.x, 0.03, a.pos.z, a.id * 1.3, a.radius * k * 1.04);
        puddles.add(a.pos.x, 0.035, a.pos.z, a.id * 1.3 + 0.5, a.radius * k * 0.93);
        for (let i = 0; i < (low ? 3 : 7); i++) {
          // (bubbles that swell and burst, each in its own place and time; a streak of ketchup across it)
          const t = (time * 0.7 + i * 0.37 + a.id * 0.11) % 1, ang = i * 2.4 + a.id, r = a.radius * k * (0.25 + 0.5 * ((i * 0.37) % 1));
          pix.addScaled(a.pos.x + Math.cos(ang) * r, 0.06, a.pos.z + Math.sin(ang) * r, ang, 0.2 * Math.sin(Math.PI * t), 0.05, 0.2 * Math.sin(Math.PI * t), t > 0.8 ? 0xffffff : 0xfff3a0);
        }
        const turn = a.id * 1.3, cos = Math.cos(turn), sin = Math.sin(turn), r = a.radius * k;
        for (let i = 0; i < 5; i++) {
          // (a zigzag: every stroke runs from one side of its line to the other)
          const lx = (i - 2) * 0.2 * r, slope = i % 2 ? 1 : -1;
          pix.addScaled(a.pos.x + lx * cos, 0.055, a.pos.z - lx * sin, turn + Math.PI / 2 + slope * 0.9, 0.12 * k, 0.04, 0.33 * r, 0xd8261c);
        }
      }

      // the banana mines: lying in wait, a red light blinking on each once it is armed
      const laid = new Map<number, Vec2>();
      for (const m of s.mines) {
        laid.set(m.id, m.pos);
        const armed = s.tick >= m.armedAt;
        // (it drops from the hand and rocks a little as it settles)
        const settle = Math.max(0, 1 - (s.tick - (m.armedAt - MINE.armTicks)) / 14);
        bananas.add(m.pos.x, 0.11 + settle * 0.7, m.pos.z, m.id * 2.1 + settle * 3, 1.4, undefined, 0, settle * Math.sin(time * 30) * 0.3);
        const blink = armed && Math.floor(time * 4 + m.id * 0.37) % 2 === 0;
        pix.add(m.pos.x - 0.126 * Math.cos(m.id * 2.1), 0.26, m.pos.z + 0.126 * Math.sin(m.id * 2.1), 0, 0.1, blink ? 0xff3b3b : armed ? 0x5a1414 : 0xffb020);
        if (blink && !low) auras.add(m.pos.x, 0.26, m.pos.z, 0, 0.5, 0x661010);
        // (the moment it is armed a ring runs out as far as it listens)
        const since = (s.tick - m.armedAt) / 18;
        if (since >= 0 && since < 1) hoops.add(m.pos.x, 0.06, m.pos.z, 0, MINE.trigger * 2 * (1 - (1 - since) ** 2), since < 0.5 ? 0xff3b3b : 0x8a1a1a);
      }
      mines = laid;

      // the sword's slash: the blade itself sweeps across the front, white-hot in its glow, and leaves its light in the
      // air behind it, a trail that is white just behind the blade, then pink, then deep purple. The tip moves fastest:
      // the trail's root fades first, the light of the tip stays longest
      swinging.clear();
      for (let i = slashes.length - 1; i >= 0; i--) {
        const sl = slashes[i];
        sl.age += dt;
        if (sl.age >= SLASH_SECONDS) {
          slashes.splice(i, 1);
          continue;
        }
        // (it goes with whoever swings it)
        const who = s.players.find(p => p.id === sl.id);
        if (who) {
          sl.x = who.pos.x;
          sl.z = who.pos.z;
        }
        const y = HAND - 0.05 + (who?.flying ? 2.5 : 0);
        const t = sl.age / SLASH_SECONDS, half = (SWORD.halfArcDeg * Math.PI) / 180;
        const lead = slashSweep(t / SWEEP) * half, fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        // (an angle of the arc as a direction: 0 is the aim, positive to the right of it)
        const dir = (a: number) => ({ x: sl.ax * Math.cos(a) - sl.az * Math.sin(a), z: sl.az * Math.cos(a) + sl.ax * Math.sin(a) });
        const step = low ? 0.17 : 0.11, n = low ? 7 : SLASH_RAMP.length, reach = sl.radius - BLADE_ROOT;
        // (seen through the swinger's own eyes the trail runs right past them: there only its bright part is solid,
        // the rest is the glow, so it does not wall off the view)
        const solid = eyes.has(sl.id) ? n * 0.45 : n;
        for (let k = 0; k < n; k++) {
          const a = lead + k * step;
          if (a > half) break;
          const old = k / n, root = sl.radius - reach * (1 - Math.min(0.9, old ** 0.6)) * fade;
          const d = dir(a), long = sl.radius - root + 0.04, mid = (root + sl.radius) / 2, yaw = Math.atan2(d.x, d.z);
          const wide = sl.radius * step * 1.1;
          if (k < solid) pix.addScaled(sl.x + d.x * mid, y, sl.z + d.z * mid, yaw, wide, 0.05 * (1 - old * 0.5), long, SLASH_RAMP[Math.min(SLASH_RAMP.length - 1, Math.round((k * SLASH_RAMP.length) / n))]);
          if (!low) glows.addScaled(sl.x + d.x * mid, y, sl.z + d.z * mid, yaw, wide * 1.15, 0.3 * (1 - old * 0.6), long + 0.15, dim(BLADE_COLORS.glow, 0.42 * (1 - old) * fade));
        }
        if (t < SWEEP) {
          // the blade at the edge: its white core in its glow, and sparks off its tip
          const d = dir(lead), yaw = Math.atan2(d.x, d.z);
          from.set(sl.x + d.x * BLADE_ROOT, y + 0.01, sl.z + d.z * BLADE_ROOT);
          rods.addBeam(from, yaw, 0, reach, 0xffffff, 0.075);
          if (!low) {
            hazes.addBeam(from, yaw, 0, reach, dim(BLADE_COLORS.glow, 0.85), 0.2);
            hazes.addBeam(from, yaw, 0, reach, dim(BLADE_COLORS.haze, 0.55), 0.42);
          } else rods.addBeam(from, yaw, 0, reach, BLADE_COLORS.glow, 0.12);
          emit(sl.x + d.x * sl.radius, y, sl.z + d.z * sl.radius, d.x * 3 + (rand() - 0.5) * 2, rand() * 1.5, d.z * 3 + (rand() - 0.5) * 2, 0.18 + rand() * 0.14, 0.06, [0xffffff, 0xff6be6, 0xff2bd6], { fall: 3 });
          swinging.set(sl.id, { x: sl.x + d.x * sl.radius * 0.6, z: sl.z + d.z * sl.radius * 0.6 });
        }
      }
      // a drawn sword lights the floor round it a little, in its colour (more at night, where it is the light there
      // is); a swinging one where its blade is. No light of its own: a disc of added light that fades at its rim
      for (const p of s.players) {
        const drawn = p.downUntil === null && !p.out && p.vehicleId === null && !(p.rare && p.rareSelected) && p.weapons[p.selected]?.kind === 'laserSword';
        const out = bladeStep(blades.get(p.id) ?? 0, drawn, dt);
        if (out > 0) blades.set(p.id, out);
        else blades.delete(p.id);
        if (low || out === 0) continue;
        const swing = swinging.get(p.id);
        const k = (0.16 + 0.34 * theme.pointLights) * bladeReach(out) * bladeFlicker(time, p.id) * (swing ? 1.5 : 1) * (p.flying ? 0.4 : 1);
        ponds.add(swing ? swing.x : p.pos.x + p.aim.x * 0.75, 0.05, swing ? swing.z : p.pos.z + p.aim.z * 0.75, 0, 3.6, dim(BLADE_COLORS.glow, Math.min(1, k)));
      }
      // the lines the blade burnt into walls: they glow white, cool to pink and red, are a dark scar a moment, and go
      for (let i = scorches.length - 1; i >= 0; i--) {
        const c = scorches[i];
        const was = c.age;
        c.age += dt;
        if (c.age >= SCORCH_SECONDS) {
          scorches.splice(i, 1);
          continue;
        }
        if (c.age < 0) continue;
        // (as the blade gets there: a spit of sparks off the face)
        if (was < 0) spray(c.x, c.y, c.z, c.nx, c.nz, 2.2, some(2), 5, 0.2, 0.045, [0xffffff, 0xff6be6], { long: 3, fall: 6 });
        const t = c.age / SCORCH_SECONDS, size = Math.min(1, c.age / 0.04) * Math.min(1, (1 - t) * 5);
        pix.addScaled(c.x, c.y, c.z, c.along, 0.03, 0.045 * size, c.long * size, SCORCH_RAMP[Math.min(SCORCH_RAMP.length - 1, Math.floor(t * 1.6 * SCORCH_RAMP.length))]);
        if (!low && t < 0.25) glows.addScaled(c.x, c.y, c.z, c.along, 0.12, 0.2, c.long + 0.15, dim(BLADE_COLORS.glow, 0.5 * (1 - t / 0.25)));
      }
      // the crackle where a blade met something: short jagged lines of light that jump about the spot, every frame anew
      for (let i = crackles.length - 1; i >= 0; i--) {
        const c = crackles[i];
        c.age += dt;
        if (c.age >= CRACKLE_SECONDS) {
          crackles.splice(i, 1);
          continue;
        }
        const t = c.age / CRACKLE_SECONDS;
        for (let b = 0; b < (low ? 1 : 3); b++) {
          from.set(c.x, c.y, c.z);
          let yaw = rand() * Math.PI * 2;
          for (let j = 0; j < 3; j++) {
            const len = (0.12 + rand() * 0.18) * (1 - t * 0.5), pitch = (rand() - 0.5) * 1.6;
            rods.addBeam(from, yaw, pitch, len, j === 0 ? 0xffffff : 0xff8cf0, 0.03);
            from.set(from.x + Math.sin(yaw) * Math.cos(pitch) * len, from.y - Math.sin(pitch) * len, from.z + Math.cos(yaw) * Math.cos(pitch) * len);
            yaw += (rand() - 0.5) * 2;
          }
        }
      }
      // a nick of light on what a blade or a beam went through: two strokes that cross
      for (let i = cuts.length - 1; i >= 0; i--) {
        const c = cuts[i];
        c.age += dt;
        if (c.age >= CUT_SECONDS) {
          cuts.splice(i, 1);
          continue;
        }
        const t = c.age / CUT_SECONDS, long = 1.5 * (1 - (1 - t) ** 2), thick = 0.09 * (1 - t);
        pix.addScaled(c.x, c.y, c.z, c.yaw, thick, thick, long, 0xffffff, 0.5);
        pix.addScaled(c.x, c.y, c.z, c.yaw, thick * 2.2, thick * 0.6, long * 0.8, c.color, 0.5);
      }
      // the fly swatter's slap: the grid of its paddle printed on the air, bright, then green, then gone
      for (let i = swats.length - 1; i >= 0; i--) {
        const w = swats[i];
        w.age += dt;
        if (w.age >= SWAT_SECONDS) {
          swats.splice(i, 1);
          continue;
        }
        const t = w.age / SWAT_SECONDS, size = w.size * (1.25 - 0.25 * Math.min(1, t * 4)), thick = 0.07 * (1 - t * t);
        const color = t < 0.25 ? 0xffffff : t < 0.6 ? 0x9dffbf : 0x3bd16f;
        const cos = Math.cos(w.yaw), sin = Math.sin(w.yaw);
        for (let k = -2; k <= 2; k++) {
          const o = (k / 2) * size * 0.5;
          // (bars across and bars along, in the frame of the swing)
          pix.addScaled(w.x + sin * o, 0.75, w.z + cos * o, w.yaw, size, thick, thick, color);
          pix.addScaled(w.x + cos * o, 0.75, w.z - sin * o, w.yaw, thick, thick, size, color);
        }
      }
      // the rail's beam: a white core in a blue glow that thins away, square rings that run out along it
      for (let i = rails.length - 1; i >= 0; i--) {
        const r = rails[i];
        r.age += dt;
        if (r.age >= RAIL_SECONDS) {
          rails.splice(i, 1);
          continue;
        }
        const t = r.age / RAIL_SECONDS, thin = (1 - t) ** 1.6;
        const sin = Math.sin(r.yaw), cos = Math.cos(r.yaw);
        from.set(r.x, HAND, r.z);
        rods.addBeam(from, r.yaw, 0, r.len, 0xffffff, 0.15 * thin + 0.01);
        rods.addBeam(from, r.yaw, 0, r.len, t < 0.2 ? 0x9ff8ff : 0x3ad0ff, 0.34 * thin * thin);
        if (!low) hazes.addBeam(from, r.yaw, 0, r.len, dim(0x2ab8ff, 0.4 * thin), 0.5);
        for (let d = 0.4, k = 0; d < r.len; d += low ? 2.2 : 1.1, k++) {
          // (each ring starts as the beam's front passes it, spins, widens and is gone)
          const local = (r.age - d * 0.006) / 0.26;
          if (local <= 0 || local >= 1) continue;
          const size = 0.3 + 0.55 * local;
          frames.addScaled(r.x + sin * d, HAND, r.z + cos * d, r.yaw, size, size, 1 - local, RAIL_RAMP[Math.min(RAIL_RAMP.length - 1, Math.floor(local * RAIL_RAMP.length))], 0, (k % 2 ? 1 : -1) * (local * 2.2 + k));
        }
      }
      // the magnet's pull: a red and a blue line from the glove to the spot, flickering
      for (let i = pulls.length - 1; i >= 0; i--) {
        const m = pulls[i];
        m.age += dt;
        if (m.age >= MAGNET_SECONDS) {
          pulls.splice(i, 1);
          continue;
        }
        const who = s.players.find(p => p.id === m.id);
        if (who) {
          m.x = who.pos.x;
          m.z = who.pos.z;
        }
        const dx = m.tx - m.x, dz = m.tz - m.z, flat = Math.hypot(dx, dz) || 0.001;
        const t = m.age / MAGNET_SECONDS, wide = 0.07 * (1 - t) * (0.7 + 0.3 * Math.sin(time * 80));
        for (const side of [-1, 1]) {
          // (they leave the two poles of the glove and meet at the spot)
          const sx = m.x + (dx / flat) * 0.6 - (dz / flat) * side * 0.16, sz = m.z + (dz / flat) * 0.6 + (dx / flat) * side * 0.16;
          const ex = m.tx - sx, ez = m.tz - sz, len = Math.hypot(ex, ez, 0.3) || 0.001;
          from.set(sx, HAND, sz);
          rods.addBeam(from, Math.atan2(ex, ez), Math.asin(0.3 / len), len, side < 0 ? 0xff3b3b : 0x5f9bff, wide);
          if (!low) hazes.addBeam(from, Math.atan2(ex, ez), Math.asin(0.3 / len), len, side < 0 ? 0x661010 : 0x102a66, wide * 5);
        }
      }

      for (let i = hoopList.length - 1; i >= 0; i--) {
        const h = hoopList[i];
        h.age += dt;
        if (h.age >= h.life) {
          hoopList.splice(i, 1);
          continue;
        }
        if (h.age < 0) continue;
        const t = h.age / h.life;
        hoops.add(h.x, h.y, h.z, 0, h.from + (h.to - h.from) * (1 - (1 - t) ** 2), t > 0.7 ? dim(h.color, 0.6) : h.color);
      }
      for (let i = pixels.length - 1; i >= 0; i--) {
        const p = pixels[i];
        p.age += dt;
        if (p.age >= p.life) {
          pixels[i] = pixels[pixels.length - 1];
          pixels.pop();
          continue;
        }
        const slow = Math.exp(-p.drag * dt);
        p.vx *= slow;
        p.vz *= slow;
        p.vy = p.vy * slow - p.fall * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.04) {
          p.y = 0.04;
          p.vy = 0;
        }
        const t = p.age / p.life;
        const color = p.ramp[Math.min(p.ramp.length - 1, Math.floor(t * p.ramp.length))];
        // (it swells to its size and shrinks away at the end)
        const size = p.size * (1 + (p.grow - 1) * Math.min(1, t * 2.5)) * Math.min(1, (1 - t) * 3);
        if (p.long > 0) pix.addScaled(p.x, p.y, p.z, Math.atan2(p.vx, p.vz), size, size, size * p.long, color);
        else pix.add(p.x, p.y, p.z, p.spin + p.age * 5, size, color, p.spin);
      }

      for (const p of all) p.end();
    },
    setLow(v) {
      low = v;
    },
    setEyes(ids) {
      eyes = new Set(ids);
    },
    setViewers(ids) {
      viewers = new Set(ids);
    },
    pixels: () => pixels.length,
  };
}

/** a darker tone of a colour: light that is added to the picture is fainter the darker it is */
function dim(color: number, k: number): number {
  return (Math.round(((color >> 16) & 255) * k) << 16) | (Math.round(((color >> 8) & 255) * k) << 8) | Math.round((color & 255) * k);
}
