import { carryingCube, pvpDamage, rivals } from './versus';
import { damagePlayer } from './player';
import { airborne } from './rare';
import { BOOST_FACTOR, BOOST_TICKS, PLAYER_RADIUS } from '../config/balance';
import { BLOCKS_AIR, BLOCKS_KART, BLOCKS_WALKER, isFree, moveCircle, nearestFree, Tile, tileAt } from '../map/tilemap';
import { DT, type Intent, type Player, type SimState, type Vec2, type Vehicle, type VehicleKind } from '../types';
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

/** What each vehicle can do. The kart is the all-rounder. */
export const VEHICLES: Record<VehicleKind, { speed: number; accel: number; hp: number; ramDamage: number; radius: number; jumps: boolean; hovers: boolean }> = {
  kart: { speed: KART.speed, accel: KART.accel, hp: KART.hp, ramDamage: KART.ramDamage, radius: KART.radius, jumps: true, hovers: false },
  // slow and heavy: flattens everything, does not fly off ramps
  roller: { speed: KART.speed * 0.7, accel: 18, hp: 250, ramDamage: 80, radius: 0.9, jumps: false, hovers: false },
  // fast and light: floats over glitch floor and low walls, no ramming
  hoverboard: { speed: KART.speed * 1.3, accel: 36, hp: 60, ramDamage: 0, radius: 0.6, jumps: false, hovers: true },
  // rare and magic: fast, leaps off ramps, spears monsters with its horn, never runs out of steam
  unicorn: { speed: KART.speed * 1.2, accel: 34, hp: 120, ramDamage: 60, radius: 0.7, jumps: true, hovers: false },
};

/** a unicorn turns up on its own now and then: every `checkTicks` the game rolls `chance` */
export const UNICORN = { checkTicks: 60 * 60, chance: 0.2 };

export function addKart(s: SimState, pos: Vec2, spot: number): Vehicle {
  return addVehicle(s, 'kart', pos, spot);
}

export function addVehicle(s: SimState, kind: VehicleKind, pos: Vec2, spot: number): Vehicle {
  const v: Vehicle = {
    id: s.nextId++,
    kind,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    hp: VEHICLES[kind].hp,
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
  const extras = s.unlocks.vehicles.filter(k => k !== 'kart');
  for (let n = 0; n < KART.startKarts && spots.length > 0; n++) {
    const [spot] = spots.splice(Math.floor(s.rng.next() * spots.length), 1);
    // the first is always a kart; the second may be something unlocked
    const kind = n > 0 && extras.length > 0 && s.rng.next() < 0.6 ? s.rng.pick(extras) : 'kart';
    addVehicle(s, kind, s.map.vehicleSpots[spot], spot);
  }
}

/** Damage meant for a driver hits the kart instead. */
export function damageVehicle(s: SimState, vehicleId: number, amount: number): void {
  const v = s.vehicles.find(x => x.id === vehicleId);
  // the rally's karts cannot be wrecked: nobody is thrown out of the race
  if (v && s.run.stage !== 'race') v.hp -= amount;
}

function leave(s: SimState, p: Player, v: Vehicle): void {
  p.vehicleId = null;
  v.driverId = null;
  p.pos = nearestFree(s.map, v.pos, PLAYER_RADIUS, BLOCKS_WALKER, 1.2);
}

function toggle(s: SimState, p: Player): void {
  if (p.vehicleId !== null) {
    const v = s.vehicles.find(x => x.id === p.vehicleId);
    // race karts keep their driver until the race is over
    if (v?.locked) return;
    if (v) {
      v.vel = { x: 0, z: 0 };
      leave(s, p, v);
    } else p.vehicleId = null;
    return;
  }
  // a cube carrier walks
  if (p.air > 0 || p.dashTicks > 0 || carryingCube(s, p)) return;
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
  const stats = VEHICLES[v.kind];
  const len = it ? Math.hypot(it.move.x, it.move.z) : 0;
  if (driver && it && len > 0) {
    const top = stats.speed * (s.tick < driver.boostUntil ? BOOST_FACTOR : 1);
    approach(v.vel, { x: (it.move.x / len) * top, z: (it.move.z / len) * top }, stats.accel * DT);
    driver.facing = { x: it.move.x / len, z: it.move.z / len };
  } else {
    approach(v.vel, { x: 0, z: 0 }, KART.friction * DT);
  }

  const blocks = v.air > 0 || stats.hovers ? BLOCKS_AIR : BLOCKS_KART;
  const hit = moveCircle(s.map, v.pos, v.vel.x * DT, v.vel.z * DT, stats.radius, blocks);
  if (hit.hitX) v.vel.x = 0;
  if (hit.hitZ) v.vel.z = 0;
  const speed = Math.hypot(v.vel.x, v.vel.z);
  if (driver && speed > 1 && !v.locked && v.kind !== 'unicorn') v.fuel--;

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
  if (tile === Tile.Ramp && speed > KART.rampSpeed && stats.jumps) {
    v.air = KART.airTicks;
    s.events.push({ type: 'kartJump', pos: { ...v.pos } });
    return;
  }
  if (tile === Tile.Boost && driver) {
    if (s.tick >= driver.boostUntil) s.events.push({ type: 'boost', playerId: driver.id });
    driver.boostUntil = s.tick + BOOST_TICKS;
  }

  if (!driver || speed <= KART.ramSpeed || stats.ramDamage === 0) return;
  for (const e of s.enemies) {
    if (e.hp <= 0 || s.tick < e.ramHitUntil || dist(e.pos, v.pos) > stats.radius + e.radius) continue;
    e.ramHitUntil = s.tick + KART.ramCooldownTicks;
    e.knock.x += (v.vel.x / speed) * KART.ramKnockback;
    e.knock.z += (v.vel.z / speed) * KART.ramKnockback;
    if (v.kind === 'kart' && s.run.stage !== 'race') v.hp -= e.kind === 'tank' || e.elite ? KART.ramCostBig : KART.ramCostSmall;
    if (v.kind === 'unicorn') v.hp -= KART.ramCostSmall;
    damageEnemy(s, e, stats.ramDamage, 'kart', driver.id);
    s.events.push({ type: 'kartRam', pos: { ...e.pos } });
  }
  // versus: a kart or unicorn at speed runs rivals over too (not those flying or up on a wall)
  for (const r of rivals(s, driver.id)) {
    if (r.vehicleId !== null || airborne(r) || r.perched || dist(r.pos, v.pos) > stats.radius + PLAYER_RADIUS) continue;
    v.rammedUntil ??= {};
    if (s.tick < (v.rammedUntil[r.id] ?? 0)) continue;
    v.rammedUntil[r.id] = s.tick + KART.ramCooldownTicks;
    moveCircle(s.map, r.pos, (v.vel.x / speed) * 1.2, (v.vel.z / speed) * 1.2, PLAYER_RADIUS, BLOCKS_WALKER);
    damagePlayer(s, r, pvpDamage(stats.ramDamage), 'other', driver.id);
    s.events.push({ type: 'kartRam', pos: { ...r.pos } });
  }
}

export function updateVehicles(s: SimState, intents: Map<number, Intent>): void {
  for (const p of s.players) {
    if (p.downUntil === null && intents.get(p.id)?.use) toggle(s, p);
  }

  for (const r of s.vehicleRespawns) {
    if (s.tick >= r.at) addVehicle(s, r.kind, s.map.vehicleSpots[r.spot], r.spot);
  }
  s.vehicleRespawns = s.vehicleRespawns.filter(r => s.tick < r.at);

  s.vehicles = s.vehicles.filter(v => {
    const driver = v.driverId !== null ? s.players.find(p => p.id === v.driverId) : undefined;
    drive(s, v, driver, driver ? intents.get(driver.id) : undefined);
    if (driver) driver.pos = { ...v.pos };
    if (v.hp > 0 && v.fuel > 0) return true;
    // a wrecked race kart is the race's business (it comes back at the last checkpoint)
    if (v.locked) return true;
    s.events.push({ type: 'kartDestroyed', pos: { ...v.pos } });
    if (driver) {
      leave(s, driver, v);
      driver.invulnUntil = Math.max(driver.invulnUntil, s.tick + KART.ejectInvulnTicks);
    }
    // a unicorn is a lucky find: it does not come back where it was
    if (v.kind !== 'unicorn') s.vehicleRespawns.push({ spot: v.spot, at: s.tick + KART.respawnTicks, kind: v.kind });
    return false;
  });
  maybeUnicorn(s);
}

/** Now and then a unicorn trots in at a free vehicle spot (one at a time, only where there are such spots). */
function maybeUnicorn(s: SimState): void {
  s.nextUnicornAt ??= s.tick + UNICORN.checkTicks;
  if (s.tick < s.nextUnicornAt) return;
  s.nextUnicornAt = s.tick + UNICORN.checkTicks;
  if (s.run.stage !== 'floor' || s.vehicles.some(v => v.kind === 'unicorn') || s.rng.next() >= UNICORN.chance) return;
  const free = s.map.vehicleSpots.map((pos, spot) => ({ pos, spot })).filter(x => !s.vehicles.some(v => dist(v.pos, x.pos) < 2));
  if (free.length === 0) return;
  const at = s.rng.pick(free);
  addVehicle(s, 'unicorn', at.pos, at.spot);
  s.events.push({ type: 'unicornAppeared', pos: { ...at.pos } });
}
