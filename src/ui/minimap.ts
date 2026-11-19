import { Tile } from '../sim/map/tilemap';
import { crowned } from '../sim/systems/bounty';
import { cubeHome } from '../sim/systems/versus';
import { cssColor, palette, playerColor } from '../render/palette';
import type { SimState } from '../sim/types';

const SCALE = 2.5;

export interface Minimap {
  update(s: SimState, time: number, localId: number): void;
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
      // glitch floor muted, so it is never mistaken for a nest
      [Tile.Hazard]: '#5e3a6e',
      [Tile.ConveyorN]: '#8a84a8',
      [Tile.ConveyorE]: '#8a84a8',
      [Tile.ConveyorS]: '#8a84a8',
      [Tile.ConveyorW]: '#8a84a8',
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
    update(s, time, localId) {
      if (time - last < 0.05 && baseMap === s.map.id) return;
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
      // nests: big, white frame, pulsing; a planted one blinks
      const pulse = 1 + 0.25 * Math.sin(time * 6);
      for (const n of s.nests) {
        if (n.state === 'destroyed') continue;
        if (n.state === 'planted' && !blink) continue;
        dot(n.pos.x, n.pos.z, 13 * pulse, '#ffffff');
        dot(n.pos.x, n.pos.z, 10 * pulse, '#1b1440');
        dot(n.pos.x, n.pos.z, 7 * pulse, '#ff2bd6');
      }
      if (!s.elevatorOpen || blink) dot(s.map.elevator.x, s.map.elevator.z, 7, s.elevatorOpen ? '#2bf0ff' : '#5a7a88');
      // colour-blind mode in a team game: team 0 is a triangle, team 1 a round dot, as over their heads
      const shapes = palette().teamMarks && s.versus?.mode === 'team';
      // whoever leads a versus match carries the crown: a golden frame round their dot, for everyone to find them
      const leader = crowned(s);
      for (const p of s.players) {
        if (p.id === leader && p.downUntil === null) dot(p.pos.x, p.pos.z, 12 + 2 * Math.sin(time * 6), '#ffd23d');
        const me = p.id === localId;
        const color = me ? '#ffffff' : cssColor(playerColor(p.color));
        if (shapes && p.team !== undefined) {
          const x = p.pos.x * SCALE, z = p.pos.z * SCALE, r = me ? 6 : 5;
          ctx.beginPath();
          if (p.team === 0) {
            ctx.moveTo(x, z - r);
            ctx.lineTo(x + r, z + r * 0.8);
            ctx.lineTo(x - r, z + r * 0.8);
            ctx.closePath();
          } else ctx.arc(x, z, r * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.strokeStyle = '#1b1440';
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
          continue;
        }
        dot(p.pos.x, p.pos.z, me ? 9 : 7, '#1b1440');
        dot(p.pos.x, p.pos.z, me ? 6 : 4, color);
      }
      // capture the cube: each base a frame in its team's colour, each cube a square on top (over its carrier's
      // dot, blinking while carried or lying out, so everyone can find it)
      s.versus?.flags?.forEach((f, team) => {
        const color = cssColor(palette().teams[team]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(f.base.x * SCALE - 6, f.base.z * SCALE - 6, 12, 12);
        if (!cubeHome(f) && !blink) return;
        dot(f.pos.x, f.pos.z, 9, '#ffffff');
        dot(f.pos.x, f.pos.z, 6, color);
        // colour-blind mode: the team's shape on the cube as well (team 0 a triangle, team 1 a round dot)
        if (shapes) {
          const x = f.pos.x * SCALE, z = f.pos.z * SCALE;
          ctx.beginPath();
          if (team === 0) {
            ctx.moveTo(x, z - 3);
            ctx.lineTo(x + 3, z + 2.4);
            ctx.lineTo(x - 3, z + 2.4);
            ctx.closePath();
          } else ctx.arc(x, z, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = '#1b1440';
          ctx.fill();
        }
      });
    },
  };
}
