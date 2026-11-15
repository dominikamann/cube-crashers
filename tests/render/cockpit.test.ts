import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCockpit, vehicleHop } from '../../src/render/cockpit';
import { PITCH_START } from '../../src/input/first-person';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim } from '../../src/sim/sim';
import { addVehicle, KART } from '../../src/sim/systems/vehicles';
import type { SimEvent, SimState, VehicleKind } from '../../src/sim/types';

const DT = 1 / 60;
const LOOK = { yaw: 0, pitch: PITCH_START };
const KINDS: VehicleKind[] = ['kart', 'roller', 'hoverboard', 'unicorn', 'police'];

/** stands in for the WebGL renderer: it only notes what it was asked to draw */
function fakeRenderer() {
  const seen: { scene: THREE.Scene; camera: THREE.PerspectiveCamera }[] = [];
  const renderer = { clearDepth() {}, render: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void seen.push({ scene, camera }) } as unknown as THREE.WebGLRenderer;
  return { renderer, seen };
}

function seat(s: SimState, player: number, kind: VehicleKind) {
  const p = s.players[player];
  const v = addVehicle(s, kind, p.pos, 0);
  v.driverId = p.id;
  p.vehicleId = v.id;
  return v;
}

/** the cockpits in the scene (every group in it is one) */
const rigs = (scene: THREE.Scene) => scene.children.filter(o => (o as THREE.Group).isGroup);
const count = (scene: THREE.Scene) => {
  let n = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  scene.traverse(o => {
    n++;
    const g = (o as THREE.Mesh).geometry;
    if (g) geometries.add(g);
  });
  return `${n} objects, ${geometries.size} geometries`;
};

describe('the cockpit round a first-person view', () => {
  it('is there only for who drives and looks out of their own eyes', () => {
    const s = createSim(floor01, 1);
    const c = createCockpit();
    const me = s.players[0].id;
    expect(c.update(s, me, LOOK, [], 0, DT).shown).toBe(false);
    const v = seat(s, 0, 'kart');
    const out = c.update(s, me, LOOK, [], 0, DT);
    expect(out.shown).toBe(true);
    expect(out.vehicleId).toBe(v.id);
    // the view from above has none, nor has a player who is down
    expect(c.update(s, me, null, [], 0, DT).shown).toBe(false);
    s.players[0].downUntil = 100;
    expect(c.update(s, me, LOOK, [], 0, DT).shown).toBe(false);
    const { renderer, seen } = fakeRenderer();
    c.render(renderer, me, 72, 16 / 9);
    expect(seen).toHaveLength(0);
  });

  it('draws the cockpit of the vehicle one sits in, one at a time, and builds each only once', () => {
    const s = createSim(floor01, 1);
    const c = createCockpit();
    const me = s.players[0].id;
    const { renderer, seen } = fakeRenderer();
    const shown = new Set<THREE.Object3D>();
    KINDS.forEach((kind, k) => {
      s.vehicles = [];
      seat(s, 0, kind);
      c.update(s, me, LOOK, [], k, DT);
      c.render(renderer, me, 72, 16 / 9);
      const scene = seen[seen.length - 1].scene;
      const visible = rigs(scene).filter(o => o.visible);
      expect(visible).toHaveLength(1);
      shown.add(visible[0]);
      expect(rigs(scene)).toHaveLength(k + 1);
    });
    expect(shown.size).toBe(KINDS.length);
    // every one of them again, driven for a while: nothing is made anew
    const scene = seen[0].scene;
    const before = count(scene);
    for (const kind of KINDS) {
      s.vehicles = [];
      const v = seat(s, 0, kind);
      for (let f = 0; f < 30; f++) {
        v.vel = { x: -Math.sin(f * 0.05) * 9, z: -Math.cos(f * 0.05) * 9 };
        const events: SimEvent[] = f === 10 ? [{ type: 'kartRam', pos: { ...v.pos } }, { type: 'boost', playerId: me }] : [];
        s.players[0].boostUntil = f > 10 ? s.tick + 10 : 0;
        c.update(s, me, { yaw: 0, pitch: -0.4 }, events, 10 + f * DT, DT);
        c.render(renderer, me, 72, 16 / 9);
      }
    }
    expect(count(scene)).toBe(before);
    expect(rigs(scene)).toHaveLength(KINDS.length);
  });

  it('keeps the two views of a split screen apart', () => {
    const s = createSim(floor01, 1, { players: 2 });
    const c = createCockpit();
    const [a, b] = s.players;
    const kart = seat(s, 0, 'kart');
    seat(s, 1, 'unicorn');
    const { renderer, seen } = fakeRenderer();
    // the first drives off under a boost, the second stands
    kart.vel = { x: 0, z: -12 };
    a.boostUntil = s.tick + 100;
    let fovA = 0, fovB = 0;
    for (let f = 0; f < 30; f++) {
      fovA = c.update(s, a.id, LOOK, [], f * DT, DT).fov;
      fovB = c.update(s, b.id, LOOK, [], f * DT, DT).fov;
    }
    expect(fovA).toBeGreaterThan(5);
    expect(fovB).toBe(0);
    c.render(renderer, a.id, 72 + fovA, 0.9);
    const first = rigs(seen[0].scene).find(o => o.visible);
    c.render(renderer, b.id, 72, 0.9);
    const second = rigs(seen[1].scene).find(o => o.visible);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    // a narrow view is drawn through a wider lens, so the sides of the cockpit stay in it
    expect(seen[1].camera.fov).toBeGreaterThan(72);
    c.render(renderer, b.id, 72, 16 / 9);
    expect(seen[2].camera.fov).toBeCloseTo(72);
  });

  it('feels what the vehicle does: a landing slams it down, a jump lifts the eyes', () => {
    const s = createSim(floor01, 1);
    const c = createCockpit();
    const me = s.players[0].id;
    const v = seat(s, 0, 'hoverboard');
    const { renderer, seen } = fakeRenderer();
    // (measured at one moment of the board's shake, so only the jolt moves it)
    const height = () => {
      c.render(renderer, me, 72, 16 / 9);
      return rigs(seen[seen.length - 1].scene).find(o => o.visible)!.position.y;
    };
    c.update(s, me, LOOK, [], 0, DT);
    expect(height()).toBeCloseTo(0, 3);
    // someone else's landing far away is not felt
    c.update(s, me, LOOK, [{ type: 'kartLand', pos: { x: v.pos.x + 10, z: v.pos.z } }], 0, DT);
    for (let f = 2; f < 6; f++) c.update(s, me, LOOK, [], 0, DT);
    expect(height()).toBeCloseTo(0, 3);
    c.update(s, me, LOOK, [{ type: 'kartLand', pos: { ...v.pos } }], 0, DT);
    let low = 0;
    for (let f = 7; f < 20; f++) {
      c.update(s, me, LOOK, [], 0, DT);
      low = Math.min(low, height());
    }
    expect(low).toBeLessThan(-0.03);
    for (let f = 20; f < 200; f++) c.update(s, me, LOOK, [], 0, DT);
    expect(height()).toBeCloseTo(0, 3);
    // in the air off a ramp the eyes go up with the vehicle
    expect(c.update(s, me, LOOK, [], 0, DT).lift).toBe(0);
    v.air = KART.airTicks / 2;
    expect(c.update(s, me, LOOK, [], 0, DT).lift).toBeCloseTo(1.6);
    expect(vehicleHop({ air: 0 })).toBe(0);
  });
});
