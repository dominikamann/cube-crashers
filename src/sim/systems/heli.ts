import { PLAYER_RADIUS } from '../config/balance';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos, isFree, moveCircle, nearestFree, reachable, Tile, tileAt } from '../map/tilemap';
import { DT, TICK_RATE, type BossState, type Enemy, type HeliState, type Player, type SimState, type Vec2 } from '../types';
import { allBosses, dist } from '../util';
import { clearSpot } from './ground';

/**
 * The attack helicopter, the boss of the Sky Helipad. It is not the machine parked on the pad: it flies in from
 * outside and circles over the players, up where nothing reaches it. From there it fires salvos of missiles (every
 * one marked on the floor before it lands), strafes along a line with its gun, or swoops half-way down over
 * someone so that its rotor wash blows everyone under it about. Then it comes down and hovers low for a while:
 * that is when it can be hurt, and it keeps the players off with its wash and bursts of its gun. Hurt, it climbs
 * away at once and calls for help; the more it is hurt, the more missiles come, and the shorter it stays down.
 * Shot down, it spins and comes down burning, and leaves a crate that often holds a Lock-On Launcher.
 */
export const HELI = {
  hp: 900,
  /** how wide its body is to shots while it hovers low */
  radius: 1.5,
  /** how high it flies: circling, in a swoop, hovering low; below `reach` it can be hit */
  cruise: 5.5,
  swoop: 3.4,
  low: 0.7,
  reach: 2.4,
  /** its circle over the players: how wide, how fast round (radians a second), and how fast its middle follows them */
  circle: 5.5,
  spin: 1.1,
  follow: 2.5,
  /** how fast it flies at most, and how fast it turns (radians a second) up in the air and hovering low */
  speed: 12,
  turn: 3.2,
  lowTurn: 1.5,
  /** how long it stays up and how long it hovers low, by phase; the first time it comes down sooner */
  airSeconds: { 1: 9, 2: 9, 3: 8 } as Record<1 | 2 | 3, number>,
  lowSeconds: { 1: 9, 2: 8, 3: 7.5 } as Record<1 | 2 | 3, number>,
  firstAirSeconds: 6,
  descendTicks: 80,
  riseTicks: 60,
  /** hurt into its next phase it climbs away after this long */
  breakOffTicks: 50,
  /** where it comes down: this far from the player it picked, this far from another helicopter's spot, and
   *  with this much room to a glitchy edge if there is such a place (so nobody is blown or lured onto it) */
  landOff: 5,
  landApart: 7,
  landClear: 4,
  /** a salvo of missiles: how many by phase (and one more per further player), how long the rings warn, how far
   *  apart they land in time, the blast of each, and how far from the player the ones round them land */
  salvo: { 1: 3, 2: 5, 3: 7 } as Record<1 | 2 | 3, number>,
  missileWarn: 70,
  missileGap: 6,
  missileRadius: 1.6,
  missileDamage: 30,
  missileLead: 3.2,
  missileSpread: 3.6,
  /** a strafing run (from phase 2): a line of gun strikes through a player, this many of them this far apart */
  strafeChance: { 1: 0, 2: 0.3, 3: 0.3 } as Record<1 | 2 | 3, number>,
  strafeLine: 9,
  strafeStep: 1.5,
  strafeWarn: 60,
  strafeGap: 5,
  strafeSpeed: 13,
  gunRadius: 1.1,
  gunDamage: 20,
  /** a swoop: how long it hangs over a player, how fast it follows them, how hard its wash blows there (tiles a
   *  second right under it) and how far; from phase 2 a ring of missiles lands round where the player stood */
  swoopChance: { 1: 0.35, 2: 0.25, 3: 0.3 } as Record<1 | 2 | 3, number>,
  swoopTicks: 150,
  swoopSpeed: 5,
  swoopWash: 4.5,
  swoopRadius: 6,
  swoopRing: 6,
  swoopRingRadius: 5.2,
  /** hovering low: how hard its wash blows by phase (right under it; nothing at `washRadius`), and from how
   *  high up it is felt on the floor */
  wash: { 1: 3.2, 2: 3.8, 3: 4.4 } as Record<1 | 2 | 3, number>,
  washRadius: 5,
  washTop: 4.2,
  /** a burst of its gun while it hovers low: a line of strikes from its nose, after a short warning */
  gunLine: 6,
  gunWarn: 55,
  /** how often it attacks, against the other bosses */
  haste: 1,
  /** shot down: the wreck hits the floor after this long, with this blast */
  crashTicks: 75,
  wreckRadius: 3,
  wreckDamage: 30,
  /** how often the crate it leaves holds a Lock-On Launcher */
  launcherChance: 0.6,
};

const byId = (s: SimState, id: number) => s.enemies.find(e => e.id === id && e.hp > 0);
const unit = (from: Vec2, to: Vec2, or: Vec2 = { x: 0, z: 1 }): Vec2 => {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  return d > 1e-6 ? { x: dx / d, z: dz / d } : { ...or };
};
const ease = (t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};
/** a spot over the map, a little inside its edge (it flies over every wall, but not away) */
const over = (s: SimState, q: Vec2): Vec2 => ({ x: Math.max(2, Math.min(s.map.w - 2, q.x)), z: Math.max(2, Math.min(s.map.h - 2, q.z)) });
const living = (s: SimState) => s.players.filter(p => p.downUntil === null);

function warn(s: SimState, pos: Vec2, radius: number, damage: number, delay: number): void {
  s.blasts.push({ id: s.nextId++, pos: { ...pos }, radius, createdAt: s.tick, at: s.tick + delay, damage });
  s.events.push({ type: 'blastWarning', pos: { ...pos }, radius });
}

/** Sets it up on its body: up in the air at once. `arrives`: it flies in from the edge of the map. */
export function setupHeli(s: SimState, b: BossState, body: Enemy, centre: Vec2, arrives: boolean): void {
  // (a second one flies on the far side of the circle and comes down when the first is up again)
  const others = allBosses(s).filter(x => x.heli).length;
  body.radius = HELI.radius;
  body.speed = 0;
  body.fly = 'high';
  if (arrives) body.pos = over(s, { x: centre.x, z: 0 });
  body.dir = unit(body.pos, centre);
  // (it makes for the players at once: the middle of its circle is where they are)
  const alive = living(s);
  const home = alive.length > 0 ? { x: alive.reduce((n, p) => n + p.pos.x, 0) / alive.length, z: alive.reduce((n, p) => n + p.pos.z, 0) / alive.length } : { ...centre };
  const air = HELI.firstAirSeconds + (others * (HELI.airSeconds[1] + HELI.lowSeconds[1])) / 2;
  b.heli = { home, angle: -Math.PI / 2 + others * Math.PI, mode: 'circle', at: s.tick, until: s.tick + Math.round(air * TICK_RATE), spot: { ...centre }, run: null, landings: 0, nextRotorAt: s.tick };
}

/** How high it is above the floor at `tick`. */
export function heliHeight(h: HeliState, tick: number): number {
  const t = (tick - h.at) / Math.max(1, h.until - h.at);
  if (h.mode === 'low') return HELI.low;
  if (h.mode === 'descend') return HELI.cruise + (HELI.low - HELI.cruise) * ease(t);
  if (h.mode === 'rise') return HELI.low + (HELI.cruise - HELI.low) * ease(t);
  const r = h.run;
  if (r?.kind !== 'swoop') return HELI.cruise;
  return HELI.cruise + (HELI.swoop - HELI.cruise) * Math.min(ease((tick - r.at) / 35), ease((r.until - tick) / 30));
}

/** Its rotor wash on the floor at `tick`: how hard it blows right under it (tiles a second) and how far out it reaches. */
export function heliWash(b: BossState, tick: number): { push: number; radius: number } {
  const h = b.heli!;
  const lift = heliHeight(h, tick);
  if (h.mode === 'circle') return { push: h.run?.kind === 'swoop' ? HELI.swoopWash * ((HELI.cruise - lift) / (HELI.cruise - HELI.swoop)) : 0, radius: HELI.swoopRadius };
  return { push: HELI.wash[b.phase] * Math.max(0, Math.min(1, (HELI.washTop - lift) / (HELI.washTop - HELI.low))), radius: HELI.washRadius };
}

/** It is in the middle of something: no new attack until it is over. */
export function heliBusy(b: BossState): boolean {
  const h = b.heli;
  return !!h && (h.run !== null || h.mode === 'descend' || h.mode === 'rise');
}

/** It picks what to do next (called when its next attack is due and it is not busy). */
export function heliAttack(s: SimState, b: BossState, alive: Player[]): void {
  const h = b.heli, me = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!h || !me || alive.length === 0) return;
  const voice = () => s.events.push({ type: 'bossAttack', kind: 'heli' });
  if (h.mode === 'low') {
    // hovering low: a burst of its gun at whoever is nearest (badly hurt: at the two nearest)
    const near = [...alive].sort((a, c) => dist(a.pos, me.pos) - dist(c.pos, me.pos)).slice(0, b.phase >= 3 ? 2 : 1);
    for (const p of near) {
      const dir = unit(me.pos, p.pos, me.dir);
      for (let i = 1; i <= HELI.gunLine; i++) strike(s, { x: me.pos.x + dir.x * (HELI.radius + 0.6 + i * HELI.strafeStep), z: me.pos.z + dir.z * (HELI.radius + 0.6 + i * HELI.strafeStep) }, HELI.gunWarn + i * 4);
    }
    s.events.push({ type: 'heliGun', pos: { ...me.pos }, dir: unit(me.pos, near[0].pos, me.dir) });
    return;
  }
  // (about to come down: nothing new)
  if (s.tick + 40 >= h.until) return;
  const roll = s.rng.next();
  if (roll < HELI.swoopChance[b.phase]) {
    voice();
    swoop(s, b, me, s.rng.pick(alive));
  } else if (roll < HELI.swoopChance[b.phase] + HELI.strafeChance[b.phase]) {
    voice();
    strafe(s, b, me, s.rng.pick(alive));
  } else salvo(s, b, me, alive);
}

/** one strike of its gun, where there is floor to hit */
function strike(s: SimState, at: Vec2, delay: number): void {
  if (at.x < 0 || at.z < 0 || at.x >= s.map.w || at.z >= s.map.h || tileAt(s.map, at.x, at.z) === Tile.Wall) return;
  warn(s, at, HELI.gunRadius, HELI.gunDamage, delay);
}

/** missiles from where it flies to the marked spots, one after the other */
function fire(s: SimState, me: Enemy, to: Vec2[], delay: number): void {
  to.forEach((q, i) => warn(s, q, HELI.missileRadius, HELI.missileDamage, delay + i * HELI.missileGap));
  if (to.length > 0) s.events.push({ type: 'heliMissiles', from: { ...me.pos }, to, at: s.tick + delay });
}

/**
 * A salvo: one missile at every player (at most four of them), then one where each is heading, then the rest
 * round them; no two land on top of each other, so there is always a way out between the rings.
 */
function salvo(s: SimState, b: BossState, me: Enemy, alive: Player[]): void {
  const aims = alive.slice(0, 4);
  const count = HELI.salvo[b.phase] + Math.min(3, alive.length - 1);
  const turn = s.rng.next() * Math.PI * 2;
  const round = Math.max(1, Math.ceil(count / aims.length) - 2);
  const to: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const p = aims[i % aims.length], nth = Math.floor(i / aims.length);
    const a = turn + ((nth - 2) * Math.PI * 2) / round + p.id;
    const spot =
      nth === 0 ? { ...p.pos } : nth === 1 ? { x: p.pos.x + p.facing.x * HELI.missileLead, z: p.pos.z + p.facing.z * HELI.missileLead } : { x: p.pos.x + Math.cos(a) * HELI.missileSpread, z: p.pos.z + Math.sin(a) * HELI.missileSpread };
    if (!isFree(s.map, spot, 0.3, BLOCKS_WALKER) || to.some(t => dist(t, spot) < HELI.missileRadius * 2)) continue;
    to.push(spot);
  }
  fire(s, me, to, HELI.missileWarn);
}

/** A strafing run: a line of gun strikes through `p`, and it flies along the line as they go off. */
function strafe(s: SimState, b: BossState, me: Enemy, p: Player): void {
  const dir = unit(me.pos, p.pos, me.dir);
  const half = ((HELI.strafeLine - 1) * HELI.strafeStep) / 2;
  const from = { x: p.pos.x - dir.x * half, z: p.pos.z - dir.z * half };
  for (let i = 0; i < HELI.strafeLine; i++) strike(s, { x: from.x + dir.x * i * HELI.strafeStep, z: from.z + dir.z * i * HELI.strafeStep }, HELI.strafeWarn + i * HELI.strafeGap);
  const ticks = HELI.strafeWarn + HELI.strafeLine * HELI.strafeGap;
  b.heli!.run = { kind: 'strafe', at: s.tick, until: s.tick + ticks, from: over(s, from), to: over(s, { x: p.pos.x + dir.x * (half + 3), z: p.pos.z + dir.z * (half + 3) }) };
  s.events.push({ type: 'heliGun', pos: { ...from }, dir });
}

/**
 * A swoop: it hangs half-way down over `p` and follows them, and its wash blows everyone under it outward. Once
 * hurt it also rings the place with missiles, so being blown about is no way out: stand against the wind.
 */
function swoop(s: SimState, b: BossState, me: Enemy, p: Player): void {
  b.heli!.run = { kind: 'swoop', at: s.tick, until: s.tick + HELI.swoopTicks, from: { ...me.pos }, to: { ...p.pos }, target: p.id };
  s.events.push({ type: 'heliSwoop', pos: { ...p.pos } });
  if (b.phase < 2) return;
  const to: Vec2[] = [];
  const turn = s.rng.next() * Math.PI * 2;
  for (let i = 0; i < HELI.swoopRing; i++) {
    const a = turn + (i / HELI.swoopRing) * Math.PI * 2;
    const spot = { x: p.pos.x + Math.cos(a) * HELI.swoopRingRadius, z: p.pos.z + Math.sin(a) * HELI.swoopRingRadius };
    if (isFree(s.map, spot, 0.3, BLOCKS_WALKER)) to.push(spot);
  }
  fire(s, me, to, HELI.missileWarn + 25);
}

/** The helicopter swoops over `p` (or strafes them) now, whatever it was about to do. */
export function heliRun(s: SimState, p: Player, kind: 'swoop' | 'strafe' = 'swoop', b: BossState | null = s.boss): void {
  const me = b?.heli && b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!b || !me || b.heli!.mode !== 'circle') return;
  if (kind === 'swoop') swoop(s, b, me, p);
  else strafe(s, b, me, p);
}

/**
 * Where it comes down: open floor the players can walk to, a few steps from one of them and in their sight, on
 * the side it comes from if there is room, away from a glitchy edge; never where another helicopter hovers.
 */
function landingSpot(s: SimState, b: BossState, me: Enemy, alive: Player[]): Vec2 {
  const p = alive.length > 0 ? s.rng.pick(alive) : null;
  if (!p) return nearestFree(s.map, me.pos, 0.45, BLOCKS_ENEMY);
  const walk = reachable(s.map, s.map.spawn, BLOCKS_WALKER);
  const taken = allBosses(s).filter(x => x !== b && x.heli && x.heli.mode !== 'circle').map(x => x.heli!.spot);
  const base = Math.atan2(me.pos.z - p.pos.z, me.pos.x - p.pos.x);
  const glitch = (t: Tile) => t === Tile.Hazard;
  for (const [room, clear] of [[HELI.radius, HELI.landClear], [HELI.radius, 0], [0.9, 0], [0.45, 0]])
    for (const r of [HELI.landOff, HELI.landOff - 1, HELI.landOff + 1, HELI.landOff - 2, HELI.landOff + 2])
      for (let k = 0; k < 12; k++) {
        const a = base + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 6);
        const q = { x: p.pos.x + Math.cos(a) * r, z: p.pos.z + Math.sin(a) * r };
        if (q.x < 1 || q.z < 1 || q.x >= s.map.w - 1 || q.z >= s.map.h - 1 || walk[Math.floor(q.z) * s.map.w + Math.floor(q.x)] !== 1) continue;
        if (clear > 0 && !isFree(s.map, q, clear, glitch)) continue;
        if (isFree(s.map, q, room, BLOCKS_ENEMY) && hasLos(s.map, q, p.pos) && taken.every(t => dist(t, q) >= HELI.landApart)) return q;
      }
  return nearestFree(s.map, p.pos, 0.45, BLOCKS_ENEMY);
}

/** Hurt into its next phase while it is down: it climbs away in a moment. */
export function heliPhase(s: SimState, b: BossState): void {
  const h = b.heli;
  if (h && h.mode === 'low') h.until = Math.min(h.until, s.tick + HELI.breakOffTicks);
}

/** Where it is this tick, after everything else has moved: nothing on the floor carries or bumps it. */
export function moveHeli(s: SimState, b: BossState): void {
  const h = b.heli, me = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!h || !me) return;
  me.knock = { x: 0, z: 0 };
  const from = { ...me.pos };
  let face: Vec2 | null = null;
  if (h.mode === 'circle') {
    const r = h.run;
    let to: Vec2, speed = HELI.speed;
    if (r?.kind === 'strafe') {
      // first to where the line begins, then along it
      to = s.tick < r.at + HELI.strafeWarn - 15 ? r.from : r.to;
      speed = HELI.strafeSpeed;
    } else if (r?.kind === 'swoop') {
      const p = s.players.find(x => x.id === r.target && x.downUntil === null);
      if (p) r.to = { ...p.pos };
      to = r.to;
      // (it flies there fast and then keeps over them at its own pace)
      speed = dist(me.pos, to) > 2 ? HELI.speed : HELI.swoopSpeed;
    } else {
      h.angle += HELI.spin * DT;
      to = over(s, { x: h.home.x + Math.cos(h.angle) * HELI.circle, z: h.home.z + Math.sin(h.angle) * HELI.circle });
    }
    const d = dist(me.pos, to), step = Math.min(d, speed * DT);
    if (d > 1e-6) me.pos = { x: me.pos.x + ((to.x - me.pos.x) / d) * step, z: me.pos.z + ((to.z - me.pos.z) / d) * step };
  } else if (h.mode === 'descend') {
    // down to its spot, there when the descent ends
    const left = Math.max(1, h.until - s.tick);
    me.pos = { x: me.pos.x + (h.spot.x - me.pos.x) / left, z: me.pos.z + (h.spot.z - me.pos.z) / left };
  } else me.pos = { ...h.spot };
  // its nose: the way it flies; hovering low or in a swoop, toward whoever is nearest
  const watching = h.mode !== 'circle' || h.run?.kind === 'swoop';
  if (watching) {
    const near = living(s).reduce<Player | null>((a, c) => (!a || dist(c.pos, me.pos) < dist(a.pos, me.pos) ? c : a), null);
    if (near && dist(near.pos, me.pos) > 0.5) face = unit(me.pos, near.pos);
  } else if (dist(from, me.pos) > 1e-4) face = unit(from, me.pos);
  if (!face) return;
  const cross = me.dir.x * face.z - me.dir.z * face.x, dot = me.dir.x * face.x + me.dir.z * face.z;
  const max = (h.mode === 'circle' ? HELI.turn : HELI.lowTurn) * DT;
  const a = Math.max(-max, Math.min(max, Math.atan2(cross, dot)));
  const c = Math.cos(a), sn = Math.sin(a);
  me.dir = { x: me.dir.x * c - me.dir.z * sn, z: me.dir.x * sn + me.dir.z * c };
}

/** Its flight, its wash and when it comes down and climbs again; runs every tick in the boss update. */
export function updateHeli(s: SimState, b: BossState): void {
  const h = b.heli, me = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!h || !me) return;
  const alive = living(s);
  // the middle of its circle follows the players
  if (alive.length > 0) {
    const mid = { x: alive.reduce((n, p) => n + p.pos.x, 0) / alive.length, z: alive.reduce((n, p) => n + p.pos.z, 0) / alive.length };
    const d = dist(h.home, mid), step = Math.min(d, HELI.follow * DT);
    if (d > 1e-6) h.home = { x: h.home.x + ((mid.x - h.home.x) / d) * step, z: h.home.z + ((mid.z - h.home.z) / d) * step };
  }
  if (h.run && s.tick >= h.run.until) {
    h.run = null;
    b.nextAttackAt = Math.max(b.nextAttackAt, s.tick + TICK_RATE);
  }
  if (s.tick >= h.until && !h.run) {
    if (h.mode === 'circle') {
      // (with nobody left standing it stays up)
      if (alive.length === 0) h.until = s.tick + TICK_RATE;
      else {
        h.spot = landingSpot(s, b, me, alive);
        Object.assign(h, { mode: 'descend', at: s.tick, until: s.tick + HELI.descendTicks, landings: h.landings + 1 });
        s.events.push({ type: 'heliDown', pos: { ...h.spot } });
      }
    } else if (h.mode === 'descend') {
      Object.assign(h, { mode: 'low', at: s.tick, until: s.tick + Math.round(HELI.lowSeconds[b.phase] * TICK_RATE) });
      b.nextAttackAt = s.tick + TICK_RATE;
    } else if (h.mode === 'low') {
      Object.assign(h, { mode: 'rise', at: s.tick, until: s.tick + HELI.riseTicks });
      s.events.push({ type: 'heliUp', pos: { ...me.pos } });
    } else {
      // up again: on with the circle from where it is
      Object.assign(h, { mode: 'circle', at: s.tick, until: s.tick + Math.round(HELI.airSeconds[b.phase] * TICK_RATE), angle: Math.atan2(me.pos.z - h.home.z, me.pos.x - h.home.x) });
      b.nextAttackAt = s.tick + TICK_RATE;
    }
  }
  me.fly = heliHeight(h, s.tick) <= HELI.reach ? 'low' : 'high';
  if (s.tick >= h.nextRotorAt) {
    h.nextRotorAt = s.tick + TICK_RATE;
    s.events.push({ type: 'heliRotor', pos: { ...me.pos }, low: me.fly === 'low' });
  }
  // the wash: whoever is on foot under it is blown outward, harder the nearer its middle (a wall stops them)
  const wash = heliWash(b, s.tick);
  if (wash.push <= 0) return;
  for (const p of alive) {
    const d = dist(p.pos, me.pos);
    if (d >= wash.radius || p.vehicleId !== null || p.perched) continue;
    const dir = unit(me.pos, p.pos, { x: -p.facing.x, z: -p.facing.z });
    const step = wash.push * (1 - d / wash.radius) * DT;
    moveCircle(s.map, p.pos, dir.x * step, dir.z * step, PLAYER_RADIUS, BLOCKS_WALKER);
  }
}

/** It is shot down: it spins and comes down burning where it hovered, and leaves a crate. */
export function heliDown(s: SimState, b: BossState): void {
  if (!b.heli) return;
  b.heli.run = null;
  warn(s, b.lastPos, HELI.wreckRadius, HELI.wreckDamage, HELI.crashTicks);
  s.events.push({ type: 'heliCrash', pos: { ...b.lastPos }, at: s.tick + HELI.crashTicks });
  // (its launcher is often still good; not in the Gun Game, where weapons come from kills)
  if (s.versus?.rule === 'gungame') return;
  const beside = nearestFree(s.map, { x: b.lastPos.x, z: b.lastPos.z + HELI.wreckRadius + 1 }, 0.4, BLOCKS_WALKER);
  s.crates.push({ id: s.nextId++, pos: { ...clearSpot(s, beside) }, ...(s.rng.next() < HELI.launcherChance ? { prize: 'missileLauncher' as const } : {}) });
}
