import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDominikLimbs, DOMINIK, type DominikPose, hammerGeometry } from '../../src/render/dominik-limbs';
import { voxelBody } from '../../src/render/voxel-body';

describe('Angry Dominik, the boss', () => {
  it('has his body and his head', () => {
    for (const shape of [voxelBody('dominik', DOMINIK.width, DOMINIK.height, DOMINIK.depth), voxelBody('dominikHead', DOMINIK.head.w, DOMINIK.head.h, DOMINIK.head.d)]) {
      expect(shape.geometry.getAttribute('position').count).toBeGreaterThan(1000);
    }
    // (building his voxel body takes a few seconds, more on a busy machine)
  }, 20000);

  it('has his neck, arms, legs and hammer, and draws them', () => {
    const scene = new THREE.Scene();
    const limbs = createDominikLimbs(scene, new THREE.MeshLambertMaterial({ vertexColors: true }));
    expect(scene.children.length).toBe(8);
    expect(hammerGeometry().lit.getAttribute('position').count).toBeGreaterThan(100);
    limbs.begin();
    const pose: DominikPose = { id: 1, x: 0, y: 2, z: 0, yaw: 0, sx: DOMINIK.scale, sy: DOMINIK.scale, sz: DOMINIK.scale, lean: 0, tilt: 0, tint: undefined, phase: 1, still: false, attack: 1, laser: false, thrown: false, slam: false, kneel: 0 };
    expect(() => limbs.add(pose, 1 / 60)).not.toThrow();
    expect(() => limbs.add({ ...pose, id: 2, attack: 2, thrown: true, kneel: 1 }, 1 / 60)).not.toThrow();
    limbs.end();
  });
});
