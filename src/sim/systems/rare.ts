import { PLAYER_RADIUS } from '../config/balance';
import { JETPACK, RARE } from '../config/rare';
import { BLOCKS_WALKER, hasLos, isFree, Tile, tileAt } from '../map/tilemap';
import { DT, type Enemy, type Player, type SimState, type Vec2 } from '../types';
import { dist, targets } from '../util';
import { damageEnemy, explode } from './combat';

/** In the air from a jump or on a jetpack: no contact, glitch or ground blast damage. */
export function airborne(p: Player): boolean {
  return p.air > 0 || p.flying;
}

function inCone(from: Vec2, aim: Vec2, target: Vec2, range: number, halfConeDeg: number): boolean {
  const dx = target.x - from.x, dz = target.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 0.6) return true;
  return (dx * aim.x + dz * aim.z) / d >= Math.cos((halfConeDeg * Math.PI) / 180);
}

function placeJetpack(s: SimState, spots: Vec2[]): void {
  const free = spots.filter(sp => !s.crates.some(c => c.pos.x === sp.x && c.pos.z === sp.z) && !s.powerups.some(pu => pu.pos.x === sp.x && pu.pos.z === sp.z));
  if (free.length === 0) return;
  s.jetpacks.push({ id: s.nextId++, pos: { ...s.rng.pick(free) } });
}

export function placeStartJetpack(s: SimState): void {
  placeJetpack(s, s.map.crateSpots);
  s.nextJetpackAt = s.tick + JETPACK.respawnTicks;
}

export function updateJetpacks(s: SimState): void {
  if (s.tick >= s.nextJetpackAt) {
    s.nextJetpackAt = s.tick + JETPACK.respawnTicks;
    if (s.jetpacks.length === 0) placeJetpack(s, s.map.powerSpots);
  }
  const alive = s.players.filter(p => p.downUntil === null && p.vehicleId === null);
  s.jetpacks = s.jetpacks.filter(j => {
    const p = alive.find(x => dist(x.pos, j.pos) <= JETPACK.pickupRadius);
    if (!p) return true;
    p.jetpack = true;
    p.jetFuel = JETPACK.fuelTicks;
    s.events.push({ type: 'jetpackPicked', playerId: p.id });
    return false;
  });
}

/** Rare weapon timers and the gum bubbles they leave behind. */
export function updateRare(s: SimState): void {
  for (const p of s.players) {
    if (!p.rare) continue;
    if (p.rare.cooldown > 0) p.rare.cooldown--;
    if (s.tick < p.rare.until) continue;
    p.rare = null;
    p.rareSelected = false;
    s.events.push({ type: 'rareExpired', playerId: p.id });
  }
  s.bubbles = s.bubbles.filter(b => {
    if (s.tick < b.popAt) return true;
    s.events.push({ type: 'bubblePop', pos: { ...b.pos } });
    explode(s, b.pos, RARE.bubble.radius, { enemy: RARE.bubble.damage }, 'bubblegumBazooka', b.ownerId >= 0 ? b.ownerId : undefined);
    return false;
  });
}

export function makeBubble(s: SimState, pos: Vec2, ownerId: number): void {
  const popAt = s.tick + RARE.bubble.stuckTicks;
  s.bubbles.push({ id: s.nextId++, pos: { ...pos }, ownerId, popAt });
  for (const e of targets(s)) if (dist(e.pos, pos) <= RARE.bubble.radius + e.radius) e.stuckUntil = popAt;
}

/** Fires the selected rare weapon. Returns true when something happened (for the event). */
export function fireRare(s: SimState, p: Player): boolean {
  const r = p.rare!;
  if (r.cooldown > 0) return false;
  switch (r.kind) {
    case 'slushMachine': {
      const c = RARE.slush;
      r.cooldown = c.everyTicks;
      for (const e of targets(s)) {
        if (!inCone(p.pos, p.aim, e.pos, c.range + e.radius, c.halfConeDeg) || !hasLos(s.map, p.pos, e.pos)) continue;
        e.slowUntil = Math.max(e.slowUntil, s.tick + 30);
        e.chill += c.chill;
        if (e.chill >= c.freezeAt) {
          e.chill = 0;
          e.frozenUntil = s.tick + c.frozenTicks;
        }
        damageEnemy(s, e, c.damage, r.kind, p.id);
      }
      return true;
    }
    case 'bubblegumBazooka': {
      const c = RARE.bubble;
      r.cooldown = c.cooldownTicks;
      s.projectiles.push({
        id: s.nextId++,
        kind: r.kind,
        behavior: 'bolt',
        pos: { ...p.pos },
        vel: { x: p.aim.x * c.speed, z: p.aim.z * c.speed },
        damage: 0,
        pierce: 0,
        until: s.tick + Math.ceil((c.range / c.speed) * 60),
        hitIds: [],
        ownerId: p.id,
      });
      return true;
    }
    case 'leafBlower': {
      const c = RARE.blower;
      for (const e of targets(s)) {
        if (!inCone(p.pos, p.aim, e.pos, c.range + e.radius, c.halfConeDeg) || !hasLos(s.map, p.pos, e.pos)) continue;
        e.knock.x += p.aim.x * c.push;
        e.knock.z += p.aim.z * c.push;
        const k = Math.hypot(e.knock.x, e.knock.z);
        if (k > c.maxKnock) {
          e.knock.x *= c.maxKnock / k;
          e.knock.z *= c.maxKnock / k;
        }
      }
      for (const coin of s.coins) {
        if (!inCone(p.pos, p.aim, coin.pos, c.range, c.halfConeDeg)) continue;
        const d = dist(coin.pos, p.pos) || 1;
        coin.pos.x += ((p.pos.x - coin.pos.x) / d) * Math.min(d, c.coinPull * DT);
        coin.pos.z += ((p.pos.z - coin.pos.z) / d) * Math.min(d, c.coinPull * DT);
      }
      return true;
    }
    case 'pizzaCutter': {
      const c = RARE.pizza;
      r.cooldown = c.cooldownTicks;
      s.projectiles.push({
        id: s.nextId++,
        kind: r.kind,
        behavior: 'saw',
        pos: { ...p.pos },
        vel: { x: p.aim.x * c.speed, z: p.aim.z * c.speed },
        damage: c.damage,
        pierce: Infinity,
        until: s.tick + c.lifeTicks,
        hitIds: [],
        ownerId: p.id,
        launchedAt: s.tick,
        bounces: c.bounces,
      });
      return true;
    }
  }
}

/** Flight on the jetpack; returns true while the player is flying this tick. */
export function updateFlight(s: SimState, p: Player, wantsToFly: boolean): boolean {
  p.flyHold = wantsToFly ? p.flyHold + 1 : 0;
  const canFly = wantsToFly && p.jetpack && p.jetFuel > 0 && (p.flying || p.flyHold >= JETPACK.takeoffTicks) && p.vehicleId === null && p.downUntil === null;
  if (canFly) {
    p.flying = true;
    p.air = 0;
    p.jetFuel = Math.max(0, p.jetFuel - 1);
    if (p.jetFuel === 0) s.events.push({ type: 'jetpackEmpty', playerId: p.id });
    if (p.jetFuel > 0) return true;
  }
  if (!p.flying) {
    // the tank refills on the ground
    if (p.jetpack && p.air === 0 && !wantsToFly) p.jetFuel = Math.min(JETPACK.fuelTicks, p.jetFuel + JETPACK.fuelTicks / JETPACK.rechargeTicks);
    return false;
  }
  p.flying = false;
  if (!isFree(s.map, p.pos, PLAYER_RADIUS, BLOCKS_WALKER)) p.pos = landingSpot(s, p.pos);
  s.events.push({ type: 'stomp', pos: { ...p.pos }, radius: JETPACK.landRadius });
  for (const e of targets(s)) {
    if (dist(e.pos, p.pos) <= JETPACK.landRadius + e.radius) damageEnemy(s, e, JETPACK.landDamage, 'stomp', p.id);
  }
  return false;
}

/** Nearest free floor tile centre, searched outward ring by ring (no line of sight needed: we come down from above). */
function landingSpot(s: SimState, pos: Vec2): Vec2 {
  const tx = Math.floor(pos.x), tz = Math.floor(pos.z);
  for (let r = 0; r <= 8; r++) {
    let best: Vec2 | null = null;
    for (let oz = -r; oz <= r; oz++) {
      for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
        const c = { x: tx + ox + 0.5, z: tz + oz + 0.5 };
        if (tileAt(s.map, c.x, c.z) === Tile.Hazard || !isFree(s.map, c, PLAYER_RADIUS, BLOCKS_WALKER)) continue;
        if (!best || dist(c, pos) < dist(best, pos)) best = c;
      }
    }
    if (best) return best;
  }
  return { ...s.map.spawn };
}

/** Frozen or stuck monsters cannot move or attack. */
export function held(s: SimState, e: Enemy): boolean {
  return e.frozenUntil > s.tick || e.stuckUntil > s.tick;
}

