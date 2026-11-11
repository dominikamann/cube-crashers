import { ALARM_SPEED_STEP, BOMBER, FLOW_REBUILD_TICKS, PLAYER_RADIUS, RAMMER, ROAM_SPEED_FACTOR, SHOOTER } from '../config/balance';
import { ELITE, ENEMIES } from '../config/enemies';
import { RARE } from '../config/rare';
import { buildFlowField, flowDir } from '../map/flowfield';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos, moveCircle } from '../map/tilemap';
import { DT, type Enemy, type EnemyKind, type Horde, type Player, type SimState, type Vec2 } from '../types';
import { dist } from '../util';
import { damageEnemy, explode } from './combat';
import { airborne, held } from './rare';
import { damagePlayer } from './player';

export function spawnEnemy(s: SimState, kind: EnemyKind, pos: Vec2, opts: { hordeId?: number; elite?: boolean } = {}): Enemy {
  const def = ENEMIES[kind];
  const elite = opts.elite ?? false;
  const hp = def.hp * (elite ? ELITE.hp : 1);
  const e: Enemy = {
    id: s.nextId++,
    kind,
    pos: { ...pos },
    hp,
    maxHp: hp,
    speed: def.speed,
    slowUntil: -1,
    radius: def.radius * (elite ? ELITE.radius : 1),
    hordeId: opts.hordeId ?? null,
    elite,
    state: 'move',
    stateUntil: 0,
    dir: { x: 0, z: 1 },
    knock: { x: 0, z: 0 },
    cooldownUntil: 0,
    ramHitUntil: 0,
    chargeLeft: 0,
    chill: 0,
    frozenUntil: 0,
    stuckUntil: 0,
    slamUntil: 0,
  };
  s.enemies.push(e);
  return e;
}

function flowField(s: SimState): Int16Array {
  if (!s.flow || s.tick - s.flow.builtAt >= FLOW_REBUILD_TICKS) {
    const targets = s.players.filter(p => p.downUntil === null).map(p => p.pos);
    s.flow = { field: buildFlowField(s.map, targets, BLOCKS_ENEMY), builtAt: s.tick };
  }
  return s.flow.field;
}

function unit(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  return d > 1e-6 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 };
}

function nearestPlayer(players: Player[], pos: Vec2): { p: Player; d: number } | null {
  let best: { p: Player; d: number } | null = null;
  for (const p of players) {
    const d = dist(p.pos, pos);
    if (!best || d < best.d) best = { p, d };
  }
  return best;
}

function startWindup(s: SimState, e: Enemy, target: Vec2, ticks: number, state: 'windup' | 'fuse'): void {
  e.state = state;
  e.stateUntil = s.tick + ticks;
  const dir = unit(e.pos, target);
  if (dir.x !== 0 || dir.z !== 0) e.dir = dir;
  s.events.push({ type: 'enemyWindup', id: e.id, kind: e.kind, pos: { ...e.pos }, dir: { ...e.dir } });
}

function shoot(s: SimState, e: Enemy): void {
  s.projectiles.push({
    id: s.nextId++,
    kind: 'explosion',
    behavior: 'bolt',
    hostile: true,
    pos: { ...e.pos },
    vel: { x: e.dir.x * SHOOTER.bulletSpeed, z: e.dir.z * SHOOTER.bulletSpeed },
    damage: SHOOTER.damage,
    pierce: 0,
    until: s.tick + 180,
    hitIds: [],
    ownerId: -1,
  });
  s.events.push({ type: 'enemyShot', pos: { ...e.pos } });
}

/** Moves a charging rammer and resolves what it runs into. */
function charge(s: SimState, e: Enemy, players: Player[]): void {
  const step = RAMMER.speed * DT;
  const hit = moveCircle(s.map, e.pos, e.dir.x * step, e.dir.z * step, e.radius, BLOCKS_ENEMY);
  e.chargeLeft -= step;
  const stun = (ticks: number) => {
    e.state = 'stunned';
    e.stateUntil = s.tick + ticks;
    e.cooldownUntil = s.tick + RAMMER.cooldownTicks;
  };
  for (const p of players) {
    if (airborne(p) || s.tick < p.invulnUntil) continue;
    if (dist(p.pos, e.pos) > e.radius + PLAYER_RADIUS + (p.vehicleId !== null ? 0.3 : 0)) continue;
    damagePlayer(s, p, RAMMER.damage);
    moveCircle(s.map, p.pos, e.dir.x * 1.5, e.dir.z * 1.5, PLAYER_RADIUS, BLOCKS_WALKER);
    stun(RAMMER.hitStunTicks);
    return;
  }
  for (const t of s.towers) {
    if (dist(t.pos, e.pos) > e.radius + 0.7) continue;
    t.hp -= RAMMER.towerDamage;
    stun(RAMMER.stunTicks);
    return;
  }
  if (hit.hitX || hit.hitZ) stun(RAMMER.stunTicks);
  else if (e.chargeLeft <= 0) {
    e.state = 'move';
    e.cooldownUntil = s.tick + RAMMER.cooldownTicks;
  }
}

/** Desired walking direction and speed factor of an enemy in the 'move' state; may start a windup. */
function think(s: SimState, e: Enemy, horde: Horde | undefined, players: Player[], field: Int16Array): { dir: Vec2; factor: number } {
  const still = { dir: { x: 0, z: 0 }, factor: 0 };
  if (horde && !horde.aggro) {
    return dist(e.pos, horde.waypoint) > 2 ? { dir: unit(e.pos, horde.waypoint), factor: ROAM_SPEED_FACTOR } : still;
  }
  const target = nearestPlayer(players, e.pos);
  if (!target) return still;
  const { p, d } = target;
  const los = d < 12 && hasLos(s.map, e.pos, p.pos);
  const chase = { dir: d < 1.5 && los ? unit(e.pos, p.pos) : flowDir(s.map, field, e.pos), factor: 1 };

  switch (e.kind) {
    case 'shooter':
      if (los && d <= SHOOTER.fireRange && s.tick >= e.cooldownUntil) {
        startWindup(s, e, p.pos, SHOOTER.windupTicks, 'windup');
        return still;
      }
      if (los && d < SHOOTER.min) return { dir: unit(p.pos, e.pos), factor: 1 };
      return !los || d > SHOOTER.max ? chase : still;
    case 'bomber':
      if (los && d <= BOMBER.trigger + e.radius) {
        startWindup(s, e, p.pos, BOMBER.fuseTicks, 'fuse');
        return still;
      }
      return chase;
    case 'rammer':
      if (los && d < RAMMER.range && s.tick >= e.cooldownUntil) {
        startWindup(s, e, p.pos, RAMMER.windupTicks, 'windup');
        return still;
      }
      return chase;
    default:
      return chase;
  }
}

function contactDamage(s: SimState, players: Player[]): void {
  for (const e of s.enemies) {
    if (e.hp <= 0 || e.state === 'stunned' || held(s, e)) continue;
    const dps = ENEMIES[e.kind].contactDamage * (e.elite ? ELITE.contact : 1);
    if (dps === 0) continue;
    for (const p of players) {
      if (airborne(p) || p.vehicleId !== null) continue;
      if (dist(p.pos, e.pos) < e.radius + PLAYER_RADIUS) damagePlayer(s, p, dps * DT);
    }
  }
}

const CELL_KEY = (x: number, z: number) => Math.floor(x) + Math.floor(z) * 1024;
const SEPARATION = 3;

export function updateEnemies(s: SimState): void {
  const field = flowField(s);
  const players = s.players.filter(p => p.downUntil === null);
  const hordes = new Map(s.hordes.map(h => [h.id, h]));
  const alarmSpeed = 1 + ALARM_SPEED_STEP * s.alarm.level;

  const grid = new Map<number, Enemy[]>();
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const key = CELL_KEY(e.pos.x, e.pos.z);
    const cell = grid.get(key);
    if (cell) cell.push(e);
    else grid.set(key, [e]);
  }

  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    let dir = { x: 0, z: 0 };
    let factor = 0;

    if (e.state !== 'move' && e.state !== 'charge' && s.tick >= e.stateUntil) {
      if (e.state === 'fuse') {
        e.hp = 0;
        explode(s, e.pos, BOMBER.radius, { player: BOMBER.player, enemy: BOMBER.enemy, tower: BOMBER.tower }, 'explosion');
        continue;
      }
      if (e.state === 'windup' && e.kind === 'shooter') {
        shoot(s, e);
        e.cooldownUntil = s.tick + SHOOTER.cooldownTicks;
        e.state = 'move';
      } else if (e.state === 'windup' && e.kind === 'rammer') {
        e.state = 'charge';
        e.chargeLeft = RAMMER.distance;
      } else {
        e.state = 'move';
      }
    }

    const isHeld = held(s, e);
    if (e.state === 'charge' && !isHeld) {
      charge(s, e, players);
      continue;
    }
    if (e.state === 'move' && !isHeld) ({ dir, factor } = think(s, e, e.hordeId !== null ? hordes.get(e.hordeId) : undefined, players, field));
    if (factor > 0 && (dir.x !== 0 || dir.z !== 0)) e.dir = dir;

    const slow = e.slowUntil > s.tick ? 0.5 : 1;
    let vx = dir.x * e.speed * factor * slow * alarmSpeed + e.knock.x;
    let vz = dir.z * e.speed * factor * slow * alarmSpeed + e.knock.z;
    e.knock.x *= 0.85;
    e.knock.z *= 0.85;
    if (Math.abs(e.knock.x) + Math.abs(e.knock.z) < 0.05) e.knock = { x: 0, z: 0 };

    // keep a little distance from the neighbours so a horde does not collapse into one point
    const cx = Math.floor(e.pos.x), cz = Math.floor(e.pos.z);
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cell = grid.get(cx + ox + (cz + oz) * 1024);
        if (!cell) continue;
        for (const o of cell) {
          if (o === e) continue;
          const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
          const d = Math.hypot(dx, dz);
          const min = e.radius + o.radius;
          if (d >= min || d < 1e-4) continue;
          const push = ((min - d) / min) * SEPARATION;
          vx += (dx / d) * push;
          vz += (dz / d) * push;
        }
      }
    }

    if (e.frozenUntil > s.tick) {
      // frozen solid: only a blast of air moves it
      vx = e.knock.x;
      vz = e.knock.z;
    }
    if (vx !== 0 || vz !== 0) {
      const hit = moveCircle(s.map, e.pos, vx * DT, vz * DT, e.radius, BLOCKS_ENEMY);
      const knock = Math.hypot(e.knock.x, e.knock.z);
      if ((hit.hitX || hit.hitZ) && knock >= RARE.blower.slamSpeed && s.tick >= e.slamUntil) {
        e.slamUntil = s.tick + RARE.blower.slamCooldownTicks;
        e.knock = { x: 0, z: 0 };
        damageEnemy(s, e, RARE.blower.slamDamage, 'leafBlower');
      }
    }
  }

  contactDamage(s, players);
}
