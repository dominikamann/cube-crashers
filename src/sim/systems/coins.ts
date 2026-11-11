import { DT, TICK_RATE, type SimState } from '../types';
import { dist } from '../util';

export const MAGNET_RADIUS = 2.5;
export const MAGNET_SPEED = 10;
export const PICKUP_RADIUS = 0.5;
export const STREAK_WINDOW_TICKS = 30;
export const COIN_VACUUM_SECONDS = 4;
export const VACUUM_SPEED = 14;

export function updateCoins(s: SimState): void {
  const alive = s.players.filter(p => p.downUntil === null);
  s.coins = s.coins.filter(c => {
    let nearest = null;
    let nearestD = Infinity;
    for (const p of alive) {
      const d = dist(p.pos, c.pos);
      if (d < nearestD) {
        nearest = p;
        nearestD = d;
      }
    }
    if (!nearest) return true;
    if (nearestD <= PICKUP_RADIUS) {
      nearest.coins += c.value;
      nearest.coinStreak = s.tick - nearest.lastCoinTick <= STREAK_WINDOW_TICKS ? nearest.coinStreak + 1 : 1;
      nearest.lastCoinTick = s.tick;
      s.events.push({ type: 'coinPicked', playerId: nearest.id, streak: nearest.coinStreak });
      return false;
    }
    const vacuum = c.spawnedAt !== undefined && s.tick - c.spawnedAt >= COIN_VACUUM_SECONDS * TICK_RATE;
    if (nearestD <= MAGNET_RADIUS || vacuum) {
      const step = Math.min((vacuum ? VACUUM_SPEED : MAGNET_SPEED) * DT, nearestD);
      c.pos.x += ((nearest.pos.x - c.pos.x) / nearestD) * step;
      c.pos.z += ((nearest.pos.z - c.pos.z) / nearestD) * step;
    }
    return true;
  });
}
