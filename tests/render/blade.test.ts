import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BLADE_IN, BLADE_OUT, bladeFlicker, bladeReach, bladeStep, showBlade, swordBlade } from '../../src/render/blade';
import { bake } from '../../src/render/figure';
import { weaponModel } from '../../src/render/viewmodel';

describe('the blade of the Laser Sword', () => {
  it('runs out of the hilt when the sword is drawn and sinks back when it is put away, each in a moment', () => {
    let out = 0;
    const dt = 1 / 60;
    let frames = 0;
    while (out < 1) {
      out = bladeStep(out, true, dt);
      frames++;
    }
    expect(frames * dt).toBeCloseTo(BLADE_OUT, 1);
    frames = 0;
    while (out > 0) {
      out = bladeStep(out, false, dt);
      frames++;
    }
    expect(frames * dt).toBeCloseTo(BLADE_IN, 1);
    // (fast out of the hilt, slowing at its length)
    expect(bladeReach(0)).toBe(0);
    expect(bladeReach(0.5)).toBeGreaterThan(0.5);
    expect(bladeReach(1)).toBe(1);
    expect(bladeReach(2)).toBe(1);
  });

  it('flickers a little, never much', () => {
    for (let t = 0; t < 5; t += 0.013) {
      expect(bladeFlicker(t, 3)).toBeGreaterThan(0.85);
      expect(bladeFlicker(t, 3)).toBeLessThan(1.15);
    }
    expect(bladeFlicker(1, 0)).not.toBe(bladeFlicker(1, 1));
  });

  it('is a white core in its colour with a glow of added light round it, which stays apart when the figure is merged', () => {
    const blade = swordBlade();
    const halo = blade.getObjectByName('halo')!;
    expect(halo.children.length).toBeGreaterThan(0);
    for (const m of halo.children) expect(((m as THREE.Mesh).material as THREE.Material).blending).toBe(THREE.AdditiveBlending);
    const model = weaponModel('laserSword');
    const inModel = model.getObjectByName('blade') as THREE.Group;
    expect(inModel).toBeDefined();
    bake(model);
    bake(inModel);
    // (merged into the figure's meshes, but still a blade with its glow, apart from the hilt)
    expect(model.getObjectByName('blade')).toBe(inModel);
    expect(inModel.getObjectByName('halo')!.children.length).toBe(halo.children.length);
  });

  it('shows as far as it is out, and not while a swing draws it elsewhere', () => {
    const blade = swordBlade();
    showBlade(blade, 0, 0, 1);
    expect(blade.visible).toBe(false);
    showBlade(blade, 0.5, 0, 1);
    expect(blade.visible).toBe(true);
    expect(blade.scale.z).toBeCloseTo(bladeReach(0.5));
    showBlade(blade, 1, 0, 1, 1, true);
    expect(blade.visible).toBe(false);
    // (a higher level widens its glow)
    showBlade(blade, 1, 0.3, 1, 1);
    const one = blade.getObjectByName('halo')!.scale.x;
    showBlade(blade, 1, 0.3, 1, 5);
    expect(blade.getObjectByName('halo')!.scale.x).toBeGreaterThan(one);
  });
});
