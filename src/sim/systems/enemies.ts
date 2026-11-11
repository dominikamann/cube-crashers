import { ENEMIES } from '../config/enemies';
import { dist } from '../util';
import { damagePlayer, PLAYER_RADIUS } from './player';
import { DT, type Enemy, type EnemyKind, type SimState, type Vec2 } from '../types';

export function spawnEnemy(s: SimState, kind: EnemyKind, pos: Vec2): Enemy {
  const def = ENEMIES[kind];
  const e: Enemy = {
    id: s.nextId++,
    kind,
    pos: { ...pos },
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    slowUntil: -1,
    radius: def.radius,
  };
  s.enemies.push(e);
  return e;
}

export function damageBase(s: SimState, amount: number): void {
  if (s.base.hp <= 0) return;
  s.base.hp = Math.max(0, s.base.hp - amount);
  s.events.push({ type: 'baseHit', hp: s.base.hp });
}

export function updateEnemies(s: SimState): void {
  const survivors: Enemy[] = [];
  for (const e of s.enemies) {
    const slow = e.slowUntil > s.tick ? 0.5 : 1;
    e.pos.z += e.speed * slow * DT;
    if (e.pos.z >= s.map.baseZ) {
      damageBase(s, ENEMIES[e.kind].baseDamage);
      continue;
    }
    survivors.push(e);
    for (const p of s.players) {
      if (dist(p.pos, e.pos) < e.radius + PLAYER_RADIUS) damagePlayer(s, p, ENEMIES[e.kind].contactDamage * DT);
    }
  }
  s.enemies = survivors;
}
