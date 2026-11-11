import { ENEMIES } from '../config/enemies';
import { DT, type Enemy, type SimState, type Worm } from '../types';
import { clamp } from '../util';
import { spawnEnemy } from './enemies';

export const WORM_SEGMENTS = 16;
export const WORM_SPACING = 0.9;
export const WORM_SPEED = 0.8;
export const WORM_SWAY = 3.5;
export const WORM_SWAY_FREQ = 1.2;
export const WORM_MIN_SPLIT = 3;
export const WORM_MAX_WORMS = 4;
export const WORM_ATTACK_RADIUS = 2;
export const WORM_DEATH_COINS = 40;

export function spawnWorm(s: SimState): { worms: Worm[]; maxHp: number } {
  const ids: number[] = [];
  for (let i = 0; i < WORM_SEGMENTS; i++) {
    ids.push(spawnEnemy(s, 'wormSegment', { x: 0, z: s.map.spawnZ - i * WORM_SPACING }).id);
  }
  return {
    worms: [{ id: s.nextId++, segmentIds: ids, t0: s.tick, wiggle: 0 }],
    maxHp: WORM_SEGMENTS * ENEMIES.wormSegment.hp,
  };
}

function byId(s: SimState, id: number): Enemy | undefined {
  return s.enemies.find(e => e.id === id);
}

export function moveWorms(s: SimState, worms: Worm[]): void {
  for (const w of worms) {
    const segs = w.segmentIds.map(id => byId(s, id)).filter((e): e is Enemy => !!e);
    if (segs.length === 0) continue;
    const head = segs[0];
    const t = (s.tick - w.t0) * DT;
    const slow = head.slowUntil > s.tick ? 0.5 : 1;
    head.pos.z += WORM_SPEED * slow * DT;
    head.pos.x += WORM_SWAY * WORM_SWAY_FREQ * Math.cos(WORM_SWAY_FREQ * t + w.wiggle) * slow * DT;
    head.pos.x = clamp(head.pos.x, -s.map.laneHalfWidth, s.map.laneHalfWidth);
    // the body follows like a chain
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1].pos, cur = segs[i].pos;
      const dx = cur.x - prev.x, dz = cur.z - prev.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > WORM_SPACING) {
        cur.x = prev.x + (dx / d) * WORM_SPACING;
        cur.z = prev.z + (dz / d) * WORM_SPACING;
      }
    }
  }
}

/**
 * Removes dead or leaked segments. A destroyed middle segment splits the worm when both parts keep
 * at least WORM_MIN_SPLIT segments and fewer than WORM_MAX_WORMS worms exist; otherwise the gap closes.
 */
export function resolveWorms(s: SimState, worms: Worm[]): Worm[] {
  for (let wi = 0; wi < worms.length; wi++) {
    const w = worms[wi];
    for (;;) {
      const i = w.segmentIds.findIndex(id => {
        const e = byId(s, id);
        return !e || e.hp <= 0;
      });
      if (i < 0) break;
      const dead = byId(s, w.segmentIds[i]);
      const left = w.segmentIds.slice(0, i);
      const right = w.segmentIds.slice(i + 1);
      const middle = i > 0 && i < w.segmentIds.length - 1;
      if (
        dead &&
        middle &&
        left.length >= WORM_MIN_SPLIT &&
        right.length >= WORM_MIN_SPLIT &&
        worms.length < WORM_MAX_WORMS
      ) {
        w.segmentIds = left;
        worms.push({ id: s.nextId++, segmentIds: right, t0: s.tick, wiggle: s.rng.range(0, Math.PI * 2) });
        s.events.push({ type: 'wormSplit', pos: { ...dead.pos } });
      } else {
        w.segmentIds = [...left, ...right];
      }
    }
  }
  return worms.filter(w => w.segmentIds.length > 0);
}
