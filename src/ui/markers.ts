import type { SimState, Vec2 } from '../sim/types';

/** how far from the edge of the view the arrows sit; a target closer to the edge than this counts as out of view */
export const MARKER_MARGIN = 48;

/**
 * Where the arrow for a target goes, in a view `w` by `h` pixels: `p` is where the target appears in that view.
 * Null while the target is in view; a target behind the camera (`behind`, see render/project.ts) is never in view.
 * `angle` turns an arrow that points right (clockwise, as CSS does).
 */
export function edgeArrow(p: { x: number; y: number; behind?: boolean }, w: number, h: number, margin = MARKER_MARGIN): { x: number; y: number; angle: number } | null {
  const cx = w / 2, cy = h / 2;
  const inside = !p.behind && p.x > margin && p.x < w - margin && p.y > margin && p.y < h - margin;
  if (inside) return null;
  // put the arrow where the line from the centre to the target leaves the screen
  let dx = p.x - cx, dy = p.y - cy;
  if (p.behind) {
    // behind the camera the picture is mirrored through the middle: turned back, the arrow points to the side
    // the target is really on (and straight behind, with no side to choose, it points down)
    dx = -dx;
    dy = -dy;
    if (Math.hypot(dx, dy) < 1e-6) dy = 1;
  }
  const k = Math.min((cx - margin) / Math.abs(dx || 1e-6), (cy - margin) / Math.abs(dy || 1e-6));
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

/**
 * Arrows at the edge of the screen pointing to objectives that are out of view:
 * the remaining nests, and the elevator once it is open.
 */
export function createMarkers(root: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'ui-layer markers';
  root.append(layer);
  const pool: HTMLDivElement[] = [];

  function arrow(i: number): HTMLDivElement {
    while (pool.length <= i) {
      const a = document.createElement('div');
      a.className = 'marker';
      a.innerHTML = '<i></i><span></span>';
      layer.append(a);
      pool.push(a);
    }
    return pool[i];
  }

  return {
    setVisible(v: boolean) {
      layer.style.display = v ? '' : 'none';
    },
    update(s: SimState, project: (x: number, z: number) => { x: number; y: number; behind?: boolean }) {
      const targets: { pos: Vec2; kind: 'nest' | 'elevator' }[] = [];
      if (s.run.stage === 'floor') {
        for (const n of s.nests) if (n.state !== 'destroyed') targets.push({ pos: n.pos, kind: 'nest' });
        if (s.elevatorOpen) targets.push({ pos: s.map.elevator, kind: 'elevator' });
      }
      // the layer fills its screen half in split screen, the whole window otherwise
      const w = layer.clientWidth || innerWidth, h = layer.clientHeight || innerHeight;
      let used = 0;
      for (const t of targets) {
        const at = edgeArrow(project(t.pos.x, t.pos.z), w, h);
        if (!at) continue;
        const a = arrow(used++);
        a.style.display = '';
        a.className = `marker ${t.kind}`;
        a.style.transform = `translate(${at.x}px, ${at.y}px)`;
        (a.firstElementChild as HTMLElement).style.transform = `rotate(${at.angle}rad)`;
      }
      for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
    },
  };
}
