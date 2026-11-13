import { BLOCKS_WALKER, isFree } from '../map/tilemap';
import type { SimState, Vec2 } from '../types';
import { dist } from '../util';

/** how far apart two things on the floor lie at least: each one can be seen and picked up by itself */
export const ITEM_GAP = 1.3;

/** where something lies on the floor: crates and the cards of an opened one, power-ups, jetpacks, the hidden heart and parked vehicles */
export function groundItems(s: SimState): Vec2[] {
  return [
    ...s.crates.map(c => c.pos),
    ...s.offers.map(o => o.pos),
    ...s.powerups.map(p => p.pos),
    ...s.jetpacks.map(j => j.pos),
    ...(s.heart ? [s.heart.pos] : []),
    ...s.vehicles.filter(v => v.driverId === null).map(v => v.pos),
  ];
}

/** nothing lies here yet */
export const spotClear = (s: SimState, pos: Vec2, items = groundItems(s)) => items.every(i => dist(i, pos) >= ITEM_GAP);

/** `pos`, or the nearest free floor next to it where nothing lies yet (no dice: the same for everyone) */
export function clearSpot(s: SimState, pos: Vec2): Vec2 {
  const items = groundItems(s);
  if (spotClear(s, pos, items)) return pos;
  for (const r of [1.4, 2.1, 2.8, 3.5])
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const at = { x: pos.x + Math.cos(a) * r, z: pos.z + Math.sin(a) * r };
      if (isFree(s.map, at, 0.4, BLOCKS_WALKER) && spotClear(s, at, items)) return at;
    }
  return pos;
}
