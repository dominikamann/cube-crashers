import { BLOCKS_WALKER, nearestFree } from '../map/tilemap';
import { TICK_RATE } from '../types';
import type { SimState, Vec2 } from '../types';
import { spawnEnemy } from './enemies';

/**
 * The rarest answer of the wall logo: a small Angry Dominik steps out of it and goes after whoever is nearest,
 * hammer in hand. He is far too tough to beat in the time he has; after half a minute he goes back into the
 * wall. (Whoever beats him anyway gets his hammer.)
 */
export const MINI = {
  ticks: 30 * TICK_RATE,
  hp: 6000,
  radius: 0.5,
  speed: 4.4,
  /** his hammer comes down where the nearest player stands, this often */
  slamEveryTicks: 150,
  slamRadius: 1.7,
  slamDamage: 24,
  slamWarnTicks: 42,
};

export function releaseMiniDominik(s: SimState, at: Vec2): void {
  if (s.mini) return;
  const pos = nearestFree(s.map, at, MINI.radius, BLOCKS_WALKER);
  // (a tank in the rules, like the big one)
  const e = spawnEnemy(s, 'tank', pos);
  e.hp = e.maxHp = MINI.hp;
  e.radius = MINI.radius;
  e.speed = MINI.speed;
  s.mini = { enemyId: e.id, until: s.tick + MINI.ticks, home: { ...pos }, nextSlamAt: s.tick + MINI.slamEveryTicks / 2 };
  s.events.push({ type: 'dominikJoined', pos: { ...pos } });
}

export function updateMiniDominik(s: SimState): void {
  const m = s.mini;
  if (!m) return;
  const body = s.enemies.find(e => e.id === m.enemyId && e.hp > 0);
  if (!body) {
    // beaten after all: his hammer is the prize
    s.crates.push({ id: s.nextId++, pos: { ...m.home }, prize: 'thunderHammer' });
    s.mini = null;
    return;
  }
  if (s.tick >= m.until) {
    s.enemies = s.enemies.filter(e => e !== body);
    s.events.push({ type: 'dominikLeft', pos: { ...body.pos } });
    s.mini = null;
    return;
  }
  if (s.tick >= m.nextSlamAt) {
    m.nextSlamAt = s.tick + MINI.slamEveryTicks;
    const alive = s.players.filter(p => p.downUntil === null);
    if (alive.length === 0) return;
    const p = alive.reduce((a, c) => (Math.hypot(c.pos.x - body.pos.x, c.pos.z - body.pos.z) < Math.hypot(a.pos.x - body.pos.x, a.pos.z - body.pos.z) ? c : a));
    s.blasts.push({ id: s.nextId++, pos: { ...p.pos }, radius: MINI.slamRadius, createdAt: s.tick, at: s.tick + MINI.slamWarnTicks, damage: MINI.slamDamage });
    s.events.push({ type: 'blastWarning', pos: { ...p.pos }, radius: MINI.slamRadius });
  }
}
