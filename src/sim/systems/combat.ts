import { BOMBER, CLOSE_BONUS, CLOSE_RANGE, PLAYER_RADIUS, COIN_LIFETIME_TICKS, COMBO_MAX_MULT, COMBO_STEP, COMBO_TICKS } from '../config/balance';
import { ELITE, ENEMIES } from '../config/enemies';
import { MINE } from '../config/weapons';
import { BLOCKS_ENEMY, nearestFree, Tile, tileAt } from '../map/tilemap';
import { DT, type DamageSource, type Enemy, type Player, type SimState, type Vec2 } from '../types';
import { dist, targets } from '../util';
import { spawnEnemy } from './enemies';
import { damagePlayer } from './player';
import { killCategory } from './stats';

const HIT_PADDING = 0.15;

export function comboMult(p: Player): number {
  return Math.min(COMBO_MAX_MULT, 1 + Math.floor(p.combo / COMBO_STEP));
}

export function dropCoins(s: SimState, pos: Vec2, count: number, value = 1): void {
  for (let i = 0; i < count; i++) {
    s.coins.push({
      id: s.nextId++,
      pos: { x: pos.x + s.rng.range(-0.4, 0.4), z: pos.z + s.rng.range(-0.4, 0.4) },
      value,
      expiresAt: s.tick + COIN_LIFETIME_TICKS,
    });
  }
}

/**
 * All damage to enemies goes through here. A kill by a player feeds that player's combo;
 * dead enemies are swept by removeDead at the end of the tick.
 */
export function damageEnemy(s: SimState, e: Enemy, amount: number, source: DamageSource, byPlayerId?: number): void {
  if (e.hp <= 0) return;
  e.hp -= amount;
  s.events.push({ type: 'enemyHit', pos: { ...e.pos } });
  const horde = e.hordeId !== null ? s.hordes.find(h => h.id === e.hordeId) : undefined;
  if (horde) horde.aggro = true;
  if (e.hp > 0) return;

  s.events.push({ type: 'enemyKilled', kind: e.kind, pos: { ...e.pos }, elite: e.elite });
  s.stats.kills[killCategory(source)]++;
  const def = ENEMIES[e.kind];
  const p = byPlayerId !== undefined ? s.players.find(x => x.id === byPlayerId) : undefined;
  let mult = 1;
  let greed = 0;
  if (p) {
    const before = comboMult(p);
    p.combo++;
    p.comboUntil = s.tick + COMBO_TICKS;
    mult = comboMult(p);
    greed = p.perks.greed;
    if (mult > before) s.events.push({ type: 'comboUp', playerId: p.id, mult });
    s.stats.maxCombo = Math.max(s.stats.maxCombo, p.combo);
  }
  s.score += def.score * (e.elite ? ELITE.score : 1) * mult;
  dropCoins(s, e.pos, def.coins * (e.elite ? 3 : 1), Math.round(mult * (1 + 0.25 * greed)));
  if (e.kind === 'splitter') {
    const r = ENEMIES.splitling.radius;
    for (const side of [-1, 1]) {
      const at = nearestFree(s.map, { x: e.pos.x + side * 0.3, z: e.pos.z }, r, BLOCKS_ENEMY);
      spawnEnemy(s, 'splitling', at, { hordeId: e.hordeId ?? undefined });
    }
  }
  if (e.elite) s.crates.push({ id: s.nextId++, pos: { ...e.pos } });
  // a bomber that is shot goes off at once, but only hurts its own kind
  if (e.kind === 'bomber') explode(s, e.pos, BOMBER.deathRadius, { enemy: BOMBER.enemy }, 'explosion', byPlayerId);
}

/** A direct hit by a player's weapon: 50 % more when the enemy is within 3 tiles of the shooter. */
export function hitEnemy(s: SimState, e: Enemy, base: number, source: DamageSource, ownerId: number): void {
  const owner = s.players.find(p => p.id === ownerId);
  if (!owner) {
    damageEnemy(s, e, base, source);
    return;
  }
  const close = dist(owner.pos, e.pos) <= CLOSE_RANGE + e.radius;
  damageEnemy(s, e, base * (close ? CLOSE_BONUS : 1), source, ownerId);
}

export function damageInRadius(s: SimState, pos: Vec2, radius: number, amount: number, source: DamageSource, byPlayerId?: number): void {
  for (const e of targets(s)) {
    if (dist(pos, e.pos) <= radius + e.radius) damageEnemy(s, e, amount, source, byPlayerId);
  }
}

/** An explosion with separate damage for enemies, players and towers (omit a key to spare that group). */
export function explode(
  s: SimState,
  pos: Vec2,
  radius: number,
  damage: { enemy?: number; player?: number; tower?: number },
  source: DamageSource,
  byPlayerId?: number,
): void {
  s.events.push({ type: 'explosion', pos: { ...pos }, radius });
  if (damage.enemy) damageInRadius(s, pos, radius, damage.enemy, source, byPlayerId);
  if (damage.player) {
    for (const p of s.players) if (p.air === 0 && dist(p.pos, pos) <= radius) damagePlayer(s, p, damage.player);
  }
  if (damage.tower) {
    for (const t of s.towers) if (dist(t.pos, pos) <= radius) t.hp -= damage.tower;
  }
}

export function removeDead(s: SimState): void {
  s.enemies = s.enemies.filter(e => e.hp > 0);
}

const owner = (id: number) => (id >= 0 ? id : undefined);

export function updateProjectiles(s: SimState): void {
  const keep = [];
  for (const p of s.projectiles) {
    if (p.behavior === 'lob') {
      const t = Math.min(1, (s.tick - p.launchedAt!) / (p.until - p.launchedAt!));
      p.pos.x = p.from!.x + (p.target!.x - p.from!.x) * t;
      p.pos.z = p.from!.z + (p.target!.z - p.from!.z) * t;
      if (s.tick >= p.until) {
        const land = p.land!;
        if (land.duration) {
          s.areas.push({
            id: s.nextId++,
            kind: p.kind,
            ownerId: p.ownerId,
            pos: { ...p.target! },
            radius: land.radius,
            damage: land.damage,
            interval: land.interval!,
            nextAt: s.tick,
            until: s.tick + land.duration,
          });
        } else {
          explode(s, p.target!, land.radius, { enemy: land.damage }, p.kind, owner(p.ownerId));
        }
        continue;
      }
      keep.push(p);
      continue;
    }

    p.pos.x += p.vel.x * DT;
    p.pos.z += p.vel.z * DT;

    if (p.behavior === 'boomerang') {
      const speed = Math.hypot(p.vel.x, p.vel.z);
      if (!p.returning) {
        p.travelled! += speed * DT;
        if (p.travelled! >= p.range! || tileAt(s.map, p.pos.x, p.pos.z) === Tile.Wall) {
          p.returning = true;
          p.hitIds = [];
        }
      } else {
        const thrower = s.players.find(pl => pl.id === p.ownerId);
        if (!thrower || dist(thrower.pos, p.pos) < 0.5) continue;
        const dx = thrower.pos.x - p.pos.x, dz = thrower.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        p.vel = { x: (dx / d) * speed, z: (dz / d) * speed };
      }
      if (s.tick >= p.until) continue;
    } else if (s.tick >= p.until || tileAt(s.map, p.pos.x, p.pos.z) === Tile.Wall) {
      continue;
    }

    if (p.hostile) {
      const victim = s.players.find(pl => pl.downUntil === null && pl.air === 0 && dist(pl.pos, p.pos) <= PLAYER_RADIUS + HIT_PADDING);
      if (victim) damagePlayer(s, victim, p.damage);
      else keep.push(p);
      continue;
    }

    let alive = true;
    for (const e of targets(s)) {
      if (p.hitIds.includes(e.id)) continue;
      if (dist(p.pos, e.pos) > e.radius + HIT_PADDING) continue;
      hitEnemy(s, e, p.damage, p.kind, p.ownerId);
      p.hitIds.push(e.id);
      if (p.pierce <= 0) {
        alive = false;
        break;
      }
      p.pierce--;
    }
    if (alive) keep.push(p);
  }
  s.projectiles = keep;
}

export function updateAreas(s: SimState): void {
  s.areas = s.areas.filter(a => s.tick < a.until);
  for (const a of s.areas) {
    if (s.tick < a.nextAt) continue;
    a.nextAt = s.tick + a.interval;
    damageInRadius(s, a.pos, a.radius, a.damage, a.kind, owner(a.ownerId));
  }
}

export function updateMines(s: SimState): void {
  s.mines = s.mines.filter(m => {
    if (s.tick >= m.expiresAt) return false;
    if (s.tick < m.armedAt) return true;
    const touched = targets(s).some(e => dist(m.pos, e.pos) <= MINE.trigger + e.radius);
    if (!touched) return true;
    explode(s, m.pos, MINE.radius, { enemy: m.damage }, 'bananaMine', owner(m.ownerId));
    return false;
  });
}
