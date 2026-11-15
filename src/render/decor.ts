import * as THREE from 'three';
import { Tile, type FloorMap } from '../sim/map/tilemap';
import { ladders } from '../sim/map/ladders';
import { logoClear } from '../sim/map/logo-spots';
import { HELIPAD } from '../sim/config/floor-helipad';
import { glowMat, InstancedPool, lambert } from './pool';
import { DecalBuilder, PropBuilder, hash } from './props';

export interface DecorContext {
  map: FloorMap;
  /** the floor's look: plaza, candy, neon, arena, rooftop, ... (see floors.ts) */
  look: string;
  floorTiles: { tx: number; tz: number }[];
  wallTiles: { tx: number; tz: number }[];
  tileOf(tx: number, tz: number): Tile;
  /** where something standing on the wall block at a tile has its feet */
  wallTopY(tx: number, tz: number): number;
  /** spawn, elevator, pads and spots: nothing stands within reach of these */
  keepClear: { x: number; z: number }[];
}

export interface Decor {
  group: THREE.Group;
  /** the ladders: part of the game, so they stay when the decoration is turned off */
  ladders: THREE.Group;
  /** blinking lights, flickering signs, swaying flags and grass, rising bubbles */
  update(time: number, glow: number): void;
}

/** one instance of a moving piece (grass, kelp, LEDs, bubbles), refilled into its pool every frame */
interface Piece {
  pool: InstancedPool;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** sways from the foot, blinks, or rises and fades */
  move: 'sway' | 'blink' | 'rise';
  phase: number;
}

interface Spot {
  tx: number;
  tz: number;
  /** tile centre, pushed a little toward the wall it leans on */
  x: number;
  z: number;
  /** turns the prop so its back faces the wall */
  yaw: number;
  /** 0..1, picks the kind of prop */
  r: number;
}

const Q = Math.PI / 2;
/** the helicopter on the helipad: the paint of its hull (world.ts paints its wall blocks in it) */
export const HULL_COLOR = 0x24395f;
/** an edge spot sits 0.22 toward its wall, so the wall face is 0.28 behind it: nothing reaches further back */
const AGAINST_WALL = -0.27;
/** rails and rungs of the climbable ladders in each world */
const LADDER_COLORS: Record<string, [number, number]> = {
  plaza: [0x5a6378, 0xb07a3e],
  candy: [0xff6fa8, 0xfff4f8],
  neon: [0x454a66, 0x2c2a4a],
  arena: [0x6b4a2a, 0xb08a5a],
  rooftop: [0x3a3f52, 0x6a4a3a],
  helipad: [0x3c4454, 0xffc93a],
  uplink: [0x5a6680, 0xc9cfdd],
  jungle: [0x5a3d22, 0x8a6236],
  servers: [0x454a66, 0xf4f4ff],
  underwater: [0x4a5656, 0x7a8a7a],
};
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Theme decoration: benches and lamps on the plaza, lollipops in the factory, signs and cables in the
 * neon city, banners around the arena, vents and antennas on the roof, ferns and tall grass in the
 * jungle, blinking racks in the server farm, coral and kelp in the sunken arcade, the giant dish and its
 * cabinets, masts and transformer yards at the Uplink. Everything stands
 * next to a wall or on top of one, never on a path, pad or spawn, and it is merged into a few meshes;
 * only what moves (grass, kelp, LEDs, bubbles) is drawn as instances that are refilled each frame.
 */
/** how fast the Uplink's big dish turns on its tower, in radians a second */
const DISH_TURN = 0.3;

export function buildDecor(input: DecorContext): Decor {
  // the AmannLabs logos stay free: nothing is placed on, over or in front of them
  const logo = logoClear(input.map);
  const free = (c: { tx: number; tz: number }) => !logo.has(c.tz * input.map.w + c.tx);
  const ctx: DecorContext = { ...input, floorTiles: input.floorTiles.filter(free), wallTiles: input.wallTiles.filter(free) };
  const { map, look, tileOf, wallTopY } = ctx;
  const group = new THREE.Group();
  const blinkers: { mat: THREE.MeshStandardMaterial; base: number; speed: number; phase: number }[] = [];
  const flickers: { mat: THREE.MeshStandardMaterial; base: number; seed: number }[] = [];
  const flags: { mesh: THREE.Object3D; yaw: number; phase: number }[] = [];
  const flames: THREE.MeshStandardMaterial[] = [];
  const breathers: THREE.MeshStandardMaterial[] = [];
  /** (the Uplink's big dish is one of them: it turns on its tower, once round in about twenty seconds) */
  const spinners: { mesh: THREE.Object3D; speed: number; axis?: 'z' }[] = [];
  /** lights that come on one after the other: the rings of the dish's signal */
  const pulses: { mat: THREE.MeshStandardMaterial; phase: number }[] = [];
  /** lights that flash short and bright: the strobes of the helicopter */
  const strobes: { mat: THREE.MeshStandardMaterial; base: number; period: number; phase: number }[] = [];
  /** the helicopter's rotor wash: dust and scraps that run away from it over the ground, and its exhaust smoke */
  const gusts: { pool: InstancedPool; kind: 'dust' | 'scrap' | 'smoke'; x: number; y: number; z: number; dx: number; dz: number; phase: number; size: number; color: number }[] = [];
  const pools: InstancedPool[] = [];
  const pieces: Piece[] = [];
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const pool = (mat: THREE.Material, shadows = false) => {
    const p = new InstancedPool(group, unit, mat, 256, shadows);
    pools.push(p);
    return p;
  };
  // the minigame maps stay clean: nothing in the maze, on the track or in the lane
  if (['maze', 'race', 'lane'].includes(map.id)) return { group, ladders: new THREE.Group(), update() {} };

  const isWall = (tx: number, tz: number) => tileOf(tx, tz) === Tile.Wall;
  const isFloor = (tx: number, tz: number) => tileOf(tx, tz) === Tile.Floor;
  const onBorder = (tx: number, tz: number) => tx <= 0 || tz <= 0 || tx >= map.w - 1 || tz >= map.h - 1;
  const clear = (tx: number, tz: number) => !ctx.keepClear.some(p => Math.abs(p.x - (tx + 0.5)) < 2.6 && Math.abs(p.z - (tz + 0.5)) < 2.6);
  /** the wall run through a tile is at most `w` wide and `d` long: a pillar, not a building */
  const pillar = (tx: number, tz: number, w: number, d: number) => {
    const run = (ox: number, oz: number) => {
      // outside the map everything counts as wall: stop at the edge
      let n = 1;
      while (n <= 8 && isWall(tx + ox * n, tz + oz * n)) n++;
      return n - 1;
    };
    return run(1, 0) + run(-1, 0) + 1 <= w && run(0, 1) + run(0, -1) + 1 <= d;
  };

  // the ladders are part of the game (you climb them), so they stand where the sim says, with nothing else there
  const ladderList = ladders(map);
  const onLadder = (tx: number, tz: number) => ladderList.some(l => l.tx === tx && l.tz === tz);

  /** floor tiles that touch a wall (or hazard, for roof edges), thinned out by `density`, facing away from it */
  function edgeSpots(density: number, salt: number, against: (t: Tile) => boolean = t => t === Tile.Wall): Spot[] {
    const out: Spot[] = [];
    for (const c of ctx.floorTiles) {
      if (hash(c.tx * 13 + salt, c.tz * 5) > density || !clear(c.tx, c.tz) || onLadder(c.tx, c.tz)) continue;
      const dir = DIRS.find(([ox, oz]) => against(tileOf(c.tx + ox, c.tz + oz)));
      if (!dir) continue;
      const [ox, oz] = dir;
      out.push({ tx: c.tx, tz: c.tz, x: c.tx + 0.5 + ox * 0.22, z: c.tz + 0.5 + oz * 0.22, yaw: Math.atan2(-ox, -oz), r: hash(c.tx * 7 + salt, c.tz * 11) });
    }
    return out;
  }
  /** wall tiles surrounded by wall: the middle of a block, where roof clutter goes */
  function topSpots(density: number, salt: number): Spot[] {
    const out: Spot[] = [];
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz) || hash(c.tx * 29 + salt, c.tz * 31) > density) continue;
      if (!DIRS.every(([ox, oz]) => isWall(c.tx + ox, c.tz + oz))) continue;
      // and the blocks all round are as tall: whatever stands here may reach over the tile's edge without
      // ending up inside a taller neighbour
      let level = true;
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) if (isWall(c.tx + ox, c.tz + oz) && wallTopY(c.tx + ox, c.tz + oz) !== wallTopY(c.tx, c.tz)) level = false;
      if (!level) continue;
      out.push({ tx: c.tx, tz: c.tz, x: c.tx + 0.5, z: c.tz + 0.5, yaw: Math.floor(hash(c.tx, c.tz * 7 + salt) * 4) * Q, r: hash(c.tz * 3 + salt, c.tx * 19) });
    }
    return out;
  }
  /** wall tiles at a block's edge, facing the floor next to them: for banners and lights that look inward */
  function rimSpots(density: number, salt: number): Spot[] {
    const out: Spot[] = [];
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz) || hash(c.tx * 37 + salt, c.tz * 41) > density) continue;
      const dir = DIRS.find(([ox, oz]) => isFloor(c.tx + ox, c.tz + oz));
      if (!dir) continue;
      const [ox, oz] = dir;
      out.push({ tx: c.tx, tz: c.tz, x: c.tx + 0.5, z: c.tz + 0.5, yaw: Math.atan2(ox, oz), r: hash(c.tx * 3 + salt, c.tz * 23) });
    }
    return out;
  }
  const topY = (s: Spot) => wallTopY(s.tx, s.tz);

  const props = new PropBuilder();
  const decals = new DecalBuilder();
  const blink = (color: number, speed: number, phase: number) => {
    const mat = glowMat(color, 1.5);
    blinkers.push({ mat, base: 1.5, speed, phase });
    return mat;
  };
  const strobe = (color: number, base: number, phase: number) => {
    const mat = glowMat(color, base);
    strobes.push({ mat, base, period: 1.1, phase });
    return mat;
  };
  const flicker = (color: number, base: number, seed: number) => {
    const mat = glowMat(color, base);
    flickers.push({ mat, base, seed });
    return mat;
  };
  /** a ladder up the wall face behind a spot: two rails and rungs, from the floor to the block's top */
  const ladder = (into: PropBuilder, s: Spot, rail: THREE.Material, rung: THREE.Material) => {
    const h = wallTopY(s.tx - Math.round(Math.sin(s.yaw)), s.tz - Math.round(Math.cos(s.yaw))) + 0.12;
    into.at(s.x, 0, s.z, s.yaw);
    for (const x of [-0.18, 0.18]) into.box(0.06, h, 0.06, rail, x, h / 2, -0.24);
    for (let y = 0.25; y < h; y += 0.3) into.box(0.4, 0.05, 0.05, rung, 0, y, -0.24);
  };
  /** a flag hanging from a pole: its own mesh, so it can sway */
  const flag = (x: number, y: number, z: number, yaw: number, mat: THREE.Material, w: number, h: number) => {
    const g = new THREE.BoxGeometry(w, h, 0.05);
    g.translate(w / 2 + 0.04, 0, 0);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    flags.push({ mesh: m, yaw, phase: x * 1.7 + z * 0.9 });
  };

  if (look === 'plaza') {
    const leafA = lambert(0x4caf50), leafB = lambert(0x3e9d47), pot = lambert(0xb5653a), metal = lambert(0x5a6378), wood = lambert(0xb07a3e), cab = lambert(0x6b5bb8);
    const light = lambert(0xe6e8ef), dark = lambert(0x3a3f52), hydrant = lambert(0xe03a3a), bloomA = lambert(0xff6fa8), bloomB = lambert(0xffd23f);
    const lamp = glowMat(0xffe9a8, 1.6), screen = glowMat(0x2bf0ff, 1.2);
    breathers.push(screen);
    for (const s of edgeSpots(0.17, 0)) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      // trees are the plaza's signature: a third of everything standing around
      const k = Math.max(0, Math.floor(s.r * 9) - 2);
      if (k === 0) {
        // a tree in a planter: a trunk and three layers of leaves, taller than a player. It stands in the middle of
        // its tile (the spot leans 0.22 toward the wall) and its crown stays inside the tile, clear of the wall
        const c = 0.24;
        props.box(0.6, 0.3, 0.6, pot, 0, 0.15, c).box(0.2, 0.95, 0.2, wood, 0, 0.75, c);
        props.box(0.9, 0.55, 0.9, leafA, 0, 1.4, c).box(0.68, 0.5, 0.68, leafB, 0.05, 1.9, c - 0.03).box(0.4, 0.4, 0.4, leafA, 0, 2.32, c + 0.04);
      } else if (k === 1) {
        props.box(0.12, 1.6, 0.12, metal, 0, 0.8, 0).box(0.32, 0.22, 0.32, lamp, 0, 1.7, 0).box(0.4, 0.05, 0.4, dark, 0, 1.84, 0);
      } else if (k === 2) {
        props.box(0.55, 0.45, 0.55, wood, 0, 0.23, 0).box(0.4, 0.35, 0.4, wood, 0.1, 0.63, -0.05);
      } else if (k === 3) {
        props.box(0.6, 1.1, 0.5, cab, 0, 0.55, 0).box(0.45, 0.32, 0.05, screen, 0, 0.78, 0.26);
      } else if (k === 4) {
        // a park bench: two iron legs, three slats and a backrest, its back to the wall
        for (const sx of [-0.4, 0.4]) props.box(0.08, 0.42, 0.42, metal, sx, 0.21, 0);
        for (const oz of [-0.14, 0, 0.14]) props.box(1.0, 0.06, 0.11, wood, 0, 0.44, oz);
        props.box(1.0, 0.3, 0.06, wood, 0, 0.72, -0.2).box(0.06, 0.34, 0.06, metal, -0.4, 0.62, -0.2).box(0.06, 0.34, 0.06, metal, 0.4, 0.62, -0.2);
      } else if (k === 5) {
        // a flower box with pink and yellow blooms
        props.box(0.9, 0.34, 0.5, pot, 0, 0.17, 0).box(0.84, 0.16, 0.44, leafB, 0, 0.42, 0);
        for (let i = 0; i < 4; i++) props.box(0.14, 0.14, 0.14, i % 2 ? bloomA : bloomB, -0.3 + i * 0.2, 0.56, (i % 2 ? 0.08 : -0.08));
      } else {
        props.box(0.22, 0.55, 0.22, hydrant, 0, 0.28, 0).box(0.3, 0.12, 0.3, hydrant, 0, 0.6, 0).box(0.38, 0.1, 0.12, hydrant, 0, 0.42, 0);
      }
    }
    for (const s of topSpots(0.2, 0)) {
      props.at(s.x, topY(s), s.z, s.yaw);
      const k = Math.floor(s.r * 4);
      if (k === 0) props.box(0.7, 0.4, 0.55, light, 0, 0.2, 0).box(0.4, 0.04, 0.4, dark, 0, 0.42, 0);
      else if (k === 1) props.box(0.16, 0.5, 0.16, metal, -0.2, 0.25, 0).box(0.16, 0.35, 0.16, metal, 0.15, 0.18, 0.15).box(0.26, 0.06, 0.26, dark, -0.2, 0.52, 0);
      else if (k === 2) props.box(0.8, 0.22, 0.4, pot, 0, 0.11, 0).box(0.7, 0.25, 0.32, leafA, 0, 0.32, 0);
      else props.box(0.06, 1.2, 0.06, metal, 0, 0.6, 0).box(0.5, 0.04, 0.04, metal, 0, 1.0, 0).box(0.3, 0.04, 0.04, metal, 0, 0.8, 0).box(0.1, 0.1, 0.1, blink(0xff3b3b, 1.2, 0), 0, 1.25, 0);
    }
  } else if (look === 'candy') {
    const pink = lambert(0xff8fc8), mint = lambert(0x7fe0c8), lemon = lambert(0xfff07a), lilac = lambert(0xc49bff), sky = lambert(0x8fd8ff);
    const red = lambert(0xff4d6d), white = lambert(0xfff8fb), choc = lambert(0x6b4030), stick = lambert(0xfff4ee), cream = lambert(0xfff0f6);
    const pastels = [pink, mint, lemon, lilac, sky];
    for (const s of edgeSpots(0.18, 3)) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 5);
      const a = pastels[Math.floor(hash(s.tx, s.tz * 3) * 5)], b = pastels[Math.floor(hash(s.tz, s.tx * 5) * 5)];
      if (k === 0) {
        // a lollipop: a stick and a round-ish head of two crossed boxes with a swirl stripe
        props.box(0.08, 1.3, 0.08, stick, 0, 0.65, 0).box(0.62, 0.62, 0.14, a, 0, 1.55, 0).box(0.62, 0.62, 0.14, a, 0, 1.55, 0, Math.PI / 4);
        props.box(0.3, 0.3, 0.16, white, 0, 1.55, 0, Math.PI / 4);
      } else if (k === 1) {
        // a candy cane: red and white rings up the stick, a hook at the top
        for (let i = 0; i < 6; i++) props.box(0.16, 0.22, 0.16, i % 2 ? white : red, 0, 0.11 + i * 0.22, 0);
        props.box(0.16, 0.16, 0.16, red, 0, 1.4, 0).box(0.16, 0.16, 0.16, white, 0.16, 1.44, 0).box(0.16, 0.16, 0.16, red, 0.3, 1.34, 0);
      } else if (k === 2) {
        // a pile of gumdrops
        props.box(0.34, 0.3, 0.34, a, -0.18, 0.15, 0.08).box(0.3, 0.26, 0.3, b, 0.2, 0.13, -0.1).box(0.28, 0.26, 0.28, lemon, 0.02, 0.4, -0.02);
      } else if (k === 3) {
        // a wrapped sweet: a fat middle and two twisted ends
        props.box(0.5, 0.42, 0.42, a, 0, 0.21, 0, 0.2).box(0.2, 0.26, 0.26, a, -0.4, 0.21, 0, 0.5).box(0.2, 0.26, 0.26, a, 0.4, 0.21, 0, -0.5);
        props.box(0.52, 0.1, 0.44, white, 0, 0.21, 0, 0.2);
      } else {
        // a cupcake: a brown case, cream frosting, a cherry on top
        props.box(0.5, 0.36, 0.5, choc, 0, 0.18, 0).box(0.56, 0.22, 0.56, cream, 0, 0.47, 0).box(0.36, 0.22, 0.36, cream, 0, 0.68, 0).box(0.14, 0.14, 0.14, red, 0, 0.86, 0);
      }
    }
    for (const s of topSpots(0.2, 3)) {
      props.at(s.x, topY(s), s.z, s.yaw);
      const k = Math.floor(s.r * 3);
      if (k === 0) props.box(0.7, 0.22, 0.6, white, 0, 0.11, 0).box(0.3, 0.3, 0.3, white, 0.1, 0.3, -0.05).box(0.14, 0.14, 0.14, red, 0.1, 0.52, -0.05);
      else if (k === 1) for (let i = 0; i < 3; i++) props.box(0.26, 0.26, 0.26, white, -0.26 + i * 0.26, 0.13 + (i === 1 ? 0.26 : 0), 0);
      else props.box(0.4, 0.4, 0.4, pastels[Math.floor(s.r * 25) % 5], 0, 0.2, 0, Math.PI / 4);
    }
    // the candy machines in the halls (3×3 blocks): a gumball machine on top, a glass dome full of sweets
    const glass = new THREE.MeshStandardMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.35, roughness: 0.1 });
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz)) continue;
      let solid = true;
      for (let oz = -1; oz <= 1 && solid; oz++) for (let ox = -1; ox <= 1; ox++) if (!isWall(c.tx + ox, c.tz + oz)) solid = false;
      // the middle of a machine: walled all round, but floor two tiles out on every side
      if (!solid || !DIRS.every(([ox, oz]) => !isWall(c.tx + ox * 2, c.tz + oz * 2))) continue;
      const y = wallTopY(c.tx, c.tz), r = hash(c.tx * 5, c.tz * 7), a = pastels[Math.floor(r * 5)];
      props.at(c.tx + 0.5, y, c.tz + 0.5, Math.floor(r * 4) * Q);
      props.box(2.7, 0.14, 2.7, white, 0, 0.07, 0).box(1.3, 0.5, 1.3, a, 0, 0.39, 0).box(0.3, 0.2, 0.12, choc, 0, 0.35, 0.68);
      props.box(1.2, 1.0, 1.2, glass, 0, 1.14, 0).box(0.6, 0.18, 0.6, red, 0, 1.73, 0).box(0.16, 0.2, 0.16, red, 0, 1.92, 0);
      for (let i = 0; i < 14; i++) props.box(0.24, 0.24, 0.24, [red, ...pastels][Math.floor(hash(i, c.tx + c.tz) * 6)], -0.38 + hash(c.tx, i) * 0.76, 0.78 + hash(i * 3, c.tz) * 0.6 * (i < 9 ? 0.5 : 1), -0.38 + hash(c.tz, i * 7) * 0.76);
      // a lollipop sign on a corner and a candy-cane stripe round the base
      props.box(0.08, 1.0, 0.08, stick, 1.05, 0.6, 1.05).box(0.5, 0.5, 0.1, pastels[(Math.floor(r * 5) + 2) % 5], 1.05, 1.25, 1.05).box(0.25, 0.25, 0.12, white, 1.05, 1.25, 1.05, Math.PI / 4);
    }
    // sprinkles across the halls
    const sprinkle = [0xff8fc8, 0x7fe0c8, 0xfff07a, 0xc49bff, 0x8fd8ff, 0xff4d6d];
    for (const c of ctx.floorTiles) {
      if (hash(c.tx * 3, c.tz * 17) > 0.18) continue;
      for (let i = 0; i < 3; i++) {
        const u = hash(c.tx + i * 5, c.tz * 2 + 1), v = hash(c.tz + i * 9, c.tx * 2 + 3);
        decals.rect(c.tx + 0.12 + u * 0.76, c.tz + 0.12 + v * 0.76, 0.16, 0.06, sprinkle[Math.floor(hash(i, c.tx + c.tz) * 6)], u * Math.PI);
      }
    }
  } else if (look === 'neon') {
    const dark = lambert(0x1c1838), metal = lambert(0x2c2a4a), steel = lambert(0x454a66), orange = lambert(0xff7a2f), white = lambert(0xf4f4ff), rust = lambert(0x6a4a3a);
    const cyan = flicker(0x2bf0ff, 1.6, 1), pink = flicker(0xff2bd6, 1.6, 2), yellow = flicker(0xffd34a, 1.4, 3), signs = [cyan, pink, yellow];
    const screen = flicker(0x9ff6ff, 1.2, 4);
    const streetLamp = glowMat(0xfff1c4, 1.8);
    for (const s of edgeSpots(0.14, 5)) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 6);
      const glow = signs[Math.floor(hash(s.tx * 5, s.tz) * 3)];
      if (k === 0) {
        // a neon sign on a post, lit panel facing the street
        props.box(0.1, 1.9, 0.1, metal, 0, 0.95, 0).box(0.7, 0.5, 0.08, dark, 0, 1.75, 0.06).box(0.56, 0.36, 0.04, glow, 0, 1.75, 0.12);
      } else if (k === 1) {
        // a vending machine with a glowing front and a slot
        props.box(0.7, 1.4, 0.55, metal, 0, 0.7, 0).box(0.5, 0.8, 0.04, screen, 0, 0.9, 0.29).box(0.5, 0.12, 0.04, dark, 0, 0.32, 0.29);
      } else if (k === 2) {
        // barrels
        props.box(0.42, 0.6, 0.42, steel, -0.2, 0.3, 0.05, Math.PI / 4).box(0.42, 0.6, 0.42, rust, 0.24, 0.3, -0.1, Math.PI / 4).box(0.46, 0.06, 0.46, dark, -0.2, 0.33, 0.05, Math.PI / 4);
      } else if (k === 3) {
        // a dumpster with its lid ajar
        props.box(1.1, 0.7, 0.6, steel, 0, 0.35, 0).box(1.14, 0.08, 0.64, dark, 0, 0.76, -0.04).box(0.12, 0.1, 0.12, dark, -0.45, 0.05, 0.25).box(0.12, 0.1, 0.12, dark, 0.45, 0.05, 0.25);
      } else if (k === 4) {
        // a traffic cone pair
        for (const sx of [-0.22, 0.22]) props.box(0.34, 0.04, 0.34, dark, sx, 0.02, 0).box(0.2, 0.5, 0.2, orange, sx, 0.27, 0).box(0.22, 0.08, 0.22, white, sx, 0.3, 0);
      } else {
        // a vertical neon tube on the wall face
        props.box(0.06, 1.1, 0.06, glow, 0, 0.75, -0.27).box(0.1, 0.06, 0.08, metal, 0, 0.22, -0.26).box(0.1, 0.06, 0.08, metal, 0, 1.28, -0.26);
      }
    }
    for (const s of topSpots(0.13, 5)) {
      props.at(s.x, topY(s), s.z, s.yaw);
      const k = Math.floor(s.r * 4);
      if (k === 0) {
        // a billboard on two posts
        const glow = signs[Math.floor(hash(s.tz * 5, s.tx) * 3)];
        props.box(0.08, 1.3, 0.08, metal, -0.4, 0.65, 0).box(0.08, 1.3, 0.08, metal, 0.4, 0.65, 0).box(1.0, 0.6, 0.08, dark, 0, 1.3, 0).box(0.9, 0.5, 0.04, glow, 0, 1.3, 0.05);
      } else if (k === 1) {
        props.box(0.06, 1.5, 0.06, metal, 0, 0.75, 0).box(0.5, 0.04, 0.04, metal, 0, 1.2, 0).box(0.3, 0.04, 0.04, metal, 0, 0.95, 0).box(0.1, 0.1, 0.1, blink(0xff3b3b, 1.4, s.r * 6), 0, 1.55, 0);
      } else if (k === 2) {
        props.box(0.7, 0.4, 0.55, steel, 0, 0.2, 0).box(0.4, 0.04, 0.4, dark, 0, 0.42, 0).box(0.14, 0.14, 0.14, dark, 0.2, 0.47, 0.1);
      } else {
        props.box(0.8, 0.7, 0.8, rust, 0, 0.6, 0, Math.PI / 4).box(0.84, 0.08, 0.84, dark, 0, 0.96, 0, Math.PI / 4);
        for (const [sx, sz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) props.box(0.08, 0.26, 0.08, metal, sx, 0.13, sz);
      }
    }
    // cables slung from roof to roof over the narrow streets: thin dark lines high above the heads
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz) || hash(c.tx * 43, c.tz * 47) > 0.025) continue;
      for (const [ox, oz] of DIRS) {
        if (!isFloor(c.tx + ox, c.tz + oz)) continue;
        let n = 1;
        while (n < 7 && !isWall(c.tx + ox * (n + 1), c.tz + oz * (n + 1))) n++;
        if (n >= 7 || n < 2 || !isWall(c.tx + ox * (n + 1), c.tz + oz * (n + 1))) continue;
        // not across a logo
        if (Array.from({ length: n + 2 }, (_, i) => ({ tx: c.tx + ox * i, tz: c.tz + oz * i })).some(t => !free(t))) continue;
        // strung above the taller of the two roofs, so neither end disappears into a wall
        const y = Math.max(wallTopY(c.tx, c.tz), wallTopY(c.tx + ox * (n + 1), c.tz + oz * (n + 1))) + 0.4;
        props.at(c.tx + 0.5 + ox * (n + 1) / 2, y, c.tz + 0.5 + oz * (n + 1) / 2, ox ? Q : 0);
        props.box(0.03, 0.03, n + 1, dark, 0, 0, 0).box(0.03, 0.03, n + 1, dark, 0.2, -0.08, 0);
        props.box(0.5, 0.08, 0.5, dark, 0, -0.02, 0).box(0.1, 0.1, 0.1, blink(0xffd34a, 0.6, n), 0, -0.1, 0);
        break;
      }
    }
    if (map.id === 'highway') {
      // street lamps on the ends of the median pillars, lane markings on both carriageways
      for (const c of ctx.wallTiles) {
        if (!pillar(c.tx, c.tz, 2, 4) || (isWall(c.tx, c.tz - 1) && isWall(c.tx, c.tz + 1))) continue;
        if (hash(c.tx, c.tz) > 0.5) continue;
        const out = isWall(c.tx, c.tz - 1) ? 1 : -1;
        props.at(c.tx + 0.5, wallTopY(c.tx, c.tz), c.tz + 0.5, out > 0 ? 0 : Math.PI);
        props.box(0.14, 2.6, 0.14, steel, 0, 1.3, 0).box(0.1, 0.1, 1.1, steel, 0, 2.6, 0.5).box(0.36, 0.1, 0.3, dark, 0, 2.62, 1.0).box(0.3, 0.05, 0.24, streetLamp, 0, 2.56, 1.0);
      }
      // the carriageways run between the kerbs (z 18 and 37) and the pillars (z 26..29): a dashed centre
      // line on each, a solid edge line along the kerbs
      for (let tx = 2; tx < map.w - 2; tx++) {
        for (const tz of [22, 33]) if (tx % 2 === 0 && isFloor(tx, tz)) decals.rect(tx + 0.5, tz + 0.5, 1.2, 0.12, 0xf0ecff);
        for (const tz of [19, 36]) if (isFloor(tx, tz)) decals.rect(tx + 0.5, tz === 19 ? tz + 0.12 : tz + 0.88, 1, 0.1, 0xffd34a);
      }
    }
  } else if (look === 'arena') {
    const wood = lambert(0x8a5a2b), iron = lambert(0x4a4a52), sand = lambert(0xd9b98a), clothA = lambert(0xc8322e), clothB = lambert(0xe8b84a), rope = lambert(0xb09060), bowl = lambert(0x3a3a40);
    const flame = glowMat(0xff8a2b, 1.8);
    flames.push(flame);
    const flood = glowMat(0xfff4d6, 1.6);
    for (const s of edgeSpots(0.15, 7)) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 4);
      if (k === 0) {
        // barrels with iron hoops
        props.box(0.5, 0.64, 0.5, wood, -0.2, 0.32, 0.05, Math.PI / 4).box(0.54, 0.06, 0.54, iron, -0.2, 0.18, 0.05, Math.PI / 4).box(0.54, 0.06, 0.54, iron, -0.2, 0.5, 0.05, Math.PI / 4);
        props.box(0.5, 0.64, 0.5, wood, 0.26, 0.32, -0.08, Math.PI / 4).box(0.54, 0.06, 0.54, iron, 0.26, 0.34, -0.08, Math.PI / 4);
      } else if (k === 1) {
        // a rack with a spear and a shield
        props.box(0.9, 0.08, 0.3, wood, 0, 0.04, 0).box(0.08, 1.4, 0.08, wood, -0.3, 0.7, -0.1).box(0.08, 1.4, 0.08, wood, 0.3, 0.7, -0.1).box(0.9, 0.08, 0.08, wood, 0, 1.3, -0.1);
        props.box(0.5, 0.5, 0.06, clothA, 0, 0.75, -0.02, Math.PI / 4).box(0.2, 0.2, 0.08, clothB, 0, 0.75, -0.02, Math.PI / 4);
      } else if (k === 2) {
        // sandbags
        props.box(0.6, 0.26, 0.36, sand, -0.1, 0.13, 0).box(0.6, 0.26, 0.36, sand, 0.22, 0.13, 0.2, 0.3).box(0.6, 0.26, 0.36, sand, 0.06, 0.38, 0.1, 0.15);
      } else {
        // a stack of crates tied with rope
        props.box(0.6, 0.5, 0.6, wood, 0, 0.25, 0).box(0.64, 0.06, 0.64, rope, 0, 0.25, 0).box(0.44, 0.4, 0.44, wood, 0.08, 0.7, -0.06, 0.4);
      }
    }
    for (const s of rimSpots(0.1, 7)) {
      const y = topY(s);
      const k = Math.floor(s.r * 3);
      props.at(s.x, y, s.z, s.yaw);
      if (k < 2) {
        // a banner pole with a flag that sways
        props.box(0.1, 2.2, 0.1, iron, 0, 1.1, 0).box(0.18, 0.18, 0.18, clothB, 0, 2.25, 0);
        flag(s.x, y + 1.7, s.z, s.yaw, k === 0 ? clothA : clothB, 0.7, 0.9);
      } else {
        // a floodlight looking into the arena
        props.box(0.12, 2.4, 0.12, iron, 0, 1.2, 0).box(0.5, 0.3, 0.2, iron, 0, 2.45, 0.12).box(0.42, 0.22, 0.04, flood, 0, 2.45, 0.23);
      }
    }
    // braziers on the pillars
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz) || !pillar(c.tx, c.tz, 2, 2) || hash(c.tx * 11, c.tz * 13) > 0.5) continue;
      props.at(c.tx + 0.5, wallTopY(c.tx, c.tz), c.tz + 0.5);
      props.box(0.5, 0.12, 0.5, bowl, 0, 0.06, 0).box(0.36, 0.26, 0.36, bowl, 0, 0.22, 0).box(0.5, 0.1, 0.5, bowl, 0, 0.38, 0);
      props.box(0.26, 0.3, 0.26, flame, 0, 0.55, 0, Math.PI / 4).box(0.14, 0.22, 0.14, flame, 0.04, 0.78, -0.02);
    }
  } else if (look === 'rooftop') {
    const concrete = lambert(0x8a8ea0), metal = lambert(0x6a7088), rust = lambert(0x8a5a3a), dark = lambert(0x3a3f52), panel = lambert(0x24407a), glass = lambert(0x9fd8ff), tank = lambert(0x5c6a86);
    const skylight = glowMat(0x9fd8ff, 0.5);
    for (const s of topSpots(1, 9)) {
      props.at(s.x, topY(s), s.z, s.yaw);
      const k = Math.floor(s.r * 3);
      if (k === 0) {
        // a water tank on four legs with a rust band and a hatch
        for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) props.box(0.1, 0.5, 0.1, metal, sx, 0.25, sz);
        props.box(1.5, 1.3, 1.5, tank, 0, 1.15, 0, Math.PI / 4).box(1.54, 0.14, 1.54, rust, 0, 0.95, 0, Math.PI / 4).box(0.4, 0.1, 0.4, dark, 0.2, 1.85, 0.1);
      } else if (k === 1) {
        // an antenna mast with cross bars and a blinking light
        props.box(0.5, 0.16, 0.5, concrete, 0, 0.08, 0).box(0.1, 3.0, 0.1, metal, 0, 1.6, 0);
        for (const [h, w] of [[1.2, 0.8], [1.9, 0.6], [2.5, 0.4]]) props.box(w, 0.05, 0.05, metal, 0, h, 0).box(0.05, 0.05, w, metal, 0, h, 0);
        props.box(0.14, 0.14, 0.14, blink(0xff3b3b, 1.0, s.r * 9), 0, 3.2, 0);
      } else {
        // a bank of air conditioners
        for (const sx of [-0.45, 0.45]) props.box(0.8, 0.5, 0.7, concrete, sx, 0.25, 0).box(0.5, 0.04, 0.5, dark, sx, 0.52, 0).box(0.1, 0.1, 0.1, metal, sx, 0.6, 0);
        props.box(0.12, 0.12, 1.4, metal, 0, 0.3, 0.45);
      }
    }
    // along the roof's edge (the glitch rim) and next to the vents
    const rim = edgeSpots(0.06, 9, t => t === Tile.Hazard);
    for (const s of [...rim, ...edgeSpots(0.2, 11)]) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 5);
      if (k === 0) {
        // a solar panel on a tilted frame
        props.box(0.08, 0.5, 0.08, metal, -0.4, 0.25, -0.15).box(0.08, 0.5, 0.08, metal, 0.4, 0.25, -0.15).box(0.08, 0.25, 0.08, metal, -0.4, 0.12, 0.2).box(0.08, 0.25, 0.08, metal, 0.4, 0.12, 0.2);
        props.box(1.0, 0.06, 0.7, panel, 0, 0.42, 0).box(0.9, 0.02, 0.26, glass, 0, 0.46, -0.16).box(0.9, 0.02, 0.26, glass, 0, 0.46, 0.16);
      } else if (k === 1) {
        // a satellite dish
        props.box(0.08, 0.9, 0.08, metal, 0, 0.45, 0).box(0.7, 0.7, 0.08, concrete, 0, 1.0, 0.1, Math.PI / 4).box(0.3, 0.3, 0.1, concrete, 0, 1.0, 0.12).box(0.06, 0.06, 0.3, dark, 0, 1.0, 0.3);
      } else if (k === 2) {
        // a pipe run along the floor with two elbows
        props.box(1.2, 0.14, 0.14, rust, 0, 0.12, -0.2).box(0.14, 0.4, 0.14, rust, -0.55, 0.25, -0.2).box(0.14, 0.4, 0.14, rust, 0.55, 0.25, -0.2).box(0.2, 0.08, 0.2, dark, 0, 0.04, -0.2);
      } else if (k === 3) {
        // a skylight: a low frame with a faintly glowing glass pane
        props.box(0.9, 0.2, 0.9, dark, 0, 0.1, 0).box(0.76, 0.04, 0.76, skylight, 0, 0.21, 0);
      } else {
        // a roof vent with a turbine cap
        props.box(0.4, 0.5, 0.4, concrete, 0, 0.25, 0).box(0.5, 0.12, 0.5, metal, 0, 0.56, 0, Math.PI / 4).box(0.3, 0.1, 0.3, dark, 0, 0.66, 0);
      }
    }
  } else if (look === 'helipad') {
    const steel = lambert(0x5a6374), dark = lambert(0x2b303c), concrete = lambert(0x8d9199), yellow = lambert(0xffc93a), white = lambert(0xeef0f4), red = lambert(0xd0352a);
    const navy = lambert(HULL_COLOR), trim = lambert(0x1a2a48), glass = lambert(0x8fd0ff), orange = lambert(0xff7a1a), rubber = lambert(0x1c1f26), grille = lambert(0x3a404c);
    const floodMat = glowMat(0xfff4d0, 1.3), beaconMat = blink(0xff2a2a, 1.6, 0), green = (phase: number) => blink(0x5dff8a, 2, phase);
    const { pad, heli, hut, plant, container, pipe, walkway } = HELIPAD;
    /** the top of a jersey barrier (see LOW_WALL_HEIGHT in world.ts): the tail boom and the pipe rest on them */
    const lowTop = 0.5;
    // (a long block's tiles come in different heights, patch by patch: what stands on one stands on its own tile's
    // top, and what spans several on the tallest of them)
    const topAt = (x: number, z: number) => wallTopY(Math.floor(x), Math.floor(z));
    const topOver = (x0: number, x1: number, z0: number, z1: number) => {
      let top = 0;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) top = Math.max(top, wallTopY(x, z));
      return top;
    };
    /**
     * something that turns through (x, y, z): rotor blades, fans, the beacon; each bar its own mesh at that axis.
     * About the y axis, or about z for a rotor standing on its side (the tail rotor); a bar may be turned by `yaw`
     * about y or by `roll` about z before it goes on
     */
    const spinner = (x: number, y: number, z: number, speed: number, axis?: 'z') => ({
      bar(w: number, h: number, d: number, mat: THREE.Material, dy = 0, yaw = 0, roll = 0) {
        const g = new THREE.BoxGeometry(w, h, d);
        if (roll) g.rotateZ(roll);
        if (yaw) g.rotateY(yaw);
        g.translate(0, dy, 0);
        const m = new THREE.Mesh(g, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        group.add(m);
        spinners.push({ mesh: m, speed, axis });
        return this;
      },
    });
    /** the blur of a rotor going round: a thin dark disc one sees through, and the pale ring the blade tips run on */
    const blur = (x: number, y: number, z: number, r: number, roll: number) => {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 48), new THREE.MeshBasicMaterial({ color: 0x1c1f26, transparent: true, opacity: 0.26, depthWrite: false }));
      const tips = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r + 0.04, 64).rotateX(-Math.PI / 2).translate(0, 0.015, 0), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      for (const m of [disc, tips]) {
        m.position.set(x, y, z);
        m.rotation.x = roll;
        group.add(m);
      }
    };
    /** the ghosts of a blade: fainter, wider copies trailing it, so the rotor is seen to turn even in a still frame */
    const ghosts = [0.45, 0.22].map(opacity => new THREE.MeshLambertMaterial({ color: 0x1c1f26, transparent: true, opacity, depthWrite: false }));
    // the markings: a yellow ring round the pad, a white one inside it, the big H under the helicopter (its bars come
    // out on either side of the hull), and the walkway's dashed lines
    const ring = (r: number, w: number, color: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        decals.rect(pad.x + Math.cos(a) * r, pad.z + Math.sin(a) * r, (2 * Math.PI * r) / n + 0.02, w, color, a + Q);
      }
    };
    ring(pad.r, 0.36, 0xffc93a, 56);
    ring(pad.r - 1.6, 0.22, 0xf4f6f8, 48);
    for (const dx of [-3.7, 3.7]) decals.rect(pad.x + dx, pad.z, 1.2, 9, 0xf4f6f8);
    decals.rect(pad.x, pad.z, 6.2, 1.2, 0xf4f6f8);
    for (let z = walkway.z0; z <= walkway.z1; z++) for (const dx of [-0.9, 0.9]) decals.rect(walkway.x + dx, z + 0.5, 0.12, 0.7, 0xf4f6f8);
    // a yellow line round the fuel tanks, and hatching in front of the hut's door
    const t0 = HELIPAD.tanks[0], t1 = HELIPAD.tanks[1];
    const fx0 = t0.x0 - 0.5, fx1 = t1.x0 + 2.5, fz0 = t0.z0 - 0.5, fz1 = t0.z0 + 2.5;
    decals.rect((fx0 + fx1) / 2, fz0, fx1 - fx0, 0.12, 0xffc93a).rect((fx0 + fx1) / 2, fz1, fx1 - fx0, 0.12, 0xffc93a).rect(fx0, (fz0 + fz1) / 2, 0.12, fz1 - fz0, 0xffc93a).rect(fx1, (fz0 + fz1) / 2, 0.12, fz1 - fz0, 0xffc93a);
    // (the hatching keeps west of the hut's second tile: the AmannLabs logo hangs on the wall east of it)
    for (let i = 0; i < 5; i++) decals.rect(hut.x0 + 1.1 + (i - 2) * 0.22, hut.z1 + 1.5, 0.1, 1.2, 0xffc93a, 0.6);
    // the pad's edge lights: green, running round the ring one after the other
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = pad.x + Math.cos(a) * (pad.r + 0.7), z = pad.z + Math.sin(a) * (pad.r + 0.7);
      if (!isFloor(Math.floor(x), Math.floor(z))) continue;
      props.at(x, 0, z).box(0.3, 0.1, 0.3, dark, 0, 0.05, 0).box(0.18, 0.1, 0.18, green(i * 0.4), 0, 0.14, 0);
    }
    // the floodlight towers: a mast with two lamps looking at the pad
    for (const [tx, tz] of HELIPAD.towers) {
      const yaw = Math.atan2(pad.x - tx - 0.5, pad.z - tz - 0.5);
      props.at(tx + 0.5, wallTopY(tx, tz), tz + 0.5, yaw);
      props.box(0.14, 1.8, 0.14, steel, 0, 0.9, 0).box(0.9, 0.08, 0.08, steel, 0, 1.75, 0);
      for (const sx of [-0.3, 0.3]) props.box(0.36, 0.26, 0.2, dark, sx, 1.78, 0.12).box(0.3, 0.2, 0.04, floodMat, sx, 1.78, 0.23);
    }
    // the helicopter, in the middle of the pad with its nose to the east. Its hull is the wall block (riveted plate
    // in its navy, see world.ts); everything else stands on it or hangs flush on its sides: the cabin with its
    // doors and windows, the cockpit glass round the nose, the engine with its exhausts, the mast and the main rotor
    // going round under its blur, the skids at its foot, the tail boom lying on the barriers west of it with the fin
    // and the tail rotor. Nav lights on the sides (red left, green right), strobes on the roof and the fin, a
    // searchlight under the nose.
    const hx = (heli.x0 + heli.x1 + 1) / 2, hz = (heli.z0 + heli.z1 + 1) / 2, hy = wallTopY(heli.x0, heli.z0);
    const hl = (heli.x1 + 1 - heli.x0) / 2, hw = (heli.z1 + 1 - heli.z0) / 2;
    props.at(hx, hy, hz);
    // the cabin roof, rounded off by a narrower box on top, and the cockpit glass over the nose with its windscreen
    props.box(hl * 2 - 0.3, 0.5, hw * 2 - 0.2, navy, -0.25, 0.25, 0).box(hl * 2 - 1.3, 0.3, hw * 2 - 0.9, navy, -0.5, 0.62, 0);
    props.box(1.2, 0.5, hw * 2 - 0.5, glass, hl - 0.75, 0.25, 0).box(0.9, 0.05, hw * 2 - 0.45, glass, hl - 0.4, 0.3, 0, 0, -0.75);
    props.box(0.03, 0.55, hw * 2 - 0.5, glass, hl + 0.015, -0.33, 0);
    for (const side of [-1, 1]) {
      const sz = side * (hw + 0.015);
      // the stripes along the hull, two windows and the sliding door with its own window and handle
      props.box(hl * 2 - 0.2, 0.14, 0.03, white, -0.1, -0.2, sz).box(hl * 2 - 0.2, 0.05, 0.03, yellow, -0.1, -0.31, sz);
      for (const wx of [-1.9, -1.2]) props.box(0.5, 0.36, 0.03, glass, wx, -0.6, sz);
      props.box(1.15, 0.92, 0.025, trim, 0.1, -0.5, sz).box(0.55, 0.36, 0.03, glass, 0.1, -0.6, sz).box(0.2, 0.04, 0.04, white, -0.3, -0.85, sz);
      // the cockpit's side glass, and the nav light at the cabin's front corner
      props.box(0.8, 0.5, 0.03, glass, hl - 0.6, -0.4, sz);
      props.box(0.1, 0.1, 0.04, blink(side < 0 ? 0xff3b3b : 0x3bff7a, 1.2, 1), -0.3, 0.05, side * (hw - 0.08));
    }
    // the engine behind the mast, its exhausts pointing back over the tail, the antennas and the pitot tube
    props.box(1.5, 0.32, 1.1, grille, -1.0, 0.93, 0).box(0.24, 0.55, 0.24, dark, 0, 1.0, 0);
    for (const sz of [-0.35, 0.35]) props.box(0.5, 0.2, 0.2, dark, -1.9, 1.0, sz).box(0.04, 0.14, 0.14, glowMat(0xff6a30, 0.8), -2.14, 1.0, sz);
    props.box(0.04, 0.5, 0.04, steel, 0.9, 0.95, 0.9).box(0.04, 0.35, 0.04, steel, -1.8, 0.9, -0.8).box(0.5, 0.04, 0.04, steel, hl + 0.25, -0.1, 0.5);
    props.box(0.12, 0.12, 0.12, strobe(0xff2a2a, 1.9, 0), -2.1, 0.84, 0);
    // the searchlight under the nose
    props.box(0.3, 0.3, 0.4, dark, hl + 0.16, -0.75, 0).box(0.04, 0.22, 0.3, glowMat(0xfff1c8, 1.6), hl + 0.33, -0.75, 0);
    // the skids: a tube along each side at the foot of the hull, on short struts
    props.at(hx, 0, hz);
    for (const side of [-1, 1]) {
      props.box(hl * 2 - 0.6, 0.12, 0.12, steel, -0.1, 0.14, side * (hw + 0.22));
      for (const sx of [-1.5, 1.3]) props.box(0.12, 0.42, 0.34, steel, sx, 0.3, side * (hw + 0.1));
    }
    // the main rotor: four blades with yellow tips, going round fast, and the blur of them
    const rotorY = hy + 1.33;
    const rotor = spinner(hx, rotorY, hz, 24).bar(0.5, 0.18, 0.5, dark);
    for (const yaw of [0, Q]) {
      rotor.bar(hl * 3.5, 0.06, 0.38, rubber, 0, yaw).bar(hl * 3.5 + 0.5, 0.04, 0.2, yellow, -0.01, yaw);
      // (the rotor turns toward smaller yaws on screen, so the ghosts lie at larger ones, behind the blade)
      ghosts.forEach((g, i) => rotor.bar(hl * 3.5, 0.05, 0.5 + i * 0.2, g, -0.005, yaw + (i + 1) * 0.16));
    }
    blur(hx, rotorY, hz, hl * 1.8, 0);
    // the tail boom: on the barriers, with the fin, the stabiliser, the white strobe and the tail rotor at its end
    const tx0 = heli.tailX0, tz = heli.tailZ + 0.5, boomY = lowTop + 0.3, boomL = heli.x0 - tx0;
    props.at((tx0 + heli.x0) / 2, 0, tz);
    props.box(boomL + 0.2, 0.42, 0.42, navy, 0, boomY, 0).box(boomL + 0.2, 0.08, 0.44, white, 0, boomY + 0.1, 0);
    props.box(0.5, 1.0, 0.14, navy, -boomL / 2 + 0.35, boomY + 0.5, 0).box(0.3, 0.08, 1.3, navy, -boomL / 2 + 0.8, boomY + 0.25, 0);
    props.box(0.1, 0.1, 0.1, strobe(0xffffff, 1.6, 0.5), -boomL / 2 + 0.35, boomY + 1.02, 0);
    const tailY = boomY + 0.75, tailX = tx0 + 0.35, tailZ = tz + 0.12;
    const tail = spinner(tailX, tailY, tailZ, 40, 'z').bar(0.14, 0.14, 0.14, dark).bar(0.06, 1.3, 0.08, rubber).bar(1.3, 0.06, 0.08, rubber);
    ghosts.forEach((g, i) => tail.bar(1.3, 0.08, 0.06, g, 0, 0, (i + 1) * 0.3).bar(0.08, 1.3, 0.06, g, 0, 0, (i + 1) * 0.3));
    blur(tailX, tailY, tailZ + 0.02, 0.66, Q);
    // the rotor wash: dust that comes out from under the hull and runs along the ground away from it on every side,
    // a few scraps of paper and leaves skittering with it, and the exhausts' smoke blown back over the tail; each
    // its own instance, moved every frame (see update). The floor shows nothing: the wind is in the air.
    // (the dust is round puffs, not cubes: its own pool with a coarse ball)
    const dust = new InstancedPool(group, new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshLambertMaterial({ color: 0xd9dce2, transparent: true, opacity: 0.3, depthWrite: false }), 128, false);
    pools.push(dust);
    const scraps = pool(lambert(0xffffff));
    for (let i = 0; i < 64; i++) {
      // (in every direction, starting at the hull's edge that way)
      const a = (i / 64) * Math.PI * 2 + hash(i, 5) * 0.1, dx = Math.cos(a), dz = Math.sin(a);
      const edge = Math.min(hl / Math.max(Math.abs(dx), 0.01), hw / Math.max(Math.abs(dz), 0.01)) + 0.2;
      gusts.push({ pool: dust, kind: 'dust', x: hx + dx * edge, y: 0, z: hz + dz * edge, dx, dz, phase: hash(i, 7), size: 0.38 + hash(i, 9) * 0.4, color: [0xd0d4dc, 0xe4e7ee, 0xbfc4ce][i % 3] });
    }
    for (let i = 0; i < 12; i++) {
      const a = hash(i, 11) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      gusts.push({ pool: scraps, kind: 'scrap', x: hx + dx * 2.6, y: 0, z: hz + dz * 2.6, dx, dz, phase: hash(i, 13), size: 0.12 + hash(i, 15) * 0.1, color: [0xf4f4f0, 0x9a6a30, 0xd6b24a, 0x6f8a3a][i % 4] });
    }
    for (let i = 0; i < 8; i++) gusts.push({ pool: dust, kind: 'smoke', x: hx - 2.2, y: hy + 1.0, z: hz + (i % 2 ? 0.35 : -0.35), dx: -1, dz: 0, phase: i / 8, size: 0.14, color: 0x5c6069 });
    // the fuel tanks: eight-sided drums with a red band and a hatch, the pipe between them with a valve
    for (const t of HELIPAD.tanks) {
      props.at(t.x0 + 1, wallTopY(t.x0, t.z0), t.z0 + 1);
      for (const yaw of [0, Math.PI / 4]) props.box(1.5, 1.3, 1.5, white, 0, 0.65, 0, yaw).box(1.54, 0.18, 1.54, red, 0, 0.5, 0, yaw);
      props.box(0.5, 0.12, 0.5, dark, 0.2, 1.36, 0.2).box(0.12, 0.3, 0.12, steel, -0.4, 1.4, -0.3);
    }
    props.at((pipe.x0 + pipe.x1 + 1) / 2, lowTop, pipe.z + 0.5);
    props.box(pipe.x1 - pipe.x0 + 1.2, 0.18, 0.18, steel, 0, 0.1, 0).box(0.26, 0.26, 0.08, red, 0, 0.32, 0).box(0.06, 0.2, 0.06, steel, 0, 0.2, 0);
    // the plant room: air handlers with turning fans, and a duct along the back
    for (let x = plant.x0; x + 1 <= plant.x1; x += 2) {
      const cx = x + 1, cz = plant.z0 + 1, y = topOver(x, x + 1, plant.z0, plant.z1);
      props.at(cx, y, cz).box(1.5, 0.5, 1.5, concrete, 0, 0.25, 0).box(0.9, 0.04, 0.9, grille, 0, 0.52, 0.1);
      spinner(cx, y + 0.56, cz + 0.1, 5 + hash(x, 1) * 4).bar(0.7, 0.03, 0.1, white).bar(0.1, 0.03, 0.7, white);
    }
    props.at((plant.x0 + plant.x1 + 1) / 2, topOver(plant.x0, plant.x1, plant.z0, plant.z1), plant.z0 + 0.3).box(plant.x1 - plant.x0 + 0.6, 0.3, 0.3, steel, 0, 0.65, 0);
    // the control hut: a door and a window toward the pad, the beacon turning on the roof, an antenna, a windsock
    const hutMidX = (hut.x0 + hut.x1 + 1) / 2, beaconY = topAt(hutMidX, hut.z0 + 1.5), mastY = topAt(hut.x0 + 1, hut.z0 + 0.8), sockY = topAt(hut.x1 + 0.5, hut.z1 + 0.6);
    props.at(hut.x0 + 1.5, 0, hut.z0 - 0.02).box(0.8, 1.2, 0.04, dark, 0, 0.6, 0).box(0.1, 0.1, 0.04, yellow, 0.25, 0.6, 0).box(0.3, 0.14, 0.14, glowMat(0xffe9a8, 1.4), 0, 1.3, -0.05);
    props.at(hut.x1 - 1.5, 0, hut.z0 - 0.02).box(1.6, 0.6, 0.04, glass, 0, 0.95, 0).box(1.7, 0.06, 0.06, white, 0, 0.62, 0);
    props.at(hutMidX, beaconY, hut.z0 + 1.5).box(0.16, 0.7, 0.16, steel, 0, 0.35, 0);
    spinner(hutMidX, beaconY + 0.78, hut.z0 + 1.5, 2.2).bar(0.3, 0.3, 0.3, beaconMat).bar(0.5, 0.2, 0.08, dark, 0.03);
    props.at(hut.x0 + 1, mastY, hut.z0 + 0.8).box(0.08, 2.4, 0.08, steel, 0, 1.2, 0).box(0.6, 0.04, 0.04, steel, 0, 2.1, 0).box(0.4, 0.04, 0.04, steel, 0, 1.7, 0);
    props.at(hut.x1 + 0.5, sockY, hut.z1 + 0.6).box(0.08, 2.2, 0.08, white, 0, 1.1, 0);
    flag(hut.x1 + 0.5, sockY + 1.95, hut.z1 + 0.6, 0, orange, 1.1, 0.3);
    // the container: locking bars on its doors, at the east end
    props.at(container.x1 + 1.02, 0, (container.z0 + container.z1 + 1) / 2, Q);
    for (const sx of [-0.7, -0.3, 0.3, 0.7]) props.box(0.06, 1.2, 0.06, dark, sx, 0.6, 0);
    // the railing along the roof's edge: posts with a yellow top rail, missing in places
    for (const c of ctx.floorTiles) {
      const dir = DIRS.find(([ox, oz]) => tileOf(c.tx + ox, c.tz + oz) === Tile.Hazard);
      if (!dir || !clear(c.tx, c.tz)) continue;
      const [ox, oz] = dir;
      props.at(c.tx + 0.5, 0, c.tz + 0.5, Math.atan2(ox, oz));
      props.box(0.06, 0.95, 0.06, steel, -0.5, 0.48, 0.42);
      if (hash(c.tx * 7, c.tz * 3) < 0.14) continue;
      props.box(1.0, 0.05, 0.05, yellow, 0, 0.93, 0.42).box(1.0, 0.04, 0.04, steel, 0, 0.5, 0.42).box(1.0, 0.1, 0.03, dark, 0, 0.06, 0.42);
    }
    // what stands about: traffic cones, fire extinguishers, a toolbox, a ground power unit on wheels (not in the
    // rotor wash: the floor tiles there are the wash, and the wind would have taken all of it)
    for (const s of edgeSpots(0.14, 19).filter(s => isFloor(s.tx, s.tz))) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 4);
      if (k === 0) {
        props.box(0.4, 0.04, 0.4, orange, 0, 0.02, 0).box(0.22, 0.3, 0.22, orange, 0, 0.17, 0).box(0.14, 0.3, 0.14, orange, 0, 0.45, 0).box(0.16, 0.06, 0.16, white, 0, 0.3, 0);
      } else if (k === 1) {
        props.box(0.2, 0.55, 0.2, red, 0, 0.28, 0).box(0.08, 0.1, 0.08, dark, 0, 0.6, 0).box(0.04, 0.3, 0.04, dark, 0.1, 0.4, 0.06);
      } else if (k === 2) {
        props.box(0.6, 0.3, 0.35, red, 0, 0.15, 0).box(0.62, 0.04, 0.37, dark, 0, 0.3, 0).box(0.2, 0.06, 0.08, dark, 0, 0.36, 0);
      } else {
        props.box(0.9, 0.6, 0.6, yellow, 0, 0.45, 0).box(0.9, 0.06, 0.62, dark, 0, 0.75, 0);
        for (const sx of [-0.3, 0.3]) props.box(0.2, 0.2, 0.1, rubber, sx, 0.1, 0.3).box(0.2, 0.2, 0.1, rubber, sx, 0.1, -0.3);
        props.box(0.4, 0.06, 0.06, dark, 0.45, 0.55, 0.2);
      }
    }
  } else if (look === 'uplink') {
    const steel = lambert(0x5a6680), dark = lambert(0x2a3045), concrete = lambert(0x8a8ea0), white = lambert(0xe8ecf4), yellow = lambert(0xffd34a), rust = lambert(0x7a5a4a), cable = lambert(0x23283a);
    const lattice = lambert(0xc9cfdd), ceramic = lambert(0xd8d2c4), copper = lambert(0xb87333);
    const feed = glowMat(0x5fe8ff, 1.8), flood = glowMat(0xfff1c4, 1.6), window = glowMat(0x9fd8ff, 0.9), screen = flicker(0x7fd8ff, 1.1, 21);
    breathers.push(feed);
    const ledGreen = pool(glowMat(0x3bff8a, 1.4)), ledAmber = pool(glowMat(0xffb020, 1.2));
    /** a status light on a cabinet face: it blinks on its own */
    const led = (x: number, y: number, z: number, h: number) => pieces.push({ pool: h < 0.7 ? ledGreen : ledAmber, x, y, z, sx: 0.06, sy: 0.06, sz: 0.06, move: 'blink', phase: h * 40 });
    /** a red aircraft-warning light */
    const beacon = (phase: number) => blink(0xff3b3b, 1.0, phase);
    /** an antenna mast: a lattice of three uprights with cross bars, a beacon on top */
    const mast = (h: number, phase: number) => {
      for (const [sx, sz] of [[-0.14, -0.08], [0.14, -0.08], [0, 0.16]]) props.box(0.05, h, 0.05, lattice, sx, h / 2, sz);
      for (let y = 0.4; y < h; y += 0.5) props.box(0.34, 0.03, 0.03, lattice, 0, y, -0.08).box(0.03, 0.03, 0.3, lattice, -0.07, y, 0.04, 0.5).box(0.03, 0.03, 0.3, lattice, 0.07, y, 0.04, -0.5);
      props.box(0.1, 0.1, 0.1, dark, 0, h + 0.02, 0).box(0.12, 0.12, 0.12, beacon(phase), 0, h + 0.14, 0);
    };
    /** a small dish on a pole: eight plates round a hub, tipped toward the sky, its feed on a short arm */
    const smallDish = (yaw: number) => {
      props.box(0.1, 1.2, 0.1, steel, 0, 0.6, 0).box(0.3, 0.1, 0.3, dark, 0, 1.2, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        props.box(0.34, 0.04, 0.3, white, Math.cos(a) * 0.3, 1.45 + Math.sin(a) * 0.17, Math.sin(a) * 0.3 * 0.6, yaw + a, Math.sin(a) * 0.5);
      }
      props.box(0.04, 0.5, 0.04, dark, 0, 1.6, -0.1, 0, 0.5).box(0.1, 0.1, 0.1, feed, 0, 1.82, -0.2);
    };

    // ---- the giant dish on its tower in the middle: a tall mast, a yoke and a lattice bowl that turns round and round
    // (the pedestal is the 2x2 block nearest the middle of the map)
    let pedestal: { tx: number; tz: number } | null = null;
    for (const c of ctx.wallTiles) {
      if (!isWall(c.tx + 1, c.tz) || !isWall(c.tx, c.tz + 1) || !isWall(c.tx + 1, c.tz + 1) || isWall(c.tx - 1, c.tz) || isWall(c.tx, c.tz - 1) || isWall(c.tx + 2, c.tz) || isWall(c.tx, c.tz + 2)) continue;
      const d = Math.hypot(c.tx + 1 - map.w / 2, c.tz + 1 - map.h / 2);
      if (!pedestal || d < Math.hypot(pedestal.tx + 1 - map.w / 2, pedestal.tz + 1 - map.h / 2)) pedestal = c;
    }
    if (pedestal) {
      // the tower stands; its head (the yoke and the bowl) turns on it, round and round
      const tower = new THREE.Group(), dish = new THREE.Group();
      const top = wallTopY(pedestal.tx, pedestal.tz);
      // how much higher than a plain mast the tower is: the bowl hangs well clear of everything on the floor
      const LIFT = 3;
      tower.position.set(pedestal.tx + 1, top, pedestal.tz + 1);
      dish.position.set(pedestal.tx + 1, top, pedestal.tz + 1);
      const tp = new PropBuilder();
      // the base plate, the mast with its service ladder and a platform round its top
      tp.at(0, 0, 0);
      tp.box(2.2, 0.16, 2.2, concrete, 0, 0.08, 0).box(0.6, 2.3 + LIFT, 0.6, steel, 0, 1.3 + LIFT / 2, 0);
      for (const [sx, sz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) tp.box(0.14, 0.1, 0.14, dark, sx, 0.2, sz);
      for (const sx of [-0.14, 0.14]) tp.box(0.04, 2.0 + LIFT, 0.04, lattice, sx, 1.2 + LIFT / 2, 0.36);
      for (let y = 0.4; y < 2.2 + LIFT; y += 0.25) tp.box(0.32, 0.03, 0.03, lattice, 0, y, 0.36);
      tp.box(1.3, 0.06, 1.3, dark, 0, 2.3 + LIFT, 0);
      tp.build(tower);
      group.add(tower);
      const dp = new PropBuilder();
      // the turning head: a bearing on the mast, the yoke that holds the bowl's axle
      dp.at(0, 0, 0);
      dp.box(0.7, 0.1, 0.7, dark, 0, 2.5 + LIFT, 0);
      dp.box(1.8, 0.3, 0.6, steel, 0, 2.6 + LIFT, 0);
      for (const sx of [-0.75, 0.75]) dp.box(0.22, 0.9, 0.22, steel, sx, 2.9 + LIFT, 0).box(0.3, 0.3, 0.3, dark, sx, 3.3 + LIFT, 0);
      dp.build(dish);
      // the bowl, built with its axis up and then tipped toward the north and the sky: sixteen ribs along a parabola,
      // rings across them, a hub plate, the feed horn on three struts over the focus, and two beacons on the rim
      const bowl = new THREE.Group();
      bowl.position.set(0, 3.3 + LIFT, 0);
      bowl.rotation.x = -0.6;
      const bp = new PropBuilder();
      const R = 4.0, depth = 1.1, k = depth / (R * R), focus = (R * R) / (4 * depth);
      const ring = (r: number) => k * r * r;
      bp.at(0, 0, 0);
      bp.box(1.3, 0.1, 1.3, dark, 0, 0, 0).box(1.3, 0.1, 1.3, dark, 0, 0, 0, Math.PI / 4).box(1.8, 0.2, 0.2, steel, 0, -0.35, 0).box(0.9, 0.5, 0.7, steel, 0, -0.7, 0);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        for (let r0 = 0.6; r0 < R - 0.01; r0 += 0.85) {
          const r1 = Math.min(R, r0 + 0.85), rm = (r0 + r1) / 2, dr = r1 - r0, dy = ring(r1) - ring(r0);
          bp.box(Math.hypot(dr, dy) + 0.04, 0.07, 0.07, lattice, Math.cos(a) * rm, (ring(r0) + ring(r1)) / 2, -Math.sin(a) * rm, a, Math.atan2(dy, dr));
        }
      }
      for (const r of [1.2, 2.1, 3.0, R]) {
        const n = r < 2 ? 16 : 32, chord = 2 * r * Math.sin(Math.PI / n), rim = r === R;
        for (let i = 0; i < n; i++) {
          const a = ((i + 0.5) / n) * Math.PI * 2;
          bp.box(chord + 0.03, rim ? 0.1 : 0.06, rim ? 0.1 : 0.06, rim ? steel : lattice, Math.cos(a) * r, ring(r), -Math.sin(a) * r, a + Math.PI / 2);
        }
      }
      for (const a of [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3]) {
        const r = R - 0.3, dy = focus - 0.2 - ring(r);
        bp.box(Math.hypot(r, dy), 0.06, 0.06, lattice, (Math.cos(a) * r) / 2, (ring(r) + focus - 0.2) / 2, (-Math.sin(a) * r) / 2, a, Math.atan2(-dy, r));
      }
      bp.box(0.4, 0.6, 0.4, dark, 0, focus, 0).box(0.5, 0.14, 0.5, dark, 0, focus + 0.34, 0).box(0.3, 0.16, 0.3, feed, 0, focus - 0.36, 0);
      for (const a of [0, Math.PI]) bp.box(0.14, 0.14, 0.14, beacon(a), Math.cos(a) * R, ring(R) + 0.14, 0);
      bp.build(bowl);
      // the signal: rings of light widening up the beam, lit one after the other
      for (let j = 0; j < 4; j++) {
        const mat = glowMat(0x5fe8ff, 1.2);
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.45 + j * 0.4, 0.035, 6, 32), mat);
        m.rotation.x = Math.PI / 2;
        m.position.set(0, focus + 1.1 + j * 0.9, 0);
        bowl.add(m);
        pulses.push({ mat, phase: j * 0.9 });
      }
      dish.add(bowl);
      group.add(dish);
      // (the rest of the decoration is built in place; the dish's parts are placed through its groups, so their
      // world matrices are worked out here, before the first frame does)
      tower.updateMatrixWorld(true);
      dish.updateMatrixWorld(true);
      spinners.push({ mesh: dish, speed: DISH_TURN });
    }

    // ---- every block has its own gear on top, by its size: the 2x2 cabinets, the 3x2 transformers, the halls
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz) || isWall(c.tx - 1, c.tz) || isWall(c.tx, c.tz - 1)) continue;
      let w = 1, d = 1;
      while (isWall(c.tx + w, c.tz)) w++;
      while (isWall(c.tx, c.tz + d)) d++;
      if (pedestal && c.tx === pedestal.tx && c.tz === pedestal.tz) continue;
      const y = wallTopY(c.tx, c.tz), r = hash(c.tx * 7, c.tz * 3);
      if (w === 2 && d === 2) {
        const byLane = DIRS.some(([ox, oz]) => [tileOf(c.tx + ox * 2, c.tz + oz * 2), tileOf(c.tx + ox * 2, c.tz + 1 + oz * 2), tileOf(c.tx + 1 + ox * 2, c.tz + oz * 2)].includes(Tile.Boost));
        props.at(c.tx + 1, y, c.tz + 1, Math.floor(r * 4) * Q);
        if (byLane) {
          // a junction cabinet where a feeder line ends: a fuse box with a hazard stripe and an amber light
          props.box(1.5, 0.5, 1.2, steel, 0, 0.25, 0).box(1.54, 0.08, 1.24, yellow, 0, 0.3, 0).box(0.5, 0.3, 0.3, dark, 0.3, 0.65, 0).box(0.12, 0.12, 0.12, blink(0xffb020, 2.2, r * 9), 0.3, 0.86, 0);
          props.box(0.1, 0.4, 0.1, ceramic, -0.4, 0.7, 0.2).box(0.1, 0.4, 0.1, ceramic, -0.4, 0.7, -0.2).box(0.06, 0.06, 0.6, copper, -0.4, 0.92, 0);
        } else if (r < 0.34) {
          smallDish(Q);
        } else if (r < 0.67) {
          mast(2.6 + r, r * 9);
        } else {
          // an air conditioner with a fan that turns
          props.box(1.4, 0.6, 1.1, concrete, 0, 0.3, 0).box(0.9, 0.04, 0.9, dark, 0, 0.62, 0).box(0.1, 0.2, 0.1, steel, 0, 0.7, 0);
          const blades = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.1), white);
          blades.position.set(c.tx + 1, y + 0.68, c.tz + 1);
          group.add(blades);
          spinners.push({ mesh: blades, speed: 5 + r * 6 });
        }
      } else if (w === 3 && d === 2) {
        // a transformer: a finned tank with insulators and a bushing, a mast beside it
        props.at(c.tx + 1.5, y, c.tz + 1);
        props.box(2.4, 0.8, 1.4, steel, 0, 0.4, 0).box(2.5, 0.1, 1.5, dark, 0, 0.82, 0);
        for (let i = 0; i < 6; i++) props.box(0.06, 0.6, 1.5, dark, -1.0 + i * 0.4, 0.4, 0);
        for (const sx of [-0.7, 0, 0.7]) for (let j = 0; j < 4; j++) props.box(0.3 - j * 0.03, 0.08, 0.3 - j * 0.03, ceramic, sx, 0.95 + j * 0.12, 0.3);
        props.box(2.0, 0.05, 0.05, copper, 0, 1.45, 0.3).box(0.12, 0.4, 0.12, rust, -1.0, 1.0, -0.5).box(0.1, 0.1, 0.1, beacon(r * 7), -1.0, 1.25, -0.5);
        props.at(c.tx + 2.5, y, c.tz + 0.5);
        mast(3.2, r * 11);
      } else if (w >= 8 && d >= 4) {
        // a hall: a railing round the roof, a lattice mast with a beacon on one corner, a small dish, skylights,
        // an exhaust stack, and lit windows in the faces that look onto the floor (its blocks come in different
        // heights, like every block: everything stands on the top of the block under it)
        const topAt = (x: number, z: number) => wallTopY(Math.floor(x), Math.floor(z));
        const on = (x: number, z: number, yaw = 0) => props.at(x, topAt(x, z), z, yaw);
        for (let i = 0; i < w; i++) for (const z of [0.15, d - 0.15]) on(c.tx + i + 0.5, c.tz + z).box(0.04, 0.9, 0.04, steel, 0, 0.45, 0).box(1, 0.04, 0.04, steel, 0, 0.9, 0);
        for (let i = 0; i < d; i++) for (const x of [0.15, w - 0.15]) on(c.tx + x, c.tz + i + 0.5).box(0.04, 0.9, 0.04, steel, 0, 0.45, 0).box(0.04, 0.04, 1, steel, 0, 0.9, 0);
        on(c.tx + (r < 0.5 ? 1.2 : w - 1.2), c.tz + 1.2);
        mast(4.0, r * 13);
        on(c.tx + (r < 0.5 ? w - 1.5 : 1.5), c.tz + d - 1.5);
        smallDish(r < 0.5 ? -Q : Q);
        for (let i = 2; i < w - 2; i += 2) on(c.tx + i + 0.5, c.tz + d / 2).box(0.9, 0.2, 0.9, dark, 0, 0.1, 0).box(0.76, 0.04, 0.76, window, 0, 0.21, 0);
        on(c.tx + w / 2, c.tz + 1).box(0.4, 1.2, 0.4, concrete, 0, 0.6, 0).box(0.5, 0.1, 0.5, dark, 0, 1.22, 0);
        for (let i = 0; i < w; i++)
          for (const [z, side] of [[c.tz - 1, -1], [c.tz + d, 1]] as const) {
            if (!isFloor(c.tx + i, z) || !free({ tx: c.tx + i, tz: z }) || i % 2 === 0) continue;
            props.at(c.tx + i + 0.5, 0, c.tz + (side < 0 ? 0 : d - 1) + 0.5 + side * 0.515);
            props.box(0.7, 0.4, 0.03, hash(c.tx + i, z) < 0.8 ? window : screen, 0, 0.75, 0).box(0.76, 0.46, 0.02, dark, 0, 0.75, -side * 0.005);
          }
      }
    }

    // ---- the transformer yards: fence posts round the gratings, transformers along their back wall
    for (let tz = 1; tz < map.h - 1; tz++)
      for (let tx = 1; tx < map.w - 1; tx++) {
        if (tileOf(tx, tz) !== Tile.Hazard || !free({ tx, tz })) continue;
        for (const [ox, oz] of DIRS) {
          if (tileOf(tx + ox, tz + oz) !== Tile.Floor) continue;
          props.at(tx + 0.5 + ox * 0.42, 0, tz + 0.5 + oz * 0.42, Math.atan2(ox, oz));
          props.box(0.08, 0.9, 0.08, steel, 0, 0.45, 0).box(0.1, 0.08, 0.1, yellow, 0, 0.92, 0).box(1, 0.04, 0.03, steel, 0, 0.6, 0).box(1, 0.04, 0.03, steel, 0, 0.3, 0);
        }
        const wall = DIRS.find(([ox, oz]) => isWall(tx + ox, tz + oz));
        if (!wall || hash(tx * 5, tz * 9) > 0.45) continue;
        props.at(tx + 0.5 + wall[0] * 0.1, 0, tz + 0.5 + wall[1] * 0.1, Math.atan2(-wall[0], -wall[1]));
        props.box(0.6, 0.7, 0.5, steel, 0, 0.35, 0).box(0.64, 0.06, 0.54, dark, 0, 0.72, 0);
        for (let i = 0; i < 4; i++) props.box(0.04, 0.5, 0.56, dark, -0.24 + i * 0.16, 0.35, 0);
        for (const sx of [-0.15, 0.15]) for (let j = 0; j < 3; j++) props.box(0.16 - j * 0.03, 0.06, 0.16 - j * 0.03, ceramic, sx, 0.8 + j * 0.09, 0);
      }

    // ---- the feeder lines are marked on the floor beside them: a yellow line along each edge; cable ducts cross
    // the floor here and there
    for (const c of ctx.floorTiles) {
      for (const [ox, oz] of DIRS) if (tileOf(c.tx + ox, c.tz + oz) === Tile.Boost) decals.rect(c.tx + 0.5 + ox * 0.44, c.tz + 0.5 + oz * 0.44, ox ? 0.1 : 1, ox ? 1 : 0.1, 0xffd34a);
      if (hash(c.tx * 3, c.tz * 13) > 0.985 && clear(c.tx, c.tz)) props.at(c.tx + 0.5, 0, c.tz + 0.5, hash(c.tz, c.tx) * Math.PI).box(0.9, 0.07, 0.16, cable, 0, 0.04, 0).box(0.5, 0.06, 0.12, cable, 0.1, 0.1, 0.1);
    }

    // ---- along the walls: cabinets with status lights, cable drums, waveguides, floodlights, crates, signs
    for (const s of edgeSpots(0.17, 19)) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 6);
      if (k === 0) {
        // an equipment cabinet with a door and two status lights
        props.box(0.7, 1.3, 0.5, steel, 0, 0.65, 0).box(0.56, 1.0, 0.02, dark, 0, 0.7, 0.26).box(0.06, 0.2, 0.03, white, 0.2, 0.7, 0.27);
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        led(s.x + fx * 0.28 - fz * 0.18, 1.12, s.z + fz * 0.28 + fx * 0.18, hash(s.tx, s.tz));
        led(s.x + fx * 0.28 - fz * 0.06, 1.12, s.z + fz * 0.28 + fx * 0.06, hash(s.tz, s.tx * 3));
      } else if (k === 1) {
        // a cable drum on its side, half unwound
        props.box(0.7, 0.1, 0.7, rust, 0, 0.05, 0, Math.PI / 4).box(0.7, 0.1, 0.7, rust, 0, 0.05, 0).box(0.44, 0.32, 0.44, cable, 0, 0.26, 0, Math.PI / 4).box(0.7, 0.1, 0.7, rust, 0, 0.47, 0, Math.PI / 4).box(0.7, 0.1, 0.7, rust, 0, 0.47, 0);
      } else if (k === 2) {
        // a waveguide: a square pipe along the wall with flanges, up into the air at one end
        props.box(1.2, 0.16, 0.16, white, 0, 0.3, -0.12).box(0.2, 0.22, 0.22, steel, -0.4, 0.3, -0.12).box(0.2, 0.22, 0.22, steel, 0.3, 0.3, -0.12).box(0.16, 0.7, 0.16, white, 0.6, 0.6, -0.12).box(0.1, 0.14, 0.1, concrete, -0.2, 0.1, -0.12);
      } else if (k === 3) {
        // a floodlight on a pole, looking onto the floor
        props.box(0.3, 0.1, 0.3, concrete, 0, 0.05, 0).box(0.08, 2.4, 0.08, steel, 0, 1.2, 0).box(0.4, 0.26, 0.2, dark, 0, 2.45, 0.1).box(0.34, 0.2, 0.04, flood, 0, 2.45, 0.21);
      } else if (k === 4) {
        // equipment crates with a hazard stripe
        props.box(0.8, 0.5, 0.6, steel, 0, 0.25, 0).box(0.82, 0.06, 0.62, yellow, 0, 0.3, 0).box(0.5, 0.4, 0.5, steel, 0.1, 0.7, -0.03, 0.3);
      } else {
        // a warning sign: a yellow plate with a dark bolt on a post
        props.box(0.06, 1.0, 0.06, steel, 0, 0.5, 0).box(0.5, 0.5, 0.04, yellow, 0, 1.15, 0).box(0.1, 0.3, 0.02, dark, 0, 1.15, 0.03, 0, 0.35);
      }
    }
  } else if (look === 'jungle') {
    const leafA = lambert(0x3fae4a), leafB = lambert(0x2f8a3c), fern = lambert(0x4fbf5a), bark = lambert(0x6b4e32), stone = lambert(0x8a8f84), stoneDark = lambert(0x6c7168);
    const capRed = lambert(0xe04a3a), capTan = lambert(0xd9b07a), stem = lambert(0xf2e8d8), vine = lambert(0x3f9a38), flower = glowMat(0xff6ab0, 0.6);
    const blade = pool(lambert(0x5fbf4a)), bladeDark = pool(lambert(0x3f9a38));
    // tall grass: three blades per tile, taller than a monster (the sim hides monsters standing in it)
    for (const g of (map.grass ?? []).filter(g => free({ tx: Math.floor(g.x), tz: Math.floor(g.z) }))) {
      for (let k = 0; k < 3; k++) {
        const h = hash(g.x * 3 + k, g.z);
        pieces.push({ pool: k % 2 ? blade : bladeDark, x: g.x - 0.3 + k * 0.3, y: 0.55 + h * 0.2, z: g.z + (h - 0.5) * 0.5, sx: 0.12, sy: 1.1 + h * 0.4, sz: 0.12, move: 'sway', phase: g.x + g.z * 0.7 + k });
      }
    }
    // a crown of leaves on every trunk block, and vines down some faces
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz)) continue;
      const h = hash(c.tx, c.tz);
      // the crown spreads over the neighbouring tiles: it sits above the tallest trunk block next to it, so it
      // never cuts into one
      let rise = 0;
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) if (isWall(c.tx + ox, c.tz + oz)) rise = Math.max(rise, wallTopY(c.tx + ox, c.tz + oz) - wallTopY(c.tx, c.tz));
      props.at(c.tx + 0.5, wallTopY(c.tx, c.tz), c.tz + 0.5);
      props.box(1.6, 0.9, 1.6, h > 0.5 ? leafA : leafB, 0, 1.05 + h * 0.6 + rise, 0);
      if (h > 0.7) props.box(1, 0.7, 1, leafA, 0, 1.85 + h * 0.3 + rise, 0);
      for (const [ox, oz] of DIRS) {
        if (isWall(c.tx + ox, c.tz + oz) || hash(c.tx * 5 + ox, c.tz * 3 + oz) > 0.35) continue;
        const len = 0.5 + hash(c.tz, c.tx * 9) * 0.6;
        props.box(0.08, len, 0.08, vine, ox * 0.53 + (oz ? 0.25 : 0), -len / 2 + 0.05, oz * 0.53 + (ox ? -0.2 : 0));
      }
    }
    for (const s of edgeSpots(0.2, 13)) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 6);
      if (k < 2) {
        // a fern: four flat fronds fanning out
        for (let i = 0; i < 4; i++) props.box(0.7, 0.05, 0.22, fern, 0.2, 0.3 + i * 0.03, 0, i * (Math.PI / 2) + 0.4);
        props.box(0.1, 0.3, 0.1, bark, 0, 0.15, 0);
      } else if (k === 2) {
        // mushrooms
        props.box(0.12, 0.3, 0.12, stem, -0.15, 0.15, 0.1).box(0.4, 0.14, 0.4, capRed, -0.15, 0.36, 0.1).box(0.08, 0.04, 0.08, stem, -0.22, 0.45, 0.02);
        props.box(0.08, 0.2, 0.08, stem, 0.2, 0.1, -0.1).box(0.26, 0.1, 0.26, capTan, 0.2, 0.24, -0.1);
      } else if (k === 3) {
        props.box(0.6, 0.4, 0.5, stone, -0.1, 0.2, 0, 0.3).box(0.34, 0.26, 0.3, stoneDark, 0.28, 0.13, 0.12, 0.8);
      } else if (k === 4) {
        // a fallen branch with a few leaves
        props.box(1.2, 0.14, 0.14, bark, 0, 0.07, 0, 0.25).box(0.2, 0.1, 0.4, bark, 0.3, 0.1, 0.2, 0.3).box(0.3, 0.12, 0.3, leafA, -0.4, 0.2, 0.1);
      } else {
        for (let i = 0; i < 3; i++) props.box(0.06, 0.3, 0.06, vine, -0.2 + i * 0.2, 0.15, (i % 2) * 0.15).box(0.14, 0.14, 0.14, flower, -0.2 + i * 0.2, 0.36, (i % 2) * 0.15);
      }
    }
  } else if (look === 'servers') {
    const slot = lambert(0x1c2238), cable = lambert(0x23283a), steel = lambert(0x4d5873), dark = lambert(0x161a2a), blue = lambert(0x2b4e9a), red = lambert(0xe03a3a), white = lambert(0xe8ecf4);
    const ledGreen = pool(glowMat(0x3bff8a, 1.4)), ledBlue = pool(glowMat(0x2bb8ff, 1.4)), ledAmber = pool(glowMat(0xffb020, 1.2));
    const screen = flicker(0x7fd8ff, 1.1, 6), coolant = glowMat(0x2bf0ff, 0.9), warn = blink(0xffb020, 2.5, 0);
    breathers.push(coolant);
    // the long faces of every rack get a column of drive slots with blinking lights
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz)) continue;
      for (const side of [-1, 1]) {
        if (isWall(c.tx, c.tz + side)) continue;
        const z = c.tz + 0.5 + side * 0.51;
        for (let row = 0; row < 3; row++) {
          const y = 0.25 + row * 0.32;
          props.at(c.tx + 0.5, y, z).box(0.8, 0.22, 0.04, slot, 0, 0, 0);
          const h = hash(c.tx * 5 + row, c.tz * 3 + side);
          pieces.push({ pool: h < 0.6 ? ledGreen : h < 0.85 ? ledBlue : ledAmber, x: c.tx + 0.2 + h * 0.5, y, z: z + side * 0.03, sx: 0.07, sy: 0.07, sz: 0.04, move: 'blink', phase: h * 40 + row });
        }
      }
    }
    // bundles of cable along the floor of the aisles
    for (const c of ctx.floorTiles) {
      if (hash(c.tx, c.tz * 11) < 0.93) continue;
      props.at(c.tx + 0.5, 0, c.tz + 0.5).box(0.9, 0.06, 0.12, cable, 0, 0.04, 0).box(0.5, 0.05, 0.1, cable, 0.1, 0.09, 0.08);
    }
    for (const s of edgeSpots(0.12, 15)) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 5);
      if (k === 0) {
        // a console on a stand, screen tilted toward the aisle
        props.box(0.5, 0.9, 0.3, steel, 0, 0.45, -0.1).box(0.7, 0.5, 0.08, dark, 0, 1.1, 0.02).box(0.6, 0.4, 0.03, screen, 0, 1.1, 0.07);
      } else if (k === 1) {
        // coolant drums with a glowing level band
        for (const sx of [-0.22, 0.22]) props.box(0.36, 0.6, 0.36, blue, sx, 0.3, 0, Math.PI / 4).box(0.38, 0.06, 0.38, coolant, sx, 0.2, 0, Math.PI / 4);
      } else if (k === 2) {
        // a shipping crate for a server, lid propped
        props.box(0.8, 0.5, 0.6, steel, 0, 0.25, 0).box(0.82, 0.06, 0.62, dark, 0, 0.53, 0).box(0.1, 0.3, 0.1, white, -0.3, 0.15, 0.31).box(0.1, 0.3, 0.1, white, 0.3, 0.15, 0.31);
      } else if (k === 3) {
        props.box(0.16, 0.5, 0.16, red, 0, 0.25, -0.15).box(0.08, 0.1, 0.08, dark, 0, 0.55, -0.15).box(0.3, 0.06, 0.1, dark, 0, 0.1, -0.22);
      } else {
        // a cable spool
        props.box(0.6, 0.1, 0.6, dark, 0, 0.05, 0, Math.PI / 4).box(0.4, 0.36, 0.4, cable, 0, 0.28, 0, Math.PI / 4).box(0.6, 0.1, 0.6, dark, 0, 0.51, 0, Math.PI / 4);
      }
    }
    // cooling fans and cable trays on the racks, warning lights on the core
    for (const s of rimSpots(0.18, 15)) {
      props.at(s.x, topY(s), s.z, s.yaw);
      if (s.r < 0.5) {
        props.box(0.8, 0.12, 0.8, dark, 0, 0.06, 0).box(0.7, 0.04, 0.7, steel, 0, 0.13, 0);
        const g = new THREE.BoxGeometry(0.6, 0.03, 0.08);
        const blades = new THREE.Mesh(g, white);
        blades.position.set(s.x, topY(s) + 0.16, s.z);
        group.add(blades);
        spinners.push({ mesh: blades, speed: 6 + s.r * 8 });
      } else {
        props.box(1, 0.08, 0.3, steel, 0, 0.14, 0).box(0.06, 0.14, 0.06, steel, -0.4, 0.06, 0).box(0.06, 0.14, 0.06, steel, 0.4, 0.06, 0).box(0.9, 0.08, 0.2, cable, 0, 0.22, 0);
      }
    }
    for (const s of topSpots(1, 15)) {
      props.at(s.x, topY(s), s.z, s.yaw);
      props.box(0.5, 0.5, 0.5, dark, 0, 0.25, 0).box(0.3, 0.6, 0.3, coolant, 0, 0.3, 0).box(0.14, 0.14, 0.14, warn, 0, 0.72, 0);
    }
  } else if (look === 'underwater') {
    const coralMats = [lambert(0xff6a8a), lambert(0xffa23b), lambert(0xb15cff), lambert(0x2bd4d4)];
    const sand = lambert(0xe8d8aa), shell = lambert(0xfff2e0), star = lambert(0xff8a4a), wood = lambert(0x5a4030), gold = glowMat(0xffd34a, 0.5), iron = lambert(0x4a5058), cab = lambert(0x2a2a44), dead = lambert(0x1a1a24);
    const anemone = glowMat(0xff6ab0, 0.8);
    breathers.push(anemone, gold);
    const kelp = pool(lambert(0x2f9a5a)), kelpLight = pool(lambert(0x4fc07a));
    const bubble = pool(new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.55 }));
    // coral grows on the reefs; kelp in the kelp beds and a strand here and there; bubbles from the sea bed
    for (const c of ctx.wallTiles) {
      if (onBorder(c.tx, c.tz)) continue;
      props.at(c.tx + 0.5, wallTopY(c.tx, c.tz), c.tz + 0.5);
      for (let k = 0; k < 3; k++) {
        const h = hash(c.tx * 3 + k, c.tz * 7);
        props.box(0.22, 0.4 + h * 0.4, 0.22, coralMats[Math.floor(h * coralMats.length)], -0.3 + h * 0.6, 0.2 + k * 0.1 + h * 0.2, -0.2 + hash(c.tz, c.tx + k) * 0.4, h * 2);
      }
    }
    for (let tz = 1; tz < map.h - 1; tz++) {
      for (let tx = 1; tx < map.w - 1; tx++) {
        const t = tileOf(tx, tz), h = hash(tx, tz);
        if (!free({ tx, tz })) continue;
        if (t === Tile.Hazard || (t === Tile.Floor && h > 0.975)) {
          for (let k = 0; k < (t === Tile.Hazard ? 2 : 1); k++) {
            const c = hash(tx + k * 13, tz);
            pieces.push({ pool: c > 0.5 ? kelp : kelpLight, x: tx + 0.25 + c * 0.5, y: 0.9 + c * 0.5, z: tz + 0.5, sx: 0.14, sy: 1.8 + c, sz: 0.14, move: 'sway', phase: tx * 0.5 + tz + k });
          }
        }
        if (t !== Tile.Wall && h > 0.985) for (let k = 0; k < 3; k++) pieces.push({ pool: bubble, x: tx + 0.5, y: 0, z: tz + 0.5, sx: 0.12, sy: 0.12, sz: 0.12, move: 'rise', phase: h * 10 + k * 1.3 });
      }
    }
    for (const s of edgeSpots(0.2, 17)) {
      props.at(s.x, 0, s.z, s.yaw, AGAINST_WALL);
      const k = Math.floor(s.r * 6);
      if (k === 0) {
        // a starfish: five arms
        for (let i = 0; i < 5; i++) props.box(0.5, 0.08, 0.14, star, 0.15, 0.04, 0, i * (Math.PI * 2 / 5));
      } else if (k === 1) {
        // a clam, half open
        props.box(0.5, 0.14, 0.44, shell, 0, 0.07, 0).box(0.5, 0.1, 0.44, shell, 0, 0.26, -0.12).box(0.3, 0.1, 0.1, anemone, 0, 0.16, 0.05);
      } else if (k === 2) {
        // a treasure chest with the lid up
        props.box(0.7, 0.4, 0.5, wood, 0, 0.2, 0).box(0.72, 0.06, 0.52, iron, 0, 0.2, 0).box(0.7, 0.1, 0.5, wood, 0, 0.62, -0.3).box(0.5, 0.1, 0.3, gold, 0, 0.42, 0);
      } else if (k === 3) {
        // a sunken arcade cabinet, keeled over, screen dead
        props.box(0.7, 1.3, 0.6, cab, 0, 0.55, 0, 0.3).box(0.5, 0.5, 0.05, dead, 0, 0.8, 0.31, 0.3).box(0.2, 0.3, 0.2, coralMats[1], 0.3, 1.3, 0.1);
      } else if (k === 4) {
        // anemones in a cluster
        for (let i = 0; i < 5; i++) props.box(0.1, 0.3 + hash(i, s.tx) * 0.2, 0.1, anemone, -0.25 + hash(s.tz, i) * 0.5, 0.15, -0.2 + hash(i, s.tz) * 0.4);
        props.box(0.5, 0.1, 0.4, sand, 0, 0.05, 0);
      } else {
        // an old anchor against the rock
        props.box(0.08, 1.0, 0.08, iron, 0, 0.5, -0.2).box(0.7, 0.08, 0.08, iron, 0, 0.15, -0.2).box(0.2, 0.2, 0.08, iron, 0, 1.05, -0.2, Math.PI / 4);
      }
    }
  }

  props.build(group);
  const [railColor, rungColor] = LADDER_COLORS[look] ?? LADDER_COLORS.plaza;
  const rail = lambert(railColor), rung = lambert(rungColor);
  const ladderProps = new PropBuilder();
  const ladderGroup = new THREE.Group();
  for (const l of ladderList) {
    const ox = Math.sign(Math.round(l.top.x - (l.tx + 0.5))), oz = Math.sign(Math.round(l.top.z - (l.tz + 0.5)));
    ladder(ladderProps, { tx: l.tx, tz: l.tz, x: l.tx + 0.5 + ox * 0.22, z: l.tz + 0.5 + oz * 0.22, yaw: Math.atan2(-ox, -oz), r: 0 }, rail, rung);
  }
  ladderProps.build(ladderGroup);
  if (!decals.empty) group.add(decals.build(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 })));
  // materials made here but merged away still need freeing with the world: group.traverse covers the meshes

  return {
    group,
    ladders: ladderGroup,
    update(time, glow) {
      for (const b of blinkers) b.mat.emissiveIntensity = (Math.sin(time * b.speed + b.phase) > 0.3 ? 1 : 0.08) * b.base * glow;
      const step = Math.floor(time * 12);
      for (const f of flickers) {
        // neon buzz: a slow breath, and now and then a short dropout
        const drop = hash(step, f.seed) > 0.93 ? 0.3 : 1;
        f.mat.emissiveIntensity = f.base * (0.9 + 0.1 * Math.sin(time * 6 + f.seed)) * drop * Math.min(glow, 1.4);
      }
      for (const m of breathers) m.emissiveIntensity = (1 + 0.2 * Math.sin(time * 3)) * glow;
      for (const m of flames) m.emissiveIntensity = (1.5 + 0.5 * Math.sin(time * 9) * Math.sin(time * 5.3)) * Math.min(glow, 1.4);
      for (const f of flags) f.mesh.rotation.y = f.yaw + Math.sin(time * 1.8 + f.phase) * 0.18;
      for (const s of spinners) s.mesh.rotation[s.axis ?? 'y'] = time * s.speed;
      for (const p of pulses) p.mat.emissiveIntensity = (0.25 + 0.95 * Math.max(0, Math.sin(time * 2.2 - p.phase))) * glow;
      for (const s of strobes) s.mat.emissiveIntensity = ((time / s.period + s.phase) % 1 < 0.07 ? 1 : 0.05) * s.base * glow;
      for (const p of pools) p.begin();
      for (const g of gusts) {
        if (g.kind === 'dust') {
          // out from under the hull and along the ground, curling up a little and drifting sideways, thinning out
          const t = (time * 0.5 + g.phase) % 1, run = 0.5 + t * 6.5, side = Math.sin(time * 2.6 + g.phase * 20) * 0.4 * t;
          const k = g.size * (0.6 + t) * (1 - t * t * 0.7);
          g.pool.addScaled(g.x + g.dx * run - g.dz * side, 0.12 + Math.sin(t * Math.PI) * 0.5, g.z + g.dz * run + g.dx * side, time * 2 + g.phase * 6, k, k * 0.55, k, g.color);
        } else if (g.kind === 'scrap') {
          // skitters away over the ground in little hops, tumbling
          const t = (time * 0.45 + g.phase) % 1, run = t * 7.5, hop = Math.abs(Math.sin(t * 19 + g.phase * 6)) * 0.25 * (1 - t);
          g.pool.addScaled(g.x + g.dx * run, 0.02 + hop, g.z + g.dz * run, time * 6 + g.phase * 9, g.size, 0.02, g.size * 0.7, g.color, 0, hop * 2);
        } else {
          // blown back over the tail, growing, gone at the end of its run
          const t = (time * 0.7 + g.phase) % 1, k = (g.size + t * 0.45) * Math.min(1, (1 - t) * 4);
          g.pool.addScaled(g.x + g.dx * t * 2.4, g.y + t * 0.7, g.z + Math.sin(time * 3 + g.phase * 7) * 0.15 * t, 0, k, k, k, g.color);
        }
      }
      for (const p of pieces) {
        if (p.move === 'sway') {
          // bend from the foot: the top moves, the foot stays
          const lean = Math.sin(time * 1.6 + p.phase) * 0.12;
          p.pool.addScaled(p.x + lean * p.sy * 0.5, p.y, p.z, 0, p.sx, p.sy, p.sz, undefined, 0, -lean);
        } else if (p.move === 'blink') {
          if (Math.sin(time * 3 + p.phase) > -0.2 || Math.floor(time * 9 + p.phase) % 7 !== 0) p.pool.addScaled(p.x, p.y, p.z, 0, p.sx, p.sy, p.sz);
        } else {
          const t = (time * 0.35 + p.phase) % 1;
          const size = p.sx * (0.6 + t);
          p.pool.addScaled(p.x + Math.sin(time * 3 + p.phase) * 0.15, 0.2 + t * 5, p.z, 0, size, size, size);
        }
      }
      for (const p of pools) p.end();
    },
  };
}
