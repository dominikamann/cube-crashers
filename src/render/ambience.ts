import * as THREE from 'three';
import { Tile, type FloorMap } from '../sim/map/tilemap';
import { shotHeight } from '../sim/systems/shot-height';
import type { SimEvent, SimState } from '../sim/types';
import { InstancedPool } from './pool';
import { hash } from './props';
import { buildWorldLife } from './ambience-worlds';

/**
 * Life in the worlds, drawn only (the game never hears of it): what moves, glows and flies about so a floor does
 * not stand still. Glitch fog over the glitch floor, birds that peck about and fly up when someone comes near (and
 * burst into feathers when a shot or a blast catches them), and for each world its own: see the `look` sections.
 */
export interface AmbienceContext {
  map: FloorMap;
  /** the floor's look: plaza, candy, neon, arena, ... (see floors.ts) */
  look: string;
  floorTiles: { tx: number; tz: number }[];
  wallTiles: { tx: number; tz: number }[];
  tileOf(tx: number, tz: number): Tile;
  wallTopY(tx: number, tz: number): number;
  /** spawn, elevator, pads and spots */
  keepClear: { x: number; z: number }[];
}

export interface Ambience {
  group: THREE.Group;
  /** `low`: the lowest graphics, where only what matters is drawn (the birds stay: they can be shot) */
  update(s: SimState, events: SimEvent[], time: number, glow: number, low: boolean): void;
  /** the sounds the life made since the last call, and where (the game plays those near a player, see main.ts) */
  takeSounds(): LifeSound[];
  dispose(): void;
}

export interface LifeSound {
  id: 'birdChirp' | 'birdFlutter' | 'critterPuff' | 'catMeow' | 'crowdCheer';
  x: number;
  z: number;
}


/** a bird as it is just now */
interface Bird {
  x: number;
  y: number;
  z: number;
  /** where it pecks about */
  home: { x: number; z: number; y: number };
  state: 'peck' | 'fly' | 'gone';
  /** a flight: from where, to where (and how high it goes on the way), and how far along (0..1) */
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  t: number;
  /** seconds the flight takes; for one that is gone, until it comes back */
  span: number;
  yaw: number;
  seed: number;
  body: number;
  head: number;
  wing: number;
}

/** the mist over one kind of special floor: its tiles, its colours, how many wisps each tile has, how high they rise,
 * how big they are and how fast they dance, and the colour of the sparks that dart out of it (null: none) */
interface Mist {
  tiles: { x: number; z: number; seed: number }[];
  colors: number[];
  per: number;
  high: number;
  size: number;
  pace: number;
  sparks: number | null;
  pool: InstancedPool;
}

/** a cat in the Town */
interface Cat {
  x: number;
  z: number;
  yaw: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
  t: number;
  span: number;
  state: 'sit' | 'walk' | 'run' | 'gone';
  /** seconds until it gets up again (sitting), or until it is back (gone) */
  wait: number;
  /** when someone last came too near (it does not take fright again at once) */
  startled: number;
  seed: number;
  /** its fur: the main colour and the white of its paws, chest and tail tip */
  coat: [number, number];
  lanes: { tx: number; tz: number }[];
}

/** a feather of a bird that was hit, as it drifts down */
interface Feather {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  spin: number;
  color: number;
}

/** what a bird is like in each world: pigeons in the town and on the plaza, parrots in the jungle, gulls on the roofs */
const BIRDS: Record<string, { n: number; body: number[]; head: number[]; wing: number[]; size: number; high: number }> = {
  plaza: { n: 9, body: [0x8a909c, 0x9aa0aa, 0x7a7f8a], head: [0x5c6a80, 0x55607a], wing: [0x6f7480, 0x80848e], size: 1, high: 4 },
  waldsee: { n: 12, body: [0x8a909c, 0x9aa0aa, 0x7a7f8a, 0xd8d4cc], head: [0x5c6a80, 0x55607a], wing: [0x6f7480, 0x80848e], size: 1, high: 6 },
  rooftop: { n: 7, body: [0xf2f2ee, 0xe6e6e2], head: [0xf8f8f4], wing: [0xb8bcc4, 0x9aa0aa], size: 1.25, high: 5 },
  jungle: { n: 8, body: [0xe0302a, 0x2aa0e0, 0x3ac04a, 0xf2c02a], head: [0xf2c02a, 0x2a4ae0, 0xe0302a], wing: [0x2a4ae0, 0x3ac04a, 0xe0302a], size: 1.1, high: 5 },
};

export function buildAmbience(ctx: AmbienceContext): Ambience {
  const { map, look } = ctx;
  const group = new THREE.Group();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const owned: { dispose(): void }[] = [];
  const pools: InstancedPool[] = [];
  const pool = (mat: THREE.Material, size = 256) => {
    owned.push(mat);
    const p = new InstancedPool(group, unit, mat, size, false);
    pools.push(p);
    return p;
  };
  const solid = () => pool(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const light = (opacity = 1) => pool(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false }));
  const clearOf = (x: number, z: number, d: number) => !ctx.keepClear.some(p => Math.hypot(p.x - x, p.z - z) < d);

  // ---- mist over the special floors, each in its own colour: violet glitch fog over the glitch floor, a yellow glow
  // over the speed floor (with sparks), electric blue haze over the Uplink's live gratings, swamp mist over the
  // jungle's mud. Soft wisps that dance: they wander in loops wider than their tile, so tiles side by side make one
  // cloud. (On the roofs and the helipad the hazard is the drop, under water the deep: no mist there.)
  const mists: Mist[] = [];
  const tilesOf = (want: (t: Tile) => boolean) => {
    const out: { x: number; z: number; seed: number }[] = [];
    for (let tz = 0; tz < map.h; tz++) for (let tx = 0; tx < map.w; tx++) if (want(ctx.tileOf(tx, tz))) out.push({ x: tx + 0.5, z: tz + 0.5, seed: hash(tx * 17, tz * 31) });
    return out;
  };
  const mist = (tiles: Mist['tiles'], colors: number[], o: Omit<Mist, 'tiles' | 'colors' | 'pool'>, opacity: number, additive = false) => {
    if (tiles.length) mists.push({ tiles, colors, ...o, pool: softPool(group, owned, pools, opacity, additive ? THREE.AdditiveBlending : THREE.NormalBlending) });
  };
  // (every map with such floor has it: the glitch on the plaza, in the factory, the city, the server farm, on the race
  // track (the no-ghost tiles) and in the lane; over the drop at the edge of the roofs and the helipad, a cloud mist)
  if (['plaza', 'candy', 'neon', 'arena', 'servers', 'lane'].includes(look)) mist(tilesOf(t => t === Tile.Hazard), [0xb8a8d8, 0xd0b0e0, 0xa8c8e0, 0xc8c0d8], { per: 5, high: 1.7, size: 1.7, pace: 1, sparks: null }, 0.5);
  // (on the race track low and thin: it must not hide the edge of the track from a driver)
  if (look === 'race') mist(tilesOf(t => t === Tile.Hazard), [0xb8a8d8, 0xd0b0e0, 0xa8c8e0], { per: 2, high: 0.7, size: 1.3, pace: 1, sparks: null }, 0.35);
  if (look === 'rooftop' || look === 'helipad') mist(tilesOf(t => t === Tile.Hazard).filter(f => f.seed < 0.55), [0xf4f6ff, 0xe8ecf8, 0xffffff], { per: 2, high: 1.2, size: 2.4, pace: 0.5, sparks: null }, 0.42);
  mist(tilesOf(t => t === Tile.Boost), [0xffd23f, 0xfff2a0, 0xffb820], { per: 3, high: 0.9, size: 1.3, pace: 1.8, sparks: 0xfff4b0 }, 0.42, true);
  if (look === 'uplink') mist(tilesOf(t => t === Tile.Hazard), [0x6ac8ff, 0x3df0ff, 0xb8e8ff], { per: 3, high: 1.1, size: 1.4, pace: 1.4, sparks: 0xd8f4ff }, 0.35, true);
  if (look === 'jungle') mist(tilesOf(t => t === Tile.Hazard), [0x8aa070, 0xa0b080, 0x708a60], { per: 2, high: 1.2, size: 2, pace: 0.6, sparks: null }, 0.32);
  const sparks = mists.some(m => m.sparks !== null) ? light() : null;

  const sounds: LifeSound[] = [];
  const sound = (id: LifeSound['id'], x: number, z: number) => {
    if (sounds.length < 16) sounds.push({ id, x, z });
  };
  // ---- each world's own (see ambience-worlds.ts)
  const life = buildWorldLife({ ctx, solid, light, sound: (id, x, z) => sound(id, x, z), soft: (opacity, additive) => softPool(group, owned, pools, opacity, additive ? THREE.AdditiveBlending : THREE.NormalBlending) });

  // ---- birds
  const kind = BIRDS[look];
  const birds: Bird[] = [];
  const feathers: Feather[] = [];
  const bodies = kind ? solid() : null, wings = kind ? solid() : null, heads = kind ? solid() : null, beaks = kind ? solid() : null, plumes = kind ? solid() : null;
  /** open floor where a bird may come down: not right by the start or the pads, not on the glitch */
  const perches: { x: number; z: number; y: number }[] = [];
  if (kind) {
    for (const c of ctx.floorTiles) {
      if (hash(c.tx * 23 + 5, c.tz * 7) > 0.18 || ctx.tileOf(c.tx, c.tz) !== Tile.Floor || !clearOf(c.tx + 0.5, c.tz + 0.5, 3)) continue;
      perches.push({ x: c.tx + 0.5, z: c.tz + 0.5, y: 0 });
    }
    // (on the roofs too: pigeons on the eaves, gulls on the parapets, parrots on the rocks)
    for (const c of ctx.wallTiles) {
      if (hash(c.tx * 41 + 3, c.tz * 13) > 0.06 || c.tx <= 0 || c.tz <= 0 || c.tx >= map.w - 1 || c.tz >= map.h - 1) continue;
      perches.push({ x: c.tx + 0.5, z: c.tz + 0.5, y: ctx.wallTopY(c.tx, c.tz) });
    }
    const pick = (i: number, salt: number) => perches[Math.floor(hash(i * 13 + salt, salt * 7 + 3) * perches.length) % perches.length];
    // (they come in small flocks: each bird near one of a few places)
    for (let i = 0; perches.length && i < kind.n; i++) {
      const home = pick(Math.floor(i / 3), 1);
      const at = { x: home.x + (hash(i, 9) - 0.5) * 1.4, z: home.z + (hash(9, i) - 0.5) * 1.4, y: home.y };
      birds.push({
        ...at, home: at, state: 'peck', from: { ...at }, to: { ...at }, t: 0, span: 1, yaw: hash(i, 3) * 6.28, seed: hash(i, 77),
        body: kind.body[i % kind.body.length], head: kind.head[i % kind.head.length], wing: kind.wing[i % kind.wing.length],
      });
    }
  }
  /** a bird takes off toward a perch some way off (or out of the map and back, when it was hit and comes again) */
  const takeOff = (b: Bird, time: number) => {
    const far = perches.filter(p => Math.hypot(p.x - b.x, p.z - b.z) > 6);
    const to = far.length ? far[Math.floor(hash(Math.floor(time * 10), b.seed * 1000) * far.length) % far.length] : b.home;
    const near = { x: to.x + (hash(b.seed * 31, time) - 0.5) * 1.2, z: to.z + (hash(time, b.seed * 17) - 0.5) * 1.2, y: to.y };
    b.state = 'fly';
    sound('birdFlutter', b.x, b.z);
    b.from = { x: b.x, y: b.y, z: b.z };
    b.to = near;
    b.t = 0;
    b.span = Math.max(1.4, Math.hypot(near.x - b.x, near.z - b.z) / 5);
    b.home = near;
  };
  const burst = (b: Bird) => {
    sound('critterPuff', b.x, b.z);
    for (let k = 0; k < 9; k++) {
      const a = hash(k, b.seed * 100) * 6.28, v = 0.6 + hash(b.seed * 50, k) * 1.4;
      feathers.push({ x: b.x, y: b.y + 0.25, z: b.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, age: -k * 0.01, spin: hash(k, 3) * 6, color: k % 3 ? b.wing : 0xffffff });
    }
    b.state = 'gone';
    b.t = 0;
    // (back in a while, flying in from somewhere)
    b.span = 18 + hash(b.seed, 5) * 14;
  };

  // ---- cats in the Town: they stroll about, sit and wash, and dash off when someone comes near; a shot or a blast
  // that catches one: a puff of fur, and it is back a while later
  const cats: Cat[] = [];
  const furs = look === 'waldsee' ? solid() : null;
  if (furs) {
    const lanes = ctx.floorTiles.filter(c => ctx.tileOf(c.tx, c.tz) === Tile.Floor && hash(c.tx * 31 + 7, c.tz * 3) < 0.05 && clearOf(c.tx + 0.5, c.tz + 0.5, 4));
    for (let i = 0; i < 2 && lanes.length; i++) {
      const c = lanes[Math.floor(hash(i, 61) * lanes.length) % lanes.length];
      cats.push({ x: c.tx + 0.5, z: c.tz + 0.5, yaw: hash(i, 5) * 6, from: { x: c.tx + 0.5, z: c.tz + 0.5 }, to: { x: c.tx + 0.5, z: c.tz + 0.5 }, t: 1, span: 1, state: 'sit', wait: 2 + i * 3, startled: -10, seed: hash(i, 71), coat: i ? [0xe08a3a, 0xf6e6d0] : [0x2a2a2e, 0xf2f2f2], lanes });
    }
  }
  /** off along open floor to a spot some way away it can walk to in a line (not through a house); false: none found */
  const catTo = (c: Cat, run: boolean, time: number): boolean => {
    const near = c.lanes.filter(p => {
      const d = Math.hypot(p.tx + 0.5 - c.x, p.tz + 0.5 - c.z);
      return d >= (run ? 4 : 2) && d <= (run ? 14 : 9);
    });
    for (let k = 0; near.length && k < 16; k++) {
      const p = near[Math.floor(hash(Math.floor(time * 7) + k, c.seed * 900) * near.length) % near.length];
      if (!lineClear(ctx, c.x, c.z, p.tx + 0.5, p.tz + 0.5)) continue;
      const d = Math.hypot(p.tx + 0.5 - c.x, p.tz + 0.5 - c.z);
      c.from = { x: c.x, z: c.z };
      c.to = { x: p.tx + 0.5, z: p.tz + 0.5 };
      c.t = 0;
      c.span = d / (run ? 6.5 : 1.1);
      c.state = run ? 'run' : 'walk';
      return true;
    }
    return false;
  };

  let last = -1;
  return {
    group,
    update(s, events, time, glow, low) {
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, time - last));
      last = time;
      for (const p of pools) p.begin();

      if (!low) {
        for (const m of mists) {
          for (const f of m.tiles) {
            for (let k = 0; k < m.per; k++) {
              // (each wisp dances: loops wider than its tile, rising from the floor, swelling, thinning out at the top)
              const u = (time * (0.06 + 0.02 * k) * m.pace + f.seed * 7 + k * 0.23) % 1;
              const a = time * (0.35 + k * 0.11) * m.pace * (k % 2 ? 1 : -1) + f.seed * 20 + k * 1.7;
              const r = 0.55 + 0.35 * Math.sin(time * 0.7 * m.pace + k + f.seed * 9);
              const x = f.x + Math.cos(a) * r + Math.sin(time * 0.31 + f.seed * 13) * 0.3;
              const z = f.z + Math.sin(a * 0.8) * r + Math.cos(time * 0.27 + f.seed * 17) * 0.3;
              const size = (m.size + 0.9 * hash(k, f.seed * 99)) * (0.75 + 0.45 * u) * (1 + 0.12 * Math.sin(time * 1.9 + k * 2));
              const fade = Math.min(1, u * 5) * Math.min(1, (1 - u) * 3);
              m.pool.addScaled(x, 0.1 + u * m.high + 0.1 * Math.sin(time * 1.3 + k * 2.3 + f.seed * 5), z, 0, size * fade, 1, size * fade, m.colors[(k + Math.floor(f.seed * 3)) % m.colors.length]);
            }
            // a spark now and then, darting up out of it
            if (sparks && m.sparks !== null) {
              const u = (time * 1.6 * m.pace + f.seed * 7) % 1;
              if (u < 0.3) sparks.addScaled(f.x + (f.seed - 0.5) * 0.7 + Math.sin(time * 9 + f.seed * 30) * 0.1, 0.1 + u * 2.6, f.z + (0.5 - f.seed) * 0.7, 0, 0.05, 0.16, 0.05, m.sparks);
            }
          }
        }
      }

      if (kind && bodies && wings && heads && beaks && plumes) {
        // what could catch a bird: player shots in the air, rail beams, blasts
        const shots = s.projectiles.filter(p => !p.hostile && p.ownerId >= 0);
        const beams = events.filter(e => e.type === 'railFired');
        const blasts = events.filter(e => e.type === 'explosion');
        for (const b of birds) {
          if (b.state === 'gone') {
            b.t += dt;
            if (b.t >= b.span) {
              // it comes back: in from high up, onto a perch
              const p = perches[Math.floor(hash(b.seed * 999, time) * perches.length) % perches.length];
              b.x = p.x + 12 * Math.cos(b.seed * 6.28);
              b.z = p.z + 12 * Math.sin(b.seed * 6.28);
              b.y = kind.high + 3;
              takeOff(b, time);
            }
            continue;
          }
          // a shot through it, a beam across it, a blast near it: a puff of feathers
          const hitBy = shots.some(p => Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 0.5 && Math.abs(shotHeight(p) - (b.y + 0.2)) < 0.9) ||
            beams.some(e => e.type === 'railFired' && nearSegment(b, e.from, e.to) < 0.45 && b.y < 2.2) ||
            blasts.some(e => e.type === 'explosion' && Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < e.radius + 0.3 && b.y < 3);
          if (hitBy) {
            burst(b);
            continue;
          }
          if (b.state === 'peck') {
            // (a chirp now and then: not every bird at once, a few seconds apart; jungle parrots are not sparrows, they keep quiet)
            if (look !== 'jungle' && hash(Math.floor(time * 0.5), b.seed * 911) > 0.985 && hash(Math.floor(time * 2), b.seed * 37) > 0.75 && Math.floor(time * 2) !== Math.floor((time - dt) * 2)) sound('birdChirp', b.x, b.z);
            // someone comes near (or it simply feels like it now and then): up and away
            const near = s.players.some(p => p.downUntil === null && Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < (b.y > 1 ? 2.2 : 3.2));
            if (near || hash(Math.floor(time * 0.2 + b.seed * 50), b.seed * 333) > 0.985) takeOff(b, time);
          } else {
            b.t = Math.min(1, b.t + dt / b.span);
            const e = b.t * b.t * (3 - 2 * b.t);
            const x = b.from.x + (b.to.x - b.from.x) * e, z = b.from.z + (b.to.z - b.from.z) * e;
            if (Math.hypot(x - b.x, z - b.z) > 1e-4) b.yaw = Math.atan2(x - b.x, z - b.z);
            b.x = x;
            b.z = z;
            b.y = b.from.y + (b.to.y - b.from.y) * e + Math.sin(Math.PI * b.t) * kind.high;
            if (b.t >= 1) b.state = 'peck';
          }
          drawBird(b, time, kind.size, b.state === 'fly', bodies, wings, heads, beaks, plumes, look);
        }
      }
      life?.(s, events, time, dt, low);
      if (furs) {
        const shots = s.projectiles.filter(p => !p.hostile && p.ownerId >= 0);
        const blasts = events.filter(e => e.type === 'explosion');
        for (const c of cats) {
          if (c.state === 'gone') {
            c.wait -= dt;
            if (c.wait <= 0) {
              c.state = 'sit';
              c.wait = 3;
            }
            continue;
          }
          const hit = shots.some(p => Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < 0.45 && shotHeight(p) < 1.4) || blasts.some(e => e.type === 'explosion' && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < e.radius + 0.3);
          if (hit) {
            // a puff of fur, and away
            sound('critterPuff', c.x, c.z);
            for (let k = 0; k < 10; k++) {
              const a = hash(k, c.seed * 100 + time) * 6.28, v = 0.5 + hash(c.seed * 50, k) * 1.2;
              feathers.push({ x: c.x, y: 0.3, z: c.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, age: -k * 0.01, spin: k, color: k % 2 ? c.coat[0] : c.coat[1] });
            }
            c.state = 'gone';
            c.wait = 20 + hash(c.seed, time) * 15;
            const p = c.lanes[Math.floor(hash(c.seed * 77, time) * c.lanes.length) % c.lanes.length];
            c.x = p.tx + 0.5;
            c.z = p.tz + 0.5;
            continue;
          }
          const near = s.players.some(p => p.downUntil === null && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < 3.5);
          // (startled: it runs, with a meow, once; cornered where it cannot run, it only meows now and then)
          if (near && c.state !== 'run' && time - c.startled > 1.5) {
            c.startled = time;
            if (catTo(c, true, time) || hash(Math.floor(time), c.seed) > 0.6) sound('catMeow', c.x, c.z);
          }
          // (and a meow now and then on its own)
          else if (Math.floor(time / 9 + c.seed) !== Math.floor((time - dt) / 9 + c.seed) && hash(Math.floor(time), c.seed * 5) > 0.5) sound('catMeow', c.x, c.z);
          if (c.state === 'sit') {
            c.wait -= dt;
            if (c.wait <= 0) {
              catTo(c, false, time);
              c.wait = 4 + hash(c.seed, Math.floor(time)) * 8;
            }
          } else {
            c.t = Math.min(1, c.t + dt / c.span);
            const x = c.from.x + (c.to.x - c.from.x) * c.t, z = c.from.z + (c.to.z - c.from.z) * c.t;
            if (Math.hypot(x - c.x, z - c.z) > 1e-4) c.yaw = Math.atan2(x - c.x, z - c.z);
            c.x = x;
            c.z = z;
            if (c.t >= 1) c.state = 'sit';
          }
          drawCat(c, time, furs);
        }
      }
      for (let i = feathers.length - 1; i >= 0; i--) {
        const f = feathers[i];
        f.age += dt;
        if (f.age > 1.8) {
          feathers.splice(i, 1);
          continue;
        }
        if (f.age < 0 || !plumes) continue;
        // (out with the puff, then they drift down rocking, slower and slower)
        const k = Math.exp(-f.age * 3);
        f.x += f.vx * k * dt;
        f.z += f.vz * k * dt;
        f.y = Math.max(0.02, f.y + (0.9 * k - 0.35) * dt * 2);
        plumes.addScaled(f.x + Math.sin(f.age * 6 + f.spin) * 0.08, f.y, f.z, f.spin + f.age * 2, 0.16, 0.02, 0.07, f.color, Math.sin(f.age * 5 + f.spin) * 0.6);
      }
      for (const p of pools) p.end();
      void glow;
    },
    takeSounds() {
      return sounds.splice(0);
    },
    dispose() {
      // (the instanced meshes hold buffers of their own on the GPU: freed only by their own dispose)
      for (const p of pools) p.mesh.dispose();
      unit.dispose();
      for (const m of owned) m.dispose();
    },
  };
}

/** how near a point comes to the line from `a` to `b`, on the ground */
function nearSegment(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  const k = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * k), p.z - (a.z + dz * k));
}

/** a bird of boxes: pecking on the ground (its head bobs down to the floor), or in flight with its wings beating */
function drawBird(b: Bird, time: number, size: number, flying: boolean, bodies: InstancedPool, wings: InstancedPool, heads: InstancedPool, beaks: InstancedPool, plumes: InstancedPool, look: string): void {
  const s = 0.85 * size;
  const yaw = b.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
  const at = (f: number, up: number, side = 0) => ({ x: b.x + fx * f * s + sx * side * s, y: b.y + up * s, z: b.z + fz * f * s + sz * side * s });
  const peck = flying ? 0 : Math.max(0, Math.sin(time * 5 + b.seed * 30)) ** 6;
  // (on the ground it turns now and then, to peck somewhere else)
  if (!flying) b.yaw += Math.sin(time * 0.7 + b.seed * 40) * 0.004;
  const body = at(0, 0.32);
  bodies.addScaled(body.x, body.y, body.z, yaw, 0.32 * s, 0.26 * s, 0.5 * s, b.body, flying ? -0.1 : 0.15);
  // the tail
  const tail = at(-0.32, 0.36);
  bodies.addScaled(tail.x, tail.y, tail.z, yaw, 0.24 * s, 0.06 * s, 0.26 * s, b.wing, flying ? 0 : 0.35);
  const head = at(0.28 + peck * 0.08, 0.6 - peck * 0.42);
  heads.addScaled(head.x, head.y, head.z, yaw, 0.2 * s, 0.2 * s, 0.2 * s, b.head);
  const beak = at(0.42 + peck * 0.08, 0.56 - peck * 0.42);
  beaks.addScaled(beak.x, beak.y, beak.z, yaw, 0.06 * s, 0.05 * s, 0.1 * s, look === 'jungle' ? 0x2a2a2a : 0xe8b040);
  // a little glint of the neck feathers on a pigeon
  if (look !== 'jungle' && look !== 'rooftop') {
    const neck = at(0.2, 0.48 - peck * 0.25);
    plumes.addScaled(neck.x, neck.y, neck.z, yaw, 0.21 * s, 0.1 * s, 0.12 * s, 0x5aa88a);
  }
  for (const side of [-1, 1]) {
    if (flying) {
      // wings beat, a little out of step with each other's tips
      const flap = Math.sin(time * 14 + b.seed * 20) * 0.9;
      const root = at(0, 0.38, side * 0.2);
      wings.addScaled(root.x + sx * side * 0.18 * s, root.y + Math.sin(flap) * 0.15 * s, root.z + sz * side * 0.18 * s, yaw, 0.42 * s, 0.04 * s, 0.3 * s, b.wing, 0, side * flap);
    } else {
      const fold = at(-0.04, 0.36, side * 0.17);
      wings.addScaled(fold.x, fold.y, fold.z, yaw, 0.06 * s, 0.18 * s, 0.4 * s, b.wing, 0.15);
      // and its feet
      const foot = at(0.02, 0.06, side * 0.07);
      beaks.addScaled(foot.x, foot.y, foot.z, yaw, 0.04 * s, 0.12 * s, 0.04 * s, 0xd8806a);
    }
  }
}

/** a pool of soft round puffs that always face the camera (a radial fade, drawn as billboards): fog and smoke
 * without corners, from above and in first person alike. An instance's size is its x scale. */
export function softPool(group: THREE.Group, owned: { dispose(): void }[], pools: InstancedPool[], opacity: number, blending: THREE.Blending = THREE.NormalBlending): InstancedPool {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: opacity } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vUv = uv;
        vColor = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #endif
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float size = length(instanceMatrix[0].xyz);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        a *= a;
        gl_FragColor = vec4(vColor, a * opacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending,
  });
  owned.push(geo, mat);
  const p = new InstancedPool(group, geo, mat, 256, false);
  pools.push(p);
  return p;
}

/** whether the floor between two points is open all the way (a cat goes round no houses: it takes ways it can run in a line) */
function lineClear(ctx: AmbienceContext, ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 3);
  for (let i = 1; i < n; i++) if (ctx.tileOf(Math.floor(ax + ((bx - ax) * i) / n), Math.floor(az + ((bz - az) * i) / n)) !== Tile.Floor) return false;
  return true;
}

/** a cat of boxes: sitting upright with its tail round it, or walking and running with its legs going and its tail up */
function drawCat(c: Cat, time: number, fur: InstancedPool): void {
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), sx = Math.cos(c.yaw), sz = -Math.sin(c.yaw);
  const at = (f: number, side = 0) => ({ x: c.x + fx * f + sx * side, z: c.z + fz * f + sz * side });
  const [main, white] = c.coat;
  const moving = c.state === 'walk' || c.state === 'run';
  const pace = c.state === 'run' ? 16 : 7;
  if (!moving) {
    // sitting: the body upright, the head on top, now and then a lick of a paw
    const b = at(0);
    fur.addScaled(b.x, 0.22, b.z, c.yaw, 0.22, 0.32, 0.26, main);
    const chest = at(0.1);
    fur.addScaled(chest.x, 0.24, chest.z, c.yaw, 0.14, 0.22, 0.05, white);
    const h = at(0.06);
    const wash = Math.max(0, Math.sin(time * 1.3 + c.seed * 30)) ** 8;
    fur.addScaled(h.x, 0.47 - wash * 0.06, h.z, c.yaw + Math.sin(time * 0.6 + c.seed * 9) * 0.4, 0.2, 0.17, 0.17, main, wash * 0.5);
    for (const side of [-1, 1]) {
      const e = at(0.04, side * 0.06);
      fur.addScaled(e.x, 0.58, e.z, c.yaw, 0.05, 0.08, 0.04, main);
      const p = at(0.14, side * 0.06);
      fur.addScaled(p.x, 0.03, p.z, c.yaw, 0.06, 0.06, 0.08, white);
    }
    // the tail round its feet, its tip twitching
    for (let k = 0; k < 4; k++) {
      const a = c.yaw + Math.PI * 0.5 + k * 0.45 + Math.sin(time * 2 + c.seed * 9) * 0.1 * k;
      fur.addScaled(c.x + Math.sin(a) * 0.17, 0.04, c.z + Math.cos(a) * 0.17, a, 0.05, 0.05, 0.09, k === 3 ? white : main);
    }
    return;
  }
  // walking or running: the body long and low, legs swinging, the tail up (and streaming behind at a run)
  const gait = Math.sin(time * pace + c.seed * 9);
  const b = at(0);
  fur.addScaled(b.x, 0.24 + Math.abs(gait) * 0.02, b.z, c.yaw, 0.2, 0.18, 0.46, main);
  const h = at(0.3);
  fur.addScaled(h.x, 0.36, h.z, c.yaw, 0.19, 0.17, 0.17, main);
  for (const side of [-1, 1]) {
    const e = at(0.3, side * 0.06);
    fur.addScaled(e.x, 0.47, e.z, c.yaw, 0.05, 0.08, 0.04, main);
    for (const [f, ph] of [[0.16, 0], [-0.16, Math.PI]] as const) {
      const swing = Math.sin(time * pace + ph + (side > 0 ? 0 : Math.PI) + c.seed * 9) * (c.state === 'run' ? 0.5 : 0.3);
      const l = at(f, side * 0.07);
      fur.addScaled(l.x, 0.08, l.z, c.yaw, 0.06, 0.16, 0.06, white, swing);
    }
  }
  const run = c.state === 'run';
  for (let k = 0; k < 4; k++) {
    const t = at(-0.24 - k * (run ? 0.09 : 0.03));
    fur.addScaled(t.x, 0.3 + k * (run ? 0.02 : 0.08) + Math.sin(time * 4 + k) * 0.01, t.z, c.yaw, 0.05, 0.08, 0.05, k === 3 ? white : main);
  }
}
