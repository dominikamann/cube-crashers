import { AGGRO_RADIUS, DEAGGRO_RADIUS, WANDER_RANGE } from '../config/balance';
import { BLOCKS_ENEMY, hasLos, isFree, nearestFree } from '../map/tilemap';
import type { Enemy, EnemyKind, Horde, SimState, Vec2 } from '../types';
import { dist } from '../util';
import { hordeScale } from './coop';
import { spawnEnemy } from './enemies';

export type HordeComp = { kind: EnemyKind; count: number }[];

export const HORDE_COMPS: Record<string, HordeComp> = {
  blobSwarm: [{ kind: 'blob', count: 14 }, { kind: 'hunter', count: 3 }],
  hunterPack: [{ kind: 'hunter', count: 9 }],
  shieldWall: [{ kind: 'tank', count: 2 }, { kind: 'shooter', count: 4 }],
  boomSquad: [{ kind: 'bomber', count: 4 }, { kind: 'blob', count: 6 }],
  ramCrew: [{ kind: 'rammer', count: 2 }, { kind: 'hunter', count: 4 }],
  mixed: [{ kind: 'blob', count: 6 }, { kind: 'splitter', count: 3 }, { kind: 'shooter', count: 2 }],
  shieldLine: [{ kind: 'shielder', count: 4 }, { kind: 'shooter', count: 2 }, { kind: 'blob', count: 3 }],
  fieldMedic: [{ kind: 'healer', count: 2 }, { kind: 'tank', count: 1 }, { kind: 'blob', count: 6 }],
  jungle: [{ kind: 'croc', count: 1 }, { kind: 'monkey', count: 2 }, { kind: 'blob', count: 4 }],
  rexHunt: [{ kind: 'trex', count: 1 }, { kind: 'hunter', count: 5 }],
  blinkers: [{ kind: 'teleporter', count: 4 }, { kind: 'hunter', count: 3 }],
};

export function spawnHorde(s: SimState, pos: Vec2, comp: HordeComp, opts: { rush?: boolean; eliteChance?: number } = {}): Horde {
  const horde: Horde = {
    id: s.nextId++,
    waypoint: { ...pos },
    aggro: opts.rush ?? false,
    rush: opts.rush ?? false,
    nextWanderAt: s.tick + Math.floor(s.rng.range(60, 180)),
  };
  s.hordes.push(horde);
  let elite = s.rng.next() < (opts.eliteChance ?? 0);
  const scale = hordeScale(s);
  for (const group of comp) {
    for (let i = 0; i < Math.ceil(group.count * scale - 1e-9); i++) {
      let at = nearestFree(s.map, pos, 0.6, BLOCKS_ENEMY);
      for (let tries = 0; tries < 8; tries++) {
        const c = { x: pos.x + s.rng.range(-2.5, 2.5), z: pos.z + s.rng.range(-2.5, 2.5) };
        if (isFree(s.map, c, 0.6, BLOCKS_ENEMY) && hasLos(s.map, pos, c)) {
          at = c;
          break;
        }
      }
      spawnEnemy(s, group.kind, at, { hordeId: horde.id, elite });
      elite = false;
    }
  }
  return horde;
}

export function hordeMembers(s: SimState): Map<number, Enemy[]> {
  const members = new Map<number, Enemy[]>();
  for (const e of s.enemies) {
    if (e.hordeId === null || e.hp <= 0) continue;
    const list = members.get(e.hordeId);
    if (list) list.push(e);
    else members.set(e.hordeId, [e]);
  }
  return members;
}

function centroid(list: Enemy[]): Vec2 {
  const c = { x: 0, z: 0 };
  for (const e of list) {
    c.x += e.pos.x;
    c.z += e.pos.z;
  }
  return { x: c.x / list.length, z: c.z / list.length };
}

export function updateHordes(s: SimState): void {
  const members = hordeMembers(s);
  s.hordes = s.hordes.filter(h => members.has(h.id));
  const players = s.players.filter(p => p.downUntil === null);
  for (const h of s.hordes) {
    if (h.rush) continue;
    const list = members.get(h.id)!;
    // staggered: every horde checks its surroundings six times a second
    if ((s.tick + h.id) % 10 === 0) {
      if (!h.aggro) {
        h.aggro = list.some(e => players.some(p => dist(p.pos, e.pos) <= AGGRO_RADIUS && hasLos(s.map, e.pos, p.pos)));
      } else {
        const c = centroid(list);
        if (players.every(p => dist(p.pos, c) > DEAGGRO_RADIUS)) {
          h.aggro = false;
          h.waypoint = c;
          h.nextWanderAt = s.tick;
        }
      }
    }
    if (!h.aggro && s.tick >= h.nextWanderAt) {
      const c = centroid(list);
      const near = s.map.waypoints.filter(w => dist(w, c) <= WANDER_RANGE && dist(w, c) > 2);
      const visible = near.filter(w => hasLos(s.map, c, w));
      const pool = visible.length > 0 ? visible : near;
      if (pool.length > 0) h.waypoint = { ...s.rng.pick(pool) };
      h.nextWanderAt = s.tick + Math.floor(s.rng.range(360, 600));
    }
  }
}
