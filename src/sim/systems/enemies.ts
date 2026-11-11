import { PLAYER_RADIUS } from '../config/balance';
import { ELITE, ENEMIES } from '../config/enemies';
import { DT, type Enemy, type EnemyKind, type SimState, type Vec2 } from '../types';
import { dist } from '../util';
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
  };
  s.enemies.push(e);
  return e;
}

export function contactDamage(s: SimState): void {
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const dps = ENEMIES[e.kind].contactDamage * (e.elite ? ELITE.contact : 1);
    if (dps === 0) continue;
    for (const p of s.players) {
      if (p.air > 0 || p.vehicleId !== null) continue;
      if (dist(p.pos, e.pos) < e.radius + PLAYER_RADIUS) damagePlayer(s, p, dps * DT);
    }
  }
}

export function updateEnemies(s: SimState): void {
  contactDamage(s);
}
