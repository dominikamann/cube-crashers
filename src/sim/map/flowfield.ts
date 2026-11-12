import type { Vec2 } from '../types';
import type { Blocks, FloorMap } from './tilemap';

/** Walking distance (in tiles, 4-connected) from every tile to the nearest target; -1 where unreachable. */
/** `solid`: extra tiles to go round (tower tiles, for bots: players cannot walk through towers) */
export function buildFlowField(m: FloorMap, targets: Vec2[], blocks: Blocks, solid?: ReadonlySet<number>): Int16Array {
  const field = new Int16Array(m.w * m.h).fill(-1);
  const queue: number[] = [];
  const seed = (tx: number, tz: number) => {
    if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h) return;
    const i = tz * m.w + tx;
    if (field[i] === 0) return;
    field[i] = 0;
    queue.push(i);
  };
  for (const t of targets) {
    const tx = Math.floor(t.x), tz = Math.floor(t.z);
    seed(tx, tz);
    // a target standing where enemies cannot go (glitch floor): lead them to the closest edge instead
    if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || !blocks(m.tiles[tz * m.w + tx])) continue;
    for (let r = 1; r <= 4; r++) {
      let found = false;
      for (let oz = -r; oz <= r; oz++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const x = tx + ox, z = tz + oz;
          if (x < 0 || z < 0 || x >= m.w || z >= m.h || blocks(m.tiles[z * m.w + x])) continue;
          seed(x, z);
          found = true;
        }
      }
      if (found) break;
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const tx = i % m.w, tz = (i - tx) / m.w;
    const next = field[i] + 1;
    if (tx > 0) visit(i - 1);
    if (tx < m.w - 1) visit(i + 1);
    if (tz > 0) visit(i - m.w);
    if (tz < m.h - 1) visit(i + m.w);
    function visit(j: number) {
      if (field[j] !== -1 || blocks(m.tiles[j]) || solid?.has(j)) return;
      field[j] = next;
      queue.push(j);
    }
  }
  return field;
}

const NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Unit vector from `pos` toward the neighbouring tile that is closest to a target. Zero if there is no way. */
export function flowDir(m: FloorMap, field: Int16Array, pos: Vec2): Vec2 {
  const tx = Math.floor(pos.x), tz = Math.floor(pos.z);
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= m.w || z >= m.h ? -1 : field[z * m.w + x]);
  const here = at(tx, tz);
  if (here < 0) return { x: 0, z: 0 };
  let best = here, bx = tx, bz = tz;
  for (const [ox, oz] of NEIGHBOURS) {
    const v = at(tx + ox, tz + oz);
    if (v < 0 || v >= best) continue;
    // no cutting corners: a diagonal step needs both straight neighbours to be walkable
    if (ox !== 0 && oz !== 0 && (at(tx + ox, tz) < 0 || at(tx, tz + oz) < 0)) continue;
    best = v;
    bx = tx + ox;
    bz = tz + oz;
  }
  if (bx === tx && bz === tz) return { x: 0, z: 0 };
  const dx = bx + 0.5 - pos.x, dz = bz + 0.5 - pos.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

/** the tiles under towers, for flow fields of things that cannot walk through them */
export function towerTiles(s: { map: FloorMap; towers: { pos: Vec2 }[] }): Set<number> {
  return new Set(s.towers.map(t => Math.floor(t.pos.z) * s.map.w + Math.floor(t.pos.x)));
}
