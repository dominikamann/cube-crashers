import {
  BOLT_SPEED,
  BOOMERANG_DISTANCE,
  BOOMERANG_SPEED,
  CANDY_SPEED,
  CANDY_SPREAD_DEG,
  HOTDOG_FLIGHT,
  HOTDOG_PUDDLE,
  SWORD_RADIUS_PER_LEVEL,
  WEAPONS,
  levelMul,
} from '../config/weapons';
import { DT, TICK_RATE, type HeldWeapon, type Player, type SimState, type Vec2 } from '../types';
import { nearestEnemies, nearestEnemy } from '../util';
import { damageInRadius, damageEnemy } from './combat';

function dirTo(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

function rotate(v: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad), si = Math.sin(rad);
  return { x: v.x * c - v.z * si, z: v.x * si + v.z * c };
}

function swordRadius(level: number): number {
  return WEAPONS.laserSword.range + SWORD_RADIUS_PER_LEVEL * (level - 1);
}

/** Fires `w` if a target is in range. Returns true when it fired. */
function fire(s: SimState, p: Player, w: HeldWeapon): boolean {
  const def = WEAPONS[w.kind];
  const mul = levelMul(w.level);
  const base = {
    kind: w.kind,
    ownerId: p.id,
    hitIds: [] as number[],
  };

  switch (w.kind) {
    case 'pixelBlaster': {
      const t = nearestEnemy(s, p.pos, def.range);
      if (!t) return false;
      const dir = dirTo(p.pos, t.pos);
      const bolts = 1 + Math.floor((w.level - 1) / 2);
      for (let i = 0; i < bolts; i++) {
        const off = (i - (bolts - 1) / 2) * 0.25;
        s.projectiles.push({
          ...base,
          id: s.nextId++,
          behavior: 'bolt',
          pos: { x: p.pos.x - dir.z * off, z: p.pos.z + dir.x * off },
          vel: { x: dir.x * BOLT_SPEED, z: dir.z * BOLT_SPEED },
          damage: def.damage * mul,
          pierce: 0,
          until: s.tick + TICK_RATE,
          hitIds: [],
        });
      }
      return true;
    }
    case 'laserSword': {
      const r = swordRadius(w.level);
      if (!nearestEnemy(s, p.pos, r)) return false;
      damageInRadius(s, p.pos, r, def.damage * mul, w.kind);
      return true;
    }
    case 'candyCannon': {
      const t = nearestEnemy(s, p.pos, def.range);
      if (!t) return false;
      const dir = dirTo(p.pos, t.pos);
      const balls = 5 + (w.level - 1);
      const spread = (CANDY_SPREAD_DEG * Math.PI) / 180;
      for (let i = 0; i < balls; i++) {
        const v = rotate(dir, -spread / 2 + (spread * i) / (balls - 1));
        s.projectiles.push({
          ...base,
          id: s.nextId++,
          behavior: 'bolt',
          pos: { ...p.pos },
          vel: { x: v.x * CANDY_SPEED, z: v.z * CANDY_SPEED },
          damage: def.damage,
          pierce: 0,
          until: s.tick + Math.round(0.6 * TICK_RATE),
          hitIds: [],
        });
      }
      return true;
    }
    case 'hotdogSlinger': {
      const t = nearestEnemy(s, p.pos, def.range);
      if (!t) return false;
      // lead the target a little: it keeps walking during the flight
      const target = { x: t.pos.x, z: t.pos.z + t.speed * HOTDOG_FLIGHT };
      s.projectiles.push({
        ...base,
        id: s.nextId++,
        behavior: 'lob',
        pos: { ...p.pos },
        vel: { x: 0, z: 0 },
        damage: 0,
        pierce: 0,
        from: { ...p.pos },
        target,
        launchedAt: s.tick,
        until: s.tick + Math.round(HOTDOG_FLIGHT * TICK_RATE),
        land: {
          radius: HOTDOG_PUDDLE.radius,
          damage: def.damage * mul,
          duration: Math.round(HOTDOG_PUDDLE.duration * TICK_RATE),
          interval: Math.round(HOTDOG_PUDDLE.interval * TICK_RATE),
        },
      });
      return true;
    }
    case 'joystickBoomerang': {
      const t = nearestEnemy(s, p.pos, def.range);
      if (!t) return false;
      const dir = dirTo(p.pos, t.pos);
      s.projectiles.push({
        ...base,
        id: s.nextId++,
        behavior: 'boomerang',
        pos: { ...p.pos },
        vel: { x: dir.x * BOOMERANG_SPEED, z: dir.z * BOOMERANG_SPEED },
        damage: def.damage * mul,
        pierce: Infinity,
        until: s.tick + 3 * TICK_RATE,
        travelled: 0,
        range: BOOMERANG_DISTANCE,
        returning: false,
      });
      return true;
    }
    case 'discoBall': {
      const hits = nearestEnemies(s, p.pos, def.range, 2 + (w.level - 1));
      if (hits.length === 0) return false;
      for (const e of hits) damageEnemy(s, e, def.damage, w.kind);
      return true;
    }
  }
}

export function updateWeapons(s: SimState): void {
  for (const p of s.players) {
    if (p.downUntil !== null) continue;
    for (const w of p.weapons) {
      w.cooldown = Math.max(0, w.cooldown - DT);
      if (w.cooldown > 0) continue;
      if (fire(s, p, w)) {
        w.cooldown = WEAPONS[w.kind].cooldown;
        s.events.push({ type: 'shot', weapon: w.kind, pos: { ...p.pos } });
      }
    }
  }
}
