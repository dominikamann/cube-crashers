import { BOOST_FACTOR, BOOST_TICKS, PLAYER_RADIUS } from '../config/balance';
import { BLOCKS_AIR, BLOCKS_KART, BLOCKS_WALKER, isFree, moveCircle, nearestFree, Tile, tileAt } from '../map/tilemap';
import { DT, type Intent, type Player, type SimState, type Vec2, type Vehicle } from '../types';
import { dist } from '../util';
import { damageEnemy, damageInRadius } from './combat';

export const KART = {
  speed: 12,
  accel: 30,
  friction: 10,
  radius: 0.7,
  hp: 100,
  fuelTicks: 1200,
  enterRange: 1.8,
  ramSpeed: 4,
  ramDamage: 40,
  ramKnockback: 8,
  ramCooldownTicks: 30,
  ramCostSmall: 2,
  ramCostBig: 10,
  rampSpeed: 6,
  airTicks: 48,
  landRadius: 2.5,
  landDamage: 30,
  respawnTicks: 2700,
  startKarts: 2,
  ejectInvulnTicks: 60,
};

export function addKart(s: SimState, pos: Vec2, spot: number): Vehicle {
  const v: Vehicle = {
    id: s.nextId++,
    kind: 'kart',
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    hp: KART.hp,
    fuel: KART.fuelTicks,
    driverId: null,
    air: 0,
    spot,
  };
  s.vehicles.push(v);
  return v;
}

export function placeStartKarts(s: SimState): void {
  const spots = s.map.vehicleSpots.map((_, i) => i);
  for (let n = 0; n < KART.startKarts && spots.length > 0; n++) {
    const [spot] = spots.splice(Math.floor(s.rng.next() * spots.length), 1);
    addKart(s, s.map.vehicleSpots[spot], spot);
  }
}

/** Damage meant for a driver hits the kart instead. */
export function damageVehicle(s: SimState, vehicleId: number, amount: number): void {
  const v = s.vehicles.find(x => x.id === vehicleId);
  if (v) v.hp -= amount;
}

function leave(s: SimState, p: Player, v: Vehicle): void {
  p.vehicleId = null;
  v.driverId = null;
  p.pos = nearestFree(s.map, v.pos, PLAYER_RADIUS, BLOCKS_WALKER, 1.2);
}

function toggle(s: SimState, p: Player): void {
  if (p.vehicleId !== null) {
    const v = s.vehicles.find(x => x.id === p.vehicleId);
    if (v) {
      v.vel = { x: 0, z: 0 };
      leave(s, p, v);
    } else p.vehicleId = null;
    return;
  }
  if (p.air > 0 || p.dashTicks > 0) return;
  const v = s.vehicles
    .filter(x => x.driverId === null && dist(x.pos, p.pos) <= KART.enterRange)
    .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0];
  if (!v) return;
  v.driverId = p.id;
  p.vehicleId = v.id;
  p.pos = { ...v.pos };
  p.plantTicks = 0;
  s.events.push({ type: 'kartEnter', playerId: p.id });
}

function approach(v: Vec2, target: Vec2, step: number): void {
  const dx = target.x - v.x, dz = target.z - v.z;
  const d = Math.hypot(dx, dz);
  if (d <= step) {
    v.x = target.x;
    v.z = target.z;
  } else {
    v.x += (dx / d) * step;
    v.z += (dz / d) * step;
  }
}

function drive(s: SimState, v: Vehicle, driver: Player | undefined, it: Intent | undefined): void {
  const len = it ? Math.hypot(it.move.x, it.move.z) : 0;
  if (driver && it && len > 0) {
    const top = KART.speed * (s.tick < driver.boostUntil ? BOOST_FACTOR : 1);
    approach(v.vel, { x: (it.move.x / len) * top, z: (it.move.z / len) * top }, KART.accel * DT);
    driver.facing = { x: it.move.x / len, z: it.move.z / len };
  } else {
    approach(v.vel, { x: 0, z: 0 }, KART.friction * DT);
  }

  const hit = moveCircle(s.map, v.pos, v.vel.x * DT, v.vel.z * DT, KART.radius, v.air > 0 ? BLOCKS_AIR : BLOCKS_KART);
  if (hit.hitX) v.vel.x = 0;
  if (hit.hitZ) v.vel.z = 0;
  const speed = Math.hypot(v.vel.x, v.vel.z);
  if (driver && speed > 1) v.fuel--;

  if (v.air > 0) {
    v.air--;
    if (v.air === 0) {
      if (!isFree(s.map, v.pos, KART.radius, BLOCKS_KART)) {
        // still above a low wall: glide on while moving, otherwise drop beside it
        if (speed > 1) v.air = 1;
        else v.pos = nearestFree(s.map, v.pos, KART.radius, BLOCKS_KART);
      }
      if (v.air === 0) {
        damageInRadius(s, v.pos, KART.landRadius, KART.landDamage, 'kart', driver?.id);
        s.events.push({ type: 'kartLand', pos: { ...v.pos } });
      }
    }
    return;
  }

  const tile = tileAt(s.map, v.pos.x, v.pos.z);
  if (tile === Tile.Ramp && speed > KART.rampSpeed) {
    v.air = KART.airTicks;
    s.events.push({ type: 'kartJump', pos: { ...v.pos } });
    return;
  }
  if (tile === Tile.Boost && driver) {
    if (s.tick >= driver.boostUntil) s.events.push({ type: 'boost', playerId: driver.id });
    driver.boostUntil = s.tick + BOOST_TICKS;
  }

  if (!driver || speed <= KART.ramSpeed) return;
  for (const e of s.enemies) {
    if (e.hp <= 0 || s.tick < e.ramHitUntil || dist(e.pos, v.pos) > KART.radius + e.radius) continue;
    e.ramHitUntil = s.tick + KART.ramCooldownTicks;
    e.knock.x += (v.vel.x / speed) * KART.ramKnockback;
    e.knock.z += (v.vel.z / speed) * KART.ramKnockback;
    v.hp -= e.kind === 'tank' || e.elite ? KART.ramCostBig : KART.ramCostSmall;
    damageEnemy(s, e, KART.ramDamage, 'kart', driver.id);
    s.events.push({ type: 'kartRam', pos: { ...e.pos } });
  }
}

export function updateVehicles(s: SimState, intents: Map<number, Intent>): void {
  for (const p of s.players) {
    if (p.downUntil === null && intents.get(p.id)?.use) toggle(s, p);
  }

  for (const r of s.vehicleRespawns) {
    if (s.tick >= r.at) addKart(s, s.map.vehicleSpots[r.spot], r.spot);
  }
  s.vehicleRespawns = s.vehicleRespawns.filter(r => s.tick < r.at);

  s.vehicles = s.vehicles.filter(v => {
    const driver = v.driverId !== null ? s.players.find(p => p.id === v.driverId) : undefined;
    drive(s, v, driver, driver ? intents.get(driver.id) : undefined);
    if (driver) driver.pos = { ...v.pos };
    if (v.hp > 0 && v.fuel > 0) return true;
    s.events.push({ type: 'kartDestroyed', pos: { ...v.pos } });
    if (driver) {
      leave(s, driver, v);
      driver.invulnUntil = Math.max(driver.invulnUntil, s.tick + KART.ejectInvulnTicks);
    }
    s.vehicleRespawns.push({ spot: v.spot, at: s.tick + KART.respawnTicks });
    return false;
  });
}
