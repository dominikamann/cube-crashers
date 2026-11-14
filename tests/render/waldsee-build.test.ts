import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';

// a canvas that takes every drawing call and draws nothing: enough to build the Town's look without a browser
const fakeContext = (): unknown =>
  new Proxy({}, {
    get: (_t, key) => {
      if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => ({ addColorStop() {} });
      if (key === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      return () => undefined;
    },
    set: () => true,
  });
const fakeCanvas = () => ({ width: 0, height: 0, style: {}, getContext: () => fakeContext(), addEventListener() {}, removeEventListener() {} });

describe('the Town, built', () => {
  const g = globalThis as { document?: unknown; Image?: unknown };
  const saved = { document: g.document, Image: g.Image };
  beforeAll(() => {
    g.document = { createElement: () => fakeCanvas(), createElementNS: () => fakeCanvas() };
    // (an image that never loads: what is drawn once it has loaded is left out)
    g.Image = class { width = 1; height = 1; onload: (() => void) | null = null; src = ''; };
  });
  afterAll(() => {
    g.document = saved.document;
    g.Image = saved.Image;
  });

  it('builds every house, front and sign without an error', async () => {
    const { buildWaldseeTown } = await import('../../src/render/waldsee-look');
    const objects: THREE.Object3D[] = [], disposables: { dispose(): void }[] = [];
    buildWaldseeTown(o => objects.push(o), disposables);
    expect(objects.length).toBeGreaterThan(50);
    // (no plane of a painted front is left without a size or stands at a spot that is not a number)
    for (const o of objects) expect(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z)).toBe(true);
    // (and every mesh's own geometry: points, normals and texture spots all numbers, as many normals as points)
    let meshes = 0;
    for (const o of objects)
      o.traverse(m => {
        if (!(m instanceof THREE.Mesh)) return;
        meshes++;
        const g = m.geometry as THREE.BufferGeometry, pos = g.getAttribute('position');
        expect(pos.count, m.type).toBeGreaterThan(0);
        for (const name of ['position', 'normal', 'uv']) {
          const at = g.getAttribute(name);
          if (!at) continue;
          if (name === 'normal') expect(at.count).toBe(pos.count);
          for (let i = 0; i < at.array.length; i++) if (!Number.isFinite(at.array[i])) throw new Error(`${name} of a ${m.type} is not a number at ${i}`);
        }
      });
    expect(meshes).toBeGreaterThan(50);
  }, 30000);
});
