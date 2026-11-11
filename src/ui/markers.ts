import type { SimState, Vec2 } from '../sim/types';

/**
 * Arrows at the edge of the screen pointing to objectives that are out of view:
 * the remaining nests, and the elevator once it is open.
 */
export function createMarkers(root: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'ui-layer markers';
  root.append(layer);
  const pool: HTMLDivElement[] = [];
  const MARGIN = 48;

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
    update(s: SimState, project: (x: number, z: number) => { x: number; y: number }) {
      const targets: { pos: Vec2; kind: 'nest' | 'elevator' }[] = [];
      if (s.run.stage === 'floor') {
        for (const n of s.nests) if (n.state !== 'destroyed') targets.push({ pos: n.pos, kind: 'nest' });
        if (s.elevatorOpen) targets.push({ pos: s.map.elevator, kind: 'elevator' });
      }
      const w = innerWidth, h = innerHeight, cx = w / 2, cy = h / 2;
      let used = 0;
      for (const t of targets) {
        const p = project(t.pos.x, t.pos.z);
        const inside = p.x > MARGIN && p.x < w - MARGIN && p.y > MARGIN && p.y < h - MARGIN;
        if (inside) continue;
        // put the arrow where the line from the centre to the target leaves the screen
        const dx = p.x - cx, dy = p.y - cy;
        const k = Math.min((cx - MARGIN) / Math.abs(dx || 1e-6), (cy - MARGIN) / Math.abs(dy || 1e-6));
        const a = arrow(used++);
        a.style.display = '';
        a.className = `marker ${t.kind}`;
        a.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k}px)`;
        (a.firstElementChild as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
      for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
    },
  };
}
