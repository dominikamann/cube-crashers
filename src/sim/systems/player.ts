import { DOWN_COIN_LOSS, PLAYER_RADIUS, PLAYER_SPEED, RESPAWN_TICKS } from '../config/balance';
import { BLOCKS_WALKER, moveCircle } from '../map/tilemap';
import { DT, type Player, type SimState, type Vec2 } from '../types';

export function damagePlayer(s: SimState, p: Player, amount: number): void {
  if (p.downUntil !== null || amount <= 0) return;
  p.hp = Math.max(0, p.hp - amount);
  s.events.push({ type: 'playerHit', playerId: p.id, hp: p.hp });
  if (p.hp > 0) return;
  p.downUntil = s.tick + RESPAWN_TICKS;
  p.coins -= Math.floor(p.coins * DOWN_COIN_LOSS);
  s.events.push({ type: 'playerDown', playerId: p.id });
}

export function updatePlayers(s: SimState, moves: Map<number, Vec2>): void {
  for (const p of s.players) {
    if (p.downUntil !== null) {
      if (s.tick < p.downUntil) continue;
      p.downUntil = null;
      p.hp = p.maxHp;
      p.pos = { ...p.safePoint };
      s.events.push({ type: 'playerRespawn', playerId: p.id });
    }
    const dir = moves.get(p.id);
    if (!dir) continue;
    const len = Math.hypot(dir.x, dir.z);
    if (len === 0) continue;
    p.facing = { x: dir.x / len, z: dir.z / len };
    const k = (Math.min(len, 1) / len) * PLAYER_SPEED * DT;
    moveCircle(s.map, p.pos, dir.x * k, dir.z * k, PLAYER_RADIUS, BLOCKS_WALKER);
  }
}
