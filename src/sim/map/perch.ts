import { Tile, type FloorMap } from './tilemap';

/**
 * Where a jetpack can set you down on top of a wall: the blocks inside the arena. The outer rim (every wall
 * connected to the edge of the map) does not count. Worked out once per map.
 */
const cache = new WeakMap<FloorMap, Uint8Array>();

function inner(m: FloorMap): Uint8Array {
  let ok = cache.get(m);
  if (ok) return ok;
  const wall = (i: number) => m.tiles[i] === Tile.Wall;
  const outer = new Uint8Array(m.w * m.h);
  const queue: number[] = [];
  for (let tx = 0; tx < m.w; tx++) for (const tz of [0, m.h - 1]) queue.push(tz * m.w + tx);
  for (let tz = 0; tz < m.h; tz++) for (const tx of [0, m.w - 1]) queue.push(tz * m.w + tx);
  while (queue.length > 0) {
    const i = queue.pop()!;
    if (outer[i] || !wall(i)) continue;
    outer[i] = 1;
    const tx = i % m.w, tz = (i - tx) / m.w;
    if (tx > 0) queue.push(i - 1);
    if (tx < m.w - 1) queue.push(i + 1);
    if (tz > 0) queue.push(i - m.w);
    if (tz < m.h - 1) queue.push(i + m.w);
  }
  ok = new Uint8Array(m.w * m.h);
  for (let i = 0; i < ok.length; i++) ok[i] = wall(i) && !outer[i] ? 1 : 0;
  cache.set(m, ok);
  return ok;
}

/** a wall block inside the arena: a jetpack can land you on it */
export function perchable(m: FloorMap, x: number, z: number): boolean {
  const tx = Math.floor(x), tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h) return false;
  return inner(m)[tz * m.w + tx] === 1;
}
