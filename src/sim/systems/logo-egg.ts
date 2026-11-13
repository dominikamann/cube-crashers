import { clearSpot } from './ground';
import { logoSpots } from '../map/logo-spots';
import { BLOCKS_WALKER, nearestFree } from '../map/tilemap';
import type { SimState, Vec2 } from '../types';
import { dropCoins } from './combat';

/**
 * An easter egg: shoot the AmannLabs logo on the wall often enough and it answers. Usually with a shower of
 * coins, now and then with a crate, and sometimes with nothing at all. A few times per floor, no more.
 */
export const LOGO_EGG = { hits: 20, perFloor: 2, coins: 25, coinChance: 0.55, crateChance: 0.25 };

/** A player's shot ran into a wall at `pos`: was it the logo? */
export function shotAtWall(s: SimState, pos: Vec2): void {
  const spot = logoSpots(s.map).find(x => x.kind === 'wall');
  if (!spot || spot.kind !== 'wall') return;
  const tx = Math.floor(pos.x), tz = Math.floor(pos.z);
  const i = spot.along === 'x' ? tx - spot.tx : tz - spot.tz;
  if (i < 0 || i >= spot.w || (spot.along === 'x' ? tz !== spot.tz : tx !== spot.tx)) return;
  // only from the side the logo is on
  if ((pos.x - (tx + 0.5)) * spot.facing.x + (pos.z - (tz + 0.5)) * spot.facing.z < 0) return;
  const egg = (s.logoEgg ??= { hits: 0, given: 0 });
  if (egg.given >= LOGO_EGG.perFloor) return;
  egg.hits++;
  s.events.push({ type: 'logoHit', pos: { ...pos }, hits: egg.hits });
  if (egg.hits < LOGO_EGG.hits) return;
  egg.hits = 0;
  egg.given++;
  // the prize lands on the floor in front of the logo
  const mid = (spot.w - 1) / 2;
  const front = nearestFree(s.map, { x: spot.tx + 0.5 + (spot.along === 'x' ? mid : 0) + spot.facing.x * 1.5, z: spot.tz + 0.5 + (spot.along === 'z' ? mid : 0) + spot.facing.z * 1.5 }, 0.4, BLOCKS_WALKER);
  const roll = s.rng.next();
  const prize = roll < LOGO_EGG.coinChance ? 'coins' : roll < LOGO_EGG.coinChance + LOGO_EGG.crateChance ? 'crate' : 'nothing';
  if (prize === 'coins') dropCoins(s, front, LOGO_EGG.coins);
  if (prize === 'crate') s.crates.push({ id: s.nextId++, pos: { ...clearSpot(s, front) } });
  s.events.push({ type: 'logoEgg', pos: front, prize });
}
