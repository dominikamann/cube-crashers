import { BLOCKS_ENEMY, nearestFree } from '../map/tilemap';
import type { BossKind, SimState } from '../types';
import { dist } from '../util';
import { floorDef } from '../config/floors';
import { spawnBoss } from './boss';

/**
 * A wild boss in the Tower Run: on some nest floors King Rex or the Rhino stands in front of the elevator once
 * the last nest has fallen. It is smaller than the real thing and leaves a crate behind; the elevator is open
 * either way, so the team can lure it away and slip past, or beat it.
 */
export const WILD = {
  /** share of the nest floors (after the first) that get one */
  chance: 0.45,
  /** its health, as a share of the real boss's */
  hp: 0.35,
  kinds: ['rex', 'rhino'] as BossKind[],
};

/** its own dice from the seed and the floor, so the run's other random numbers stay as they were */
const dice = (s: SimState, salt: number) => Math.abs(Math.sin(s.seed * 7.3219 + (s.run.floor + 1) * 41.117 + salt) * 43758.5453) % 1;

/** Called when a nest floor of a run is set up; `always` skips the dice (tests, dev). */
export function planWildBoss(s: SimState, always = false): void {
  s.wild = null;
  if (s.run.mode !== 'run' || floorDef(s.map.id)?.kind !== 'nests') return;
  if (!always && (s.run.floor === 0 || dice(s, 0) >= WILD.chance)) return;
  s.wild = { kind: WILD.kinds[Math.floor(dice(s, 1) * WILD.kinds.length)] };
}

/**
 * The planned boss turns up by the elevator, just as the last nest falls and the team wants to leave. The doors
 * are open: lure it away and slip past, or beat it. True if one came.
 */
export function releaseWildBoss(s: SimState): boolean {
  const plan = s.wild;
  if (!plan || s.boss) return false;
  s.wild = null;
  // in front of the elevator, but not on top of a player who already waits there
  const alive = s.players.filter(p => p.downUntil === null);
  const near = s.map.waypoints.filter(w => dist(w, s.map.elevator) < 9 && alive.every(p => dist(p.pos, w) > 6));
  const spot = near.sort((a, b) => dist(a, s.map.elevator) - dist(b, s.map.elevator))[0] ?? s.map.elevator;
  spawnBoss(s, plan.kind, nearestFree(s.map, spot, 1.2, BLOCKS_ENEMY));
  const b = s.boss as SimState['boss'];
  if (!b) return false;
  b.wild = true;
  const body = s.enemies.find(e => e.id === b.enemyId);
  if (body) {
    body.hp = body.maxHp = b.maxHp = body.maxHp * WILD.hp;
    // it stands there until someone comes near or hurts it (see boss.ts): lure it away, or beat it
    b.waiting = body.speed;
    body.speed = 0;
  }
  return true;
}
