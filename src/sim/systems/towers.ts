import { rivals, VERSUS } from './versus';
import { damagePlayer } from './player';
import { BUILD_TICKS, BUMPER, FROST_SLOW_SECONDS, MAX_TOWER_LEVEL, POPCORN_FLIGHT, POPCORN_RADIUS, REPAIR_PER_SECOND, TESLA, TOWERS, UPGRADE_TICKS, towerStats, upgradeCost } from '../config/towers';
import { DT, TICK_RATE, type Intent, type SimState, type Tower, type TowerKind, type Vec2 } from '../types';
import { BLOCKS_WALKER, hasLos, moveCircle } from '../map/tilemap';
import { PLAYER_RADIUS } from '../config/balance';
import { airborne } from './rare';
import { dist, nearestEnemy, targets } from '../util';
import { damageEnemy } from './combat';

export const BUILD_RADIUS = 1.2;

/** The pad the position is standing on, or null. */
export function padAt(s: SimState, pos: Vec2): number | null {
  // the nearest one: pads can sit two tiles apart, and a solid tower keeps you off the middle of yours
  let best: number | null = null, bestD = BUILD_RADIUS;
  for (const pad of s.map.pads) {
    const d = dist(pad.pos, pos);
    if (d <= bestD) {
      best = pad.id;
      bestD = d;
    }
  }
  return best;
}

export function tryBuild(s: SimState, playerId: number, padId: number, kind: TowerKind): void {
  const p = s.players.find(x => x.id === playerId);
  const pad = s.map.pads.find(x => x.id === padId);
  if (!p || !pad || p.downUntil !== null || p.vehicleId !== null || padAt(s, p.pos) !== padId) {
    s.events.push({ type: 'buildDenied', padId, reason: 'notOnPad', playerId });
    return;
  }
  if (s.towers.some(t => t.padId === padId)) {
    s.events.push({ type: 'buildDenied', padId, reason: 'occupied', playerId });
    return;
  }
  const def = TOWERS[kind];
  if (p.coins < def.cost) {
    s.events.push({ type: 'buildDenied', padId, reason: 'coins', playerId });
    return;
  }
  p.coins -= def.cost;
  p.stats.towersBuilt++;
  // versus: one tower per player, a new one replaces the old
  if (s.versus) s.towers = s.towers.filter(t => t.ownerId !== playerId);
  s.towers.push({ id: s.nextId++, kind, padId, pos: { ...pad.pos }, hp: def.hp, maxHp: def.hp, cooldown: 0, level: 1, buildLeft: BUILD_TICKS, upgrading: false, ownerId: playerId });
  s.events.push({ type: 'towerBuilt', kind, padId, playerId });
}

export function tryUpgrade(s: SimState, playerId: number, padId: number): void {
  const p = s.players.find(x => x.id === playerId);
  const t = s.towers.find(x => x.padId === padId);
  const deny = (reason: 'coins' | 'maxLevel' | 'building' | 'notOnPad') => s.events.push({ type: 'upgradeDenied', padId, reason, playerId });
  if (!p || !t || p.downUntil !== null || p.vehicleId !== null || padAt(s, p.pos) !== padId) return void deny('notOnPad');
  if (t.buildLeft > 0) return void deny('building');
  // versus towers stay small
  if (t.level >= MAX_TOWER_LEVEL || s.versus) return void deny('maxLevel');
  const cost = upgradeCost(t.kind, t.level + 1);
  if (p.coins < cost) return void deny('coins');
  p.coins -= cost;
  t.buildLeft = UPGRADE_TICKS;
  t.upgrading = true;
  s.events.push({ type: 'towerUpgrade', padId, level: t.level + 1, playerId });
}

/** Players holding E on a pad build its tower (or upgrade) and, once it stands, repair it. */
export function updateTowerWork(s: SimState, intents: Map<number, Intent>): void {
  for (const p of s.players) {
    if (p.downUntil !== null || p.vehicleId !== null || !intents.get(p.id)?.hold) continue;
    const padId = padAt(s, p.pos);
    const t = padId === null ? undefined : s.towers.find(x => x.padId === padId);
    if (!t) continue;
    if (t.buildLeft > 0) {
      t.buildLeft--;
      if (t.buildLeft === 0) {
        if (t.upgrading) {
          t.level++;
          t.upgrading = false;
          const hp = towerStats(t.kind, t.level).hp;
          t.hp += hp - t.maxHp;
          t.maxHp = hp;
        }
        s.events.push({ type: 'towerDone', padId: t.padId, level: t.level });
      }
    } else if (t.hp < t.maxHp) {
      t.hp = Math.min(t.maxHp, t.hp + (t.maxHp * REPAIR_PER_SECOND) / TICK_RATE);
    }
  }
}

/** Fires `t` if something is in range. Returns true when it fired. */
function fire(s: SimState, t: Tower): boolean {
  const def = towerStats(t.kind, t.level);
  switch (t.kind) {
    case 'laser': {
      const e = nearestEnemy(s, t.pos, def.range);
      if (!e) {
        // versus: no monster in reach, so the nearest rival of the owner it can see
        const r = t.ownerId === undefined ? undefined : rivals(s, t.ownerId).filter(p => dist(p.pos, t.pos) <= def.range && hasLos(s.map, t.pos, p.pos)).sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos))[0];
        if (!r) return false;
        s.events.push({ type: 'towerFired', kind: t.kind, pos: { ...t.pos }, target: { ...r.pos } });
        damagePlayer(s, r, def.damage * VERSUS.towerScale, 'shot', t.ownerId);
        return true;
      }
      s.events.push({ type: 'towerFired', kind: t.kind, pos: { ...t.pos }, target: { ...e.pos } });
      damageEnemy(s, e, def.damage, t.kind);
      return true;
    }
    case 'popcorn': {
      const e = nearestEnemy(s, t.pos, def.range);
      if (!e) return false;
      // lead the target along the way it walks
      const target = { x: e.pos.x + e.dir.x * e.speed * POPCORN_FLIGHT, z: e.pos.z + e.dir.z * e.speed * POPCORN_FLIGHT };
      s.projectiles.push({
        id: s.nextId++,
        kind: t.kind,
        behavior: 'lob',
        pos: { ...t.pos },
        vel: { x: 0, z: 0 },
        damage: 0,
        pierce: 0,
        hitIds: [],
        ownerId: -1,
        from: { ...t.pos },
        target,
        launchedAt: s.tick,
        until: s.tick + Math.round(POPCORN_FLIGHT * TICK_RATE),
        land: { radius: POPCORN_RADIUS, damage: def.damage },
      });
      s.events.push({ type: 'towerFired', kind: t.kind, pos: { ...t.pos }, target });
      return true;
    }
    case 'tesla': {
      const first = nearestEnemy(s, t.pos, def.range);
      if (!first || !hasLos(s.map, t.pos, first.pos)) return false;
      const points = [{ ...t.pos }];
      const hit = new Set<number>();
      let e: typeof first | undefined = first;
      let damage = def.damage;
      for (let i = 0; e && i <= TESLA.jumps; i++) {
        hit.add(e.id);
        points.push({ ...e.pos });
        const from: typeof first = e;
        damageEnemy(s, from, damage, t.kind);
        damage *= TESLA.falloff;
        e = targets(s).filter(o => !hit.has(o.id) && dist(o.pos, from.pos) <= TESLA.hop).sort((a, b) => dist(a.pos, from.pos) - dist(b.pos, from.pos))[0];
      }
      s.events.push({ type: 'teslaChain', points });
      return true;
    }
    case 'bumper': {
      const near = targets(s).filter(e => dist(t.pos, e.pos) <= def.range + e.radius);
      const pushed = t.ownerId === undefined ? [] : rivals(s, t.ownerId).filter(r => !airborne(r) && dist(r.pos, t.pos) <= def.range);
      if (near.length === 0 && pushed.length === 0) return false;
      const away = (q: { x: number; z: number }) => {
        const dx = q.x - t.pos.x, dz = q.z - t.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        return { x: dx / d, z: dz / d };
      };
      for (const e of near) {
        damageEnemy(s, e, def.damage, t.kind);
        if (e.kind === 'megaBlock' || e.kind === 'wormSegment') continue;
        const a = away(e.pos);
        e.knock = { x: a.x * BUMPER.knock, z: a.z * BUMPER.knock };
      }
      for (const r of pushed) {
        const a = away(r.pos);
        moveCircle(s.map, r.pos, a.x * BUMPER.rivalPush, a.z * BUMPER.rivalPush, PLAYER_RADIUS, BLOCKS_WALKER);
        damagePlayer(s, r, def.damage * VERSUS.towerScale, 'other', t.ownerId);
      }
      s.events.push({ type: 'towerFired', kind: t.kind, pos: { ...t.pos }, target: { ...t.pos } });
      return true;
    }
    case 'frost': {
      const inRange = targets(s).filter(e => dist(t.pos, e.pos) <= def.range && hasLos(s.map, t.pos, e.pos));
      if (inRange.length === 0) return false;
      for (const e of inRange) e.slowUntil = s.tick + FROST_SLOW_SECONDS * TICK_RATE;
      s.events.push({ type: 'towerFired', kind: t.kind, pos: { ...t.pos }, target: { ...t.pos } });
      return true;
    }
  }
}

export function updateTowers(s: SimState): void {
  s.towers = s.towers.filter(t => {
    if (t.hp > 0) return true;
    s.events.push({ type: 'towerDestroyed', kind: t.kind, pos: { ...t.pos } });
    return false;
  });
  for (const t of s.towers) {
    // a frame still being built does not fire; an upgrade in progress keeps the old level firing
    if (t.buildLeft > 0 && !t.upgrading) continue;
    t.cooldown = Math.max(0, t.cooldown - DT);
    if (t.cooldown > 0) continue;
    if (fire(s, t)) t.cooldown = towerStats(t.kind, t.level).cooldown;
  }
}
