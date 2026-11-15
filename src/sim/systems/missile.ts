import { PLAYER_RADIUS } from '../config/balance';
import { RARE } from '../config/rare';
import { hasLos, Tile, tileAt } from '../map/tilemap';
import { DT, type Enemy, type Player, type Projectile, type SimState, type Vec2 } from '../types';
import { dist, targets } from '../util';
import { explode } from './combat';
import { damagePlayer } from './player';
import { rivals } from './versus';

/**
 * The Lock-On Launcher, a rare weapon that is not on the golden cards: found only in a few crates. Whoever holds
 * it and keeps a target near the crosshair for a moment has it locked; fired then, the missile follows that
 * target round the arena and blows up on it. Without a lock it does not fire.
 */

/** what a launcher can lock on to: a rival (versus) or a monster, by its id */
type Mark = { id: number; rival: boolean };

const sought = (s: SimState, m: Mark): Player | Enemy | undefined => (m.rival ? s.players.find(p => p.id === m.id && p.downUntil === null) : s.enemies.find(e => e.id === m.id && e.hp > 0));

/** how far `to` is off the line of `aim` from `from`, in radians */
function offAim(from: Vec2, aim: Vec2, to: Vec2): number {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  return d < 1e-6 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * aim.x + dz * aim.z) / d)));
}

/** the target nearest the crosshair that the launcher can see: rivals first, then monsters */
function candidate(s: SimState, p: Player): Mark | null {
  const c = RARE.missile, cone = (c.halfConeDeg * Math.PI) / 180;
  const seen = (o: { pos: Vec2 }) => dist(o.pos, p.pos) <= c.range && offAim(p.pos, p.aim, o.pos) <= cone && hasLos(s.map, p.pos, o.pos);
  const nearest = <T extends { pos: Vec2 }>(list: T[]): T | undefined => list.filter(seen).sort((a, b) => offAim(p.pos, p.aim, a.pos) - offAim(p.pos, p.aim, b.pos))[0];
  const rival = nearest(rivals(s, p.id).filter(r => s.tick >= r.invulnUntil));
  if (rival) return { id: rival.id, rival: true };
  const enemy = nearest(targets(s));
  return enemy ? { id: enemy.id, rival: false } : null;
}

/** whether this player's launcher has its target locked */
export const locked = (p: Player): boolean => !!p.lock && p.lock.ticks >= RARE.missile.lockTicks;

/** Every tick: whoever holds the launcher in their hands locks on to what stays near their crosshair. */
export function updateLocks(s: SimState): void {
  for (const p of s.players) {
    if (p.rare?.kind !== 'missileLauncher' || !p.rareSelected || p.downUntil !== null) {
      if (p.lock) delete p.lock;
      continue;
    }
    const to = candidate(s, p);
    if (!to) delete p.lock;
    else if (p.lock && p.lock.id === to.id && p.lock.rival === to.rival) p.lock.ticks = Math.min(RARE.missile.lockTicks, p.lock.ticks + 1);
    else p.lock = { ...to, ticks: 1 };
  }
}

/** Fires at the locked target; false without a lock. */
export function fireMissile(s: SimState, p: Player): boolean {
  const c = RARE.missile;
  if (!locked(p)) return false;
  p.rare!.cooldown = c.cooldownTicks;
  s.projectiles.push({
    id: s.nextId++,
    kind: 'missileLauncher',
    behavior: 'missile',
    pos: { x: p.pos.x + p.aim.x * 0.6, z: p.pos.z + p.aim.z * 0.6 },
    vel: { x: p.aim.x * c.speed, z: p.aim.z * c.speed },
    damage: c.damage,
    pierce: 0,
    until: s.tick + c.lifeTicks,
    hitIds: [],
    ownerId: p.id,
    launchedAt: s.tick,
    seek: { id: p.lock!.id, rival: p.lock!.rival },
  });
  // (the next one needs a new lock)
  p.lock!.ticks = 0;
  return true;
}

/** One tick of a missile's flight; false once it has blown up. */
export function stepMissile(s: SimState, p: Projectile): boolean {
  const c = RARE.missile;
  const to = p.seek ? sought(s, p.seek) : undefined;
  // its target fell (or burst) to something else: it flies on straight and is after nobody any more, also not
  // after the same player once they are back
  if (p.seek && !to) delete p.seek;
  if (to) {
    // it turns toward its target, but only so fast: a quick step round a corner shakes it off
    const want = Math.atan2(to.pos.z - p.pos.z, to.pos.x - p.pos.x), now = Math.atan2(p.vel.z, p.vel.x);
    let off = want - now;
    while (off > Math.PI) off -= 2 * Math.PI;
    while (off < -Math.PI) off += 2 * Math.PI;
    const a = now + Math.max(-c.turn * DT, Math.min(c.turn * DT, off));
    p.vel = { x: Math.cos(a) * c.speed, z: Math.sin(a) * c.speed };
  }
  p.pos.x += p.vel.x * DT;
  p.pos.z += p.vel.z * DT;
  const wall = tileAt(s.map, p.pos.x, p.pos.z) === Tile.Wall;
  const reach = to ? ('radius' in to ? to.radius : PLAYER_RADIUS) + 0.3 : 0;
  const hit = !!to && dist(p.pos, to.pos) <= reach;
  if (!wall && !hit && s.tick < p.until) return true;
  const at = wall ? { x: p.pos.x - p.vel.x * DT, z: p.pos.z - p.vel.z * DT } : { ...p.pos };
  const by = p.ownerId >= 0 ? p.ownerId : undefined;
  // whom it was after and reached takes the full blow, on top of the blast that gets everyone near
  if (hit && p.seek!.rival) damagePlayer(s, to as Player, c.direct, 'explosion', by);
  explode(s, at, c.radius, { enemy: c.damage }, 'missileLauncher', by, c.radius);
  return false;
}
