import type { SimState } from '../types';

export function updateOutcome(s: SimState): void {
  if (s.phase !== 'playing') return;
  if (s.base.hp <= 0) {
    s.phase = 'lost';
    s.events.push({ type: 'gameLost' });
  }
}
