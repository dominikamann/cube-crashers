import { PLAYER_RADIUS } from '../config/balance';
import { rivals, VERSUS } from './versus';
import { damagePlayer } from './player';
import { BLASTER, BOMB, BOOMERANG, CANDY, DISCO, HOTDOG, MINE, SWORD, WEAPONS, levelMul } from '../config/weapons';
import { DT, type HeldWeapon, type Intent, type Player, type Projectile, type SimState, type Vec2 } from '../types';
import { dist, nearestEnemies, targets } from '../util';
import { hitEnemy } from './combat';
import { fireRare } from './rare';

function rotate(v: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad), si = Math.sin(rad);
  return { x: v.x * c - v.z * si, z: v.x * si + v.z * c };
}

/** The aim point, pulled in to at most `range` tiles from the player. */
function aimWithin(p: Player, range: number): Vec2 {
  const d = dist(p.pos, p.aimPoint);
  if (d <= range) return { ...p.aimPoint };
  return { x: p.pos.x + ((p.aimPoint.x - p.pos.x) / d) * range, z: p.pos.z + ((p.aimPoint.z - p.pos.z) / d) * range };
}

function bolt(s: SimState, p: Player, w: HeldWeapon, pos: Vec2, dir: Vec2, speed: number, range: number, damage: number): Projectile {
  return {
    id: s.nextId++,
    kind: w.kind,
    behavior: 'bolt',
    pos,
    vel: { x: dir.x * speed, z: dir.z * speed },
    damage,
    pierce: 0,
    until: s.tick + Math.ceil((range / speed) * 60),
    hitIds: [],
    ownerId: p.id,
  };
}

/** Fires `w` toward the player's aim. Returns false if the shot would be wasted and should not use the charge. */
function fire(s: SimState, p: Player, w: HeldWeapon): boolean {
  const def = WEAPONS[w.kind];
  const damage = def.damage * levelMul(w.level);

  switch (w.kind) {
    case 'pixelBlaster': {
      const bolts = 1 + Math.floor((w.level - 1) / 2);
      for (let i = 0; i < bolts; i++) {
        const off = (i - (bolts - 1) / 2) * 0.25;
        const pos = { x: p.pos.x - p.aim.z * off, z: p.pos.z + p.aim.x * off };
        s.projectiles.push(bolt(s, p, w, pos, p.aim, BLASTER.speed, BLASTER.range, damage));
      }
      return true;
    }
    case 'laserSword': {
      const radius = SWORD.radius + SWORD.radiusPerLevel * (w.level - 1);
      const minDot = Math.cos((SWORD.halfArcDeg * Math.PI) / 180);
      for (const e of targets(s)) {
        const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > radius + e.radius) continue;
        if (d > 0.6 && (dx * p.aim.x + dz * p.aim.z) / d < minDot) continue;
        hitEnemy(s, e, damage, w.kind, p.id);
      }
      // versus: the blade cuts rivals in the arc too
      for (const r of rivals(s, p.id)) {
        const dx = r.pos.x - p.pos.x, dz = r.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > radius + PLAYER_RADIUS || (d > 0.6 && (dx * p.aim.x + dz * p.aim.z) / d < minDot)) continue;
        damagePlayer(s, r, damage * VERSUS.damageScale, 'other', p.id);
      }
      return true;
    }
    case 'candyCannon': {
      const pellets = CANDY.pellets + (w.level - 1);
      const spread = (CANDY.spreadDeg * Math.PI) / 180;
      for (let i = 0; i < pellets; i++) {
        const dir = rotate(p.aim, -spread / 2 + (spread * i) / (pellets - 1));
        s.projectiles.push(bolt(s, p, w, { ...p.pos }, dir, CANDY.speed, CANDY.range, def.damage));
      }
      return true;
    }
    case 'hotdogSlinger':
    case 'bomb': {
      const hotdog = w.kind === 'hotdogSlinger';
      const target = aimWithin(p, hotdog ? HOTDOG.range : BOMB.range);
      s.projectiles.push({
        id: s.nextId++,
        kind: w.kind,
        behavior: 'lob',
        pos: { ...p.pos },
        vel: { x: 0, z: 0 },
        damage: 0,
        pierce: 0,
        hitIds: [],
        ownerId: p.id,
        from: { ...p.pos },
        target,
        launchedAt: s.tick,
        until: s.tick + (hotdog ? HOTDOG.flightTicks : BOMB.flightTicks),
        land: hotdog
          ? { radius: HOTDOG.radius, damage, duration: HOTDOG.durationTicks, interval: HOTDOG.intervalTicks, impact: HOTDOG.impact * (damage / WEAPONS.hotdogSlinger.damage), slows: true }
          : { radius: BOMB.radius, damage },
      });
      return true;
    }
    case 'joystickBoomerang': {
      s.projectiles.push({
        id: s.nextId++,
        kind: w.kind,
        behavior: 'boomerang',
        pos: { ...p.pos },
        vel: { x: p.aim.x * BOOMERANG.speed, z: p.aim.z * BOOMERANG.speed },
        damage,
        pierce: Infinity,
        until: s.tick + 240,
        hitIds: [],
        ownerId: p.id,
        travelled: 0,
        range: BOOMERANG.distance,
        returning: false,
      });
      return true;
    }
    case 'discoBall': {
      const hits = nearestEnemies(s, p.pos, DISCO.range, DISCO.targets + (w.level - 1));
      if (hits.length === 0) return false;
      for (const e of hits) hitEnemy(s, e, damage, w.kind, p.id);
      return true;
    }
    case 'bananaMine': {
      const own = s.mines.filter(m => m.ownerId === p.id);
      if (own.length >= MINE.max) s.mines.splice(s.mines.indexOf(own[0]), 1);
      s.mines.push({
        id: s.nextId++,
        pos: { ...p.pos },
        ownerId: p.id,
        damage,
        armedAt: s.tick + MINE.armTicks,
        expiresAt: s.tick + MINE.lifetimeTicks,
      });
      return true;
    }
  }
}

export function updateWeapons(s: SimState, intents: Map<number, Intent>): void {
  // the Glitch Maze is played without weapons
  if (s.run.stage === 'maze') return;
  for (const p of s.players) {
    const rate = s.tick < p.rapidUntil ? 2 : 1;
    for (const w of p.weapons) {
      w.cooldown -= DT * rate;
      if (w.cooldown < 1e-9) w.cooldown = 0;
    }
    if (p.downUntil !== null || !intents.get(p.id)?.fire) continue;
    if (p.rareSelected && p.rare) {
      const kind = p.rare.kind;
      if (fireRare(s, p) && s.tick % 6 === 0) s.events.push({ type: 'rareFired', kind, playerId: p.id, pos: { ...p.pos } });
      continue;
    }
    const w = p.weapons[p.selected];
    if (!w || w.cooldown > 0) continue;
    if (fire(s, p, w)) {
      w.cooldown = WEAPONS[w.kind].cooldown;
      s.events.push({ type: 'shot', weapon: w.kind, pos: { ...p.pos } });
    }
  }
}
