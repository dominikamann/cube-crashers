import { Tile, type FloorMap } from './tilemap';

/**
 * The wall round the game area: every wall tile that hangs together with the edge of the map through nothing
 * but wall. It is a hard border for everything, also for what climbs over the walls inside (1 = border).
 */
const cache = new WeakMap<FloorMap, Uint8Array>();
export function borderWalls(m: FloorMap): Uint8Array {
  let out = cache.get(m);
  if (out) return out;
  out = new Uint8Array(m.w * m.h);
  const wall = (x: number, z: number) => m.tiles[z * m.w + x] === Tile.Wall;
  const todo: number[] = [];
  const visit = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= m.w || z >= m.h || out![z * m.w + x] || !wall(x, z)) return;
    out![z * m.w + x] = 1;
    todo.push(x, z);
  };
  for (let x = 0; x < m.w; x++) {
    visit(x, 0);
    visit(x, m.h - 1);
  }
  for (let z = 0; z < m.h; z++) {
    visit(0, z);
    visit(m.w - 1, z);
  }
  while (todo.length > 0) {
    const z = todo.pop()!, x = todo.pop()!;
    visit(x + 1, z);
    visit(x - 1, z);
    visit(x, z + 1);
    visit(x, z - 1);
  }
  cache.set(m, out);
  return out;
}

/** Is this spot on the border wall, or off the map? */
export function onBorder(m: FloorMap, x: number, z: number): boolean {
  const tx = Math.floor(x), tz = Math.floor(z);
  return tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || borderWalls(m)[tz * m.w + tx] === 1;
}

/** Is a body of this reach clear of the border all round, here? */
export function clearOfBorder(m: FloorMap, x: number, z: number, reach: number): boolean {
  if (onBorder(m, x, z)) return false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (onBorder(m, x + Math.cos(a) * reach, z + Math.sin(a) * reach)) return false;
  }
  return true;
}

/** `pos`, or the nearest spot on the way to the middle of the map where a body of this reach is clear of the border */
export function insideBorder(m: FloorMap, pos: { x: number; z: number }, reach: number): { x: number; z: number } {
  const cx = m.w / 2, cz = m.h / 2;
  const d = Math.hypot(cx - pos.x, cz - pos.z);
  for (let t = 0; t <= d; t += 0.25) {
    const x = pos.x + ((cx - pos.x) / (d || 1)) * t, z = pos.z + ((cz - pos.z) / (d || 1)) * t;
    if (clearOfBorder(m, x, z, reach)) return { x, z };
  }
  return { x: cx, z: cz };
}
