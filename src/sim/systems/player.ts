import { DT, type SimState, type Vec2 } from '../types';
import { clamp } from '../util';

export const PLAYER_SPEED = 6;
export const PLAYER_AREA = { minX: -6, maxX: 6, minZ: -6, maxZ: 7 };

export function updatePlayers(s: SimState, moves: Map<number, Vec2>): void {
  for (const p of s.players) {
    const dir = moves.get(p.id);
    if (!dir) continue;
    const len = Math.hypot(dir.x, dir.z);
    if (len === 0) continue;
    const k = (Math.min(len, 1) / len) * PLAYER_SPEED * DT;
    p.pos.x = clamp(p.pos.x + dir.x * k, PLAYER_AREA.minX, PLAYER_AREA.maxX);
    p.pos.z = clamp(p.pos.z + dir.z * k, PLAYER_AREA.minZ, PLAYER_AREA.maxZ);
  }
}
