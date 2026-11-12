import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos, moveCircle, nearestFree } from '../map/tilemap';
import { ENEMY_CAP, PLAYER_RADIUS } from '../config/balance';
import { damagePlayer } from './player';
import { flowDir } from '../map/flowfield';
import { DT, TICK_RATE, type BossKind, type BossState, type Enemy, type Intent, type Player, type SimState, type Vec2 } from '../types';
import { allBosses, dist } from '../util';
import { hpScale } from './coop';
import { dropCoins } from './combat';
import { spawnEnemy } from './enemies';
import { spawnHorde, type HordeComp } from './hordes';

export const BOSS = {
  deathCoins: 60,
  wormSegments: 18,
  wormSpacing: 0.9,
  wormSpeed: 2.2,
  wormMinSplit: 3,
  wormMaxWorms: 4,
  /** share of Mega Block attacks that are stomps (the rest are shockwave lines) */
  stompChance: 0.6,
  /** the Mega Block's leap: from phase 2 on, this share of its attacks; where it lands, how long the jump takes */
  leapChance: 0.3,
  leapRadius: 3.2,
  leapTicks: 75,
  /** it gets this much faster with every phase */
  megaPhaseSpeed: 1.35,
  stompRadius: 2.5,
  stompDamage: 30,
  strikeRadius: 2,
  strikeDamage: 30,
  warnTicks: 60,
  /** seconds between attacks per phase */
  attackSeconds: { 1: 3.5, 2: 3, 3: 2.4 } as Record<1 | 2 | 3, number>,
  /** shockwave: blasts in a line, one after another */
  waveLength: 8,
  waveStep: 1.5,
  /** the Kraken's grab: how far it reaches, how fast it drags, how long it holds, what it does per second */
  grabRange: 10,
  grabSpeed: 5,
  grabTicks: 100,
  grabDps: 12,
  /** its tentacle slap: a ring of blows around it */
  slapRadius: 3.8,
  /** the Kraken's sea: schools swim around from the start, and it calls a new one this often, faster each phase */
  startSchools: 3,
  schoolSeconds: { 1: 20, 2: 16, 3: 12 } as Record<1 | 2 | 3, number>,
  /** no new school while this many fish and sharks are still alive */
  seaCap: 30,
  /** King Rex */
  rexHp: 1600,
  /** King Rex's roar: the ground cracks in a ring around it */
  roarRadius: 4.5,
};

const REINFORCEMENTS: Record<2 | 3, HordeComp> = {
  2: [{ kind: 'blob', count: 8 }, { kind: 'shooter', count: 2 }],
  3: [{ kind: 'hunter', count: 6 }, { kind: 'bomber', count: 3 }],
};
/** under water the Kraken calls the sea instead */
const SEA_REINFORCEMENTS: Record<2 | 3, HordeComp> = {
  2: [{ kind: 'fish', count: 12 }, { kind: 'shark', count: 1 }],
  3: [{ kind: 'fish', count: 10 }, { kind: 'shark', count: 3 }],
};

const SCHOOL: HordeComp = [{ kind: 'fish', count: 7 }, { kind: 'shark', count: 1 }];

const byId = (s: SimState, id: number) => s.enemies.find(e => e.id === id);

function bodies(s: SimState, b: BossState): Enemy[] {
  const ids = b.kind === 'worm' ? b.worms.flat() : b.enemyId !== null ? [b.enemyId] : [];
  return ids.map(id => byId(s, id)).filter((e): e is Enemy => e !== undefined && e.hp > 0);
}

const hpOf = (s: SimState, b: BossState) => bodies(s, b).reduce((sum, e) => sum + e.hp, 0);

/** the health of every boss in the game together (one on a boss floor, several in a Boss Brawl) */
export function bossHp(s: SimState): number {
  return allBosses(s).reduce((sum, b) => sum + hpOf(s, b), 0);
}

/** Called when a boss floor is set up: the boss appears in the middle of the arena. */
export function spawnBoss(s: SimState, kind: BossKind, at?: Vec2): void {
  const centre = nearestFree(s.map, at ?? { x: s.map.w / 2, z: s.map.h * 0.35 }, 1.2, BLOCKS_ENEMY);
  let b: BossState;
  if (kind === 'megaBlock' || kind === 'rex' || kind === 'kraken') {
    const e = spawnEnemy(s, kind === 'rex' ? 'trex' : kind, centre);
    if (kind === 'rex') {
      // King Rex: a T-Rex grown to boss size
      e.hp = e.maxHp = BOSS.rexHp * hpScale(s);
      e.radius = 1.3;
      e.speed *= 1.1;
    }
    b = { kind, maxHp: e.maxHp, phase: 1, enemyId: e.id, worms: [], nextAttackAt: 0, lastPos: { ...centre } };
  } else {
    const ids: number[] = [];
    for (let i = 0; i < BOSS.wormSegments; i++) ids.push(spawnEnemy(s, 'wormSegment', { x: centre.x, z: centre.z - i * BOSS.wormSpacing }).id);
    // the bar and the phases count from what the segments really have
    b = { kind, maxHp: ids.reduce((sum, id) => sum + (byId(s, id)?.hp ?? 0), 0), phase: 1, enemyId: null, worms: [ids], nextAttackAt: 0, lastPos: { ...centre } };
  }
  b.nextAttackAt = s.tick + 3 * TICK_RATE;
  if (kind === 'kraken') {
    // the sea bed is alive: a few schools already swim about, away from where the players come in
    const far = s.map.waypoints.filter(w => dist(w, s.map.spawn) > 12 && dist(w, centre) > 6);
    for (let i = 0; i < BOSS.startSchools && far.length > 0; i++) spawnHorde(s, far.splice(Math.floor(s.rng.next() * far.length), 1)[0], SCHOOL);
    b.nextSchoolAt = s.tick + BOSS.schoolSeconds[1] * TICK_RATE;
  }
  if (s.bosses) {
    s.bosses.push(b);
    s.boss = s.bosses[0];
  } else s.boss = b;
  s.events.push({ type: 'bossSpawn', kind });
}

/**
 * Boss Brawl: every boss comes to the Mega Block Arena, one or two at a time by the dice, some of them twice.
 * A cleared wave gives a breather and a heart, then the next comes in. Now and then a shark swims through.
 */
export const BRAWL = {
  kinds: ['megaBlock', 'rex', 'worm', 'kraken'] as BossKind[],
  /** this many of them come a second time */
  extra: 2,
  breakTicks: 4 * TICK_RATE,
  sharkEveryTicks: 20 * TICK_RATE,
};

export function startBrawl(s: SimState): void {
  const shuffle = (list: BossKind[]) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(s.rng.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  s.bosses = [];
  s.boss = null;
  s.brawl = { queue: [...shuffle(BRAWL.kinds), ...shuffle(BRAWL.kinds).slice(0, BRAWL.extra)], nextAt: s.tick, wave: 0, nextSharkAt: s.tick + BRAWL.sharkEveryTicks };
}

function updateBrawl(s: SimState): void {
  const br = s.brawl;
  if (!br || !s.bosses || s.elevatorOpen) return;
  if (s.tick >= br.nextSharkAt) {
    // a shark that lost its way: it swims in from the edge and goes for whoever is nearest
    br.nextSharkAt = s.tick + BRAWL.sharkEveryTicks;
    const entries = s.map.waypoints.filter(w => s.players.every(p => dist(w, p.pos) > 8));
    if (entries.length > 0 && s.enemies.length < ENEMY_CAP) spawnHorde(s, s.rng.pick(entries), [{ kind: 'shark', count: 1 }], { rush: true });
  }
  if (s.bosses.length > 0 || s.tick < br.nextAt) return;
  if (br.queue.length === 0) {
    s.elevatorOpen = true;
    s.events.push({ type: 'elevatorOpen' });
    return;
  }
  // one boss or two, by the dice
  const n = Math.min(br.queue.length, s.rng.next() < 0.5 ? 1 : 2);
  br.wave++;
  for (let i = 0; i < n; i++) {
    const side = n === 1 ? 0 : i === 0 ? -1 : 1;
    spawnBoss(s, br.queue.shift()!, { x: s.map.w / 2 + side * 7, z: s.map.h * 0.35 });
  }
}

function telegraph(s: SimState, pos: Vec2, radius: number, damage: number, delay = BOSS.warnTicks): void {
  s.blasts.push({ id: s.nextId++, pos: { ...pos }, radius, createdAt: s.tick, at: s.tick + delay, damage });
  s.events.push({ type: 'blastWarning', pos: { ...pos }, radius });
}

function attack(s: SimState, b: BossState): void {
  const alive = s.players.filter(p => p.downUntil === null);
  if (alive.length === 0) return;
  if (b.kind === 'megaBlock') {
    const boss = byId(s, b.enemyId!);
    // stomps under every player (and a tower now and then), a leap at one of them (from phase 2), or
    // shockwave lines toward one player (in phase 3 a cross of four)
    const roll = s.rng.next();
    if (boss && b.phase >= 2 && roll > 1 - BOSS.leapChance) {
      megaLeap(s, s.rng.pick(alive));
    } else if (!boss || roll < BOSS.stompChance) {
      for (const p of alive) telegraph(s, p.pos, BOSS.stompRadius, BOSS.stompDamage);
      if (s.towers.length > 0 && s.rng.next() < 0.5) telegraph(s, s.rng.pick(s.towers).pos, BOSS.stompRadius, BOSS.stompDamage);
    } else {
      const p = s.rng.pick(alive);
      const d = dist(boss.pos, p.pos) || 1;
      const dir = { x: (p.pos.x - boss.pos.x) / d, z: (p.pos.z - boss.pos.z) / d };
      const arms = b.phase >= 3 ? [dir, { x: -dir.x, z: -dir.z }, { x: -dir.z, z: dir.x }, { x: dir.z, z: -dir.x }] : [dir];
      for (const arm of arms)
        for (let i = 1; i <= BOSS.waveLength; i++) {
          const at = { x: boss.pos.x + arm.x * i * BOSS.waveStep, z: boss.pos.z + arm.z * i * BOSS.waveStep };
          telegraph(s, at, 1.3, BOSS.stompDamage, BOSS.warnTicks + i * 5);
        }
    }
  } else if (b.kind === 'kraken') {
    const kraken = byId(s, b.enemyId!);
    const roll = s.rng.next();
    const near = kraken ? alive.filter(p => dist(p.pos, kraken.pos) <= BOSS.slapRadius + 2) : [];
    const reach = kraken ? alive.filter(p => dist(p.pos, kraken.pos) <= BOSS.grabRange && dist(p.pos, kraken.pos) > BOSS.slapRadius && hasLos(s.map, kraken.pos, p.pos)) : [];
    // too close: a slap all round; someone in reach: grab them; otherwise tentacles in lines, or ink under everyone
    if (kraken && near.length > 0 && roll < 0.5) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        telegraph(s, { x: kraken.pos.x + Math.cos(a) * BOSS.slapRadius, z: kraken.pos.z + Math.sin(a) * BOSS.slapRadius }, 1.4, BOSS.strikeDamage, 45);
      }
    } else if (kraken && !b.grab && reach.length > 0 && roll < 0.8) {
      grabPlayer(s, s.rng.pick(reach));
    } else if (kraken && s.rng.next() < 0.6) {
      for (const p of alive.slice(0, 3)) {
        const d = dist(kraken.pos, p.pos) || 1;
        const dir = { x: (p.pos.x - kraken.pos.x) / d, z: (p.pos.z - kraken.pos.z) / d };
        for (let i = 1; i <= BOSS.waveLength; i++) {
          telegraph(s, { x: kraken.pos.x + dir.x * (1.5 + i * BOSS.waveStep), z: kraken.pos.z + dir.z * (1.5 + i * BOSS.waveStep) }, 1.2, BOSS.strikeDamage, BOSS.warnTicks + i * 4);
        }
      }
    } else {
      for (const p of alive) telegraph(s, p.pos, BOSS.strikeRadius, BOSS.strikeDamage);
    }
  } else if (b.kind === 'rex') {
    const rex = byId(s, b.enemyId!);
    // a roar that cracks the ground in a ring around it, or a stomp under every player
    if (rex && s.rng.next() < 0.45) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        telegraph(s, { x: rex.pos.x + Math.cos(a) * BOSS.roarRadius, z: rex.pos.z + Math.sin(a) * BOSS.roarRadius }, 1.5, BOSS.stompDamage);
      }
    } else {
      for (const p of alive) telegraph(s, p.pos, BOSS.stompRadius, BOSS.stompDamage);
    }
  } else {
    // the worm strikes at a player or a tower
    const target = s.towers.length > 0 && s.rng.next() < 0.35 ? s.rng.pick(s.towers).pos : s.rng.pick(alive).pos;
    telegraph(s, target, BOSS.strikeRadius, BOSS.strikeDamage);
  }
}

/** Moves the worms: each head steers toward the players, the body follows like a chain. */
function moveWorms(s: SimState, b: BossState): void {
  const field = s.flow?.field;
  for (const worm of b.worms) {
    const segs = worm.map(id => byId(s, id)).filter((e): e is Enemy => !!e);
    if (segs.length === 0) continue;
    const head = segs[0];
    if (head.frozenUntil > s.tick || head.stuckUntil > s.tick) continue;
    let dir = field ? flowDir(s.map, field, head.pos) : { x: 0, z: 0 };
    const wiggle = Math.sin(s.tick * 0.08 + head.id) * 0.5;
    dir = { x: dir.x - dir.z * wiggle, z: dir.z + dir.x * wiggle };
    const slow = head.slowUntil > s.tick ? 0.5 : 1;
    moveCircle(s.map, head.pos, (dir.x * BOSS.wormSpeed * slow + head.knock.x) * DT, (dir.z * BOSS.wormSpeed * slow + head.knock.z) * DT, head.radius, BLOCKS_ENEMY);
    head.knock.x *= 0.85;
    head.knock.z *= 0.85;
    if (dir.x !== 0 || dir.z !== 0) head.dir = dir;
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1].pos, cur = segs[i].pos;
      const dx = cur.x - prev.x, dz = cur.z - prev.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > BOSS.wormSpacing) {
        cur.x = prev.x + (dx / d) * BOSS.wormSpacing;
        cur.z = prev.z + (dz / d) * BOSS.wormSpacing;
      }
      segs[i].dir = { x: -dx / d, z: -dz / d };
    }
  }
}

/** Removes dead segments; a destroyed middle segment splits the worm if both halves keep at least 3. */
function resolveWorms(s: SimState, b: BossState): void {
  for (let wi = 0; wi < b.worms.length; wi++) {
    for (;;) {
      const worm = b.worms[wi];
      const i = worm.findIndex(id => {
        const e = byId(s, id);
        return !e || e.hp <= 0;
      });
      if (i < 0) break;
      const dead = byId(s, worm[i]);
      const left = worm.slice(0, i), right = worm.slice(i + 1);
      const middle = i > 0 && i < worm.length - 1;
      if (dead && middle && left.length >= BOSS.wormMinSplit && right.length >= BOSS.wormMinSplit && b.worms.length < BOSS.wormMaxWorms) {
        b.worms[wi] = left;
        b.worms.push(right);
        s.events.push({ type: 'wormSplit', pos: { ...dead.pos } });
      } else {
        b.worms[wi] = [...left, ...right];
      }
    }
  }
  b.worms = b.worms.filter(w => w.length > 0);
}

/** The Mega Block jumps at `p`: a big ring warns where it comes down, a moment later it lands there. */
export function megaLeap(s: SimState, p: Player): void {
  const b = s.boss;
  const boss = b && b.kind === 'megaBlock' ? byId(s, b.enemyId!) : undefined;
  if (!b || !boss) return;
  b.leap = { from: { ...boss.pos }, to: { ...p.pos }, start: s.tick, land: s.tick + BOSS.leapTicks };
  telegraph(s, p.pos, BOSS.leapRadius, BOSS.stompDamage, BOSS.leapTicks);
}

/** In mid-leap the Mega Block flies over everything in a straight line and comes down with a stomp. */
function leap(s: SimState, b: BossState): void {
  const l = b.leap;
  if (!l) return;
  const boss = byId(s, b.enemyId!);
  if (!boss) {
    b.leap = null;
    return;
  }
  const t = Math.min(1, (s.tick - l.start) / (l.land - l.start));
  boss.pos = { x: l.from.x + (l.to.x - l.from.x) * t, z: l.from.z + (l.to.z - l.from.z) * t };
  if (t < 1) return;
  boss.pos = nearestFree(s.map, l.to, boss.radius, BLOCKS_ENEMY);
  b.leap = null;
  s.events.push({ type: 'stomp', pos: { ...boss.pos }, radius: BOSS.leapRadius });
}

/** The Kraken wraps a tentacle round `p` and starts dragging them in. */
export function grabPlayer(s: SimState, p: Player): void {
  const b = s.boss;
  if (!b || b.kind !== 'kraken') return;
  b.grab = { playerId: p.id, until: s.tick + BOSS.grabTicks };
  s.events.push({ type: 'krakenGrab', playerId: p.id });
}

/** A held player is dragged toward the Kraken; a dash (or going down) breaks free. */
function drag(s: SimState, b: BossState, intents?: Map<number, Intent>): void {
  const g = b.grab;
  if (!g) return;
  const p = s.players.find(x => x.id === g.playerId);
  const kraken = byId(s, b.enemyId!);
  const free = () => {
    b.grab = null;
    if (p) s.events.push({ type: 'krakenRelease', playerId: p.id });
  };
  // a dash only breaks free with a charge left to dash with
  const dashing = p !== undefined && (p.dashTicks > 0 || (intents?.get(p.id)?.dash === true && p.dashCharges > 0));
  if (!p || !kraken || p.downUntil !== null || s.tick >= g.until || dashing) return free();
  const d = dist(p.pos, kraken.pos);
  if (d <= kraken.radius + PLAYER_RADIUS + 0.3) return free();
  const step = Math.min(BOSS.grabSpeed * DT, d - kraken.radius - PLAYER_RADIUS);
  moveCircle(s.map, p.pos, ((kraken.pos.x - p.pos.x) / d) * step, ((kraken.pos.z - p.pos.z) / d) * step, PLAYER_RADIUS, BLOCKS_WALKER);
  damagePlayer(s, p, BOSS.grabDps * DT, 'other');
}

/** Moves boss bodies; runs right after the other enemies. */
export function moveBoss(s: SimState): void {
  for (const b of allBosses(s)) if (b.kind === 'worm') moveWorms(s, b);
}

/** Deaths, splits, phases and attacks; runs after all damage of the tick. */
export function updateBoss(s: SimState, intents?: Map<number, Intent>): void {
  if (s.phase !== 'playing') return;
  // each boss in turn is "the" boss while it acts, so its attacks (a leap, a grab) find their own state
  for (const b of [...allBosses(s)]) {
    s.boss = b;
    updateOne(s, b, intents);
  }
  if (s.bosses) {
    s.boss = s.bosses[0] ?? null;
    updateBrawl(s);
  }
}

function updateOne(s: SimState, b: BossState, intents?: Map<number, Intent>): void {
  drag(s, b, intents);
  leap(s, b);
  const living = bodies(s, b);
  if (living.length > 0) b.lastPos = { ...living[0].pos };
  if (b.kind === 'worm') resolveWorms(s, b);
  if (living.length === 0) {
    if (b.grab) s.events.push({ type: 'krakenRelease', playerId: b.grab.playerId });
    s.events.push({ type: 'bossDead', pos: { ...b.lastPos } });
    dropCoins(s, b.lastPos, BOSS.deathCoins);
    if (s.bosses) {
      // a brawl: the others fight on; the wave is cleared when the last of them falls
      s.bosses = s.bosses.filter(x => x !== b);
      if (s.bosses.length === 0 && s.brawl) {
        s.brawl.nextAt = s.tick + BRAWL.breakTicks;
        if (s.brawl.queue.length > 0) s.powerups.push({ id: s.nextId++, kind: 'heart', pos: { ...b.lastPos }, expiresAt: s.tick + 20 * TICK_RATE });
      }
      return;
    }
    s.boss = null;
    s.elevatorOpen = true;
    s.events.push({ type: 'elevatorOpen' });
    return;
  }
  const frac = hpOf(s, b) / b.maxHp;
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  while (b.phase < phase) {
    b.phase = (b.phase + 1) as 2 | 3;
    s.events.push({ type: 'bossPhase', phase: b.phase });
    // the Mega Block gets angrier: faster with every phase
    if (b.kind === 'megaBlock') for (const e of living) e.speed *= BOSS.megaPhaseSpeed;
    const entries = s.map.waypoints.filter(w => dist(w, b.lastPos) > 10);
    if (entries.length > 0) spawnHorde(s, s.rng.pick(entries), (b.kind === 'kraken' ? SEA_REINFORCEMENTS : REINFORCEMENTS)[b.phase], { rush: true });
  }
  if (b.nextSchoolAt !== undefined && s.tick >= b.nextSchoolAt) {
    // the Kraken calls the sea: a new school sweeps in from somewhere away from the players
    b.nextSchoolAt = s.tick + BOSS.schoolSeconds[b.phase] * TICK_RATE;
    const sea = s.enemies.filter(e => (e.kind === 'fish' || e.kind === 'shark') && e.hp > 0).length;
    const entries = s.map.waypoints.filter(w => s.players.every(p => dist(w, p.pos) > 10));
    if (sea < BOSS.seaCap && s.enemies.length + 8 <= ENEMY_CAP && entries.length > 0) spawnHorde(s, s.rng.pick(entries), SCHOOL, { rush: true });
  }
  if (s.tick >= b.nextAttackAt) {
    attack(s, b);
    b.nextAttackAt = s.tick + Math.round(BOSS.attackSeconds[b.phase] * TICK_RATE);
  }
}
