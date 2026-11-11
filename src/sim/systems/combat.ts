import { BOMBER, CLOSE_BONUS, ENEMY_CAP, CLOSE_RANGE, PLAYER_RADIUS, COIN_LIFETIME_TICKS, COMBO_MAX_MULT, COMBO_STEP, COMBO_TICKS, BOSS_BODY_RESIST } from '../config/balance';
import { ELITE, ENEMIES } from '../config/enemies';
import { FROZEN_DAMAGE, RARE } from '../config/rare';
import { DIFFICULTY } from '../config/difficulty';
import { HOTDOG, MINE } from '../config/weapons';
import { BLOCKS_ENEMY, nearestFree, Tile, tileAt } from '../map/tilemap';
import { DT, type DamageSource, type Enemy, type Player, type SimState, type Vec2 } from '../types';
import { dist, targets } from '../util';
import { spawnEnemy } from './enemies';
import { damagePlayer } from './player';
import { airborne, makeBubble } from './rare';
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
  if ((e.kind === 'megaBlock' || e.kind === 'wormSegment') && (source === 'stomp' || source === 'kart')) amount *= BOSS_BODY_RESIST;
  const dealt = e.frozenUntil > s.tick ? amount * FROZEN_DAMAGE : amount;
  e.hp -= dealt;
  s.events.push({ type: 'enemyHit', id: e.id, pos: { ...e.pos }, amount: dealt });
  const horde = e.hordeId !== null ? s.hordes.find(h => h.id === e.hordeId) : undefined;
  if (horde) horde.aggro = true;
  if (e.hp > 0) return;

  // a lost run is over: the last explosions of the tick no longer count
  if (s.phase !== 'playing') return;
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
    p.stats.bestCombo = Math.max(p.stats.bestCombo, p.combo);
    p.stats.kills++;
    p.stats.killsBy[source] = (p.stats.killsBy[source] ?? 0) + 1;
  }
  const points = Math.round(def.score * (e.elite ? ELITE.score : 1) * mult * DIFFICULTY[s.difficulty].score);
  s.score += points;
  if (p) p.stats.score += points;
  dropCoins(s, e.pos, def.coins * (e.elite ? 3 : 1), Math.round(mult * (1 + 0.25 * greed)));
  if (e.kind === 'splitter' && s.enemies.filter(x => x.hp > 0).length + 2 <= ENEMY_CAP) {
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
    for (const p of s.players) if (!airborne(p) && dist(p.pos, pos) <= radius) damagePlayer(s, p, damage.player, 'explosion');
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
          if (land.impact) explode(s, p.target!, land.radius, { enemy: land.impact }, p.kind, owner(p.ownerId));
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
            slows: land.slows,
          });
        } else {
          explode(s, p.target!, land.radius, { enemy: land.damage }, p.kind, owner(p.ownerId));
        }
        continue;
      }
      keep.push(p);
      continue;
    }

    if (p.behavior === 'saw') {
      // bounce off walls axis by axis
      const nx = p.pos.x + p.vel.x * DT, nz = p.pos.z + p.vel.z * DT;
      if (tileAt(s.map, nx, p.pos.z) === Tile.Wall) {
        p.vel.x = -p.vel.x;
        p.bounces!--;
      } else p.pos.x = nx;
      if (tileAt(s.map, p.pos.x, nz) === Tile.Wall) {
        p.vel.z = -p.vel.z;
        p.bounces!--;
      } else p.pos.z = nz;
      if (s.tick >= p.until || p.bounces! < 0) continue;
      if ((s.tick - p.launchedAt!) % RARE.pizza.rehitTicks === 0) p.hitIds = [];
      for (const e of targets(s)) {
        if (p.hitIds.includes(e.id) || dist(p.pos, e.pos) > e.radius + 0.4) continue;
        p.hitIds.push(e.id);
        damageEnemy(s, e, p.damage, p.kind, owner(p.ownerId));
      }
      keep.push(p);
      continue;
    }

    p.pos.x += p.vel.x * DT;
    p.pos.z += p.vel.z * DT;

    if (p.kind === 'bubblegumBazooka') {
      const hitWall = tileAt(s.map, p.pos.x, p.pos.z) === Tile.Wall;
      const hitEnemy = targets(s).some(e => dist(p.pos, e.pos) <= e.radius + HIT_PADDING);
      if (hitWall || hitEnemy || s.tick >= p.until) {
        makeBubble(s, hitWall ? { x: p.pos.x - p.vel.x * DT, z: p.pos.z - p.vel.z * DT } : p.pos, p.ownerId);
        continue;
      }
      keep.push(p);
      continue;
    }

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
      const victim = s.players.find(pl => pl.downUntil === null && !airborne(pl) && dist(pl.pos, p.pos) <= PLAYER_RADIUS + HIT_PADDING);
      if (victim) damagePlayer(s, victim, p.damage, 'shot');
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
    if (a.slows) for (const e of s.enemies) if (dist(e.pos, a.pos) <= a.radius + e.radius) e.slowUntil = Math.max(e.slowUntil, s.tick + HOTDOG.slowTicks);
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
