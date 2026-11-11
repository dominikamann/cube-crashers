import { WAVES } from '../config/waves';
import { TICK_RATE, type BossState, type EnemyKind, type SimState, type Vec2 } from '../types';
import { dist } from '../util';
import { dropCoins } from './combat';
import { moveWorms, resolveWorms, spawnWorm, WORM_ATTACK_RADIUS, WORM_DEATH_COINS } from './boss-worm';
import { spawnEnemy } from './enemies';
import { MINIBOSS_ATTACK_SECONDS, MINIBOSS_SLAM_RADIUS, spawnMiniboss } from './miniboss';
import { damagePlayer } from './player';

export const TELEGRAPH_PLAYER_DAMAGE = 30;
export const TELEGRAPH_TOWER_DAMAGE = 20;
const WORM_ATTACK_SECONDS = { 1: 3, 2: 2.5, 3: 2 } as const;

const REINFORCEMENTS: Record<2 | 3, { kind: EnemyKind; count: number }[]> = {
  2: [{ kind: 'blob', count: 8 }],
  3: [
    { kind: 'dasher', count: 6 },
    { kind: 'tank', count: 2 },
  ],
};

export function startBoss(s: SimState, kind: 'miniboss' | 'worm'): void {
  let boss: BossState;
  if (kind === 'worm') {
    const { worms, maxHp } = spawnWorm(s);
    boss = { kind, maxHp, phase: 1, enemyId: null, worms, telegraphs: [], nextAttackAt: 0, lastPos: { x: 0, z: s.map.spawnZ } };
  } else {
    const { enemyId, maxHp } = spawnMiniboss(s);
    boss = { kind, maxHp, phase: 1, enemyId, worms: [], telegraphs: [], nextAttackAt: 0, lastPos: { x: 0, z: s.map.spawnZ } };
  }
  boss.nextAttackAt = s.tick + attackInterval(boss);
  s.boss = boss;
  s.look = 'night';
  s.events.push({ type: 'bossSpawn', kind });
}

function attackInterval(b: BossState): number {
  const seconds = b.kind === 'worm' ? WORM_ATTACK_SECONDS[b.phase] : MINIBOSS_ATTACK_SECONDS;
  return Math.round(seconds * TICK_RATE);
}

function bossEnemies(s: SimState) {
  const b = s.boss!;
  const ids = b.kind === 'worm' ? b.worms.flatMap(w => w.segmentIds) : [b.enemyId!];
  return ids.map(id => s.enemies.find(e => e.id === id)).filter(e => e !== undefined && e.hp > 0);
}

export function bossHp(s: SimState): number {
  return bossEnemies(s).reduce((sum, e) => sum + e!.hp, 0);
}

export function computeStars(s: SimState): 1 | 2 | 3 {
  const f = s.base.hp / s.base.maxHp;
  return f >= 0.8 ? 3 : f >= 0.4 ? 2 : 1;
}

export function addTelegraph(s: SimState, pos: Vec2, radius: number, delayTicks: number, damage: number): void {
  s.boss!.telegraphs.push({ id: s.nextId++, pos: { ...pos }, radius, createdAt: s.tick, impactAt: s.tick + delayTicks, damage });
  s.events.push({ type: 'bossTelegraph', pos: { ...pos }, radius, delay: delayTicks / TICK_RATE });
}

/** Moves boss bodies; runs right after updateEnemies. */
export function moveBoss(s: SimState): void {
  if (s.boss?.kind === 'worm') moveWorms(s, s.boss.worms);
}

function attack(s: SimState, b: BossState): void {
  const players = s.players.filter(p => p.downUntil === null);
  const useTower = s.towers.length > 0 && (players.length === 0 || s.rng.next() < 0.5);
  let target: Vec2 | null = null;
  if (useTower) target = s.rng.pick(s.towers).pos;
  else if (players.length > 0) target = s.rng.pick(players).pos;
  if (!target) return;
  const delay = Math.round((b.phase === 3 ? 0.9 : 1.2) * TICK_RATE);
  const radius = b.kind === 'worm' ? WORM_ATTACK_RADIUS : MINIBOSS_SLAM_RADIUS;
  addTelegraph(s, target, radius, delay, TELEGRAPH_PLAYER_DAMAGE);
}

function resolveTelegraphs(s: SimState, b: BossState): void {
  b.telegraphs = b.telegraphs.filter(t => {
    if (s.tick < t.impactAt) return true;
    s.events.push({ type: 'bossImpact', pos: { ...t.pos }, radius: t.radius });
    for (const p of s.players) if (dist(p.pos, t.pos) <= t.radius) damagePlayer(s, p, t.damage);
    for (const tw of s.towers) if (dist(tw.pos, t.pos) <= t.radius) tw.hp -= TELEGRAPH_TOWER_DAMAGE;
    return false;
  });
}

function endBoss(s: SimState, b: BossState): void {
  s.events.push({ type: 'bossDead', pos: { ...b.lastPos } });
  if (b.kind === 'worm') dropCoins(s, b.lastPos, WORM_DEATH_COINS);
  s.boss = null;
  s.look = 'day';
  if (s.wave.index === WAVES.length - 1 && s.base.hp > 0 && s.phase === 'playing') {
    s.phase = 'won';
    s.events.push({ type: 'gameWon', stars: computeStars(s) });
  }
}

/** Resolves deaths, splits, phases and attacks; runs after all damage and before removeDead. */
export function updateBoss(s: SimState): void {
  const b = s.boss;
  if (!b) return;

  const living = bossEnemies(s);
  if (living.length > 0) b.lastPos = { ...living[0]!.pos };
  else {
    const anyBody = (b.kind === 'worm' ? b.worms.flatMap(w => w.segmentIds) : [b.enemyId!])
      .map(id => s.enemies.find(e => e.id === id))
      .find(e => e);
    if (anyBody) b.lastPos = { ...anyBody.pos };
  }

  if (b.kind === 'worm') b.worms = resolveWorms(s, b.worms);
  if (living.length === 0) {
    endBoss(s, b);
    return;
  }

  const frac = bossHp(s) / b.maxHp;
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  while (b.phase < phase) {
    b.phase = (b.phase + 1) as 2 | 3;
    s.events.push({ type: 'bossPhase', phase: b.phase });
    for (const g of REINFORCEMENTS[b.phase]) {
      for (let i = 0; i < g.count; i++) {
        spawnEnemy(s, g.kind, { x: s.rng.range(-s.map.laneHalfWidth + 0.5, s.map.laneHalfWidth - 0.5), z: s.map.spawnZ });
      }
    }
  }

  resolveTelegraphs(s, b);
  if (s.tick >= b.nextAttackAt) {
    attack(s, b);
    b.nextAttackAt = s.tick + attackInterval(b);
  }
}

