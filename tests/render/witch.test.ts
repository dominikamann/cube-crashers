import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { createWitchFigures, WITCH_LOOK, type WitchPose } from '../../src/render/witch-figure';
import { createWitchFires } from '../../src/render/witch-fire';

const pose = (over: Partial<WitchPose> = {}): WitchPose => ({ id: 1, x: 0, y: 0, z: 0, yaw: 0, scale: 1, act: 'walk', t: 0, air: 0, stride: 0, moving: false, face: 0, burning: false, time: 1, ...over });
const bounds = (scene: THREE.Scene) => {
  scene.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(scene.children[0]);
};

describe('the witch, as she is drawn', () => {
  it('stands on the floor, about as tall as a person, and crouches with her feet on it', () => {
    const scene = new THREE.Scene();
    const f = createWitchFigures(scene);
    f.begin();
    f.add(pose());
    f.end();
    const standing = bounds(scene);
    expect(standing.min.y).toBeGreaterThan(-0.08);
    expect(standing.min.y).toBeLessThan(0.08);
    expect(standing.max.y).toBeGreaterThan(WITCH_LOOK.height - 0.3);
    f.begin();
    f.add(pose({ act: 'scan', t: 0.5 }));
    f.end();
    const crouched = bounds(scene);
    expect(crouched.max.y).toBeLessThan(standing.max.y - 0.2);
    expect(crouched.min.y).toBeGreaterThan(-0.2);
  });

  it('strikes every pose without trouble, and lights her broom when it burns', () => {
    const scene = new THREE.Scene();
    const f = createWitchFigures(scene);
    for (const act of ['walk', 'scan', 'charge', 'hop', 'press', 'sweep', 'throw', 'reel', 'dance'] as const) {
      f.begin();
      expect(() => f.add(pose({ act, t: 0.6, air: act === 'hop' ? 0.8 : 0, moving: act === 'walk', burning: act === 'sweep' }))).not.toThrow();
      f.end();
    }
    f.begin();
    f.add(pose({ burning: true }));
    f.end();
    expect(scene.getObjectByName('hot')!.visible).toBe(true);
    expect(scene.getObjectByName('twigs')!.visible).toBe(false);
    f.begin();
    f.add(pose({ burning: false }));
    f.end();
    expect(scene.getObjectByName('hot')!.visible).toBe(false);
  });

  it('turns her head round to show the glaring face', () => {
    const scene = new THREE.Scene();
    const f = createWitchFigures(scene);
    const head = () => scene.getObjectByName('head')!.rotation.y;
    f.begin();
    f.add(pose({ face: 0 }));
    f.end();
    const grin = head();
    f.begin();
    f.add(pose({ face: 1 }));
    f.end();
    expect(Math.abs(head() - grin - Math.PI)).toBeLessThan(0.01);
  });

  it('puts a figure away when she is gone, and uses it again for the next', () => {
    const scene = new THREE.Scene();
    const f = createWitchFigures(scene);
    f.begin();
    f.add(pose({ id: 1 }));
    f.add(pose({ id: 2, scale: WITCH_LOOK.small }));
    f.end();
    expect(scene.children).toHaveLength(2);
    f.begin();
    f.add(pose({ id: 2 }));
    f.end();
    expect(scene.children).toHaveLength(1);
    f.begin();
    f.add(pose({ id: 2 }));
    f.add(pose({ id: 3 }));
    f.end();
    expect(scene.children).toHaveLength(2);
  });
});

describe('her bonfire, as it is drawn', () => {
  it('burns with a light while she lives, and burns down and goes out after she falls', () => {
    const scene = new THREE.Scene();
    const fires = createWitchFires(scene);
    const s = createSim(FLOORS.waldsee.map, 4, { mode: 'quick' });
    stepSim(s, []);
    fires.update(s, [], 1, 1 / 60, 0);
    const light = () => scene.children.find(o => (o as THREE.PointLight).isPointLight) as THREE.PointLight | undefined;
    expect(light()?.intensity).toBeGreaterThan(0);
    const body = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    body.hp = 0;
    stepSim(s, []);
    expect(s.boss).toBeNull();
    fires.update(s, s.events, 1.1, 1 / 60, 0);
    expect(light()).toBeDefined();
    for (let t = 1.2; t < 12; t += 0.1) fires.update(s, [], t, 0.1, 0);
    expect(light()).toBeUndefined();
  });
});
