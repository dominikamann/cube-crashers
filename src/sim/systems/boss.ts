import { BLOCKS_ENEMY, moveCircle } from '../map/tilemap';
import { flowDir } from '../map/flowfield';
import { DT, TICK_RATE, type BossState, type Enemy, type SimState, type Vec2 } from '../types';
import { dist } from '../util';
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
};

const REINFORCEMENTS: Record<2 | 3, HordeComp> = {
  2: [{ kind: 'blob', count: 8 }, { kind: 'shooter', count: 2 }],
  3: [{ kind: 'hunter', count: 6 }, { kind: 'bomber', count: 3 }],
};

const byId = (s: SimState, id: number) => s.enemies.find(e => e.id === id);

function bodies(s: SimState, b: BossState): Enemy[] {
  const ids = b.kind === 'worm' ? b.worms.flat() : b.enemyId !== null ? [b.enemyId] : [];
  return ids.map(id => byId(s, id)).filter((e): e is Enemy => e !== undefined && e.hp > 0);
}

export function bossHp(s: SimState): number {
  return s.boss ? bodies(s, s.boss).reduce((sum, e) => sum + e.hp, 0) : 0;
}

/** Called when a boss floor is set up: the boss appears in the middle of the arena. */
export function spawnBoss(s: SimState, kind: 'megaBlock' | 'worm'): void {
  const centre = { x: s.map.w / 2, z: s.map.h * 0.35 };
  let b: BossState;
  if (kind === 'megaBlock') {
    const e = spawnEnemy(s, 'megaBlock', centre);
    b = { kind, maxHp: e.maxHp, phase: 1, enemyId: e.id, worms: [], nextAttackAt: 0, lastPos: { ...centre } };
  } else {
    const ids: number[] = [];
    for (let i = 0; i < BOSS.wormSegments; i++) ids.push(spawnEnemy(s, 'wormSegment', { x: centre.x, z: centre.z - i * BOSS.wormSpacing }).id);
    b = { kind, maxHp: BOSS.wormSegments * 60 * hpScale(s), phase: 1, enemyId: null, worms: [ids], nextAttackAt: 0, lastPos: { ...centre } };
  }
  b.nextAttackAt = s.tick + 3 * TICK_RATE;
  s.boss = b;
  s.events.push({ type: 'bossSpawn', kind });
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
    // stomps under every player (and a tower now and then), or a shockwave line toward one player
    if (!boss || s.rng.next() < 0.6) {
      for (const p of alive) telegraph(s, p.pos, BOSS.stompRadius, BOSS.stompDamage);
      if (s.towers.length > 0 && s.rng.next() < 0.5) telegraph(s, s.rng.pick(s.towers).pos, BOSS.stompRadius, BOSS.stompDamage);
    } else {
      const p = s.rng.pick(alive);
      const d = dist(boss.pos, p.pos) || 1;
      const dir = { x: (p.pos.x - boss.pos.x) / d, z: (p.pos.z - boss.pos.z) / d };
      for (let i = 1; i <= BOSS.waveLength; i++) {
        const at = { x: boss.pos.x + dir.x * i * BOSS.waveStep, z: boss.pos.z + dir.z * i * BOSS.waveStep };
        telegraph(s, at, 1.3, BOSS.stompDamage, BOSS.warnTicks + i * 5);
      }
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

/** Moves boss bodies; runs right after the other enemies. */
export function moveBoss(s: SimState): void {
  if (s.boss?.kind === 'worm') moveWorms(s, s.boss);
}

/** Deaths, splits, phases and attacks; runs after all damage of the tick. */
export function updateBoss(s: SimState): void {
  const b = s.boss;
  if (!b || s.phase !== 'playing') return;
  const living = bodies(s, b);
  if (living.length > 0) b.lastPos = { ...living[0].pos };
  if (b.kind === 'worm') resolveWorms(s, b);
  if (living.length === 0) {
    s.events.push({ type: 'bossDead', pos: { ...b.lastPos } });
    dropCoins(s, b.lastPos, BOSS.deathCoins);
    s.boss = null;
    s.elevatorOpen = true;
    s.events.push({ type: 'elevatorOpen' });
    return;
  }
  const frac = bossHp(s) / b.maxHp;
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  while (b.phase < phase) {
    b.phase = (b.phase + 1) as 2 | 3;
    s.events.push({ type: 'bossPhase', phase: b.phase });
    const entries = s.map.waypoints.filter(w => dist(w, b.lastPos) > 10);
    if (entries.length > 0) spawnHorde(s, s.rng.pick(entries), REINFORCEMENTS[b.phase], { rush: true });
  }
  if (s.tick >= b.nextAttackAt) {
    attack(s, b);
    b.nextAttackAt = s.tick + Math.round(BOSS.attackSeconds[b.phase] * TICK_RATE);
  }
}
