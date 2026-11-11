import { PLANT_RANGE, REVIVE_RANGE } from '../sim/config/balance';
import { padAt } from '../sim/systems/towers';
import { KART } from '../sim/systems/vehicles';
import type { Player, SimState } from '../sim/types';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Whether pressing E (X on a pad) should get in or out of a kart right away instead of waiting to see if the
 * key is held: true while driving, and next to a free kart when nothing else wants a held E here
 * (no build pad, no nest to plant, no teammate to help up).
 */
export function instantUse(s: SimState, p: Player): boolean {
  if (p.downUntil !== null) return false;
  if (p.vehicleId !== null) return true;
  if (padAt(s, p.pos) !== null) return false;
  if (s.nests.some(n => n.state === 'idle' && dist(n.pos, p.pos) <= PLANT_RANGE)) return false;
  if (s.players.some(o => o !== p && o.downUntil !== null && dist(o.pos, p.pos) <= REVIVE_RANGE + 0.5)) return false;
  return s.vehicles.some(v => v.driverId === null && dist(v.pos, p.pos) <= KART.enterRange);
}
