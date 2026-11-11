import { CREDIT_BONUS, ELEVATOR_RADIUS, PAR_SECONDS, TIME_BONUS_PER_SECOND } from '../config/balance';
import { TICK_RATE, type SimState } from '../types';
import { dist } from '../util';

/** Runs last in a tick: a run that was lost earlier in the same tick stays lost. */
export function updateOutcome(s: SimState): void {
  if (s.phase !== 'playing' || !s.elevatorOpen) return;
  if (!s.players.some(p => p.downUntil === null && dist(p.pos, s.map.elevator) <= ELEVATOR_RADIUS)) return;
  const seconds = s.tick / TICK_RATE;
  s.score += s.credits * CREDIT_BONUS + Math.round(Math.max(0, PAR_SECONDS - seconds) * TIME_BONUS_PER_SECOND);
  s.phase = 'won';
  s.events.push({ type: 'gameWon', score: s.score });
}
