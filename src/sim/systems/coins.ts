import { COMBO_TICKS, MAGNET_RADIUS, MAGNET_SPEED, PICKUP_RADIUS, POWER_MAGNET_SPEED, STREAK_WINDOW_TICKS } from '../config/balance';
import { DT, type SimState } from '../types';
import { dist } from '../util';

export function updateCoins(s: SimState): void {
  const alive = s.players.filter(p => p.downUntil === null);
  const magnet = alive.find(p => s.tick < p.magnetUntil);
  s.coins = s.coins.filter(c => {
    let nearest = magnet ?? null;
    let nearestD = magnet ? dist(magnet.pos, c.pos) : Infinity;
    if (!magnet) {
      for (const p of alive) {
        const d = dist(p.pos, c.pos);
        if (d < nearestD) {
          nearest = p;
          nearestD = d;
        }
      }
    }
    if (!nearest) return s.tick < c.expiresAt;
    if (nearestD <= PICKUP_RADIUS) {
      nearest.coins += c.value;
      nearest.coinStreak = s.tick - nearest.lastCoinTick <= STREAK_WINDOW_TICKS ? nearest.coinStreak + 1 : 1;
      nearest.lastCoinTick = s.tick;
      if (nearest.combo > 0) nearest.comboUntil = s.tick + COMBO_TICKS;
      s.events.push({ type: 'coinPicked', playerId: nearest.id, streak: nearest.coinStreak });
      return false;
    }
    if (magnet || nearestD <= MAGNET_RADIUS + 1.5 * nearest.perks.magnet) {
      const step = Math.min((magnet ? POWER_MAGNET_SPEED : MAGNET_SPEED) * DT, nearestD);
      c.pos.x += ((nearest.pos.x - c.pos.x) / nearestD) * step;
      c.pos.z += ((nearest.pos.z - c.pos.z) / nearestD) * step;
      return true;
    }
    return s.tick < c.expiresAt;
  });
}
