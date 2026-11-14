import { TICK_RATE } from '../types';
import type { SimState } from '../types';
import { logoSpots, onFloorLogo } from '../map/logo-spots';
import { damageEnemy } from './combat';

/**
 * The AmannLabs logo on the floor wakes up while a player stands on it: its A rises and spins, the lettering
 * stands up (see world.ts), and a monster that touches it is hurt a little.
 */
export const LOGO_SPIN = {
  /** how far past the logo's edge a player still counts as standing on it */
  margin: 0.3,
  /** damage per second to a monster that touches it, dealt in small blows */
  dps: 12,
  everyTicks: 20,
};

/** the player who keeps the floor logo awake (the first one standing on it), if any */
export function logoKeeper(s: SimState): number | null {
  const r = logoSpots(s.map).find(x => x.kind === 'floor');
  if (!r || r.kind !== 'floor') return null;
  const m = LOGO_SPIN.margin;
  const on = s.players.find(p => {
    const q = onFloorLogo(r, p.pos);
    return p.downUntil === null && q.x > r.tx - m && q.x < r.tx + r.w + m && q.z > r.tz - m && q.z < r.tz + r.h + m;
  });
  return on ? on.id : null;
}

export const logoAwake = (s: SimState): boolean => logoKeeper(s) !== null;

export function updateLogoSpin(s: SimState): void {
  if (s.tick % LOGO_SPIN.everyTicks !== 0 || s.enemies.length === 0) return;
  const keeper = logoKeeper(s);
  if (keeper === null) return;
  const r = logoSpots(s.map).find(x => x.kind === 'floor');
  if (!r || r.kind !== 'floor') return;
  const blow = (LOGO_SPIN.dps * LOGO_SPIN.everyTicks) / TICK_RATE;
  for (const e of [...s.enemies]) {
    // the monster's body reaches the logo
    const q = onFloorLogo(r, e.pos);
    const dx = Math.max(r.tx - q.x, 0, q.x - (r.tx + r.w)), dz = Math.max(r.tz - q.z, 0, q.z - (r.tz + r.h));
    if (e.hp > 0 && Math.hypot(dx, dz) <= e.radius) damageEnemy(s, e, blow, 'explosion', keeper);
  }
}
