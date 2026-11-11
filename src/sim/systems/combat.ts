import { ENEMIES } from '../config/enemies';
import { DT, type DamageSource, type Enemy, type SimState, type Vec2 } from '../types';
import { dist, targets } from '../util';
import { spawnEnemy } from './enemies';

const HIT_PADDING = 0.15;
export const COIN_LIFETIME_TICKS = 480;

export function dropCoins(s: SimState, pos: Vec2, count: number): void {
  for (let i = 0; i < count; i++) {
    s.coins.push({
      id: s.nextId++,
      pos: { x: pos.x + s.rng.range(-0.4, 0.4), z: pos.z + s.rng.range(-0.4, 0.4) },
      value: 1,
      expiresAt: s.tick + COIN_LIFETIME_TICKS,
    });
  }
}

/** All damage in the game goes through here. Dead enemies are swept by removeDead. */
export function damageEnemy(s: SimState, e: Enemy, amount: number, _source: DamageSource, _byPlayerId?: number): void {
  if (e.hp <= 0) return;
  e.hp -= amount;
  s.events.push({ type: 'enemyHit', pos: { ...e.pos } });
  if (e.hp > 0) return;
  s.events.push({ type: 'enemyKilled', kind: e.kind, pos: { ...e.pos }, elite: e.elite });
  dropCoins(s, e.pos, ENEMIES[e.kind].coins);
  if (e.kind === 'splitter') {
    spawnEnemy(s, 'splitling', { x: e.pos.x - 0.3, z: e.pos.z });
    spawnEnemy(s, 'splitling', { x: e.pos.x + 0.3, z: e.pos.z });
  }
}

export function damageInRadius(s: SimState, pos: Vec2, radius: number, amount: number, source: DamageSource): void {
  for (const e of targets(s)) {
    if (dist(pos, e.pos) <= radius + e.radius) damageEnemy(s, e, amount, source);
  }
}

export function removeDead(s: SimState): void {
  s.enemies = s.enemies.filter(e => e.hp > 0);
}

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
          damageInRadius(s, p.target!, land.radius, land.damage, p.kind);
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
        if (p.travelled! >= p.range!) {
          p.returning = true;
          p.hitIds = [];
        }
      } else {
        const owner = s.players.find(pl => pl.id === p.ownerId);
        if (!owner || dist(owner.pos, p.pos) < 0.5) continue;
        const dx = owner.pos.x - p.pos.x, dz = owner.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        p.vel = { x: (dx / d) * speed, z: (dz / d) * speed };
      }
      if (s.tick >= p.until) continue;
    } else if (s.tick >= p.until) {
      continue;
    }

    let alive = true;
    for (const e of targets(s)) {
      if (p.hitIds.includes(e.id)) continue;
      if (dist(p.pos, e.pos) > e.radius + HIT_PADDING) continue;
      damageEnemy(s, e, p.damage, p.kind);
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
    damageInRadius(s, a.pos, a.radius, a.damage, a.kind);
  }
}
