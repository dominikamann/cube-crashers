import { TOWER_SOLID_RADIUS } from '../config/towers';
import {
  BOOST_FACTOR,
  BOOST_TICKS,
  DASH_DAMAGE,
  DASH_RECHARGE_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  HAZARD_DPS,
  IDLE_EPSILON,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RESPAWN_INVULN_TICKS,
  RESPAWN_TICKS,
  REVIVE_TICKS,
  STOMP_DAMAGE,
  STOMP_KNOCKBACK,
  STOMP_RADIUS,
  REGEN_DELAY_TICKS,
} from '../config/balance';
import { JETPACK } from '../config/rare';
import { BLOCKS_AIR, BLOCKS_WALKER, isFree, moveCircle, nearestFree, Tile, tileAt } from '../map/tilemap';
import { DT, type HurtSource, type Intent, type Player, type SimState, type Vec2 } from '../types';

export const HIT_EVENT_TICKS = 15;
import { dist } from '../util';
import { DIFFICULTY } from '../config/difficulty';
import { comboMult, damageEnemy, wormShare } from './combat';
import { checkTeamWipe, loseCredit, sendToRespawn } from './coop';
import { airborne, updateFlight } from './rare';
import { CLIMB_TICKS, ladderAt } from '../map/ladders';
import { perchable } from '../map/perch';
import { carryingCube, coinOpRule, jumpTicks, pvpDamage, rivals, VERSUS, versusDeath } from './versus';
import { damageVehicle } from './vehicles';

export function damagePlayer(s: SimState, p: Player, amount: number, source: HurtSource = 'other', attackerId?: number): void {
  if (s.phase !== 'playing' || p.downUntil !== null || amount <= 0 || s.tick < p.invulnUntil) return;
  // the difficulty is about monsters; between players every hit counts the same
  if (!s.versus) amount *= DIFFICULTY[s.difficulty].enemyDamage;
  // coin-op chaos: hits between players count double
  else if (attackerId !== undefined && coinOpRule(s) === 'double') amount *= 2;
  if (p.vehicleId !== null) {
    damageVehicle(s, p.vehicleId, amount);
    return;
  }
  p.hp = Math.max(0, p.hp - amount);
  p.lastDamageAt = s.tick;
  s.stats.damageTaken += amount;
  s.stats.damageBy[source] += amount;
  // continuous damage (contact, glitch floor) would report a hit every tick; four times a second is enough
  if (s.tick - p.lastHitEventAt >= HIT_EVENT_TICKS || amount >= 5 || p.hp <= 0) {
    p.lastHitEventAt = s.tick;
    s.events.push({ type: 'playerHit', playerId: p.id, hp: p.hp });
  }
  if (p.hp > 0) return;

  if (s.versus) {
    p.stats.downs++;
    s.events.push({ type: 'playerDown', playerId: p.id });
    versusDeath(s, p, attackerId);
    return;
  }

  s.stats.downs++;
  p.stats.downs++;
  p.combo = 0;
  p.air = 0;
  p.flying = false;
  p.dashTicks = 0;
  p.plantTicks = 0;
  s.events.push({ type: 'playerDown', playerId: p.id });

  const teammateUp = s.players.some(o => o !== p && o.downUntil === null);
  if (teammateUp) {
    // a teammate can still help: wait for a revive before it costs a credit
    p.reviveUntil = s.tick + REVIVE_TICKS;
    p.reviveProgress = 0;
    p.downUntil = Number.MAX_SAFE_INTEGER;
    s.events.push({ type: 'playerDowned', playerId: p.id });
    return;
  }
  if (s.players.length > 1) {
    p.downUntil = Number.MAX_SAFE_INTEGER;
    p.reviveUntil = s.tick;
    checkTeamWipe(s);
    return;
  }
  if (!loseCredit(s)) {
    p.downUntil = s.tick + RESPAWN_TICKS;
    return;
  }
  sendToRespawn(s, p);
}

export function maxDashCharges(p: Player): number {
  return 1 + p.perks.dash;
}

function stomp(s: SimState, p: Player): void {
  const radius = STOMP_RADIUS + 0.5 * p.perks.stomp;
  const damage = STOMP_DAMAGE + 10 * p.perks.stomp;
  s.events.push({ type: 'stomp', pos: { ...p.pos }, radius });
  const under = s.enemies.filter(e => e.hp > 0 && dist(p.pos, e.pos) <= radius + e.radius);
  const part = wormShare(under);
  for (const e of under) {
    const d = dist(p.pos, e.pos);
    damageEnemy(s, e, damage * part(e), 'stomp', p.id);
    const k = STOMP_KNOCKBACK / Math.max(d, 0.2);
    e.knock.x += (e.pos.x - p.pos.x) * k;
    e.knock.z += (e.pos.z - p.pos.z) * k;
  }  // versus: a stomp lands on rivals too
  for (const r of rivals(s, p.id)) {
    if (!airborne(r) && dist(p.pos, r.pos) <= radius + PLAYER_RADIUS) damagePlayer(s, r, pvpDamage(damage), 'other', p.id);
  }
}

/**
 * The Mega Block is solid: a player walking (or dashing) into it is pushed back to its edge, where its
 * contact damage still bites. Without this you could stand inside it.
 */
function pushOutOfBosses(s: SimState, p: Player): void {
  for (const e of s.enemies) {
    // the big boss bodies (Mega Block, the Kraken, King Rex) are solid
    if ((e.kind !== 'megaBlock' && e.kind !== 'kraken' && s.boss?.enemyId !== e.id) || e.hp <= 0) continue;
    const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    const edge = e.radius + PLAYER_RADIUS * 0.6;
    if (d >= edge) continue;
    // dead centre: push toward the player's facing so they come out somewhere
    const nx = d > 0.01 ? dx / d : -p.facing.x, nz = d > 0.01 ? dz / d : -p.facing.z;
    const out = { x: e.pos.x + nx * edge, z: e.pos.z + nz * edge };
    p.pos = isFree(s.map, out, PLAYER_RADIUS, BLOCKS_WALKER) ? out : nearestFree(s.map, out, PLAYER_RADIUS, BLOCKS_WALKER);
  }
}

/** towers are solid: walking players are kept at arm's length (close enough to build, repair and upgrade) */
function pushOutOfTowers(s: SimState, p: Player, move: Vec2 | null): void {
  if (p.flying) return;
  for (const t of s.towers) {
    const dx = p.pos.x - t.pos.x, dz = p.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz);
    const edge = TOWER_SOLID_RADIUS + PLAYER_RADIUS;
    if (d >= edge) continue;
    const nx = d > 0.01 ? dx / d : -p.facing.x, nz = d > 0.01 ? dz / d : -p.facing.z;
    // slide round it instead of stopping dead: the part of the step that went in turns into a step along its
    // side, the way the player was heading; straight at it, the side that is open (a wall may be on the other)
    const tx = -nz, tz = nx;
    const along = move ? move.x * tx + move.z * tz : 0;
    const slide = Math.min(edge - d, 0.15);
    // always back on the edge: close enough to build, repair and upgrade from there
    const at = (side: number, step: number) => {
      const ox = nx * edge + tx * side * step, oz = nz * edge + tz * side * step;
      const ol = Math.hypot(ox, oz);
      return { x: t.pos.x + (ox / ol) * edge, z: t.pos.z + (oz / ol) * edge };
    };
    // look a good way round before choosing: a side that is open for a step but walled in after does not count
    const open = (side: number) => isFree(s.map, at(side, 0.6), PLAYER_RADIUS, BLOCKS_WALKER);
    const want = Math.abs(along) > 0.05 ? Math.sign(along) : 1;
    const side = open(want) || !open(-want) ? want : -want;
    const out = at(side, slide);
    p.pos = isFree(s.map, out, PLAYER_RADIUS, BLOCKS_WALKER) ? out : nearestFree(s.map, out, PLAYER_RADIUS, BLOCKS_WALKER);
  }
}

/** Walking into the wall at a ladder starts the climb up it. */
function startClimb(s: SimState, p: Player, dir: Vec2): boolean {
  const ladder = ladderAt(s.map, p.pos.x, p.pos.z);
  if (!ladder) return false;
  const tx = ladder.top.x - p.pos.x, tz = ladder.top.z - p.pos.z;
  const d = Math.hypot(tx, tz) || 1;
  if ((dir.x * tx + dir.z * tz) / d < 0.6) return false;
  p.climb = { ticks: CLIMB_TICKS, top: { ...ladder.top } };
  // step onto the ladder, against the wall
  p.pos = { x: ladder.tx + 0.5 + (tx / d) * 0.25, z: ladder.tz + 0.5 + (tz / d) * 0.25 };
  return true;
}

function updateOne(s: SimState, p: Player, it: Intent): void {
  if (p.downUntil !== null) {
    if (s.tick < p.downUntil) return;
    p.downUntil = null;
    p.hp = p.maxHp;
    p.pos = { ...p.safePoint };
    p.perched = false;
    p.climb = null;
    p.invulnUntil = s.tick + RESPAWN_INVULN_TICKS;
    s.events.push({ type: 'playerRespawn', playerId: p.id });
  }

  if (p.perks.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.perks.regen * DT);
  const easyRegen = DIFFICULTY[s.difficulty].regen;
  if (easyRegen > 0 && p.downUntil === null && s.tick - p.lastDamageAt >= REGEN_DELAY_TICKS) p.hp = Math.min(p.maxHp, p.hp + easyRegen * DT);

  if (p.combo > 0 && s.tick >= p.comboUntil) {
    if (comboMult(p) > 1) s.events.push({ type: 'comboLost', playerId: p.id });
    p.combo = 0;
  }

  if (it.select === -1) {
    if (p.rare && !p.rareSelected) {
      p.rareSelected = true;
      s.events.push({ type: 'weaponSelected', playerId: p.id, slot: -1 });
    }
  } else if (it.select !== null && it.select >= 0 && it.select < p.weapons.length && (it.select !== p.selected || p.rareSelected)) {
    p.selected = it.select;
    p.rareSelected = false;
    s.events.push({ type: 'weaponSelected', playerId: p.id, slot: p.selected });
  }

  if (p.dashCharges < maxDashCharges(p)) {
    p.dashRecharge--;
    if (p.dashRecharge <= 0) {
      p.dashCharges++;
      p.dashRecharge = p.dashCharges < maxDashCharges(p) ? DASH_RECHARGE_TICKS : 0;
    }
  }

  const before = { ...p.pos };
  const len = Math.hypot(it.move.x, it.move.z);
  const moveDir = len > 0 ? { x: it.move.x / len, z: it.move.z / len } : null;
  if (moveDir) p.facing = moveDir;

  const flying = updateFlight(s, p, it.fly);
  const turbo = coinOpRule(s) === 'turbo' ? VERSUS.turbo : 1;

  // vehicles move their driver (see vehicles.ts)
  if (p.climb) {
    // up the ladder, hand over hand; at the top you stand on the wall
    p.flying = false;
    if (--p.climb.ticks <= 0) {
      p.pos = { ...p.climb.top };
      p.perched = true;
      p.climb = null;
    }
  } else if (p.vehicleId === null && !flying && !p.perched && moveDir && p.dashTicks === 0 && p.air === 0 && startClimb(s, p, moveDir)) {
    // just took hold of a ladder
  } else if (flying && moveDir) {
    const speed = PLAYER_SPEED * JETPACK.speedFactor * (1 + 0.12 * p.perks.speed) * turbo * Math.min(len, 1);
    // over everything, but never past the outer wall of the map
    p.pos.x = Math.min(s.map.w - 1 - PLAYER_RADIUS, Math.max(1 + PLAYER_RADIUS, p.pos.x + moveDir.x * speed * DT));
    p.pos.z = Math.min(s.map.h - 1 - PLAYER_RADIUS, Math.max(1 + PLAYER_RADIUS, p.pos.z + moveDir.z * speed * DT));
  } else if (p.perched && p.vehicleId === null && !flying) {
    // on top of a wall: walk along it; step off the edge and you drop to the floor
    if (moveDir) {
      const speed = PLAYER_SPEED * (1 + 0.12 * p.perks.speed) * turbo * Math.min(len, 1);
      p.pos.x = Math.min(s.map.w - 1 - PLAYER_RADIUS, Math.max(1 + PLAYER_RADIUS, p.pos.x + moveDir.x * speed * DT));
      p.pos.z = Math.min(s.map.h - 1 - PLAYER_RADIUS, Math.max(1 + PLAYER_RADIUS, p.pos.z + moveDir.z * speed * DT));
    }
    if (!perchable(s.map, p.pos.x, p.pos.z)) {
      p.perched = false;
      if (!isFree(s.map, p.pos, PLAYER_RADIUS, BLOCKS_WALKER)) p.pos = nearestFree(s.map, p.pos, PLAYER_RADIUS, BLOCKS_WALKER);
    }
  } else if (p.vehicleId === null && !flying) {
    if (it.dash && p.dashCharges > 0 && p.dashTicks === 0 && p.air === 0) {
      p.dashCharges--;
      if (p.dashRecharge <= 0) p.dashRecharge = DASH_RECHARGE_TICKS;
      p.dashTicks = DASH_TICKS;
      p.dashDir = { ...p.facing };
      p.dashHits = [];
      p.invulnUntil = Math.max(p.invulnUntil, s.tick + DASH_TICKS);
      s.events.push({ type: 'dash', playerId: p.id });
    }

    if (p.dashTicks > 0) {
      p.dashTicks--;
      moveCircle(s.map, p.pos, p.dashDir.x * DASH_SPEED * DT, p.dashDir.z * DASH_SPEED * DT, PLAYER_RADIUS, BLOCKS_WALKER);
      for (const e of s.enemies) {
        if (e.hp <= 0 || p.dashHits.includes(e.id)) continue;
        if (dist(p.pos, e.pos) > e.radius + PLAYER_RADIUS + 0.3) continue;
        p.dashHits.push(e.id);
        damageEnemy(s, e, DASH_DAMAGE, 'dash', p.id);
      }
    } else if (moveDir) {
      const boost = s.tick < p.boostUntil ? BOOST_FACTOR : 1;
      const carry = carryingCube(s, p) ? VERSUS.carrySpeed : 1;
      const speed = PLAYER_SPEED * (1 + 0.12 * p.perks.speed) * boost * carry * turbo * Math.min(len, 1);
      // in the air you clear barriers (low walls), only real walls stop you
      moveCircle(s.map, p.pos, moveDir.x * speed * DT, moveDir.z * speed * DT, PLAYER_RADIUS, p.air > 0 ? BLOCKS_AIR : BLOCKS_WALKER);
    }

    pushOutOfBosses(s, p);
    pushOutOfTowers(s, p, p.dashTicks > 0 ? p.dashDir : moveDir ?? null);

    if (it.jump && p.air === 0 && p.dashTicks === 0 && !p.flying && s.run.stage !== 'maze') {
      p.air = jumpTicks(s);
      s.events.push({ type: 'jump', playerId: p.id });
    } else if (p.air > 0) {
      p.air--;
      if (p.air === 0) {
        // landed on top of a barrier: step off it
        if (!isFree(s.map, p.pos, PLAYER_RADIUS, BLOCKS_WALKER)) p.pos = nearestFree(s.map, p.pos, PLAYER_RADIUS, BLOCKS_WALKER);
        stomp(s, p);
      }
    }

    if (p.air === 0) {
      const tile = tileAt(s.map, p.pos.x, p.pos.z);
      if (tile === Tile.Hazard) damagePlayer(s, p, HAZARD_DPS * DT, 'glitch');
      if (tile === Tile.Boost) {
        if (s.tick >= p.boostUntil) s.events.push({ type: 'boost', playerId: p.id });
        p.boostUntil = s.tick + BOOST_TICKS;
      }
    }
  }

  if (it.aim) p.aimPoint = { ...it.aim };
  const ax = p.aimPoint.x - p.pos.x, az = p.aimPoint.z - p.pos.z;
  const al = Math.hypot(ax, az);
  if (al > 0.05) p.aim = { x: ax / al, z: az / al };

  const moved = dist(before, p.pos);
  s.stats.distance += moved;
  if (moved < IDLE_EPSILON && p.downUntil === null) s.stats.idleTicks++;
}

export function updatePlayers(s: SimState, intents: Map<number, Intent>): void {
  for (const p of s.players) {
    const it = intents.get(p.id);
    if (it) updateOne(s, p, it);
  }
}

