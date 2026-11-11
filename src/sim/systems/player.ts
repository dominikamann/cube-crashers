import {
  BOOST_FACTOR,
  BOOST_TICKS,
  DASH_DAMAGE,
  DASH_RECHARGE_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  DOWN_COIN_LOSS,
  HAZARD_DPS,
  IDLE_EPSILON,
  JUMP_TICKS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RESPAWN_INVULN_TICKS,
  RESPAWN_TICKS,
  STOMP_DAMAGE,
  STOMP_KNOCKBACK,
  STOMP_RADIUS,
} from '../config/balance';
import { JETPACK } from '../config/rare';
import { BLOCKS_WALKER, moveCircle, Tile, tileAt } from '../map/tilemap';
import { DT, type Intent, type Player, type SimState } from '../types';

export const HIT_EVENT_TICKS = 15;
import { dist } from '../util';
import { comboMult, damageEnemy } from './combat';
import { updateFlight } from './rare';
import { damageVehicle } from './vehicles';

export function damagePlayer(s: SimState, p: Player, amount: number): void {
  if (s.phase !== 'playing' || p.downUntil !== null || amount <= 0 || s.tick < p.invulnUntil) return;
  if (p.vehicleId !== null) {
    damageVehicle(s, p.vehicleId, amount);
    return;
  }
  p.hp = Math.max(0, p.hp - amount);
  s.stats.damageTaken += amount;
  // continuous damage (contact, glitch floor) would report a hit every tick; four times a second is enough
  if (s.tick - p.lastHitEventAt >= HIT_EVENT_TICKS || amount >= 5 || p.hp <= 0) {
    p.lastHitEventAt = s.tick;
    s.events.push({ type: 'playerHit', playerId: p.id, hp: p.hp });
  }
  if (p.hp > 0) return;

  s.credits--;
  s.stats.downs++;
  p.combo = 0;
  p.air = 0;
  p.flying = false;
  p.dashTicks = 0;
  p.plantTicks = 0;
  s.events.push({ type: 'playerDown', playerId: p.id }, { type: 'creditLost', credits: s.credits });
  p.downUntil = s.tick + RESPAWN_TICKS;
  if (s.credits <= 0) {
    s.phase = 'lost';
    s.events.push({ type: 'gameLost' });
    return;
  }
  p.coins -= Math.floor(p.coins * DOWN_COIN_LOSS);
}

export function maxDashCharges(p: Player): number {
  return 1 + p.perks.dash;
}

function stomp(s: SimState, p: Player): void {
  const radius = STOMP_RADIUS + 0.5 * p.perks.stomp;
  const damage = STOMP_DAMAGE + 10 * p.perks.stomp;
  s.events.push({ type: 'stomp', pos: { ...p.pos }, radius });
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(p.pos, e.pos);
    if (d > radius + e.radius) continue;
    damageEnemy(s, e, damage, 'stomp', p.id);
    const k = STOMP_KNOCKBACK / Math.max(d, 0.2);
    e.knock.x += (e.pos.x - p.pos.x) * k;
    e.knock.z += (e.pos.z - p.pos.z) * k;
  }
}

function updateOne(s: SimState, p: Player, it: Intent): void {
  if (p.downUntil !== null) {
    if (s.tick < p.downUntil) return;
    p.downUntil = null;
    p.hp = p.maxHp;
    p.pos = { ...p.safePoint };
    p.invulnUntil = s.tick + RESPAWN_INVULN_TICKS;
    s.events.push({ type: 'playerRespawn', playerId: p.id });
  }

  if (p.perks.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.perks.regen * DT);

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

  // vehicles move their driver (see vehicles.ts)
  if (flying && moveDir) {
    const speed = PLAYER_SPEED * JETPACK.speedFactor * (1 + 0.12 * p.perks.speed) * Math.min(len, 1);
    // over everything, but never past the outer wall of the map
    p.pos.x = Math.min(s.map.w - 1 - PLAYER_RADIUS, Math.max(1 + PLAYER_RADIUS, p.pos.x + moveDir.x * speed * DT));
    p.pos.z = Math.min(s.map.h - 1 - PLAYER_RADIUS, Math.max(1 + PLAYER_RADIUS, p.pos.z + moveDir.z * speed * DT));
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
      const speed = PLAYER_SPEED * (1 + 0.12 * p.perks.speed) * boost * Math.min(len, 1);
      moveCircle(s.map, p.pos, moveDir.x * speed * DT, moveDir.z * speed * DT, PLAYER_RADIUS, BLOCKS_WALKER);
    }

    if (it.jump && p.air === 0 && p.dashTicks === 0 && p.jetFuel === 0) {
      p.air = JUMP_TICKS;
      s.events.push({ type: 'jump', playerId: p.id });
    } else if (p.air > 0) {
      p.air--;
      if (p.air === 0) stomp(s, p);
    }

    if (p.air === 0) {
      const tile = tileAt(s.map, p.pos.x, p.pos.z);
      if (tile === Tile.Hazard) damagePlayer(s, p, HAZARD_DPS * DT);
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

