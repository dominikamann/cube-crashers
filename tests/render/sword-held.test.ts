import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createActors } from '../../src/render/actors';
import { BLADE_IN, BLADE_OUT } from '../../src/render/blade';
import { THEMES } from '../../src/render/theme';
import { createViewModel } from '../../src/render/viewmodel';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim } from '../../src/sim/sim';

const DT = 1 / 60;

function game() {
  const s = createSim(FLOORS.floor01.map, 1, { players: 1 });
  const p = s.players[0];
  p.weapons = [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }, { kind: 'laserSword', level: 1, cooldown: 0 }];
  p.selected = 1;
  return { s, p };
}

/** the blade of the sword in a group, if it is shown */
const bladeIn = (root: THREE.Object3D) => {
  const blade = root.getObjectByName('blade');
  let shown = !!blade;
  for (let o: THREE.Object3D | null = blade ?? null; o; o = o.parent) shown &&= o.visible;
  return shown ? blade! : null;
};

describe('the sword in the hand, in first person', () => {
  it('its blade runs out when it is taken and after a fall, and back in before the next weapon shows', () => {
    const { s, p } = game();
    const vm = createViewModel();
    let scene: THREE.Object3D | null = null;
    const renderer = { clearDepth() {}, render(sc: THREE.Object3D) { scene = sc; } } as unknown as THREE.WebGLRenderer;
    let time = 0;
    const frame = (n = 1) => {
      for (let i = 0; i < n; i++) vm.update(s, p.id, (time += DT), DT);
      vm.render(renderer, 1);
      return scene!;
    };
    const first = bladeIn(frame())!;
    expect(first).not.toBeNull();
    expect(first.scale.z).toBeLessThan(0.5);
    expect(bladeIn(frame(Math.ceil(BLADE_OUT / DT)))!.scale.z).toBeCloseTo(1);
    // (down for a while: back up, it lights anew)
    p.downUntil = s.tick + 100;
    frame(30);
    p.downUntil = null;
    expect(bladeIn(frame())!.scale.z).toBeLessThan(0.5);
    frame(Math.ceil(BLADE_OUT / DT));
    p.selected = 0;
    const going = bladeIn(frame(2));
    expect(going).not.toBeNull();
    expect(going!.scale.z).toBeLessThan(1);
    expect(bladeIn(frame(Math.ceil(BLADE_IN / DT) + 1))).toBeNull();
  });
});

describe('the sword in a figure\'s hand, seen from above', () => {
  it('its blade runs out, goes out when the player goes down, and sinks back before another weapon is held', () => {
    const { s, p } = game();
    const scene = new THREE.Scene();
    const actors = createActors(scene, s.map);
    const frame = (n = 1) => {
      for (let i = 0; i < n; i++) actors.update(s, [], THEMES.day, i * DT, DT, [p.id]);
      return actors.playerModel(p.id)!;
    };
    expect(bladeIn(frame())!.scale.z).toBeLessThan(0.5);
    expect(bladeIn(frame(Math.ceil(BLADE_OUT / DT)))!.scale.z).toBeCloseTo(1);
    p.downUntil = s.tick + 100;
    frame(Math.ceil(BLADE_IN / DT) + 1);
    p.downUntil = null;
    // (back up: it lights again)
    expect(bladeIn(frame())!.scale.z).toBeLessThan(0.5);
    frame(Math.ceil(BLADE_OUT / DT));
    p.selected = 0;
    expect(bladeIn(frame(2))).not.toBeNull();
    expect(bladeIn(frame(Math.ceil(BLADE_IN / DT) + 1))).toBeNull();
  });
});
