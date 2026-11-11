import { FROST_SLOW_SECONDS, POPCORN_FLIGHT, POPCORN_RADIUS, TOWERS } from '../config/towers';
import { DT, TICK_RATE, type SimState, type Tower, type TowerKind, type Vec2 } from '../types';
import { hasLos } from '../map/tilemap';
import { dist, nearestEnemy, targets } from '../util';
import { damageEnemy } from './combat';

export const BUILD_RADIUS = 1.2;

/** The pad the position is standing on, or null. */
export function padAt(s: SimState, pos: Vec2): number | null {
  for (const pad of s.map.pads) {
    if (dist(pad.pos, pos) <= BUILD_RADIUS) return pad.id;
  }
  return null;
}

export function tryBuild(s: SimState, playerId: number, padId: number, kind: TowerKind): void {
  const p = s.players.find(x => x.id === playerId);
  const pad = s.map.pads.find(x => x.id === padId);
  if (!p || !pad || p.downUntil !== null || p.vehicleId !== null || padAt(s, p.pos) !== padId) {
    s.events.push({ type: 'buildDenied', padId, reason: 'notOnPad' });
    return;
  }
  if (s.towers.some(t => t.padId === padId)) {
    s.events.push({ type: 'buildDenied', padId, reason: 'occupied' });
    return;
  }
  const def = TOWERS[kind];
  if (p.coins < def.cost) {
    s.events.push({ type: 'buildDenied', padId, reason: 'coins' });
    return;
  }
  p.coins -= def.cost;
  s.towers.push({ id: s.nextId++, kind, padId, pos: { ...pad.pos }, hp: def.hp, maxHp: def.hp, cooldown: 0 });
  s.events.push({ type: 'towerBuilt', kind, padId });
}

/** Fires `t` if something is in range. Returns true when it fired. */
function fire(s: SimState, t: Tower): boolean {
  const def = TOWERS[t.kind];
  switch (t.kind) {
    case 'laser': {
      const e = nearestEnemy(s, t.pos, def.range);
      if (!e) return false;
      s.events.push({ type: 'towerFired', kind: t.kind, pos: { ...t.pos }, target: { ...e.pos } });
      damageEnemy(s, e, def.damage, t.kind);
      return true;
    }
    case 'popcorn': {
      const e = nearestEnemy(s, t.pos, def.range);
      if (!e) return false;
      const target = { x: e.pos.x, z: e.pos.z + e.speed * POPCORN_FLIGHT };
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
  s.towers = s.towers.filter(t => t.hp > 0);
  for (const t of s.towers) {
    t.cooldown = Math.max(0, t.cooldown - DT);
    if (t.cooldown > 0) continue;
    if (fire(s, t)) t.cooldown = TOWERS[t.kind].cooldown;
  }
}
