import { PLAYER_RADIUS } from '../config/balance';
import { coinOpRule, pvpDamage, rivals } from './versus';
import { damagePlayer } from './player';
import { BLASTER, BOMB, BOOMERANG, BUBBLE_WAND, CANDY, DISCO, HOTDOG, MAGNET, MINE, RAIL, SWATTER, SWORD, WEAPONS, YOYO, levelMul } from '../config/weapons';
import { BLOCKS_WALKER, hasLos, moveCircle, Tile, tileAt } from '../map/tilemap';
import { DT, type HeldWeapon, type Intent, type Player, type Projectile, type SimState, type Vec2 } from '../types';
import { dist, nearestEnemies, targets } from '../util';
import { hitMany, isBossBody } from './combat';
import { airborne, fireRare } from './rare';

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
    case 'laserSword':
    case 'flySwatter': {
      const arc = w.kind === 'flySwatter' ? SWATTER : SWORD;
      const radius = arc.radius + arc.radiusPerLevel * (w.level - 1);
      const minDot = Math.cos((arc.halfArcDeg * Math.PI) / 180);
      const inArc = targets(s).filter(e => {
        const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        return d <= radius + e.radius && (d <= 0.6 || (dx * p.aim.x + dz * p.aim.z) / d >= minDot);
      });
      hitMany(s, inArc, damage, w.kind, p.id);
      // versus: the blade cuts rivals in the arc too
      for (const r of rivals(s, p.id)) {
        const dx = r.pos.x - p.pos.x, dz = r.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > radius + PLAYER_RADIUS || (d > 0.6 && (dx * p.aim.x + dz * p.aim.z) / d < minDot)) continue;
        damagePlayer(s, r, pvpDamage(damage), 'other', p.id);
      }
      return true;
    }
    case 'pixelRail': {
      // the beam runs until the first wall
      let reach = 0;
      while (reach < RAIL.range && tileAt(s.map, p.pos.x + p.aim.x * reach, p.pos.z + p.aim.z * reach) !== Tile.Wall) reach += 0.25;
      const onLine = (q: Vec2, r: number) => {
        const qx = q.x - p.pos.x, qz = q.z - p.pos.z;
        const along = qx * p.aim.x + qz * p.aim.z;
        return along > 0 && along <= reach + r && Math.abs(qx * -p.aim.z + qz * p.aim.x) <= r + RAIL.width;
      };
      hitMany(s, targets(s).filter(e => onLine(e.pos, e.radius)), damage, w.kind, p.id);
      for (const r of rivals(s, p.id)) if (onLine(r.pos, PLAYER_RADIUS)) damagePlayer(s, r, pvpDamage(damage), 'shot', p.id);
      s.events.push({ type: 'railFired', from: { ...p.pos }, to: { x: p.pos.x + p.aim.x * reach, z: p.pos.z + p.aim.z * reach } });
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
    case 'joystickBoomerang':
    case 'yoyoLauncher': {
      // the yo-yo is a short, fast boomerang on a string
      const def = w.kind === 'yoyoLauncher' ? YOYO : BOOMERANG;
      s.projectiles.push({
        id: s.nextId++,
        kind: w.kind,
        behavior: 'boomerang',
        pos: { ...p.pos },
        vel: { x: p.aim.x * def.speed, z: p.aim.z * def.speed },
        damage,
        pierce: Infinity,
        until: s.tick + 240,
        hitIds: [],
        ownerId: p.id,
        travelled: 0,
        range: def.distance,
        returning: false,
      });
      return true;
    }
    case 'bubbleWand':
      s.projectiles.push(bolt(s, p, w, { ...p.pos }, p.aim, BUBBLE_WAND.speed, BUBBLE_WAND.range, damage));
      return true;
    case 'magnetGlove': {
      const to = aimWithin(p, MAGNET.range);
      const minDot = Math.cos((MAGNET.halfArcDeg * Math.PI) / 180);
      const inCone = (q: Vec2, r: number) => {
        const dx = q.x - p.pos.x, dz = q.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        return d <= MAGNET.range + r && (d < 0.6 || (dx * p.aim.x + dz * p.aim.z) / d >= minDot);
      };
      const inside = targets(s).filter(e => inCone(e.pos, e.radius));
      hitMany(s, inside, damage, w.kind, p.id);
      for (const e of inside) {
        // bosses are too heavy to move
        if (isBossBody(s, e)) continue;
        const dx = to.x - e.pos.x, dz = to.z - e.pos.z;
        e.knock = { x: dx * MAGNET.pull, z: dz * MAGNET.pull };
      }
      // versus: rivals in the cone are yanked toward you
      for (const r of rivals(s, p.id)) {
        if (!inCone(r.pos, PLAYER_RADIUS)) continue;
        const dx = p.pos.x - r.pos.x, dz = p.pos.z - r.pos.z;
        const d = Math.hypot(dx, dz);
        const step = Math.max(0, Math.min(MAGNET.rivalPull, d - 1));
        if (d > 1e-6) moveCircle(s.map, r.pos, (dx / d) * step, (dz / d) * step, PLAYER_RADIUS, BLOCKS_WALKER);
        damagePlayer(s, r, pvpDamage(damage), 'other', p.id);
      }
      s.events.push({ type: 'magnetPull', from: { ...p.pos }, to });
      return true;
    }
    case 'discoBall': {
      // light beams to the nearest monsters (and rivals in versus) in sight; with nobody in reach it still
      // flashes, so you see it went off
      const n = DISCO.targets + (w.level - 1);
      const hits = nearestEnemies(s, p.pos, DISCO.range, n);
      hitMany(s, hits, damage, w.kind, p.id);
      const near = rivals(s, p.id)
        .filter(r => !airborne(r) && dist(r.pos, p.pos) <= DISCO.range && hasLos(s.map, p.pos, r.pos))
        .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))
        .slice(0, Math.max(0, n - hits.length));
      for (const r of near) damagePlayer(s, r, pvpDamage(damage), 'shot', p.id);
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
    const rate = s.tick < p.rapidUntil || coinOpRule(s) === 'rapid' ? 2 : 1;
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
    // coin-op chaos: swords only, whatever is in your hand
    const use = coinOpRule(s) === 'swords' ? { ...w, kind: 'laserSword' as const } : w;
    if (fire(s, p, use)) {
      w.cooldown = WEAPONS[use.kind].cooldown;
      s.events.push({ type: 'shot', weapon: use.kind, pos: { ...p.pos } });
    }
  }
}
