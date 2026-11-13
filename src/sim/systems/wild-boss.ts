import { BLOCKS_ENEMY, nearestFree } from '../map/tilemap';
import type { BossKind, SimState } from '../types';
import { dist } from '../util';
import { floorDef } from '../config/floors';
import { spawnBoss } from './boss';

/**
 * A wild boss in the Tower Run: on some nest floors a boss that suits the world stands in front of the elevator once
 * the last nest has fallen. It is smaller than the real thing and leaves a crate behind; the elevator is open
 * either way, so the team can lure it away and slip past, or beat it.
 */
export const WILD = {
  /** how likely one is per floor of the run: rare at the bottom, more likely the higher the team is */
  chance: [0.15, 0.3, 0.4, 0.5, 0.6],
  /** its health, as a share of the real boss's */
  hp: 0.7,
  /** and in a versus match, where it is a nuisance on the side and nobody fights it together */
  versusHp: 0.4,
  /**
   * which bosses suit which world: the Rhino needs room to charge, King Rex is at home in the city, the jungle
   * and between the machines. (The Kraken needs water, the Segment Worm a wide roof and the Mega Block is too
   * big for the aisles of a nest floor: never wild.)
   */
  fits: {
    floor01: ['rhino'],
    candy: ['rhino'],
    jungle: ['rhino', 'rex'],
    neon: ['rex'],
    highway: ['rhino', 'rex'],
    servers: ['rex'],
  } as Record<string, BossKind[]>,
};

/** its own dice from the seed and the floor, so the run's other random numbers stay as they were */
const dice = (s: SimState, salt: number) => Math.abs(Math.sin(s.seed * 7.3219 + (s.run.floor + 1) * 41.117 + salt) * 43758.5453) % 1;

/** Called when a nest floor of a run is set up; `always` skips the dice (tests, dev). */
export function planWildBoss(s: SimState, always = false): void {
  s.wild = null;
  if (s.run.mode !== 'run' || floorDef(s.map.id)?.kind !== 'nests') return;
  // never a boss this run has a floor of its own for
  const own = s.run.floors.map((id, i) => s.run.bosses?.[i] ?? floorDef(id)?.boss);
  const kinds = (WILD.fits[s.map.id] ?? []).filter(k => !own.includes(k));
  if (kinds.length === 0) return;
  if (!always && dice(s, 0) >= (WILD.chance[s.run.floor] ?? WILD.chance[WILD.chance.length - 1])) return;
  s.wild = { kind: kinds[Math.floor(dice(s, 1) * kinds.length)] };
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
  const b = spawnWild(s, plan.kind, spot);
  const body = b && s.enemies.find(e => e.id === b.enemyId);
  if (b && body) {
    // it stands there until someone comes near or hurts it (see boss.ts): lure it away, or beat it
    b.waiting = body.speed;
    body.speed = 0;
  }
  if (!b) return false;
  return true;
}

/** A smaller boss that nothing depends on (a floor of the Tower Run, a versus match with chaos) breaks in at `spot`. */
export function spawnWild(s: SimState, kind: BossKind, spot: { x: number; z: number }): SimState['boss'] {
  if (s.boss) return null;
  spawnBoss(s, kind, nearestFree(s.map, spot, 1.2, BLOCKS_ENEMY));
  const b = s.boss as SimState['boss'];
  if (!b) return null;
  b.wild = true;
  const body = s.enemies.find(e => e.id === b.enemyId);
  if (body) body.hp = body.maxHp = b.maxHp = body.maxHp * (s.versus ? WILD.versusHp : WILD.hp);
  return b;
}
