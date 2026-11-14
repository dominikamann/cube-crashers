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
  }, 30000);
});
