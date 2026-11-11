import { DT, TICK_RATE, type Player, type SimState, type Vec2 } from '../types';
import { clamp } from '../util';

export const PLAYER_SPEED = 6;
// reaches past the forward build pad (z = -20) but stays clear of the spawn line
export const PLAYER_AREA = { minX: -6, maxX: 6, minZ: -22, maxZ: 7 };

export const RESPAWN_SECONDS = 3;
export const DOWN_COIN_LOSS = 0.25;
/** how close an enemy must be (beyond its radius) to hurt the player */
export const PLAYER_RADIUS = 0.4;

export function damagePlayer(s: SimState, p: Player, amount: number): void {
  if (p.downUntil !== null || amount <= 0) return;
  p.hp = Math.max(0, p.hp - amount);
  s.events.push({ type: 'playerHit', playerId: p.id, hp: p.hp });
  if (p.hp > 0) return;
  p.downUntil = s.tick + RESPAWN_SECONDS * TICK_RATE;
  p.coins -= Math.floor(p.coins * DOWN_COIN_LOSS);
  s.events.push({ type: 'playerDown', playerId: p.id });
}

export function updatePlayers(s: SimState, moves: Map<number, Vec2>): void {
  for (const p of s.players) {
    if (p.downUntil !== null) {
      if (s.tick < p.downUntil) continue;
      p.downUntil = null;
      p.hp = p.maxHp;
      p.pos = { ...s.map.playerSpawn };
      s.events.push({ type: 'playerRespawn', playerId: p.id });
    }
    const dir = moves.get(p.id);
    if (!dir) continue;
    const len = Math.hypot(dir.x, dir.z);
    if (len === 0) continue;
    const k = (Math.min(len, 1) / len) * PLAYER_SPEED * DT;
    p.pos.x = clamp(p.pos.x + dir.x * k, PLAYER_AREA.minX, PLAYER_AREA.maxX);
    p.pos.z = clamp(p.pos.z + dir.z * k, PLAYER_AREA.minZ, PLAYER_AREA.maxZ);
  }
}
