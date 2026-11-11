import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InstancedPool } from '../../src/render/pool';

describe('InstancedPool colours', () => {
  it('renders untinted instances white even after another instance was tinted', () => {
    const pool = new InstancedPool(new THREE.Scene(), new THREE.BoxGeometry(), new THREE.MeshLambertMaterial(), 4);
    pool.begin();
    pool.add(0, 0, 0, 0, 1, 0x9fe8ff);
    pool.add(1, 0, 0);
    pool.end();
    pool.begin();
    pool.add(0, 0, 0);
    pool.add(1, 0, 0);
    pool.add(2, 0, 0);
    pool.end();
    const c = new THREE.Color();
    for (let i = 0; i < 3; i++) {
      pool.mesh.getColorAt(i, c);
      expect(c.getHex(), `instance ${i}`).toBe(0xffffff);
    }
  });

  it('keeps instances white after the pool grows', () => {
    const pool = new InstancedPool(new THREE.Scene(), new THREE.BoxGeometry(), new THREE.MeshLambertMaterial(), 2);
    pool.begin();
    for (let i = 0; i < 5; i++) pool.add(i, 0, 0, 0, 1, i === 0 ? 0xff0000 : undefined);
    pool.end();
    const c = new THREE.Color();
    pool.mesh.getColorAt(4, c);
    expect(c.getHex()).toBe(0xffffff);
  });
});
