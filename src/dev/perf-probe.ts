import * as THREE from 'three';
import { createLoop, type Loop } from '../loop';

/**
 * Dev only: numbers for performance work, read with `window.__perf()` in the console (or from a script).
 * Counts what the renderer drew in the last frame (all passes together), how long the sim steps and the
 * JS side of a frame took since the last call, and what is in the scene.
 */
interface Timing {
  n: number;
  total: number;
  max: number;
}
const timing = (): Timing => ({ n: 0, total: 0, max: 0 });
const add = (t: Timing, ms: number) => {
  t.n++;
  t.total += ms;
  if (ms > t.max) t.max = ms;
};
const read = (t: Timing) => ({ n: t.n, avg: t.n ? +(t.total / t.n).toFixed(3) : 0, max: +t.max.toFixed(3) });

let sim = timing();
let frame = timing();
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let last = { calls: 0, triangles: 0, lines: 0, points: 0 };

function trianglesOf(m: THREE.Mesh): number {
  const g = m.geometry;
  const n = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0);
  const range = Math.min(n, g.drawRange.count === Infinity ? n : g.drawRange.count);
  return (range / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
}

function pathOf(o: THREE.Object3D): string {
  const names: string[] = [];
  for (let p: THREE.Object3D | null = o; p && names.length < 4; p = p.parent) names.push(p.name || p.type);
  return names.reverse().join('/');
}

function sceneStats(top: number) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let meshes = 0, visible = 0, casters = 0, receivers = 0, triangles = 0, casterTriangles = 0, doubleSided = 0, objects = 0;
  const heavy: { path: string; triangles: number; cast: boolean }[] = [];
  const walk = (o: THREE.Object3D, shown: boolean) => {
    objects++;
    shown &&= o.visible;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      meshes++;
      geometries.add(m.geometry);
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) {
        materials.add(x);
        if (shown && x.side === THREE.DoubleSide) doubleSided++;
      }
      if (shown) {
        visible++;
        const t = trianglesOf(m);
        triangles += t;
        if (m.castShadow) {
          casters++;
          casterTriangles += t;
        }
        if (m.receiveShadow) receivers++;
        heavy.push({ path: pathOf(m), triangles: Math.round(t), cast: m.castShadow });
      }
    }
    for (const c of o.children) walk(c, shown);
  };
  if (scene) walk(scene, true);
  heavy.sort((a, b) => b.triangles - a.triangles);
  return { objects, meshes, visible, casters, receivers, triangles: Math.round(triangles), casterTriangles: Math.round(casterTriangles), doubleSided, geometries: geometries.size, materials: materials.size, heavy: heavy.slice(0, top) };
}

export function attachPerfRenderer(r: THREE.WebGLRenderer, s: THREE.Scene): void {
  renderer = r;
  scene = s;
  // one count for the whole frame: the composer calls render() once per pass
  r.info.autoReset = false;
  (window as unknown as { __perf: (top?: number) => unknown }).__perf = (top = 0) => {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const out = {
      draw: { ...last },
      memory: { geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? 0 },
      pixelRatio: r.getPixelRatio(),
      sim: read(sim),
      frame: read(frame),
      heap: mem ? mem.usedJSHeapSize : 0,
      scene: sceneStats(top),
    };
    sim = timing();
    frame = timing();
    return out;
  };
  // the shader programs in use (a new id during play is a compile, which stalls the frame it happens in)
  (window as unknown as { __perfPrograms: () => unknown }).__perfPrograms = () => (r.info.programs ?? []).map(p => ({ id: p.id, name: p.name, key: p.cacheKey, used: p.usedTimes }));
}

/** `createLoop` with a stopwatch round the sim step and the frame */
export function createProbedLoop(step: () => void, render: (alpha: number, frameDt: number) => void): Loop {
  return createLoop(
    () => {
      const t = performance.now();
      step();
      add(sim, performance.now() - t);
    },
    (alpha, frameDt) => {
      renderer?.info.reset();
      const t = performance.now();
      render(alpha, frameDt);
      add(frame, performance.now() - t);
      if (renderer) last = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, lines: renderer.info.render.lines, points: renderer.info.render.points };
    },
  );
}
