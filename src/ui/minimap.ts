import { Tile } from '../sim/map/tilemap';
import type { SimState } from '../sim/types';

const SCALE = 2.5;

export interface Minimap {
  update(s: SimState, time: number): void;
}

/** Small overview map: the tiles are drawn once, the moving things ten times a second. */
export function createMinimap(parent: HTMLElement): Minimap {
  const canvas = document.createElement('canvas');
  canvas.className = 'minimap';
  parent.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let base: HTMLCanvasElement | null = null;
  let baseMap = '';
  let last = -1;

  function drawBase(s: SimState): HTMLCanvasElement {
    const m = s.map;
    const c = document.createElement('canvas');
    c.width = Math.round(m.w * SCALE);
    c.height = Math.round(m.h * SCALE);
    const b = c.getContext('2d')!;
    const colors: Record<number, string> = {
      [Tile.Floor]: '#cfc4a4',
      [Tile.Wall]: '#2b3f8f',
      [Tile.LowWall]: '#c9962e',
      [Tile.Hazard]: '#c22aa8',
      [Tile.Boost]: '#2aa8c2',
      [Tile.Ramp]: '#e0c040',
    };
    for (let tz = 0; tz < m.h; tz++) {
      for (let tx = 0; tx < m.w; tx++) {
        b.fillStyle = colors[m.tiles[tz * m.w + tx]];
        b.fillRect(Math.floor(tx * SCALE), Math.floor(tz * SCALE), Math.ceil(SCALE), Math.ceil(SCALE));
      }
    }
    return c;
  }

  return {
    update(s, time) {
      if (time - last < 0.1 && baseMap === s.map.id) return;
      last = time;
      if (!base || baseMap !== s.map.id) {
        base = drawBase(s);
        baseMap = s.map.id;
        canvas.width = base.width;
        canvas.height = base.height;
      }
      ctx.drawImage(base, 0, 0);
      const blink = Math.floor(time * 4) % 2 === 0;
      const dot = (x: number, z: number, size: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(x * SCALE - size / 2, z * SCALE - size / 2, size, size);
      };
      for (const e of s.enemies) dot(e.pos.x, e.pos.z, e.elite ? 4 : 2, e.elite ? '#ff2bd6' : '#e02040');
      for (const c of s.crates) dot(c.pos.x, c.pos.z, 5, '#b07cff');
      for (const o of s.offers) dot(o.pos.x, o.pos.z, 6, '#b07cff');
      for (const v of s.vehicles) dot(v.pos.x, v.pos.z, 6, '#ffe14a');
      for (const pu of s.powerups) if (blink) dot(pu.pos.x, pu.pos.z, 6, '#ffffff');
      for (const n of s.nests) {
        if (n.state === 'destroyed') continue;
        if (n.state === 'planted' && !blink) continue;
        dot(n.pos.x, n.pos.z, 9, '#1b1440');
        dot(n.pos.x, n.pos.z, 6, '#ff2bd6');
      }
      if (!s.elevatorOpen || blink) dot(s.map.elevator.x, s.map.elevator.z, 7, s.elevatorOpen ? '#2bf0ff' : '#5a7a88');
      for (const p of s.players) {
        dot(p.pos.x, p.pos.z, 8, '#1b1440');
        dot(p.pos.x, p.pos.z, 5, '#ffffff');
      }
    },
  };
}
