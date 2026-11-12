import * as THREE from 'three';
import { Tile, type FloorMap } from '../sim/map/tilemap';
import { glowMat, lambert } from './pool';
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
  /** blinking lights, flickering signs and swaying flags */
  update(time: number, glow: number): void;
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
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Theme decoration: benches and lamps on the plaza, lollipops in the factory, signs and cables in the
 * neon city, banners around the arena, vents and antennas on the roof. Everything stands next to a
 * wall or on top of one, never on a path, pad or spawn, and it is merged into a few meshes.
 */
export function buildDecor(ctx: DecorContext): Decor {
  const { map, look, tileOf, wallTopY } = ctx;
  const group = new THREE.Group();
  const blinkers: { mat: THREE.MeshStandardMaterial; base: number; speed: number; phase: number }[] = [];
  const flickers: { mat: THREE.MeshStandardMaterial; base: number; seed: number }[] = [];
  const flags: { mesh: THREE.Object3D; yaw: number; phase: number }[] = [];
  const flames: THREE.MeshStandardMaterial[] = [];
  const breathers: THREE.MeshStandardMaterial[] = [];
  // the minigame maps stay clean: nothing in the maze, on the track or in the lane
  if (['maze', 'race', 'lane'].includes(map.id)) return { group, update() {} };

  const isWall = (tx: number, tz: number) => tileOf(tx, tz) === Tile.Wall;
  const isFloor = (tx: number, tz: number) => tileOf(tx, tz) === Tile.Floor;
  const onBorder = (tx: number, tz: number) => tx <= 0 || tz <= 0 || tx >= map.w - 1 || tz >= map.h - 1;
  const clear = (tx: number, tz: number) => !ctx.keepClear.some(p => Math.abs(p.x - (tx + 0.5)) < 2.6 && Math.abs(p.z - (tz + 0.5)) < 2.6);
  /** the wall run through a tile is at most `w` wide and `d` long: a pillar, not a building */
  const pillar = (tx: number, tz: number, w: number, d: number) => {
    const run = (ox: number, oz: number) => {
      let n = 1;
      while (isWall(tx + ox * n, tz + oz * n)) n++;
      return n - 1;
    };
    return run(1, 0) + run(-1, 0) + 1 <= w && run(0, 1) + run(0, -1) + 1 <= d;
  };

  /** floor tiles that touch a wall (or hazard, for roof edges), thinned out by `density`, facing away from it */
  function edgeSpots(density: number, salt: number, against: (t: Tile) => boolean = t => t === Tile.Wall): Spot[] {
    const out: Spot[] = [];
    for (const c of ctx.floorTiles) {
      if (hash(c.tx * 13 + salt, c.tz * 5) > density || !clear(c.tx, c.tz)) continue;
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
  const flicker = (color: number, base: number, seed: number) => {
    const mat = glowMat(color, base);
    flickers.push({ mat, base, seed });
    return mat;
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
      props.at(s.x, 0, s.z, s.yaw);
      // trees are the plaza's signature: a third of everything standing around
      const k = Math.max(0, Math.floor(s.r * 9) - 2);
      if (k === 0) {
        // a tree in a planter: a trunk and three layers of leaves, taller than a player
        props.box(0.6, 0.3, 0.6, pot, 0, 0.15, 0).box(0.2, 0.95, 0.2, wood, 0, 0.75, 0);
        props.box(1.05, 0.55, 1.05, leafA, 0, 1.4, 0).box(0.78, 0.5, 0.78, leafB, 0.05, 1.9, -0.03).box(0.45, 0.4, 0.45, leafA, 0, 2.32, 0.04);
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
      props.at(s.x, 0, s.z, s.yaw);
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
      props.at(s.x, 0, s.z, s.yaw);
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
        const y = Math.min(wallTopY(c.tx, c.tz), wallTopY(c.tx + ox * (n + 1), c.tz + oz * (n + 1))) + 0.4;
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
      props.at(s.x, 0, s.z, s.yaw);
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
      props.at(s.x, 0, s.z, s.yaw);
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
  }

  props.build(group);
  if (!decals.empty) group.add(decals.build(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 })));
  // materials made here but merged away still need freeing with the world: group.traverse covers the meshes

  return {
    group,
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
    },
  };
}
