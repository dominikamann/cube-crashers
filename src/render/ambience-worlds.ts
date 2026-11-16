import { Tile } from '../sim/map/tilemap';
import type { SimEvent, SimState } from '../sim/types';
import { WALDSEE_FOUNTAIN } from '../sim/config/waldsee-town';
import type { AmbienceContext, LifeSound } from './ambience';
import type { InstancedPool } from './pool';
import { hash } from './props';

/** what a world's own life needs from ambience.ts: pools to draw into (lit boxes, glowing boxes, see-through glow) */
export interface LifeTools {
  ctx: AmbienceContext;
  solid(): InstancedPool;
  light(opacity?: number): InstancedPool;
  /** soft round puffs facing the camera (smoke, steam, spray): their size is the x scale */
  soft(opacity: number, additive?: boolean): InstancedPool;
  /** a sound at a place (played when a player is near) */
  sound(id: LifeSound['id'], x: number, z: number): void;
}

/** the moving part of one world: drawn every frame (`low`: the lowest graphics, where the most of it is left out) */
export type WorldLife = (s: SimState, events: SimEvent[], time: number, dt: number, low: boolean) => void;

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const SHIRTS = [0xe04040, 0x3a6ae0, 0xf2c02a, 0x3ac04a, 0xf28a2a, 0xa04ae0, 0xffffff];
const SKINS = [0xf0c8a0, 0xd8a070, 0x8a5a3a];
const HAIRS = [0x2a1a10, 0x5a3a1a, 0xc89a50, 0x1a1a1a, 0xa04a20];
const FLAGS: [number, number][] = [[0xe04040, 0xffffff], [0x3a6ae0, 0xf2c02a], [0x3ac04a, 0xffffff], [0xa04ae0, 0xf2c02a], [0xf28a2a, 0x1a1a1a]];

/**
 * A spectator standing at (x, y, z) facing yaw: a body as stocky or as tall as its seed makes it, a head with a cap, a
 * hat, long or short hair (or nothing), arms down or (cheering) up, and one in five waves a flag, harder in a cheer.
 */
function drawFan(pool: InstancedPool, x: number, y: number, z: number, yaw: number, seed: number, cheering: boolean, time: number) {
  const wide = 0.85 + hash(seed * 91, 3) * 0.45, tall = 0.8 + hash(seed * 53, 7) * 0.4;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const at = (r: number, f: number) => [x + rx * r + fx * f, z + rz * r + fz * f] as const;
  const bh = 0.46 * tall, bw = 0.34 * wide;
  const shirt = SHIRTS[Math.floor(seed * SHIRTS.length)], hair = HAIRS[Math.floor(hash(seed * 7, 5) * HAIRS.length)];
  pool.addScaled(x, y + bh / 2, z, yaw, bw, bh, 0.26 * wide, shirt);
  const hy = y + bh + 0.14;
  pool.addScaled(x, hy, z, yaw, 0.26, 0.26, 0.26, SKINS[Math.floor(seed * 7) % 3]);
  const kind = Math.floor(hash(seed * 37, 11) * 5), cap = SHIRTS[Math.floor(hash(seed * 3, 13) * SHIRTS.length)];
  if (kind === 1) {
    // a cap, its peak to the front
    pool.addScaled(x, hy + 0.15, z, yaw, 0.28, 0.08, 0.28, cap);
    const [px, pz] = at(0, 0.18);
    pool.addScaled(px, hy + 0.12, pz, yaw, 0.24, 0.03, 0.14, cap);
  } else if (kind === 2) {
    // a hat: a wide brim and a crown
    pool.addScaled(x, hy + 0.14, z, yaw, 0.44, 0.03, 0.44, 0x3a2a1a);
    pool.addScaled(x, hy + 0.22, z, yaw, 0.26, 0.14, 0.26, 0x3a2a1a);
  } else if (kind === 3) {
    // long hair: on top and down the back to the shoulders
    pool.addScaled(x, hy + 0.14, z, yaw, 0.28, 0.06, 0.28, hair);
    const [px, pz] = at(0, -0.14);
    pool.addScaled(px, hy - 0.06, pz, yaw, 0.3, 0.36, 0.06, hair);
  } else if (kind === 4) pool.addScaled(x, hy + 0.14, z, yaw, 0.27, 0.05, 0.27, hair);
  // the arms: down at the sides, or up in a cheer
  for (const side of [-1, 1]) {
    const [px, pz] = at(side * (bw / 2 + 0.05), 0);
    if (cheering) pool.addScaled(px, y + bh + 0.14, pz, yaw, 0.08, 0.34, 0.08, shirt);
    else pool.addScaled(px, y + bh * 0.55, pz, yaw, 0.08, bh * 0.6, 0.08, shirt);
  }
  if (hash(seed * 13, 17) >= 0.2) return;
  // a flag on a pole in the right hand, its cloth flapping
  const [hx, hz] = at(bw / 2 + 0.05, 0.04);
  const top = y + bh + (cheering ? 1.15 : 0.95);
  pool.addScaled(hx, top - 0.5, hz, yaw, 0.04, 1.0, 0.04, 0xd8d8d8);
  const w = yaw + Math.sin(time * (cheering ? 9 : 2.5) + seed * 20) * (cheering ? 0.7 : 0.25);
  const [a, b] = FLAGS[Math.floor(hash(seed * 29, 19) * FLAGS.length)];
  const cx = hx + Math.cos(w) * 0.26, cz = hz - Math.sin(w) * 0.26;
  pool.addScaled(cx, top - 0.08, cz, w, 0.5, 0.15, 0.03, a);
  pool.addScaled(cx, top - 0.23, cz, w, 0.5, 0.15, 0.03, b);
}

/**
 * Each world's own life, all drawn only:
 * - plaza: chasing lights round the planters, confetti tickets drifting down
 * - candy: steam from the factory's pipes, a few chocolate puddles here and there (the sweets tumbling in the
 *   machines' domes are in decor.ts)
 * - neon (Neon City and the Highway): rain with splashes, and cars rushing past outside as streaks of light
 * - arena: a crowd of cubes on the stands that cheers and jumps with every hit on the boss, searchlights over the floor
 * - rooftop: clouds drifting past below the roofs
 * - helipad: a windsock that flies in the rotor wash, runway lights that chase round the pad
 * - uplink: packets of data running along the cables to the dish
 * - jungle: fireflies, leaves sailing down
 * - servers: pulses of data along the floor between the racks, cold steam over the racks
 * - underwater: shafts of light swaying down, light dancing over the floor
 * - waldsee (the Town): smoke from the chimneys
 */
export function buildWorldLife(t: LifeTools): WorldLife | null {
  const { ctx } = t;
  const { map, look } = ctx;
  const W = map.w, H = map.h;
  const isWall = (tx: number, tz: number) => ctx.tileOf(tx, tz) === Tile.Wall;
  const isFloor = (tx: number, tz: number) => ctx.tileOf(tx, tz) === Tile.Floor;
  const clearOf = (x: number, z: number, d: number) => !ctx.keepClear.some(p => Math.hypot(p.x - x, p.z - z) < d);
  /** wall tiles at a block's edge (floor beside them), with the way to that floor */
  const rims = (density: number, salt: number) =>
    ctx.wallTiles.flatMap(c => {
      if (hash(c.tx * 37 + salt, c.tz * 41) > density || c.tx <= 0 || c.tz <= 0 || c.tx >= W - 1 || c.tz >= H - 1) return [];
      const d = DIRS.find(([ox, oz]) => isFloor(c.tx + ox, c.tz + oz));
      return d ? [{ tx: c.tx, tz: c.tz, ox: d[0], oz: d[1], y: ctx.wallTopY(c.tx, c.tz), seed: hash(c.tx * 3 + salt, c.tz * 7) }] : [];
    });
  /** wall tiles inside a block (wall all round): the tops of the buildings */
  const tops = (density: number, salt: number) =>
    ctx.wallTiles.filter(c => hash(c.tx * 29 + salt, c.tz * 31) <= density && c.tx > 0 && c.tz > 0 && c.tx < W - 1 && c.tz < H - 1 && DIRS.every(([ox, oz]) => isWall(c.tx + ox, c.tz + oz))).map(c => ({ x: c.tx + 0.5, z: c.tz + 0.5, y: ctx.wallTopY(c.tx, c.tz), seed: hash(c.tx * 11 + salt, c.tz * 5) }));
  const floors = (density: number, salt: number, away = 2.5) =>
    ctx.floorTiles.filter(c => hash(c.tx * 19 + salt, c.tz * 23) <= density && isFloor(c.tx, c.tz) && clearOf(c.tx + 0.5, c.tz + 0.5, away)).map(c => ({ x: c.tx + 0.5, z: c.tz + 0.5, seed: hash(c.tx * 13 + salt, c.tz * 17) }));
  const ease = (k: number) => k * k * (3 - 2 * k);

  if (look === 'plaza') {
    // chasing lights: little bulbs along the rims of the planters and blocks, a light running along them
    const bulbs = t.light(), confetti = t.solid();
    const lit = rims(0.5, 3).map(r => ({ ...r, x: r.tx + 0.5 + r.ox * 0.47, z: r.tz + 0.5 + r.oz * 0.47 }));
    const COLORS = [0xffd23f, 0xff5a8a, 0x3df0ff, 0x7dff6b];
    // confetti tickets: arcade tickets and paper bits sailing down over the plaza, all over it
    const bits = Array.from({ length: 70 }, (_, i) => ({ x: hash(i, 1) * W, z: hash(1, i) * H, seed: hash(i, 9), color: [0xff5a8a, 0xffd23f, 0x3df0ff, 0xfff4e0, 0x7dff6b][i % 5] }));
    return (s, events, time, dt, low) => {
      for (const b of lit) {
        // (a run of light along the rows: each bulb lights up as the wave passes it, in turn the colours)
        const wave = Math.sin((b.tx + b.tz) * 0.9 - time * 6);
        const on = wave > 0.55;
        for (const k of [-0.3, 0, 0.3]) {
          const x = b.x + (b.oz !== 0 ? k : 0), z = b.z + (b.ox !== 0 ? k : 0);
          bulbs.addScaled(x, b.y + 0.06, z, 0, on ? 0.11 : 0.07, on ? 0.11 : 0.07, on ? 0.11 : 0.07, on ? COLORS[Math.floor(time * 1.5 + b.seed * 4) % COLORS.length] : 0x5a5040);
        }
      }
      if (low) return;
      for (const c of bits) {
        const fall = (time * 0.18 + c.seed * 9) % 1;
        const y = 9 * (1 - fall);
        const sway = Math.sin(time * 1.7 + c.seed * 40) * 0.9;
        confetti.addScaled(c.x + sway + time * 0.25 % W, y, c.z + Math.cos(time * 1.3 + c.seed * 30) * 0.6, time * 2 + c.seed * 9, 0.22, 0.02, 0.12, c.color, Math.sin(time * 4 + c.seed * 20) * 1.2, Math.cos(time * 3 + c.seed * 11));
      }
      void s;
      void events;
      void dt;
    };
  }

  if (look === 'candy') {
    const steam = t.soft(0.4), choc = t.solid(), drops = t.solid();
    const pipes = tops(0.05, 7);
    // a few chocolate puddles, here and there: never two close together
    const puddles: { x: number; z: number; seed: number }[] = [];
    for (const f of floors(0.05, 5, 3.5).sort((a, b) => a.seed - b.seed)) {
      if (puddles.length >= 5) break;
      if (puddles.every(p => Math.hypot(p.x - f.x, p.z - f.z) > 14)) puddles.push(f);
    }
    return (s, events, time, dt, low) => {
      // steam from the pipes on the roofs: puffs that swell and drift as they rise
      for (const p of pipes) {
        for (let k = 0; k < (low ? 1 : 4); k++) {
          const u = (time * 0.4 + p.seed * 7 + k / 4) % 1;
          const size = (0.5 + u * 1.6) * Math.min(1, u * 5) * (1 - u * 0.5);
          steam.addScaled(p.x + Math.sin(time + p.seed * 9) * 0.3 * u, p.y + 0.3 + u * 2.8, p.z + u * 0.6, 0, size, 1, size, 0xfff4fa);
        }
      }
      // (round: the same slab turned three times over itself; bubbles swell on it and pop)
      for (const p of puddles) {
        for (let k = 0; k < 3; k++) choc.addScaled(p.x, 0.03, p.z, p.seed * 6 + (k * Math.PI) / 6, 0.95, 0.04, 0.95, 0x5a2a14);
        for (let k = 0; k < 3; k++) choc.addScaled(p.x + 0.12, 0.045, p.z - 0.08, p.seed * 6 + (k * Math.PI) / 6, 0.5, 0.03, 0.5, 0x7a3a1c);
        if (low) continue;
        for (let k = 0; k < 2; k++) {
          const u = (time * 0.9 + p.seed * 5 + k * 0.5) % 1;
          const r = u < 0.85 ? 0.06 + u * 0.14 : 0;
          if (r) drops.addScaled(p.x + Math.cos(k * 2.1 + p.seed * 9) * 0.25, 0.05 + r * 0.5, p.z + Math.sin(k * 2.1 + p.seed * 9) * 0.22, 0, r, r * 0.8, r, 0x8a4a24);
        }
      }
        void s;
      void events;
      void dt;
    };
  }

  if (look === 'neon') {
    // rain over the whole city: streaks falling slant, splashing on the floor; and on the Highway cars outside
    const rain = t.light(0.5), splash = t.light(0.6), cars = t.light(0.95);
    const N = 900;
    const drops = Array.from({ length: N }, (_, i) => ({ x: hash(i, 3) * (W + 8) - 4, z: hash(3, i) * (H + 8) - 4, seed: hash(i, 51) }));
    const highway = map.id === 'highway';
    const lanes = highway
      ? Array.from({ length: 10 }, (_, i) => ({ along: i % 2 ? 'x' : 'z', at: i % 4 < 2 ? -2.5 - (i % 3) * 0.9 : (i % 2 ? H : W) + 2 + (i % 3) * 0.9, speed: (i % 2 ? 1 : -1) * (18 + hash(i, 7) * 14), seed: hash(i, 13), color: i % 3 ? 0xff3a3a : 0xfff2c0 }))
      : [];
    return (s, events, time, dt, low) => {
      const n = low ? N / 3 : N;
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        const u = (time * 1.6 + d.seed * 13) % 1;
        const y = 12 * (1 - u);
        rain.addScaled(d.x - u * 1.5, y, d.z, 0, 0.025, 0.55, 0.025, 0xa8d8ff, 0, 0.12);
        // (where it lands, a ring that spreads)
        if (u > 0.9 && !low) {
          const r = (u - 0.9) * 4;
          splash.addScaled(d.x - 1.5, 0.03, d.z, 0, r, 0.01, r, 0xc8e8ff);
        }
      }
      for (const l of lanes) {
        // a car: two lights and a streak behind them, rushing along past the map
        const len = l.along === 'x' ? W : H;
        const p = ((time * l.speed + l.seed * 400) % (len + 40) + len + 40) % (len + 40) - 20;
        const x = l.along === 'x' ? p : l.at, z = l.along === 'x' ? l.at : p;
        const yaw = l.along === 'x' ? Math.PI / 2 : 0;
        cars.addScaled(x, 0.5, z, yaw, 0.5, 0.18, 3.5, l.color);
      }
      void s;
      void events;
      void dt;
    };
  }

  if (look === 'race') {
    // spectators: here and there a little crowd on the walls by the track, cheering as the karts race past
    const fans = t.solid();
    const spots = rims(1, 77);
    const groups: { x: number; z: number; y: number; ox: number; oz: number; seed: number }[][] = [];
    for (const r of spots.sort((a, b) => a.seed - b.seed)) {
      if (groups.length >= 9) break;
      if (groups.some(g => Math.hypot(g[0].x - r.tx, g[0].z - r.tz) < 11)) continue;
      // (a few of them on the wall tiles next to this one, facing the track)
      const near = spots.filter(o => Math.hypot(o.tx - r.tx, o.tz - r.tz) < 2.2 && o.ox === r.ox && o.oz === r.oz);
      groups.push(near.flatMap(o => [0, 1].map(k => ({ x: o.tx + 0.5 + (k ? 0.22 : -0.22) * Math.abs(o.oz), z: o.tz + 0.5 + (k ? 0.22 : -0.22) * Math.abs(o.ox), y: o.y, ox: o.ox, oz: o.oz, seed: hash(o.tx * 7 + k, o.tz * 3) }))));
    }
    const cheerAt = groups.map(() => -10);
    return (s, events, time, dt, low) => {
      groups.forEach((g, i) => {
        // a kart going past: they cheer (a jump, arms up), and the crowd is heard if a player is near
        const kart = s.vehicles.some(v => Math.hypot(v.pos.x - g[0].x, v.pos.z - g[0].z) < 4.5 && Math.hypot(v.vel.x, v.vel.z) > 2);
        if (kart && time - cheerAt[i] > 1.5) {
          cheerAt[i] = time;
          t.sound('crowdCheer', g[0].x, g[0].z);
        }
        for (const f of g) {
          const since = time - cheerAt[i] - f.seed * 0.3;
          const jump = since > 0 && since < 0.9 ? Math.abs(Math.sin((since / 0.45) * Math.PI)) * 0.35 : 0;
          const y = f.y + jump + Math.abs(Math.sin(time * 2 + f.seed * 20)) * 0.04;
          drawFan(fans, f.x, y, f.z, Math.atan2(f.ox, f.oz), f.seed, jump > 0.05, time);
        }
      });
      void dt;
      void low;
      void events;
    };
  }

  if (look === 'arena') {
    // the crowd on the stands: spectators of all sizes on the border walls (see drawFan), bobbing, and jumping up with every hit on
    // the boss (a cheer that runs round the stands)
    const fans = t.solid(), beams = t.light(0.16), spots = t.soft(0.45, true);
    const seats = ctx.wallTiles.filter(c => (c.tx <= 1 || c.tz <= 1 || c.tx >= W - 2 || c.tz >= H - 2) && hash(c.tx * 7, c.tz * 3) < 0.75).map(c => ({ x: c.tx + 0.5, z: c.tz + 0.5, y: ctx.wallTopY(c.tx, c.tz), seed: hash(c.tx * 17, c.tz * 29) }));
    const cx = W / 2, cz = H / 2;
    let cheer = -10;
    // the searchlights themselves: on masts at the edge of the stands, a housing that turns after its spot, a lens
    const lampAt = [0, 1, 2].map(k => ({ x: cx + Math.cos(k * 2.1) * (W / 2 - 0.5), y: 9, z: cz + Math.sin(k * 2.1) * (H / 2 - 0.5) }));
    const masts = t.solid(), lenses = t.light(), glows = t.soft(0.6, true);
    return (s, events, time, dt, low) => {
      // (a big hit is cheered; small ones only now and then, the crowd does not roar at every bolt)
      const big = events.some(e => e.type === 'bossPhase' || e.type === 'bossDead') || events.some(e => e.type === 'enemyHit' && s.boss && e.id === s.boss.enemyId && e.amount >= 20);
      if (big || (time - cheer > 6 && events.some(e => e.type === 'enemyHit' && s.boss && e.id === s.boss.enemyId && e.amount > 0))) {
        if (time - cheer > 1.2) t.sound('crowdCheer', cx, cz);
        cheer = time;
      }
      for (const f of seats) {
        // (the cheer runs round the stands as a wave, from where the arena's middle sees it start)
        const a = Math.atan2(f.z - cz, f.x - cx);
        const since = time - cheer - ((a + Math.PI) / (Math.PI * 2)) * 1.2;
        const jump = since > 0 && since < 0.5 ? Math.sin((since / 0.5) * Math.PI) * 0.6 : 0;
        const bob = Math.abs(Math.sin(time * 3 + f.seed * 20)) * 0.08;
        const y = f.y + bob + jump;
        // (facing the middle of the arena)
        drawFan(fans, f.x, y, f.z, Math.atan2(cx - f.x, cz - f.z), f.seed, jump > 0.1, time);
      }
      if (low) return;
      // searchlights: two beams from high up, their spots sweeping over the sand
      for (let k = 0; k < 3; k++) {
        const a = time * (0.35 + k * 0.12) + k * 2.1;
        const r = 4 + 6 * (0.5 + 0.5 * Math.sin(time * 0.4 + k * 1.7));
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        spots.addScaled(x, 0.3, z, 0, 3.6, 1, 3.6, [0xfff2c0, 0xc0e8ff, 0xffc0e8][k]);
        const from = lampAt[k];
        const dx = x - from.x, dy = 0 - from.y, dz = z - from.z, len = Math.hypot(dx, dy, dz);
        beams.addScaled((from.x + x) / 2, from.y / 2, (from.z + z) / 2, Math.atan2(dx, dz), 0.6, 0.6, len, [0xfff2c0, 0xc0e8ff, 0xffc0e8][k], Math.atan2(-dy, Math.hypot(dx, dz)));
        // its mast up from the stands, the housing pointing down at the spot, the lit lens and its glare
        masts.addScaled(from.x, from.y / 2, from.z, 0, 0.18, from.y, 0.18, 0x3a3f4a);
        const yaw = Math.atan2(dx, dz), pitch = Math.atan2(-dy, Math.hypot(dx, dz));
        masts.addScaled(from.x, from.y + 0.25, from.z, yaw, 0.7, 0.7, 0.9, 0x2a2e36, pitch);
        const lx = from.x + Math.sin(yaw) * Math.cos(pitch) * 0.46, ly = from.y + 0.25 - Math.sin(pitch) * 0.46, lz = from.z + Math.cos(yaw) * Math.cos(pitch) * 0.46;
        lenses.addScaled(lx, ly, lz, yaw, 0.56, 0.56, 0.06, 0xfffbe8, pitch);
        glows.addScaled(lx, ly, lz, 0, 2.2, 1, 2.2, [0xfff2c0, 0xc0e8ff, 0xffc0e8][k]);
      }
      void dt;
    };
  }

  if (look === 'rooftop') {
    // clouds: fluffy ones drifting past round the roofs, and wisps of cloud passing through the gaps between them
    const clouds = t.soft(0.55);
    const puffs = Array.from({ length: 22 }, (_, i) => ({ z: hash(i, 4) * (H + 30) - 15, y: -1.5 - hash(4, i) * 3, seed: hash(i, 8), size: 3 + hash(i, 6) * 4 }));
    const gaps: { x: number; z: number; seed: number }[] = [];
    for (let tz = 1; tz < H - 1; tz++) for (let tx = 1; tx < W - 1; tx++) if (ctx.tileOf(tx, tz) === Tile.Hazard && hash(tx * 3, tz * 11) < 0.12) gaps.push({ x: tx + 0.5, z: tz + 0.5, seed: hash(tx, tz * 3) });
    return (s, events, time, dt, low) => {
      for (const c of low ? puffs.slice(0, 8) : puffs) {
        const x = ((time * 0.6 + c.seed * 200) % (W + 50)) - 25;
        // (outside the roofs only: over them a cloud would hang in the way)
        if (x > -2 && x < W + 2 && c.z > -2 && c.z < H + 2) continue;
        for (let k = 0; k < 4; k++) clouds.addScaled(x + k * c.size * 0.4, c.y + (k % 2 ? 0.6 : 0), c.z + (k - 1.5) * 0.7, 0, c.size * (k % 2 ? 1.1 : 0.85), 1, c.size, 0xffffff);
      }
      if (low) return;
      for (const g of gaps) {
        const u = (time * 0.05 + g.seed * 7) % 1;
        const fade = Math.min(1, u * 4) * Math.min(1, (1 - u) * 4);
        clouds.addScaled(g.x + (u - 0.5) * 3, -0.8 + Math.sin(time * 0.4 + g.seed * 9) * 0.3, g.z, 0, 2.6 * fade, 1, 2.6 * fade, 0xf4f6ff);
      }
      void s;
      void events;
      void dt;
    };
  }

  if (look === 'helipad') {
    // a windsock on a mast at the pad's edge: it flies stiff in the rotor wash, and hangs a little when it calms
    const mast = t.solid(), sock = t.solid(), lights = t.light();
    const edge = rims(1, 9).sort((a, b) => Math.hypot(a.tx - W * 0.8, a.tz - H * 0.15) - Math.hypot(b.tx - W * 0.8, b.tz - H * 0.15))[0];
    const ring = rims(0.35, 21).map(r => ({ ...r, x: r.tx + 0.5 + r.ox * 0.45, z: r.tz + 0.5 + r.oz * 0.45 }));
    return (s, events, time, dt, low) => {
      if (edge) {
        const x = edge.tx + 0.5, z = edge.tz + 0.5, top = edge.y + 3.2;
        mast.addScaled(x, edge.y + 1.6, z, 0, 0.1, 3.2, 0.1, 0xd8dce4);
        // (the wind: from the helicopter out, gusting)
        const gust = 0.75 + 0.25 * Math.sin(time * 1.3) * Math.sin(time * 3.1);
        const yaw = Math.atan2(x - W / 2, z - H / 2) + Math.sin(time * 0.9) * 0.25;
        const droop = (1 - gust) * 0.9;
        for (let k = 0; k < 5; k++) {
          const along = 0.3 + k * 0.32, r = 0.24 - k * 0.03;
          const flap = Math.sin(time * 9 - k * 0.8) * 0.04 * (k + 1);
          sock.addScaled(x + Math.sin(yaw) * along + flap, top - along * droop, z + Math.cos(yaw) * along, yaw, r * 2, r * 2, 0.33, k % 2 ? 0xffffff : 0xff5a1a, droop * 0.6);
        }
      }
      // the lights along the pad's edges: a run of green, and one blinking red now and then
      for (const r of ring) {
        const run = (Math.sin((r.tx * 0.7 + r.tz * 0.7) - time * 4) + 1) / 2;
        lights.addScaled(r.x, r.y + 0.05, r.z, 0, 0.12, 0.08, 0.12, run > 0.85 ? 0xb8ffb0 : r.seed > 0.8 && Math.floor(time * 2 + r.seed * 9) % 2 ? 0xff3030 : 0x2a6a2a);
      }
      void s;
      void events;
      void dt;
      void low;
    };
  }

  if (look === 'uplink') {
    // the upstream: now and then the big dish sends a burst of data up into the sky, packets of light shooting up
    // from its bowl for a moment (as decor.ts finds it: on the 2x2 block nearest the middle of the map)
    const packets = t.light(), trail = t.soft(0.5, true);
    let pedestal: { tx: number; tz: number } | null = null;
    for (const c of ctx.wallTiles) {
      if (!isWall(c.tx + 1, c.tz) || !isWall(c.tx, c.tz + 1) || !isWall(c.tx + 1, c.tz + 1) || isWall(c.tx - 1, c.tz) || isWall(c.tx, c.tz - 1) || isWall(c.tx + 2, c.tz) || isWall(c.tx, c.tz + 2)) continue;
      const d = Math.hypot(c.tx + 1 - W / 2, c.tz + 1 - H / 2);
      if (!pedestal || d < Math.hypot(pedestal.tx + 1 - W / 2, pedestal.tz + 1 - H / 2)) pedestal = c;
    }
    if (!pedestal) return null;
    // (as decor.ts builds it: the bowl's middle 6.3 over the block, its axis tipped 0.6 toward the north, the whole head
    // turning at DISH_TURN; its feed and the rings of its signal lie along that axis, from about 3.6 out)
    const bowl = { x: pedestal.tx + 1, y: ctx.wallTopY(pedestal.tx, pedestal.tz) + 6.3, z: pedestal.tz + 1 };
    const TILT = 0.6, TURN = 0.3, FEED = 3.6;
    /** every this many seconds a burst, lasting this long */
    const EVERY = 7, BURST = 1.4;
    return (s, events, time, dt, low) => {
      const since = time % EVERY;
      if (since > BURST + 1.2) return;
      for (let i = 0; i < (low ? 6 : 16); i++) {
        // (each packet leaves the bowl at its own moment in the burst and shoots straight up, fast, a little apart)
        const leave = (i / 16) * BURST;
        const age = since - leave;
        if (age < 0 || age > 1.2) continue;
        // out of the feed, along the beam through the rings, and on up into the sky
        const turn = time * TURN;
        const d = { x: -Math.sin(TILT) * Math.sin(turn), y: Math.cos(TILT), z: -Math.sin(TILT) * Math.cos(turn) };
        const along = FEED + age * 28;
        const off = 0.18 * Math.sin(i * 2.4);
        const x = bowl.x + d.x * along + off * Math.cos(turn), y = bowl.y + d.y * along, z = bowl.z + d.z * along - off * Math.sin(turn);
        packets.addScaled(x, y, z, -turn, 0.16, 0.7, 0.16, i % 3 ? 0x3df0ff : 0xfff2a0, -TILT);
        if (!low) trail.addScaled(x - d.x * 0.8, y - d.y * 0.8, z - d.z * 0.8, 0, 0.7, 1, 0.7, 0x3da8ff);
      }
      void s;
      void events;
      void dt;
    };
  }

  if (look === 'jungle') {
    // fireflies drifting low, blinking; leaves sailing down from the canopy
    const flies = t.light(), leaves = t.solid(), glowFlies = t.soft(0.35, true);
    // waterfalls, one on each side of the map: down the rock at its edge (a stretch of the border with open floor
    // before it, nearest the middle of that edge), into a small pool at its foot: falling water, foam and spray, ripples
    const best: ({ x: number; z: number; ox: number; oz: number; top: number; d: number } | null)[] = [null, null, null, null];
    for (let i = 2; i < Math.max(W, H) - 2; i++)
      for (const [edge, [tx, tz, ox, oz]] of ([[i, 0, 0, 1], [i, H - 1, 0, -1], [0, i, 1, 0], [W - 1, i, -1, 0]] as const).entries()) {
        if (tx >= W || tz >= H || !isWall(tx, tz)) continue;
        // three tiles of the edge side by side, plain floor three deep and five wide before them (where the pool goes),
        // and nothing kept clear (a pad, a spawn, a nest) anywhere near the pool
        const side = (k: number) => (ox === 0 ? [tx + k, tz] : [tx, tz + k]) as [number, number];
        const ok =
          [-1, 0, 1].every(k => isWall(...side(k))) &&
          [-2, -1, 0, 1, 2].every(k => [1, 2, 3].every(n => {
            const [sx, sz] = side(k);
            return isFloor(sx + ox * n, sz + oz * n);
          })) &&
          clearOf(tx + 0.5 + ox * 1.6, tz + 0.5 + oz * 1.6, 4.5);
        if (!ok) continue;
        const d = ox === 0 ? Math.abs(tx - W / 2) : Math.abs(tz - H / 2);
        if (!best[edge] || d < best[edge]!.d) best[edge] = { x: tx + 0.5, z: tz + 0.5, ox, oz, top: ctx.wallTopY(tx, tz) + 3.4, d };
      }
    const falls = best.filter(f => f !== null);
    const sheet = t.light(0.7), foam = t.soft(0.55), rocks = t.solid(), pool = t.light(0.75), ripple = t.light(0.5);
    const swarm = Array.from({ length: 80 }, (_, i) => ({ x: hash(i, 7) * W, z: hash(7, i) * H, seed: hash(i, 3) }));
    const fall = Array.from({ length: 50 }, (_, i) => ({ x: hash(i, 11) * W, z: hash(11, i) * H, seed: hash(i, 19), color: [0x3a9a3a, 0x5ab040, 0x8ac040, 0xa07a2a][i % 4] }));
    return (s, events, time, dt, low) => {
      for (const { x, z, ox, oz, top } of falls) {
        // the face of the rock it comes over: the water leaves it a little out from the wall
        const fx = x + ox * 0.55, fz = z + oz * 0.55;
        const across = (k: number) => ({ x: fx + (ox === 0 ? k : 0), z: fz + (oz === 0 ? k : 0) });
        const yaw = Math.atan2(ox, oz);
        // the cliff it comes down: a rock face right behind the water from the floor to the lip, rising in steps
        // behind it, and stepping down to the wall on both sides, moss on the ledges
        const cliff = (side: number, back: number, w: number, h: number, color: number) => {
          const cx = x + ox * (0.2 - back) + (ox === 0 ? side : 0), cz = z + oz * (0.2 - back) + (oz === 0 ? side : 0);
          rocks.addScaled(cx, h / 2, cz, yaw, w, h, 0.9, color);
          rocks.addScaled(cx, h + 0.04, cz, yaw, w * 0.92, 0.08, 0.8, 0x4a7a3a);
        };
        cliff(0, 0, 3.0, top, 0x5a5a52);
        cliff(0, 0.9, 3.6, top + 0.7, 0x6a6a60);
        cliff(0.3, 1.8, 2.8, top + 1.5, 0x5a5a52);
        for (const side of [-1, 1]) {
          cliff(side * 2.0, 0.2, 1.1, top * 0.75, 0x6a6a60);
          cliff(side * 2.9, 0.4, 0.9, top * 0.5, 0x5a5a52);
          cliff(side * 3.6, 0.6, 0.8, top * 0.3, 0x6a6a60);
        }
        rocks.addScaled(fx - ox * 0.15, top + 0.1, fz - oz * 0.15, yaw, 3.2, 0.3, 0.5, 0x6a6a60);
        for (let i = 0; i < 9; i++) {
          // strips of water side by side, each streaming down at its own pace, broken into pieces with gaps
          const k = -1.2 + i * 0.3;
          for (let j = 0; j < 7; j++) {
            const u = (time * (1.4 + (i % 3) * 0.2) + j / 7 + i * 0.13) % 1;
            const y = top - u * top;
            const p = across(k + Math.sin(time * 3 + i + j) * 0.03);
            sheet.addScaled(p.x + ox * u * 0.25, y, p.z + oz * u * 0.25, yaw, 0.24, top / 7 * 0.8, 0.06, j % 3 ? 0x9fd8ff : 0xe8f8ff);
          }
        }
        // the pool at its foot: water in a ring of stones, ripples spreading from where the water comes down
        const px = x + ox * 1.6, pz = z + oz * 1.6;
        for (let k = 0; k < 3; k++) pool.addScaled(px, 0.04, pz, yaw + (k * Math.PI) / 6, 3.2, 0.03, 2.1, 0x3a8ab8);
        // (a ring of stones round its front half, laid out across the edge and out from it, whichever edge it is on)
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (let k = 0; k < 11; k++) {
          const a = -0.15 * Math.PI + (k / 10) * 1.3 * Math.PI;
          const sx = px + rx * Math.cos(a) * 1.7 + ox * Math.sin(a) * 1.15, sz = pz + rz * Math.cos(a) * 1.7 + oz * Math.sin(a) * 1.15;
          rocks.addScaled(sx, 0.1, sz, yaw + a, 0.42, 0.22, 0.36, k % 2 ? 0x6a6a60 : 0x7a7a6e);
        }
        if (!low) {
          for (let k = 0; k < 3; k++) {
            const u = (time * 0.7 + k / 3) % 1;
            ripple.addScaled(px - ox * 0.5, 0.06, pz - oz * 0.5, yaw, 0.4 + u * 2, 0.01, 0.3 + u * 1.4, 0xd8f4ff);
          }
          // foam and spray where it lands, a mist rising off it
          for (let k = 0; k < 6; k++) {
            const u = (time * 0.9 + k / 6) % 1;
            const p = across(-1 + (k / 5) * 2);
            foam.addScaled(p.x + ox * (0.3 + u * 0.5), 0.15 + u * 1.2, p.z + oz * (0.3 + u * 0.5), 0, (0.6 + u * 1.2) * (1 - u * 0.6), 1, (0.6 + u * 1.2) * (1 - u * 0.6), 0xffffff);
          }
        }
      }
      for (const f of low ? swarm.slice(0, 25) : swarm) {
        const x = f.x + Math.sin(time * 0.5 + f.seed * 30) * 1.5, z = f.z + Math.cos(time * 0.4 + f.seed * 20) * 1.5;
        const on = Math.sin(time * 2.5 + f.seed * 40) > 0.2;
        flies.addScaled(x, 0.6 + Math.sin(time * 0.8 + f.seed * 9) * 0.5 + f.seed * 1.5, z, 0, on ? 0.12 : 0.05, on ? 0.12 : 0.05, on ? 0.12 : 0.05, on ? 0xe8ff7a : 0x4a5a2a);
        if (on && glowFlies && !low) glowFlies.addScaled(x, 0.6 + Math.sin(time * 0.8 + f.seed * 9) * 0.5 + f.seed * 1.5, z, 0, 0.7, 1, 0.7, 0xd8ff6a);
      }
      if (low) return;
      for (const l of fall) {
        const u = (time * 0.12 + l.seed * 7) % 1;
        leaves.addScaled(l.x + Math.sin(time * 1.2 + l.seed * 30) * 0.8, 8 * (1 - u), l.z + Math.cos(time + l.seed * 9) * 0.5, time + l.seed * 6, 0.28, 0.02, 0.18, l.color, Math.sin(time * 2 + l.seed * 10) * 0.9);
      }
      void s;
      void events;
      void dt;
    };
  }

  if (look === 'servers') {
    // pulses of data along the floor between the racks, and cold steam rising off the tops of the racks
    const pulses = t.light(), mist = t.light(0.25);
    const runs = floors(0.06, 31, 2).map(f => ({ ...f, along: f.seed > 0.5 ? 'x' : 'z' }));
    const vents = tops(0.04, 13);
    return (s, events, time, dt, low) => {
      for (const r of runs) {
        const u = (time * 0.8 + r.seed * 5) % 1;
        const off = (u - 0.5) * 6;
        const x = r.along === 'x' ? r.x + off : r.x, z = r.along === 'z' ? r.z + off : r.z;
        if (!isFloor(Math.floor(x), Math.floor(z))) continue;
        pulses.addScaled(x, 0.04, z, r.along === 'x' ? Math.PI / 2 : 0, 0.08, 0.03, 0.7, r.seed > 0.7 ? 0x6aff8a : 0x3df0ff);
      }
      if (low) return;
      for (const v of vents) {
        for (let k = 0; k < 3; k++) {
          const u = (time * 0.3 + v.seed * 6 + k / 3) % 1;
          const size = 0.3 + u * 0.8;
          mist.addScaled(v.x, v.y + 0.2 + u * 1.8, v.z, k, size, size * 0.5, size, 0xd8f4ff);
        }
      }
      void s;
      void events;
      void dt;
    };
  }

  if (look === 'underwater') {
    // shafts of light from the surface, swaying, and light dancing over the sea floor (caustics)
    const shafts = t.light(0.12), dance = t.soft(0.3, true);
    const rays = Array.from({ length: 12 }, (_, i) => ({ x: hash(i, 5) * W, z: hash(5, i) * H, seed: hash(i, 9) }));
    const glints = Array.from({ length: 140 }, (_, i) => ({ x: hash(i, 15) * W, z: hash(15, i) * H, seed: hash(i, 29) }));
    return (s, events, time, dt, low) => {
      for (const r of rays) {
        const lean = 0.25 + Math.sin(time * 0.3 + r.seed * 9) * 0.08;
        shafts.addScaled(r.x + Math.sin(time * 0.2 + r.seed * 7) * 1.5, 6, r.z, r.seed * 2, 1.2 + r.seed, 14, 0.5, 0xbfefff, 0, lean);
      }
      if (low) return;
      for (const g of glints) {
        const k = 0.5 + 0.5 * Math.sin(time * 1.4 + g.seed * 30);
        dance.addScaled(g.x + Math.sin(time * 0.5 + g.seed * 20) * 0.6, 0.15, g.z + Math.cos(time * 0.4 + g.seed * 10) * 0.6, 0, 0.6 + k * 1.1, 1, 0.6 + k * 1.1, 0x9fe8ff);
      }
      void s;
      void events;
      void dt;
    };
  }

  if (look === 'waldsee') {
    // smoke from the chimneys: from the highest roofs, a thin grey plume leaning in the wind
    const smoke = t.soft(0.4);
    const high = [...ctx.wallTiles].filter(c => hash(c.tx * 53, c.tz * 7) < 0.25).sort((a, b) => ctx.wallTopY(b.tx, b.tz) - ctx.wallTopY(a.tx, a.tz));
    const chimneys: { x: number; z: number; y: number; seed: number }[] = [];
    for (const c of high) {
      if (chimneys.length >= 9) break;
      if (chimneys.some(o => Math.hypot(o.x - c.tx, o.z - c.tz) < 14)) continue;
      chimneys.push({ x: c.tx + 0.5, z: c.tz + 0.5, y: ctx.wallTopY(c.tx, c.tz), seed: hash(c.tx, c.tz) });
    }
    // a few manhole covers in the streets, a wisp of steam rising from them now and then (quietly)
    const lids = t.solid(), steam = t.soft(0.22);
    const holes = floors(0.004, 61, 4).slice(0, 7);
    // the Federle-Brunnen: water leaping up in little jets from the basin under the Federle, the water in the basin
    // moving, and spray where the jets come down
    const jets = t.light(0.75), spray = t.soft(0.5), ripples = t.light(0.45);
    const basin = WALDSEE_FOUNTAIN.length ? { x: WALDSEE_FOUNTAIN[0][0] + 0.6, z: WALDSEE_FOUNTAIN[0][1] + 0.5, y: 0.86 } : null;
    const JETS: [number, number, number, number][] = [[-0.5, 0.12, 0.55, 0], [-0.22, -0.28, 0.4, 1.3], [0.04, 0.24, 0.65, 2.1], [-0.36, -0.02, 0.32, 3.4]];
    return (s, events, time, dt, low) => {
      for (const c of chimneys) {
        for (let k = 0; k < (low ? 2 : 6); k++) {
          const u = (time * 0.15 + c.seed * 5 + k / 6) % 1;
          const size = (0.6 + u * 2.2) * Math.min(1, u * 6);
          smoke.addScaled(c.x + u * 2.5 + Math.sin(time * 0.6 + k) * 0.2, c.y + 0.5 + u * 5, c.z + u * 0.8, 0, size, 1, size, [0xd8d8d8, 0xc0c0c4, 0xe8e8e8][k % 3]);
        }
      }
      for (const h of holes) {
        // (an iron lid, a ring and a cross on it)
        lids.addScaled(h.x, 0.025, h.z, h.seed * 3, 0.62, 0.03, 0.62, 0x3a3c40);
        lids.addScaled(h.x, 0.025, h.z, h.seed * 3 + Math.PI / 4, 0.62, 0.03, 0.62, 0x3a3c40);
        lids.addScaled(h.x, 0.045, h.z, h.seed * 3, 0.5, 0.01, 0.06, 0x24262a);
        lids.addScaled(h.x, 0.045, h.z, h.seed * 3 + Math.PI / 2, 0.5, 0.01, 0.06, 0x24262a);
        if (low) continue;
        for (let k = 0; k < 2; k++) {
          const u = (time * 0.22 + h.seed * 7 + k * 0.5) % 1;
          const size = (0.4 + u * 1.1) * Math.min(1, u * 5) * (1 - u);
          if (size > 0.02) steam.addScaled(h.x + u * 0.4, 0.15 + u * 1.6, h.z + Math.sin(time + k) * 0.15, 0, size * 1.6, 1, size * 1.6, 0xe8ecf0);
        }
      }
      if (basin) {
        for (const [dx, dz, top, phase] of JETS) {
          // (each jet leaps, falls back a little and leaps again: a column of water, thinner and broken at its top)
          const h = top * (0.75 + 0.25 * Math.sin(time * 3.1 + phase) * Math.sin(time * 1.7 + phase * 2));
          const x = basin.x + dx, z = basin.z + dz;
          for (let i = 0; i < 8; i++) {
            // (a column of water rushing up: pieces of it with gaps between, wavering, thinner toward the top)
            const k = i / 8;
            const w = 0.075 * (1 - k * 0.55) + 0.018 * Math.sin(time * 23 + i * 1.7 + phase);
            const y = basin.y + h * ((i + ((time * 6 + phase) % 1)) / 8);
            jets.addScaled(x + Math.sin(time * 13 + i * 2 + phase) * 0.02 * k, y, z + Math.cos(time * 11 + i + phase) * 0.015 * k, time * 5 + i, w, (h / 8) * 0.7, w, i % 3 ? 0xcfeeff : 0xffffff);
          }
          // and drops falling off its top, out and down into the basin
          for (let i = 0; i < 5; i++) {
            const u = (time * 1.8 + phase + i / 5) % 1;
            const a = phase * 3 + i * 1.26;
            const out = 0.05 + u * 0.28;
            jets.addScaled(x + Math.cos(a) * out, basin.y + h + 0.05 + u * 0.12 - u * u * (h + 0.15), z + Math.sin(a) * out, 0, 0.035, 0.05, 0.035, 0xe8f6ff);
          }
          if (low) continue;
          // spray at the top and where it falls back into the basin
          spray.addScaled(x, basin.y + h, z, 0, 0.22 + 0.06 * Math.sin(time * 9 + phase), 1, 0.2, 0xffffff);
          const u = (time * 1.2 + phase) % 1;
          ripples.addScaled(x, basin.y + 0.005, z, 0, 0.1 + u * 0.45, 0.005, 0.1 + u * 0.45, 0xd8f0ff);
        }
        if (!low) {
          // the water in the basin glints as it moves
          for (let i = 0; i < 6; i++) {
            const a = time * 0.7 + i * 1.05;
            ripples.addScaled(basin.x + Math.cos(a) * 0.5, basin.y + 0.004, basin.z + Math.sin(a * 1.3) * 0.35, a, 0.18, 0.004, 0.05, 0xffffff);
          }
        }
      }
      void s;
      void events;
      void dt;
    };
  }

  void ease;
  return null;
}
