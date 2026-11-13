import { BLOCKS_ENEMY, nearestFree } from '../map/tilemap';
import { TICK_RATE } from '../types';
import type { SimState, Vec2 } from '../types';
import { spawnEnemy } from './enemies';

/**
 * King Rex does not go quietly: three eggs fly out of the explosion, and a baby dino hatches from each. They
 * roar and stomp like any T-Rex and are quicker on their feet, but a few hits finish them.
 */
export const EGGS = {
  count: 3,
  /** how far from where it fell they land */
  spread: 2.4,
  hatchTicks: 3.5 * TICK_RATE,
  /** one hatches a little after the other */
  staggerTicks: 18,
  /** a baby against a grown T-Rex */
  hp: 0.2,
  radius: 0.45,
  speed: 1.8,
};

export function layEggs(s: SimState, at: Vec2): void {
  const eggs = (s.eggs ??= []);
  const turn = s.rng.next() * Math.PI * 2;
  for (let i = 0; i < EGGS.count; i++) {
    const a = turn + (i / EGGS.count) * Math.PI * 2;
    const pos = nearestFree(s.map, { x: at.x + Math.cos(a) * EGGS.spread, z: at.z + Math.sin(a) * EGGS.spread }, EGGS.radius, BLOCKS_ENEMY);
    eggs.push({ id: s.nextId++, pos, from: { ...at }, laidAt: s.tick, hatchAt: s.tick + EGGS.hatchTicks + i * EGGS.staggerTicks });
  }
}

export function updateEggs(s: SimState): void {
  if (!s.eggs || s.eggs.length === 0) return;
  for (const egg of s.eggs) {
    if (s.tick < egg.hatchAt) continue;
    const baby = spawnEnemy(s, 'trex', egg.pos);
    baby.hp = baby.maxHp = baby.maxHp * EGGS.hp;
    baby.radius = EGGS.radius;
    baby.speed *= EGGS.speed;
    s.events.push({ type: 'eggHatch', pos: { ...egg.pos } });
  }
  s.eggs = s.eggs.filter(e => s.tick < e.hatchAt);
}
