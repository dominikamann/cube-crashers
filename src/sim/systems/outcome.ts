import { ELEVATOR_RADIUS } from '../config/balance';
import type { SimState } from '../types';
import { floorCleared } from './run';
import { dist } from '../util';

/** Runs last in a tick: a run that was lost earlier in the same tick stays lost. */
export function updateOutcome(s: SimState): void {
  if (s.phase !== 'playing' || !s.elevatorOpen || s.run.stage !== 'floor') return;
  if (!s.players.some(p => p.downUntil === null && dist(p.pos, s.map.elevator) <= ELEVATOR_RADIUS)) return;
  floorCleared(s);
}
