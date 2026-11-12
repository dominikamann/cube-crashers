import { SAMPLE_TICKS } from '../config/balance';
import { TICK_RATE, type DamageSource, type KillCategory, type PlayerStats, type SimState } from '../types';

export function killCategory(source: DamageSource): KillCategory {
  switch (source) {
    case 'laser':
    case 'popcorn':
    case 'frost':
    case 'tesla':
    case 'bumper':
      return 'tower';
    case 'kart':
      return 'kart';
    case 'stomp':
      return 'stomp';
    case 'dash':
      return 'dash';
    case 'explosion':
      return 'other';
    default:
      return 'weapon';
  }
}

export function totalKills(s: SimState): number {
  return Object.values(s.stats.kills).reduce((a, b) => a + b, 0);
}

/** Every 10 seconds the run log gets a sample of the running totals. */
export function sampleStats(s: SimState): void {
  if ((s.tick + 1) % SAMPLE_TICKS !== 0) return;
  s.stats.samples.push({
    t: (s.tick + 1) / TICK_RATE,
    distance: s.stats.distance,
    idleTicks: s.stats.idleTicks,
    kills: totalKills(s),
    alarm: s.alarm.level,
  });
}

/** what a player killed the most with, or null before the first kill */
export function bestWeapon(stats: PlayerStats): string | null {
  let best: string | null = null;
  for (const [k, n] of Object.entries(stats.killsBy)) if (best === null || n > stats.killsBy[best]) best = k;
  return best;
}
