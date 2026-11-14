import { PLAYER_RADIUS, START_CLEAR_RADIUS } from '../config/balance';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos, isFree, moveCircle, nearestFree, reachable } from '../map/tilemap';
import { WALDSEE_FIRE } from '../config/floor-waldsee';
import { DT, TICK_RATE, type BossState, type Enemy, type Intent, type Player, type SimState, type Vec2, type WitchState } from '../types';
import { dist } from '../util';
import { spawnEnemy } from './enemies';
import { spawnHorde } from './hordes';
import { damagePlayer } from './player';
import { aloft } from './rare';

/**
 * The Schrättele, the witch of the Fasnet, the boss of the Town. She has her bonfire beside the Federle-Brunnen,
 * and its heat hurts whoever comes too close (the logs are low: a jump takes you over the flames). She crouches and
 * looks about, then charges or hops at someone with her broom raised; she leaps onto a player and presses them down
 * ("s'Schrättele druckt") until they shake her off or a teammate knocks her off; she sweeps her burning broom and
 * throws burning twigs that keep burning on the floor. From the second phase on she dances round the fire with
 * little witches (the Schrättelestanz): the heat grows, the drums go, and she hardly feels a hit until the small
 * ones are beaten. At half her health she turns her mask from the grinning face to the glaring one, and is quicker
 * and harder from then on. She never moves in time with anything: her pace wavers all the while.
 */
export const WITCH = {
  hp: 1700,
  /** the share of her health she takes in full a second (see BOSS_HP.gate): a little less than the others, so that
   *  not even the strongest weapon at its best burns her down in under half a minute */
  gate: 0.015,
  speed: 3.1,
  radius: 0.75,
  /** she appears this far south of her fire */
  standOff: 2.6,
  /** the heat round the fire: how far it reaches, how far while she dances, and what it does a second */
  heat: 2.1,
  danceHeat: 3.3,
  heatDps: 16,
  /** before a charge or a hop she crouches and looks about this long (the glaring face: less) */
  scanTicks: 55,
  glareScanTicks: 40,
  /** her charge: the strikes along her way warn this long first; she runs this far at most, one strike every `chargeStep` */
  chargeWarn: 40,
  chargeLength: 9,
  chargeStep: 2.2,
  chargeDamage: 30,
  /** how far a blow of her broom throws a player */
  fling: 4,
  /** her hop: how long she is in the air, how wide the blow where she lands */
  hopTicks: 50,
  glareHopTicks: 42,
  hopRadius: 2.3,
  hopDamage: 30,
  /** in mid-hop (and in the leap to press someone down) her landing spot follows the player at this many tiles a
   *  second at most, for this share of the flight; nothing on the floor shows where she will land */
  homing: 2.6,
  homingShare: 0.7,
  /** "s'Schrättele druckt": how far she leaps for it, how long she is in the air (the ring warns as long), how near her
   *  landing the player must still be, how long she sits on them and what that does a second. Shaking her off takes
   *  `struggle` jumps (a dash counts double); a teammate knocks her off with `knock` of her health in hits. */
  pressReach: 9,
  pressLeapTicks: 60,
  pressRadius: 1.5,
  pressTicks: 180,
  pressDps: 14,
  struggle: 4,
  knock: 0.03,
  /** where she sits while she presses: this far from the player's middle (out of reach of her body's touch) */
  pressSit: 1.2,
  /** thrown off, she is dazed this long; the player she let go of cannot be hurt for `spare` */
  reelTicks: 90,
  spare: 60,
  /** her burning broom: a sweep across the front of her, a row of strikes `sweepRow` from her within `sweepArc`, side
   *  by side and not on top of each other (one blow per sweep); with the glaring face a second row of fire follows
   *  further out a moment later */
  sweepReach: 4.2,
  sweepRow: 2.5,
  sweepOuter: 5,
  sweepArc: 2.2,
  sweepWarn: 45,
  sweepDamage: 26,
  /** burning twigs: how many she throws (grinning, glaring, dancing), how long they fly, the blow where they land */
  twigs: { grin: 2, glare: 3, dance: 2 },
  twigWarn: 50,
  twigRadius: 1.3,
  twigDamage: 18,
  /** the twigs that miss the player land round them, this far off */
  twigSpread: 2.8,
  /** where they land they burn on for this long, hurting this much a second */
  emberTicks: 210,
  emberRadius: 1.1,
  emberDps: 8,
  /** the dance: how far from the fire, how fast round it (radians a second), how many small ones each phase, how
   *  long at most, and the share of a hit she feels meanwhile */
  danceRadius: 4.4,
  danceSpin: 0.7,
  helpers: { 2: 4, 3: 6 } as Record<2 | 3, number>,
  danceTicks: 30 * TICK_RATE,
  danceArmor: 0.25,
  /** the glaring face: this much quicker on her feet and with her attacks, this much harder */
  glareSpeed: 1.3,
  glareHaste: 0.8,
  glareHarm: 1.15,
  /** how often she attacks, against the other bosses */
  haste: 1,
};

const byId = (s: SimState, id: number) => s.enemies.find(e => e.id === id && e.hp > 0);
const unit = (from: Vec2, to: Vec2): Vec2 => {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  return d > 1e-6 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
};
/** a wavering number between about -1 and 1 that never repeats in a beat: three slow waves that do not fit each other */
const waver = (t: number, seed: number) => (Math.sin(t * 1.37 + seed) + Math.sin(t * 0.61 + seed * 2.3) * 0.7 + Math.sin(t * 2.93 + seed * 0.7) * 0.4) / 2.1;
const harm = (w: WitchState) => (w.face === 'glare' ? WITCH.glareHarm : 1);

/**
 * Where she lights her fire on a map that has no place for it (the Town has, beside the fountain): the open floor
 * closest to `near` with room for the heat ring all round it (as wide as it gets while she dances, or at least as it
 * burns), on the floor the players walk on, and away from where they come in and from the elevator.
 */
export function fireSpot(s: SimState, near: Vec2): Vec2 {
  if (s.map.id === 'waldsee') return { ...WALDSEE_FIRE };
  const walk = reachable(s.map, s.map.spawn, BLOCKS_WALKER);
  const ok = (q: Vec2, room: number) =>
    q.x > 0 && q.z > 0 && q.x < s.map.w && q.z < s.map.h && walk[Math.floor(q.z) * s.map.w + Math.floor(q.x)] === 1 && isFree(s.map, q, room, BLOCKS_ENEMY) && dist(q, s.map.elevator) > room + 3 && dist(q, s.map.spawn) > room + 3;
  for (const room of [WITCH.danceHeat, WITCH.heat + 0.4]) {
    for (let r = 0; r <= 14; r += 0.5) {
      const n = Math.max(1, Math.round(r * 4));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const q = { x: Math.floor(near.x + Math.cos(a) * r) + 0.5, z: Math.floor(near.z + Math.sin(a) * r) + 0.5 };
        if (ok(q, room)) return q;
      }
    }
  }
  return nearestFree(s.map, near, WITCH.heat, BLOCKS_ENEMY);
}

/** Sets her up on her body near `near`: she lights her fire (see fireSpot) and stands beside it. */
export function setupWitch(s: SimState, b: BossState, body: Enemy, near: Vec2): void {
  const fire = fireSpot(s, near);
  body.radius = WITCH.radius;
  body.speed = WITCH.speed;
  // (beside the fire, out of its heat: south of it in the Town, else between it and where she came in)
  const away = s.map.id === 'waldsee' || dist(near, fire) < 0.5 ? { x: 0, z: 1 } : unit(fire, near);
  body.pos = nearestFree(s.map, { x: fire.x + away.x * WITCH.standOff, z: fire.z + away.z * WITCH.standOff }, body.radius, BLOCKS_ENEMY);
  body.dir = { x: away.x, z: away.z };
  b.lastPos = { ...body.pos };
  b.gateShare = WITCH.gate;
  b.witch = { fire, heat: WITCH.heat, speed: WITCH.speed, face: 'grin', move: null, press: null, dance: null, embers: [], nextDrumAt: 0, nextCrackleAt: s.tick + TICK_RATE };
}

/** She is in the middle of something: no new attack until it is over. */
export function witchBusy(b: BossState): boolean {
  const w = b.witch;
  return !!w && (w.move !== null || w.press !== null || !!b.leap);
}

/** what a hit on her counts for: little while she dances; a hit by anyone else knocks her off the player she presses */
export function witchHit(b: BossState, amount: number, byPlayerId?: number): number {
  const w = b.witch;
  if (!w) return amount;
  // (a teammate's hits free the one she holds; a tower or a blast nobody fired does not)
  if (w.press && byPlayerId !== undefined && byPlayerId !== w.press.playerId) w.press.hurt += amount;
  return w.dance ? amount * WITCH.danceArmor : amount;
}

/** is this player held down by a witch right now? */
export function pressedBy(s: SimState, p: Player): BossState | undefined {
  return [s.boss, ...(s.bosses ?? [])].find(b => b?.witch?.press?.playerId === p.id) ?? undefined;
}

function warn(s: SimState, pos: Vec2, radius: number, damage: number, delay: number, fling?: Vec2): void {
  s.blasts.push({ id: s.nextId++, pos: { ...pos }, radius, createdAt: s.tick, at: s.tick + delay, damage, ...(fling ? { fling: { from: { ...fling }, dist: WITCH.fling } } : {}) });
  s.events.push({ type: 'blastWarning', pos: { ...pos }, radius });
}

/** She picks what to do next (called when her next attack is due and she is not busy). */
export function witchAttack(s: SimState, b: BossState, seen: Player[]): void {
  const w = b.witch, me = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!w || !me) return;
  // (only those she sees)
  const alive = seen;
  if (alive.length === 0) return;
  const voice = () => s.events.push({ type: 'bossAttack', kind: 'witch' });
  if (w.dance) {
    // while she dances she only throws twigs from the circle
    throwTwigs(s, b, me, alive, WITCH.twigs.dance);
    return;
  }
  const near = alive.reduce((a, c) => (dist(c.pos, me.pos) < dist(a.pos, me.pos) ? c : a));
  const reach = alive.filter(p => dist(p.pos, me.pos) <= WITCH.pressReach && hasLos(s.map, me.pos, p.pos) && !aloft(s, p) && !pressedBy(s, p));
  const roll = s.rng.next();
  if (dist(near.pos, me.pos) < WITCH.sweepReach && roll < 0.35) {
    voice();
    sweep(s, b, me, near);
  } else if (reach.length > 0 && roll < 0.6) {
    voice();
    leapOnto(s, b, me, s.rng.pick(reach), 'press');
  } else if (roll < 0.88) {
    // crouch and look about; then a charge at whoever she settles on (a hop if they are close or out of sight)
    const target = s.rng.pick(alive);
    const next = dist(target.pos, me.pos) > 3.5 && hasLos(s.map, me.pos, target.pos) && s.rng.next() < 0.6 ? 'charge' : 'hop';
    w.move = { kind: 'scan', at: s.tick, until: s.tick + (w.face === 'glare' ? WITCH.glareScanTicks : WITCH.scanTicks), from: { ...me.pos }, target: target.id, next };
  } else {
    voice();
    throwTwigs(s, b, me, alive, w.face === 'glare' ? WITCH.twigs.glare : WITCH.twigs.grin);
  }
}

/** her burning broom swept round in front of her: two rows of strikes across her front, throwing whoever they hit */
function sweep(s: SimState, b: BossState, me: Enemy, p: Player): void {
  const w = b.witch!;
  const dir = unit(me.pos, p.pos), mid = Math.atan2(dir.z, dir.x);
  w.move = { kind: 'sweep', at: s.tick, until: s.tick + WITCH.sweepWarn + 12, from: { ...me.pos }, target: p.id };
  me.dir = dir;
  // (strikes side by side along the row: as many as fit without overlapping)
  const row = (r: number, delay: number) => {
    const n = Math.max(2, Math.floor((r * WITCH.sweepArc) / 2.5) + 1);
    for (let i = 0; i < n; i++) {
      // (the broom goes from one side to the other: the strikes follow it)
      const k = i / (n - 1), a = mid - WITCH.sweepArc / 2 + WITCH.sweepArc * k;
      warn(s, { x: me.pos.x + Math.cos(a) * r, z: me.pos.z + Math.sin(a) * r }, 1.25, WITCH.sweepDamage * harm(w), delay + Math.round(k * 10), me.pos);
    }
  };
  row(WITCH.sweepRow, WITCH.sweepWarn);
  if (w.face === 'glare') row(WITCH.sweepOuter, WITCH.sweepWarn + 22);
  s.events.push({ type: 'witchSweep', pos: { ...me.pos }, dir });
}

/** burning twigs at the players (at most four of them) and where they are heading; each keeps burning where it lands */
function throwTwigs(s: SimState, b: BossState, me: Enemy, alive: Player[], count: number): void {
  const w = b.witch!;
  const to: Vec2[] = [];
  const aims = alive.slice(0, 4);
  const turn = s.rng.next() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    // one at each player; the rest round them, far enough apart that no two can hit at once
    const p = aims[i % aims.length], round = Math.floor(i / aims.length);
    const a = turn + (round * Math.PI * 2) / Math.max(1, Math.ceil(count / aims.length) - 1);
    const spot = round === 0 ? { ...p.pos } : { x: p.pos.x + Math.cos(a) * WITCH.twigSpread, z: p.pos.z + Math.sin(a) * WITCH.twigSpread };
    if (!isFree(s.map, spot, 0.3, BLOCKS_WALKER) || to.some(t => dist(t, spot) < WITCH.twigRadius * 2)) continue;
    to.push(spot);
    warn(s, spot, WITCH.twigRadius, WITCH.twigDamage * harm(w), WITCH.twigWarn + round * 8);
    w.embers.push({ id: s.nextId++, pos: spot, radius: WITCH.emberRadius, from: s.tick + WITCH.twigWarn + round * 8, until: s.tick + WITCH.twigWarn + round * 8 + WITCH.emberTicks });
  }
  if (to.length === 0) return;
  if (!w.dance) w.move = { kind: 'throw', at: s.tick, until: s.tick + 24, from: { ...me.pos } };
  me.dir = unit(me.pos, to[0]);
  s.events.push({ type: 'witchTwigs', from: { ...me.pos }, to, at: s.tick + WITCH.twigWarn });
}

/**
 * She hops at `p`: nothing on the floor shows where she comes down (her crouch and her cackle are the warning), and
 * in the air she bends her flight toward them a little (see steerHop); then a blow of her broom where she lands, or
 * she sits on them ("druckt")
 */
function leapOnto(s: SimState, b: BossState, me: Enemy, p: Player, next: 'hop' | 'press'): void {
  const w = b.witch!;
  const press = next === 'press';
  const ticks = press ? WITCH.pressLeapTicks : w.face === 'glare' ? WITCH.glareHopTicks : WITCH.hopTicks;
  const to = nearestFree(s.map, p.pos, me.radius, BLOCKS_ENEMY);
  // (never into a wall: with no floor near them she throws her twigs at them instead)
  if (!isFree(s.map, to, me.radius, BLOCKS_ENEMY)) return throwTwigs(s, b, me, [p], w.face === 'glare' ? WITCH.twigs.glare : WITCH.twigs.grin);
  b.leap = { from: { ...me.pos }, to, start: s.tick, land: s.tick + ticks };
  w.move = { kind: 'hop', at: s.tick, until: s.tick + ticks, from: { ...me.pos }, to: { ...to }, target: p.id, next: press ? 'press' : 'hop' };
  me.dir = unit(me.pos, to);
}

/**
 * In mid-hop she bends her flight toward the player she is after: her landing spot follows them at `homing` tiles a
 * second at most, and only for the first part of the flight. Who keeps running, or dashes aside late, still gets away.
 */
function steerHop(s: SimState, b: BossState, w: WitchState): void {
  const m = w.move, l = b.leap;
  if (!m || m.kind !== 'hop' || !l || !m.to) return;
  if (s.tick - l.start > (l.land - l.start) * WITCH.homingShare) return;
  const p = s.players.find(x => x.id === m.target && x.downUntil === null);
  if (!p) return;
  const d = dist(l.to, p.pos);
  if (d < 1e-3) return;
  const step = Math.min(d, WITCH.homing * DT);
  const to = { x: l.to.x + ((p.pos.x - l.to.x) / d) * step, z: l.to.z + ((p.pos.z - l.to.z) / d) * step };
  if (!isFree(s.map, to, WITCH.radius, BLOCKS_ENEMY)) return;
  l.to = to;
  m.to = { ...to };
}

/** The witch leaps at `p` to sit on them (or, `next` = 'hop', to strike with her broom where they stand). */
export function witchPounce(s: SimState, p: Player, next: 'hop' | 'press' = 'press', b: BossState | null = s.boss): void {
  const me = b?.witch && b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!b || !me) return;
  b.witch!.move = null;
  leapOnto(s, b, me, p, next);
}

/** her charge: a line of strikes along her way, as far as the floor goes; she runs it as they go off */
function charge(s: SimState, b: BossState, me: Enemy, p: Player): void {
  const w = b.witch!;
  const dir = unit(me.pos, p.pos);
  const want = Math.min(WITCH.chargeLength, dist(me.pos, p.pos) + 2.5);
  let len = 0;
  while (len + 0.25 <= want && isFree(s.map, { x: me.pos.x + dir.x * (len + 0.25), z: me.pos.z + dir.z * (len + 0.25) }, me.radius, BLOCKS_ENEMY)) len += 0.25;
  const to = { x: me.pos.x + dir.x * len, z: me.pos.z + dir.z * len };
  const n = Math.max(1, Math.floor(len / WITCH.chargeStep));
  for (let i = 1; i <= n; i++) warn(s, { x: me.pos.x + dir.x * i * WITCH.chargeStep, z: me.pos.z + dir.z * i * WITCH.chargeStep }, 1.2, WITCH.chargeDamage * harm(w), WITCH.chargeWarn + i * 3, me.pos);
  me.dir = dir;
  w.move = { kind: 'charge', at: s.tick + WITCH.chargeWarn, until: s.tick + WITCH.chargeWarn + n * 3, from: { ...me.pos }, to, target: p.id };
  s.events.push({ type: 'bossAttack', kind: 'witch' });
}

/** The little witches come out of the dark and dance with her round the fire. */
export function startDance(s: SimState, b: BossState, phase: 2 | 3): void {
  const w = b.witch;
  if (!w || w.dance) return;
  const helpers: number[] = [];
  const n = WITCH.helpers[phase] + Math.min(4, s.players.length - 1);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const spot = nearestFree(s.map, { x: w.fire.x + Math.cos(a) * WITCH.danceRadius, z: w.fire.z + Math.sin(a) * WITCH.danceRadius }, 0.35, BLOCKS_ENEMY);
    helpers.push(spawnEnemy(s, 'witchling', spot).id);
  }
  // (whatever she was about to do is off: she joins the dance)
  w.move = null;
  b.leap = null;
  if (w.press) letGo(s, b, false);
  w.dance = { helpers, at: s.tick, until: s.tick + WITCH.danceTicks };
  w.nextDrumAt = s.tick;
  s.events.push({ type: 'witchDance', pos: { ...w.fire } });
}

/** where a dancer is on the circle round the fire: each at its own place, all going round at a wavering pace */
function dancePos(w: WitchState, tick: number, slot: number, slots: number): Vec2 {
  const t = (tick - (w.dance?.at ?? 0)) / TICK_RATE;
  // (the pace wavers: a step forward, a stop, a rush; the angle is the sum of it)
  const a = WITCH.danceSpin * (t + 0.6 * Math.sin(t * 1.3) + 0.35 * Math.sin(t * 0.47 + 1)) + (slot / slots) * Math.PI * 2;
  const r = WITCH.danceRadius + 0.35 * Math.sin(t * 2.1 + slot * 1.9);
  return { x: w.fire.x + Math.cos(a) * r, z: w.fire.z + Math.sin(a) * r };
}

function letGo(s: SimState, b: BossState, broke: boolean): void {
  const w = b.witch!;
  const pr = w.press;
  if (!pr) return;
  w.press = null;
  const p = s.players.find(x => x.id === pr.playerId);
  const me = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (p) p.invulnUntil = Math.max(p.invulnUntil, s.tick + WITCH.spare);
  if (me && p) {
    // she is thrown back off them (or gets up), a step away
    const away = unit(p.pos, me.pos);
    moveCircle(s.map, me.pos, away.x * 1.2, away.z * 1.2, me.radius, BLOCKS_ENEMY);
    if (broke) w.move = { kind: 'reel', at: s.tick, until: s.tick + WITCH.reelTicks, from: { ...me.pos } };
  }
  s.events.push({ type: 'witchRelease', playerId: pr.playerId, broke, pos: { ...(me?.pos ?? b.lastPos) } });
}

/** Where she and the small ones stand this tick, after everything else has moved. */
export function moveWitch(s: SimState, b: BossState): void {
  const w = b.witch, me = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!w) return;
  if (w.dance) {
    const dancers = [b.enemyId, ...w.dance.helpers];
    dancers.forEach((id, i) => {
      const e = id !== null ? byId(s, id) : undefined;
      if (!e || e.frozenUntil > s.tick || e.stuckUntil > s.tick) return;
      const at = dancePos(w, s.tick, i, dancers.length);
      if (!isFree(s.map, at, e.radius, BLOCKS_ENEMY)) return;
      const step = unit(e.pos, at);
      if (dist(e.pos, at) > 1e-3) e.dir = step;
      e.pos = at;
    });
    return;
  }
  if (!me) return;
  const pr = w.press;
  if (pr) {
    const p = s.players.find(x => x.id === pr.playerId);
    if (!p) return;
    // the player stays where she caught them; she sits over them
    p.pos = { ...pr.at };
    const face = unit(pr.at, me.pos);
    const sit = { x: pr.at.x + face.x * WITCH.pressSit, z: pr.at.z + face.z * WITCH.pressSit };
    me.pos = isFree(s.map, sit, me.radius * 0.6, BLOCKS_ENEMY) ? sit : me.pos;
    me.dir = { x: -face.x, z: -face.z };
    return;
  }
  steerHop(s, b, w);
  const m = w.move;
  if (!m || b.leap) return;
  if (m.kind === 'charge' && s.tick >= m.at && m.to) {
    const t = Math.min(1, (s.tick - m.at) / Math.max(1, m.until - m.at));
    me.pos = { x: m.from.x + (m.to.x - m.from.x) * t, z: m.from.z + (m.to.z - m.from.z) * t };
    return;
  }
  // crouched, sweeping, throwing or dazed she stands where she is
  me.pos = { ...m.from };
  if (m.kind === 'scan' || m.kind === 'charge') {
    const p = s.players.find(x => x.id === m.target);
    if (m.kind === 'charge' && m.to) me.dir = unit(m.from, m.to);
    else if (p) {
      // looking about: her eyes go round, and settle on whoever she is after only at the end
      const t = (s.tick - m.at) / Math.max(1, m.until - m.at);
      const look = Math.atan2(p.pos.z - me.pos.z, p.pos.x - me.pos.x) + (t < 0.75 ? Math.sin(t * 17) * 1.6 * (1 - t) : 0);
      me.dir = { x: Math.cos(look), z: Math.sin(look) };
    }
  }
}

/** Her fire, her moves, her mask and her dance; runs every tick in the boss update, after the leap. */
export function updateWitch(s: SimState, b: BossState, intents?: Map<number, Intent>): void {
  const w = b.witch;
  if (!w) return;
  const me = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  // the fire: its heat grows while she dances and goes back after; it hurts whoever stands in it (not in mid-jump)
  w.heat += ((w.dance ? WITCH.danceHeat : WITCH.heat) - w.heat) * 0.02;
  for (const p of s.players) if (p.downUntil === null && !aloft(s, p) && dist(p.pos, w.fire) < w.heat + PLAYER_RADIUS * 0.5) damagePlayer(s, p, WITCH.heatDps * DT, 'other');
  if (s.tick >= w.nextCrackleAt) {
    w.nextCrackleAt = s.tick + Math.round(TICK_RATE * (1.6 + 1.2 * Math.abs(waver(s.tick / TICK_RATE, 3))));
    s.events.push({ type: 'fireCrackle', pos: { ...w.fire } });
  }
  // burning twigs on the floor
  w.embers = w.embers.filter(e => e.until > s.tick);
  for (const e of w.embers) {
    if (s.tick < e.from) continue;
    for (const p of s.players) if (p.downUntil === null && !aloft(s, p) && dist(p.pos, e.pos) < e.radius + PLAYER_RADIUS * 0.5) damagePlayer(s, p, WITCH.emberDps * DT, 'other');
  }
  if (!me) return;
  // her pace wavers all the while: she never walks in time with anything (not while she waits as a wild boss by
  // the elevator: then she stands, see boss.ts)
  // (and not while she keeps watch by her fire, having seen nobody yet: then she stands and looks about)
  if (b.waiting === undefined) me.speed = b.unseen ? 0 : w.speed * (0.95 + 0.55 * waver(s.tick / TICK_RATE, me.id));
  // the mask turns at half her health
  if (w.face === 'grin' && me.hp <= me.maxHp * 0.5) {
    w.face = 'glare';
    w.turnedAt = s.tick;
    w.speed *= WITCH.glareSpeed;
    s.events.push({ type: 'witchFace', pos: { ...me.pos } });
    s.events.push({ type: 'bossAttack', kind: 'witch' });
  }
  if (w.dance) dance(s, b, w);
  if (w.press) press(s, b, w, me, intents);
  const m = w.move;
  if (!m || s.tick < m.until) return;
  w.move = null;
  const p = s.players.find(x => x.id === m.target && x.downUntil === null);
  if (m.kind === 'scan' && p) {
    if (m.next === 'charge' && hasLos(s.map, me.pos, p.pos)) charge(s, b, me, p);
    else {
      s.events.push({ type: 'bossAttack', kind: 'witch' });
      leapOnto(s, b, me, p, 'hop');
    }
  } else if (m.kind === 'hop' && m.next === 'hop') {
    // she lands: a blow of her broom all round her that throws whoever it hits (no ring warned of it)
    s.blasts.push({ id: s.nextId++, pos: { ...me.pos }, radius: WITCH.hopRadius, createdAt: s.tick, at: s.tick, damage: WITCH.hopDamage * harm(w), hidden: true, fling: { from: { ...me.pos }, dist: WITCH.fling } });
  } else if (m.kind === 'hop' && m.next === 'press') {
    // she lands: whoever is still under her is pressed down
    if (p && !aloft(s, p) && s.tick >= p.invulnUntil && dist(p.pos, m.to ?? me.pos) <= WITCH.pressRadius + PLAYER_RADIUS && !pressedBy(s, p)) {
      w.press = { playerId: p.id, at: { ...p.pos }, until: s.tick + WITCH.pressTicks, struggle: 0, hurt: 0, held: true };
      s.events.push({ type: 'witchPress', playerId: p.id, pos: { ...p.pos } });
    } else w.move = { kind: 'reel', at: s.tick, until: s.tick + 30, from: { ...me.pos } };
  }
}

function press(s: SimState, b: BossState, w: WitchState, me: Enemy, intents?: Map<number, Intent>): void {
  const pr = w.press!;
  const p = s.players.find(x => x.id === pr.playerId);
  if (!p || p.downUntil !== null || s.tick >= pr.until) return letGo(s, b, false);
  // shaking her off: every jump counts (a press of the key, not holding it), a dash double
  const it = intents?.get(p.id);
  const pushing = !!it && (it.jump || it.dash);
  if (pushing && !pr.held) pr.struggle += it!.dash ? 2 : 1;
  pr.held = pushing;
  if (pr.struggle >= WITCH.struggle) return letGo(s, b, true);
  // a teammate's hits knock her off
  if (pr.hurt >= me.maxHp * WITCH.knock) return letGo(s, b, true);
  damagePlayer(s, p, WITCH.pressDps * harm(w) * DT, 'other');
}

function dance(s: SimState, b: BossState, w: WitchState): void {
  const d = w.dance!;
  // (the list keeps the fallen too: every dancer keeps its place on the circle)
  if (!d.helpers.some(id => byId(s, id)) || s.tick >= d.until) {
    // broken: the small ones that are left run at the players as common monsters
    w.dance = null;
    b.nextAttackAt = Math.max(b.nextAttackAt, s.tick + TICK_RATE);
    s.events.push({ type: 'witchDanceEnd', pos: { ...w.fire } });
    return;
  }
  if (s.tick >= w.nextDrumAt) {
    // the drums: never quite even
    const beat = Math.floor((s.tick - d.at) / 10);
    w.nextDrumAt = s.tick + 22 + ((beat * 7) % 5) * 4 + (beat % 3 === 0 ? 10 : 0);
    s.events.push({ type: 'witchDrum', pos: { ...w.fire }, beat });
  }
}

/** She has fallen: the small ones go with her, and the twigs on the floor go out. */
export function witchDown(s: SimState, b: BossState): void {
  const w = b.witch;
  if (!w) return;
  if (w.press) s.events.push({ type: 'witchRelease', playerId: w.press.playerId, broke: true, pos: { ...b.lastPos } });
  w.press = null;
  w.move = null;
  w.embers = [];
  for (const id of w.dance?.helpers ?? []) {
    const e = byId(s, id);
    if (!e) continue;
    e.hp = 0;
    s.events.push({ type: 'enemyKilled', kind: e.kind, pos: { ...e.pos }, elite: false });
  }
  w.dance = null;
}

/** how many little witches walk the Town's streets on their own (each one a horde, so more of them with more players) */
export const TOWN_WITCHLINGS = 5;

/**
 * The little witches out in the Town: each on her own, at places spread over the Town (each as far from the
 * others as can be), away from the start and from the witch's fire. They wander like any horde until they see
 * someone, and the elevator waits for them as well as for the witch (see witchlingsLeft).
 */
export function spreadWitchlings(s: SimState, fire: Vec2): void {
  const pool = s.map.waypoints.filter(w => dist(w, s.map.spawn) > START_CLEAR_RADIUS && dist(w, fire) > 10);
  if (pool.length === 0) return;
  const chosen: Vec2[] = [s.rng.pick(pool)];
  while (chosen.length < Math.min(TOWN_WITCHLINGS, pool.length)) {
    let best = pool[0], far = -1;
    for (const w of pool) {
      const d = Math.min(...chosen.map(c => dist(c, w)));
      if (d > far) ((far = d), (best = w));
    }
    chosen.push(best);
  }
  for (const w of chosen) spawnHorde(s, w, [{ kind: 'witchling', count: 1 }]);
}

/** whether one of the little witches that walk the Town is still about (not the ones dancing with the witch) */
export const witchlingsLeft = (s: SimState): boolean => s.enemies.some(e => e.kind === 'witchling' && e.hordeId !== null && e.hp > 0);

/** the witch is beaten: the elevator opens once the last little witch out in the Town is squashed too */
export function awaitWitchlings(s: SimState): void {
  if (!s.witchlingsWait || witchlingsLeft(s)) return;
  s.witchlingsWait = false;
  s.elevatorOpen = true;
  s.events.push({ type: 'elevatorOpen' });
}
