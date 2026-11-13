import { clearSpot } from './ground';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos, moveCircle, nearestFree, Tile, tileAt } from '../map/tilemap';
import { ENEMY_CAP, PLAYER_RADIUS } from '../config/balance';
import { damagePlayer } from './player';
import { flowDir } from '../map/flowfield';
import { DT, TICK_RATE, type Difficulty, type Blast, type BossKind, type BossState, type Enemy, type Intent, type Player, type SimState, type Vec2 } from '../types';
import { allBosses, dist } from '../util';
import { hpScale } from './coop';
import { layEggs } from './eggs';
import { clearOfBorder, insideBorder } from '../map/border';
import { KRAKEN_REACH, QUEEN_REACH } from './enemies';
import { spinWeb } from './webs';
import { aloft } from './rare';
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
  /** a worm cut down to a few segments is this much faster than a whole one */
  wormShortBoost: 0.6,
  /** its lunge: this many strikes in a line ahead of the head; its tail whip: this many in a ring around the tail */
  wormLunge: 5,
  wormWhip: 8,
  wormWhipRadius: 2.2,
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
  /** King Rex: how much faster than a common T-Rex, and how much faster again with each phase */
  /** Angry Dominik, the very last boss: laser eyes and a hammer */
  dominikHp: 3200,
  dominikSpeed: 3.4,
  /** what his hammer and his lightning do, and how much more often he attacks than the other bosses */
  dominikDamage: 42,
  dominikHaste: 0.7,
  dominikRadius: 1.1,
  /** his eyes: a beam that aims first, then burns and turns; who stands in it takes this per second */
  laser: { aimTicks: 50, burnTicks: 95, length: 14, width: 0.9, dps: 70, sweep: 1.6 },
  /** his hammer: thrown out in a line and back again, or brought down for three rings of shockwaves */
  hammerLine: 7,
  hammerRings: [3, 5.6, 8.2],
  /** how far a blow of his hammer throws a player it hits */
  hammerFling: 5,
  /** how often the crate he leaves holds his hammer */
  hammerChance: 0.8,
  /** the Tarantula Queen: she pounces, spins webs and strikes with her fangs; when she falls she bursts into her
   *  brood, and the fight is over when the last of them is gone */
  spiderHp: 2100,
  spiderSpeed: 3.1,
  spiderRadius: 1.25,
  spiderBrood: 21,
  /** she calls this many of them to her side with every phase */
  spiderCall: 4,
  spiderFangs: 5,
  rexHp: 1600,
  rexSpeed: 1.75,
  rexPhaseSpeed: 1.2,
  /** it attacks this much more often than the other bosses */
  rexHaste: 0.75,
  /** its bite: this many strikes in a line from its jaws, after a short warning */
  rexBite: 4,
  rexBiteWarnTicks: 38,
  rexBiteDamage: 36,
  /** from the second phase on its roar cracks a second, wider ring a moment later */
  rexOuterRing: 12,
  rexOuterRadius: 8,
  /** the Rhino: a rammer grown to boss size that charges like mad (a charge that hits flings the player, see enemies.ts) */
  rhinoHp: 1500,
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
  const ids = b.kind === 'worm' ? b.worms.flat() : b.brood ? b.brood : b.enemyId !== null ? [b.enemyId] : [];
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
  if (kind === 'megaBlock' || kind === 'rex' || kind === 'kraken' || kind === 'rhino') {
    const e = spawnEnemy(s, kind === 'rex' ? 'trex' : kind === 'rhino' ? 'rammer' : kind, centre);
    if (kind === 'rhino') {
      // the Rhino: a rammer grown to boss size, faster on its feet
      e.hp = e.maxHp = BOSS.rhinoHp * hpScale(s);
      e.radius = 1.3;
      e.speed *= 1.5;
    }
    if (kind === 'rex') {
      // King Rex: a T-Rex grown to boss size
      e.hp = e.maxHp = BOSS.rexHp * hpScale(s);
      e.radius = 1.3;
      e.speed *= BOSS.rexSpeed;
    }
    b = { kind, maxHp: e.maxHp, phase: 1, enemyId: e.id, worms: [], nextAttackAt: 0, lastPos: { ...centre } };
  } else if (kind === 'spider') {
    // the Tarantula Queen walks like a tank in the rules too, with a body of her own
    const e = spawnEnemy(s, 'tank', centre);
    e.hp = e.maxHp = BOSS.spiderHp * hpScale(s);
    e.radius = BOSS.spiderRadius;
    e.speed = BOSS.spiderSpeed;
    b = { kind, maxHp: e.maxHp, phase: 1, enemyId: e.id, worms: [], nextAttackAt: 0, lastPos: { ...centre } };
  } else if (kind === 'dominik') {
    // Angry Dominik walks like a tank in the rules, but is a body of his own
    const e = spawnEnemy(s, 'tank', centre);
    e.hp = e.maxHp = BOSS.dominikHp * hpScale(s);
    e.radius = BOSS.dominikRadius;
    e.speed = BOSS.dominikSpeed;
    b = { kind, maxHp: e.maxHp, phase: 1, enemyId: e.id, worms: [], nextAttackAt: 0, lastPos: { ...centre } };
  } else {
    const ids: number[] = [];
    // (in a brawl the chain is laid toward the middle of the arena, away from the wall behind it)
    const toMiddle = at && centre.z < s.map.h / 2 ? 1 : -1;
    for (let i = 0; i < BOSS.wormSegments; i++) {
      const pos = { x: centre.x, z: centre.z + toMiddle * i * BOSS.wormSpacing };
      // on a map with walls in the way each segment starts on the nearest free floor
      ids.push(spawnEnemy(s, 'wormSegment', at ? nearestFree(s.map, pos, 0.5, BLOCKS_ENEMY) : pos).id);
    }
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
/** how close a player comes before a waiting wild boss goes for them */
export const WILD_WAKE = 9;

export const BRAWL = {
  kinds: ['megaBlock', 'rex', 'worm', 'kraken', 'rhino', 'spider'] as BossKind[],
  /** this many of them come a second time */
  extra: 2,
  dominikChance: 0.25,
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
  // (now and then Angry Dominik turns up for the last wave)
  const finale: BossKind[] = s.rng.next() < BRAWL.dominikChance ? ['dominik'] : [];
  s.brawl = { queue: [...shuffle(BRAWL.kinds), ...shuffle(BRAWL.kinds).slice(0, BRAWL.extra), ...finale], nextAt: s.tick, wave: 0, nextSharkAt: s.tick + BRAWL.sharkEveryTicks };
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
  // they come in where the players are not: the spots furthest from anyone
  // (the map's waypoints are open floor on every map; the arena has its own spots)
  const fixed = [-7, 0, 7].flatMap(dx => [0.32, 0.68].map(fz => ({ x: s.map.w / 2 + dx, z: s.map.h * fz })));
  const spots = s.map.id === 'arena' || s.map.waypoints.length < 2 ? fixed : s.map.waypoints.map(w => ({ ...w }));
  const clear = (q: Vec2) => Math.min(...s.players.map(p => dist(p.pos, q)));
  spots.sort((a, b) => clear(b) - clear(a));
  const first = spots[0];
  // two of them keep some room between each other
  const second = spots.find(q => dist(q, first) >= 6) ?? spots[1];
  for (let i = 0; i < n; i++) spawnBoss(s, br.queue.shift()!, i === 0 ? first : second);
}

function telegraph(s: SimState, pos: Vec2, radius: number, damage: number, delay = BOSS.warnTicks, more: Pick<Blast, 'fling' | 'hidden' | 'bolt'> = {}): void {
  s.blasts.push({ id: s.nextId++, pos: { ...pos }, radius, createdAt: s.tick, at: s.tick + delay, damage, ...more });
  if (!more.hidden) s.events.push({ type: 'blastWarning', pos: { ...pos }, radius });
}

function attack(s: SimState, b: BossState): void {
  const alive = s.players.filter(p => p.downUntil === null);
  if (alive.length === 0) return;
  // its voice goes with its big moves only (a roar every few seconds would wear thin)
  const voice = () => s.events.push({ type: 'bossAttack', kind: b.kind });
  if (b.kind === 'megaBlock') {
    const boss = byId(s, b.enemyId!);
    // stomps under every player (and a tower now and then), a leap at one of them (from phase 2), or
    // shockwave lines toward one player (in phase 3 a cross of four)
    const roll = s.rng.next();
    if (boss && b.phase >= 2 && roll > 1 - BOSS.leapChance) {
      voice();
      megaLeap(s, s.rng.pick(alive), b);
    } else if (!boss || roll < BOSS.stompChance) {
      for (const p of alive) telegraph(s, p.pos, BOSS.stompRadius, BOSS.stompDamage);
      if (s.towers.length > 0 && s.rng.next() < 0.5) telegraph(s, s.rng.pick(s.towers).pos, BOSS.stompRadius, BOSS.stompDamage);
    } else {
      voice();
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
      voice();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        telegraph(s, { x: kraken.pos.x + Math.cos(a) * BOSS.slapRadius, z: kraken.pos.z + Math.sin(a) * BOSS.slapRadius }, 1.4, BOSS.strikeDamage, 45);
      }
    } else if (kraken && !b.grab && reach.length > 0 && roll < 0.8) {
      voice();
      grabPlayer(s, s.rng.pick(reach), b);
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
  } else if (b.kind === 'spider') {
    // (burst already: the brood fights by itself)
    const spider = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
    if (!spider) return;
    const roll = s.rng.next();
    const near = alive.reduce((a, c) => (dist(c.pos, spider.pos) < dist(a.pos, spider.pos) ? c : a));
    if (roll < 0.34 && !b.leap) {
      // the pounce: she jumps at one of the players and comes down on them
      voice();
      megaLeap(s, s.rng.pick(alive), b);
    } else if (roll < 0.7) {
      // webs: one under every player and one where they are heading, so there is no walking away from them
      voice();
      for (const p of alive.slice(0, 4)) {
        spinWeb(s, p.pos);
        spinWeb(s, { x: p.pos.x + p.facing.x * 4, z: p.pos.z + p.facing.z * 4 });
      }
    } else {
      // the fangs: a strike all round her, and a line of them at whoever is nearest
      const d = dist(spider.pos, near.pos) || 1;
      const dir = { x: (near.pos.x - spider.pos.x) / d, z: (near.pos.z - spider.pos.z) / d };
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        telegraph(s, { x: spider.pos.x + Math.cos(a) * 2.8, z: spider.pos.z + Math.sin(a) * 2.8 }, 1.4, BOSS.strikeDamage, 45);
      }
      for (let i = 1; i <= BOSS.spiderFangs; i++) telegraph(s, { x: spider.pos.x + dir.x * (2 + i * BOSS.waveStep), z: spider.pos.z + dir.z * (2 + i * BOSS.waveStep) }, 1.2, BOSS.strikeDamage, 45 + i * 4);
    }
  } else if (b.kind === 'dominik') {
    const dom = byId(s, b.enemyId!);
    if (!dom) return;
    const roll = s.rng.next();
    const p = alive.reduce((a, c) => (dist(c.pos, dom.pos) < dist(a.pos, dom.pos) ? c : a));
    const d = dist(dom.pos, p.pos) || 1;
    const dir = { x: (p.pos.x - dom.pos.x) / d, z: (p.pos.z - dom.pos.z) / d };
    if (roll < 0.34 && !b.laser) {
      // laser eyes: the beam starts beside the player and sweeps across them (wider and faster once hurt)
      voice();
      const L = BOSS.laser;
      const side = s.rng.next() < 0.5 ? 1 : -1;
      const sweep = L.sweep * (b.phase >= 3 ? 1.5 : 1);
      b.laser = { startAt: s.tick, fireAt: s.tick + L.aimTicks, endAt: s.tick + L.aimTicks + L.burnTicks, from: Math.atan2(dir.z, dir.x) - (side * sweep) / 2, sweep: side * sweep };
      s.events.push({ type: 'laserAim', pos: { ...dom.pos } });
    } else if (roll < 0.67) {
      // the hammer flies out in a line and comes back the same way, throwing whoever it hits away from him.
      // Nothing on the floor warns of it: the hammer in the air is the warning
      voice();
      const n = BOSS.hammerLine;
      const blow = { fling: { from: { ...dom.pos }, dist: BOSS.hammerFling }, hidden: true };
      const at = (i: number) => ({ x: dom.pos.x + dir.x * (1 + i * BOSS.waveStep), z: dom.pos.z + dir.z * (1 + i * BOSS.waveStep) });
      for (let i = 1; i <= n; i++) {
        telegraph(s, at(i), 1.3, BOSS.dominikDamage * dominikHits(s.difficulty), BOSS.warnTicks + i * 4, blow);
        telegraph(s, at(i), 1.3, BOSS.dominikDamage * dominikHits(s.difficulty), BOSS.warnTicks + (2 * n - i) * 4 + 16, blow);
      }
      s.events.push({ type: 'hammerThrow', from: { ...dom.pos }, to: at(n) });
    } else {
      // the hammer comes down: rings of shockwaves run outward, one after the other (and, once hurt, lightning
      // strikes around every player); they throw whoever they hit away from him
      voice();
      // (for the eye and the ear only: when the hammer's head meets the floor, with the first ring)
      s.events.push({ type: 'hammerSlam', pos: { ...dom.pos }, at: s.tick + BOSS.warnTicks });
      BOSS.hammerRings.forEach((r, k) => {
        const n = Math.round(r * 2.4);
        for (let i = 0; i < n; i++) {
          const a = ((i + (k % 2) * 0.5) / n) * Math.PI * 2;
          telegraph(s, { x: dom.pos.x + Math.cos(a) * r, z: dom.pos.z + Math.sin(a) * r }, 1.2, BOSS.dominikDamage * dominikHits(s.difficulty), BOSS.warnTicks + k * 22, { fling: { from: { ...dom.pos }, dist: BOSS.hammerFling } });
        }
      });
    }
    // whatever he does, lightning comes with it, so keeping one's distance is no shelter: a bolt where each
    // player stands and, the more he is hurt, more of them where they are running to and around them
    for (const q of alive) {
      telegraph(s, q.pos, 1.5, BOSS.dominikDamage * dominikHits(s.difficulty), BOSS.warnTicks + 14, { bolt: true });
      for (let i = 1; i < b.phase + 1; i++) {
        const a = s.rng.next() * Math.PI * 2, r = s.rng.next() * 2.2;
        telegraph(s, { x: q.pos.x + q.facing.x * 2.6 * i + Math.cos(a) * r, z: q.pos.z + q.facing.z * 2.6 * i + Math.sin(a) * r }, 1.4, BOSS.dominikDamage * dominikHits(s.difficulty), BOSS.warnTicks + 14 + i * 9, { bolt: true });
      }
    }
  } else if (b.kind === 'rex' || b.kind === 'rhino') {
    const rex = byId(s, b.enemyId!);
    const roll = s.rng.next();
    const king = b.kind === 'rex';
    // a roar that cracks the ground in a ring around it, a bite (King Rex only), or a stomp under every player
    if (rex && roll < 0.35) {
      voice();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        telegraph(s, { x: rex.pos.x + Math.cos(a) * BOSS.roarRadius, z: rex.pos.z + Math.sin(a) * BOSS.roarRadius }, 1.5, BOSS.stompDamage);
      }
      // King Rex, once hurt: a second, wider ring a moment later, so backing off is not enough
      if (king && b.phase >= 2)
        for (let i = 0; i < BOSS.rexOuterRing; i++) {
          const a = ((i + 0.5) / BOSS.rexOuterRing) * Math.PI * 2;
          telegraph(s, { x: rex.pos.x + Math.cos(a) * BOSS.rexOuterRadius, z: rex.pos.z + Math.sin(a) * BOSS.rexOuterRadius }, 1.6, BOSS.stompDamage, BOSS.warnTicks + 25);
        }
    } else if (rex && king && roll < 0.7) {
      // the bite: it snaps at the nearest player, a line of strikes from its jaws that comes fast
      const p = alive.reduce((a, c) => (dist(c.pos, rex.pos) < dist(a.pos, rex.pos) ? c : a));
      const d = dist(rex.pos, p.pos) || 1;
      const dir = { x: (p.pos.x - rex.pos.x) / d, z: (p.pos.z - rex.pos.z) / d };
      for (let i = 1; i <= BOSS.rexBite; i++) telegraph(s, { x: rex.pos.x + dir.x * (1 + i * BOSS.waveStep), z: rex.pos.z + dir.z * (1 + i * BOSS.waveStep) }, 1.4, BOSS.rexBiteDamage, BOSS.rexBiteWarnTicks + i * 3);
    } else {
      // a stomp under every player; King Rex also stomps where they are running to
      for (const p of alive) {
        telegraph(s, p.pos, BOSS.stompRadius, BOSS.stompDamage);
        if (king) telegraph(s, { x: p.pos.x + p.facing.x * 3.5, z: p.pos.z + p.facing.z * 3.5 }, BOSS.stompRadius * 0.8, BOSS.stompDamage, BOSS.warnTicks + 12);
      }
    }
  } else {
    const roll = s.rng.next();
    const worms = b.worms.map(w => w.map(id => byId(s, id)).filter((e): e is Enemy => !!e)).filter(w => w.length > 0);
    if (roll < 0.4 || worms.length === 0) {
      // a strike at a player or a tower (from the second phase on: under every player)
      const tower = s.towers.length > 0 && s.rng.next() < 0.35;
      if (tower) telegraph(s, s.rng.pick(s.towers).pos, BOSS.strikeRadius, BOSS.strikeDamage);
      else if (b.phase >= 2) for (const p of alive) telegraph(s, p.pos, BOSS.strikeRadius, BOSS.strikeDamage);
      else telegraph(s, s.rng.pick(alive).pos, BOSS.strikeRadius, BOSS.strikeDamage);
    } else if (roll < 0.75 || b.phase < 2) {
      voice();
      // a lunge: every head snaps at the nearest player, a line of strikes ahead of it
      for (const w of worms) {
        const head = w[0];
        const p = alive.reduce((a, c) => (dist(c.pos, head.pos) < dist(a.pos, head.pos) ? c : a));
        const d = dist(head.pos, p.pos) || 1;
        const dir = { x: (p.pos.x - head.pos.x) / d, z: (p.pos.z - head.pos.z) / d };
        for (let i = 1; i <= BOSS.wormLunge; i++) telegraph(s, { x: head.pos.x + dir.x * i * BOSS.waveStep, z: head.pos.z + dir.z * i * BOSS.waveStep }, 1.1, BOSS.strikeDamage, BOSS.warnTicks + i * 4);
      }
    } else {
      voice();
      // a tail whip: a ring around the tail of every worm, so staying behind it is not safe either
      for (const w of worms) {
        const tail = w[w.length - 1];
        for (let i = 0; i < BOSS.wormWhip; i++) {
          const a = (i / BOSS.wormWhip) * Math.PI * 2;
          telegraph(s, { x: tail.pos.x + Math.cos(a) * BOSS.wormWhipRadius, z: tail.pos.z + Math.sin(a) * BOSS.wormWhipRadius }, 1.2, BOSS.strikeDamage, 45);
        }
      }
    }
  }
}

/** how much faster a worm of this many segments crawls than a whole one */
export const wormPace = (segments: number) => 1 + BOSS.wormShortBoost * Math.max(0, 1 - (segments - BOSS.wormMinSplit) / (BOSS.wormSegments - BOSS.wormMinSplit));

/**
 * how wide the worm's head is to the walls: a little less than it is. A head as wide as a gap of one tile fits it
 * only when it is in the very middle, and so it stood in front of doorways without ever getting in
 */
const WORM_GAP = 0.4;

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
    const slow = (head.slowUntil > s.tick ? 0.5 : 1) * wormPace(segs.length);
    moveCircle(s.map, head.pos, (dir.x * BOSS.wormSpeed * slow + head.knock.x) * DT, (dir.z * BOSS.wormSpeed * slow + head.knock.z) * DT, WORM_GAP, BLOCKS_ENEMY);
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
export function megaLeap(s: SimState, p: Player, b: BossState | null = s.boss): void {
  const boss = b && (b.kind === 'megaBlock' || b.kind === 'spider') && b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!b || !boss) return;
  // (the Tarantula Queen lands where she fits: clear of the wall round the map, legs and all)
  const to = b.kind === 'spider' ? insideBorder(s.map, p.pos, QUEEN_REACH) : { ...p.pos };
  b.leap = { from: { ...boss.pos }, to, start: s.tick, land: s.tick + BOSS.leapTicks };
  telegraph(s, to, BOSS.leapRadius, BOSS.stompDamage, BOSS.leapTicks);
}

/**
 * How hard Angry Dominik hits on each level, on top of what the level does to every monster's damage: he is
 * tuned to be a hard fight on the easiest level already, so the harder ones add far less than they do elsewhere
 * (there the players also have fewer lives and do not heal).
 */
const DOMINIK_HITS: Record<Difficulty, number> = { ultraLow: 1, low: 0.8, medium: 0.5, high: 0.45, ultraHigh: 0.42 };
export const dominikHits = (d: Difficulty) => DOMINIK_HITS[d];

/** where Angry Dominik's beam points at `tick` (the angle of its direction on the floor) */
export function laserAngle(b: BossState, tick: number): number {
  const l = b.laser!;
  return l.from + l.sweep * Math.max(0, Math.min(1, (tick - l.fireAt) / Math.max(1, l.endAt - l.fireAt)));
}

/**
 * How far the beam reaches right now: it ends on the floor of the map. It may pass over walls on the way, but
 * its end is the furthest spot within its length that is floor, never a wall and never outside the map.
 */
export function laserReach(s: SimState, b: BossState): number {
  const dom = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!dom || !b.laser) return 0;
  const a = laserAngle(b, s.tick), dx = Math.cos(a), dz = Math.sin(a);
  for (let t = BOSS.laser.length; t > 0; t -= 0.25) {
    const x = dom.pos.x + dx * t, z = dom.pos.z + dz * t;
    if (x >= 0 && z >= 0 && x < s.map.w && z < s.map.h && tileAt(s.map, Math.floor(x), Math.floor(z)) !== Tile.Wall) return t;
  }
  return 0;
}

/** Is `pos` in the beam right now? (Only as far as the beam reaches, and not through a wall.) */
export function laserHits(s: SimState, b: BossState, pos: Vec2): boolean {
  const dom = b.enemyId !== null ? byId(s, b.enemyId) : undefined;
  if (!dom || !b.laser) return false;
  const a = laserAngle(b, s.tick);
  const dx = pos.x - dom.pos.x, dz = pos.z - dom.pos.z;
  const along = dx * Math.cos(a) + dz * Math.sin(a), across = Math.abs(-dx * Math.sin(a) + dz * Math.cos(a));
  return along > 0 && along <= laserReach(s, b) && across <= BOSS.laser.width / 2 + PLAYER_RADIUS && hasLos(s.map, dom.pos, pos);
}

/** Angry Dominik's laser eyes: aim, burn, done. Jump over the beam or keep ahead of it. */
function laser(s: SimState, b: BossState): void {
  const l = b.laser;
  if (!l) return;
  if (s.tick >= l.endAt || b.enemyId === null || !byId(s, b.enemyId)) {
    b.laser = null;
    return;
  }
  // he stands and looks along the beam for as long as his eyes aim and burn
  const dom = byId(s, b.enemyId)!;
  const a = laserAngle(b, s.tick);
  dom.dir = { x: Math.cos(a), z: Math.sin(a) };
  dom.stuckUntil = Math.max(dom.stuckUntil, s.tick + 2);
  if (s.tick < l.fireAt) return;
  if (s.tick === l.fireAt) s.events.push({ type: 'laserFire', pos: { ...dom.pos } });
  for (const p of s.players) if (p.downUntil === null && !aloft(s, p) && !p.perched && laserHits(s, b, p.pos)) damagePlayer(s, p, BOSS.laser.dps * dominikHits(s.difficulty) * DT, 'shot');
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
  // (she may come down on a wall inside the map: she stands on those)
  boss.pos = b.kind === 'spider' ? { ...l.to } : nearestFree(s.map, l.to, boss.radius, BLOCKS_ENEMY);
  b.leap = null;
  s.events.push({ type: 'stomp', pos: { ...boss.pos }, radius: BOSS.leapRadius });
}

/** The Kraken wraps a tentacle round `p` and starts dragging them in. */
export function grabPlayer(s: SimState, p: Player, b: BossState | null = s.boss): void {
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
  const all = allBosses(s);
  for (const b of all) if (b.kind === 'worm') moveWorms(s, b);
  if (all.length > 1) keepApart(s, all);
}

/**
 * Bosses do not walk into each other: where two bodies overlap, each gives way by half of it. (A worm is many
 * small pieces and winds between the others; a boss in mid-leap is in the air.) Giving way puts nobody into a
 * wall: the climbers stay clear of the wall round the map, the others of every wall.
 */
function keepApart(s: SimState, all: BossState[]): void {
  const solid = all.filter(b => b.enemyId !== null && !b.leap && b.kind !== 'worm').map(b => ({ b, e: byId(s, b.enemyId!) })).filter((x): x is { b: BossState; e: Enemy } => !!x.e && x.e.hp > 0);
  const give = ({ b, e }: { b: BossState; e: Enemy }, dx: number, dz: number) => {
    const reach = b.kind === 'spider' ? QUEEN_REACH : b.kind === 'kraken' ? KRAKEN_REACH : 0;
    if (!reach) return void moveCircle(s.map, e.pos, dx, dz, Math.min(e.radius, 0.45), BLOCKS_ENEMY);
    if (clearOfBorder(s.map, e.pos.x + dx, e.pos.z, reach)) e.pos.x += dx;
    if (clearOfBorder(s.map, e.pos.x, e.pos.z + dz, reach)) e.pos.z += dz;
  };
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i].e, c = solid[j].e;
      let dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), over = a.radius + c.radius - d;
      if (over <= 0) continue;
      // (right on top of each other: apart along a line that depends on who they are, not on chance)
      if (d < 1e-6) [dx, dz] = [Math.cos(a.id), Math.sin(a.id)];
      const n = Math.hypot(dx, dz);
      give(solid[i], (-dx / n) * over * 0.5, (-dz / n) * over * 0.5);
      give(solid[j], (dx / n) * over * 0.5, (dz / n) * over * 0.5);
    }
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
  laser(s, b);
  const living = bodies(s, b);
  if (living.length > 0) b.lastPos = { ...living[0].pos };
  if (b.kind === 'worm') resolveWorms(s, b);
  if (living.length === 0 && b.kind === 'spider' && !b.brood) {
    // the Tarantula Queen bursts: her brood swarms out of her, and has to be beaten to the last one
    b.enemyId = null;
    b.leap = null;
    b.brood = [];
    for (let i = 0; i < BOSS.spiderBrood; i++) {
      const a = (i / BOSS.spiderBrood) * Math.PI * 2, r = 0.8 + (i % 3) * 0.7;
      b.brood.push(spawnEnemy(s, 'spiderling', nearestFree(s.map, { x: b.lastPos.x + Math.cos(a) * r, z: b.lastPos.z + Math.sin(a) * r }, 0.3, BLOCKS_ENEMY)).id);
    }
    // (the bar is the brood from here on)
    b.maxHp = hpOf(s, b);
    s.events.push({ type: 'bossBurst', pos: { ...b.lastPos }, kind: b.kind });
    return;
  }
  if (living.length === 0) {
    if (b.grab) s.events.push({ type: 'krakenRelease', playerId: b.grab.playerId });
    s.events.push({ type: 'bossDead', pos: { ...b.lastPos }, kind: b.kind });
    dropCoins(s, b.lastPos, BOSS.deathCoins);
    if (b.kind === 'rex') layEggs(s, b.lastPos);
    // Angry Dominik leaves a crate, and most of the time his hammer is in it
    if (b.kind === 'dominik') s.crates.push({ id: s.nextId++, pos: { ...clearSpot(s, b.lastPos) }, ...(s.rng.next() < BOSS.hammerChance ? { prize: 'thunderHammer' as const } : {}) });
    if (s.bosses) {
      // a brawl: the others fight on; the wave is cleared when the last of them falls
      s.bosses = s.bosses.filter(x => x !== b);
      if (s.bosses.length === 0 && s.brawl) {
        s.brawl.nextAt = s.tick + BRAWL.breakTicks;
        if (s.brawl.queue.length > 0) s.powerups.push({ id: s.nextId++, kind: 'heart', pos: { ...clearSpot(s, b.lastPos) }, expiresAt: s.tick + 20 * TICK_RATE });
      }
      return;
    }
    s.boss = null;
    if (b.wild) {
      // a wild boss (Tower Run, versus chaos): nothing ends with it, and it leaves a crate behind (not in the
      // Gun Game, where weapons come from kills)
      if (s.versus?.rule !== 'gungame') s.crates.push({ id: s.nextId++, pos: { ...clearSpot(s, b.lastPos) } });
      return;
    }
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
    if (b.kind === 'rex') for (const e of living) e.speed *= BOSS.rexPhaseSpeed;
    // the Tarantula Queen calls some of her brood to her side (they are not part of the last swarm)
    if (b.kind === 'spider' && b.enemyId !== null && !b.wild)
      for (let i = 0; i < BOSS.spiderCall; i++) {
        const a = (i / BOSS.spiderCall) * Math.PI * 2;
        spawnEnemy(s, 'spiderling', nearestFree(s.map, { x: b.lastPos.x + Math.cos(a) * 2.2, z: b.lastPos.z + Math.sin(a) * 2.2 }, 0.3, BLOCKS_ENEMY));
      }
    const entries = s.map.waypoints.filter(w => dist(w, b.lastPos) > 10);
    if (entries.length > 0 && !b.wild) spawnHorde(s, s.rng.pick(entries), (b.kind === 'kraken' ? SEA_REINFORCEMENTS : REINFORCEMENTS)[b.phase], { rush: true });
  }
  if (b.nextSchoolAt !== undefined && s.tick >= b.nextSchoolAt) {
    // the Kraken calls the sea: a new school sweeps in from somewhere away from the players
    b.nextSchoolAt = s.tick + BOSS.schoolSeconds[b.phase] * TICK_RATE;
    const sea = s.enemies.filter(e => (e.kind === 'fish' || e.kind === 'shark') && e.hp > 0).length;
    const entries = s.map.waypoints.filter(w => s.players.every(p => dist(w, p.pos) > 10));
    if (sea < BOSS.seaCap && s.enemies.length + 8 <= ENEMY_CAP && entries.length > 0) spawnHorde(s, s.rng.pick(entries), SCHOOL, { rush: true });
  }
  if (b.waiting !== undefined) {
    // a wild boss waits by the elevator until someone comes near or hurts it
    const body = living[0];
    const near = s.players.some(p => p.downUntil === null && dist(p.pos, body.pos) <= WILD_WAKE);
    if (!near && body.hp >= body.maxHp) {
      b.nextAttackAt = s.tick + TICK_RATE;
      // (no charge and no stomp of its own either)
      body.cooldownUntil = Math.max(body.cooldownUntil, s.tick + TICK_RATE);
      return;
    }
    body.speed = b.waiting;
    b.waiting = undefined;
  }
  if (s.tick >= b.nextAttackAt) {
    attack(s, b);
    b.nextAttackAt = s.tick + Math.round(BOSS.attackSeconds[b.phase] * TICK_RATE * (b.kind === 'rex' ? BOSS.rexHaste : b.kind === 'dominik' ? BOSS.dominikHaste : 1));
  }
}
