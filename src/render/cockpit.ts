import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PITCH_START } from '../input/first-person';
import { KART, VEHICLES } from '../sim/systems/vehicles';
import type { SimEvent, SimState, Vec2, Vehicle, VehicleKind } from '../sim/types';
import { playerColor } from './palette';
import { glowMat, lambert } from './pool';
import { jolt, newRide, stepRide, type Ride } from './ride';
import type { Theme } from './theme';

/**
 * First person in a vehicle: you look out of it. Each vehicle has its own cockpit round the view (the kart's
 * wheel, nose and front wheels, the steamroller's drum and cab, the police car's dashboard and hood, the nose of
 * the hoverboard under your feet, the unicorn's neck, mane and horn), drawn after the world like the weapon in
 * the hand. It steers, leans and shakes with what the vehicle does (see ride.ts).
 */
export interface Cockpit {
  /**
   * One frame further for the player a view looks through (`look`: null in the view from above). Says whether
   * there is a cockpit to draw, how much wider the lens is (a boost) and how far the eyes are lifted (a jump).
   */
  update(s: SimState, playerId: number, look: { yaw: number; pitch: number } | null, events: SimEvent[], time: number, frameDt: number): { shown: boolean; fov: number; lift: number; vehicleId: number };
  /** the light in the cockpit follows the floor's: dim at night */
  setTheme(theme: Theme): void;
  /** draws the cockpit of this player on top of the view just drawn (with that view's lens) */
  render(renderer: THREE.WebGLRenderer, playerId: number, fov: number, aspect: number): void;
}

/** the paint of each kart, by its id, so a grid of them is colourful */
export const KART_PAINT = [0xe23b3b, 0x3d8bfd, 0x3bd16f, 0xffa23b, 0xb15cff, 0x2bd4d4, 0xff6ab0, 0xf4f4fa];

/** how high a vehicle is in its jump off a ramp */
export const vehicleHop = (v: Pick<Vehicle, 'air'>): number => (v.air > 0 ? Math.sin(Math.PI * (1 - v.air / KART.airTicks)) * 1.6 : 0);

/** degrees the lens widens with a boost */
const BOOST_FOV = 9;
/** a view narrower than this (split screen) sees the cockpit through a wider lens, so its sides are not cut off */
const FULL_ASPECT = 1.15;
/** how much of looking up and down the cockpit stays level for: all of it would put the hood over the aim point */
const LEVEL = 0.3;

type V3 = [number, number, number];
const Z = new THREE.Vector3(0, 0, 1);

/** boxes gathered by material and merged, so a cockpit is a handful of draw calls */
function shape() {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const m4 = new THREE.Matrix4(), euler = new THREE.Euler(), q = new THREE.Quaternion(), dir = new THREE.Vector3();
  const put = (mat: THREE.Material, g: THREE.BufferGeometry) => {
    const list = by.get(mat);
    if (list) list.push(g);
    else by.set(mat, [g]);
  };
  const api = {
    box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rx || ry || rz) g.applyMatrix4(m4.makeRotationFromEuler(euler.set(rx, ry, rz)));
      g.translate(x, y, z);
      put(mat, g);
      return api;
    },
    /** a bar from `a` to `b` */
    beam(mat: THREE.Material, thick: number, a: V3, b: V3, wide = thick) {
      dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const g = new THREE.BoxGeometry(wide, thick, dir.length());
      g.applyMatrix4(m4.makeRotationFromQuaternion(q.setFromUnitVectors(Z, dir.normalize())));
      g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      put(mat, g);
      return api;
    },
    /** a ring of eight bars in the plane that faces the driver */
    ring(mat: THREE.Material, r: number, thick: number, deep: number) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        api.box(mat, 2 * r * Math.tan(Math.PI / 8) + thick * 0.5, thick, deep, Math.sin(a) * r, Math.cos(a) * r, 0, 0, 0, -a);
      }
      return api;
    },
    build(into: THREE.Object3D = new THREE.Group()) {
      for (const [mat, list] of by) {
        into.add(new THREE.Mesh(mergeGeometries(list)!, mat));
        for (const g of list) g.dispose();
      }
      by.clear();
      return into;
    },
  };
  return api;
}

/** what the cockpits are made of: one of each, shared */
function materials() {
  const glows: THREE.MeshStandardMaterial[] = [];
  const glow = (color: number, intensity: number) => {
    const m = glowMat(color, intensity);
    glows.push(m);
    return m;
  };
  return {
    glows,
    // (lighter than the vehicles' own dark parts: this close to the eye they would be black holes in the picture)
    dark: lambert(0x3a3a50),
    black: lambert(0x22222e),
    rubber: lambert(0x4a4a5a),
    tread: lambert(0x8a8aa0),
    steel: lambert(0x8a90a4),
    white: lambert(0xf4f4fa),
    yellow: lambert(0xffe14a),
    skin: lambert(0xffd2a8),
    /** the driver's sleeves: the suit of whoever looks */
    suit: lambert(0xffffff),
    /** the kart's paint: the kart's own */
    paint: lambert(KART_PAINT[0]),
    ledOff: lambert(0x3a3f55),
    ledOn: glow(0x4dff7a, 0.8),
    ledHot: glow(0xff2bd6, 1.2),
    red: glow(0xff3b3b, 0.6),
    glow,
  };
}
type Mats = ReturnType<typeof materials>;

interface Pose {
  r: Ride;
  time: number;
  /** 0..1 of the top speed */
  pace: number;
  driven: boolean;
}
interface Rig {
  root: THREE.Group;
  /** leans into a turn (positive) or rolls out of it, radians at full lock */
  lean: number;
  /** the engine's shake: standing, at full speed, and how fast */
  shake: [number, number, number];
  pose(p: Pose): void;
}

const scratch = new THREE.Vector3(), scratchB = new THREE.Vector3(), scratchQ = new THREE.Quaternion();
/** lays a bar (a box one long along z) from `a` to `b` */
function aim(bar: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  bar.position.copy(a).add(b).multiplyScalar(0.5);
  scratch.copy(b).sub(a);
  bar.scale.z = Math.max(0.001, scratch.length());
  bar.quaternion.copy(scratchQ.setFromUnitVectors(Z, scratch.normalize()));
}
const bar = (mat: THREE.Material, thick: number) => new THREE.Mesh(new THREE.BoxGeometry(thick, thick, 1), mat);

/** a steering wheel on its column, the driver's fists on it and their arms up to them */
function steeringWheel(m: Mats, root: THREE.Group, at: V3, tilt: number, radius: number, mark: THREE.Material, hub: THREE.Material) {
  const column = new THREE.Group();
  column.position.set(...at);
  column.rotation.x = tilt;
  const wheel = new THREE.Group();
  const s = shape().ring(m.dark, radius, 0.045, 0.045).box(m.dark, radius * 2, 0.04, 0.03, 0, 0, -0.01).box(m.dark, 0.04, radius, 0.03, 0, -radius / 2, -0.01);
  s.box(hub, 0.09, 0.09, 0.05, 0, 0, 0).box(mark, 0.06, 0.05, 0.05, 0, radius, 0.004);
  for (const x of [-radius, radius]) s.box(m.skin, 0.085, 0.1, 0.1, x, 0, 0.01);
  s.build(wheel);
  column.add(wheel);
  // (the shaft down into the dashboard)
  shape().beam(m.steel, 0.045, [0, 0, -0.02], [0, 0, -0.34]).build(column);
  const arms = [bar(m.suit, 0.095), bar(m.suit, 0.095)];
  root.add(column, ...arms);
  const shoulders = [new THREE.Vector3(-0.27, at[1] - 0.3, at[2] + 0.62), new THREE.Vector3(0.27, at[1] - 0.3, at[2] + 0.62)];
  return {
    column,
    turn(angle: number) {
      wheel.rotation.z = angle;
      wheel.updateMatrix();
      column.updateMatrix();
      arms.forEach((arm, i) => aim(arm, shoulders[i], scratchB.set(i === 0 ? -radius : radius, 0, 0.05).applyMatrix4(wheel.matrix).applyMatrix4(column.matrix)));
    },
  };
}

/** a row of lights that fills with the speed; a boost turns them all pink */
function speedLights(m: Mats, root: THREE.Object3D, n: number, at: V3, gap: number) {
  const geo = new THREE.BoxGeometry(gap * 0.7, 0.03, 0.02);
  const leds = Array.from({ length: n }, (_, i) => {
    const led = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(geo, m.ledOff);
    led.position.set(at[0] + (i - (n - 1) / 2) * gap, at[1], at[2]);
    root.add(led);
    return led;
  });
  return (p: Pose) => leds.forEach((led, i) => (led.material = p.r.boost > 0.5 ? m.ledHot : p.pace * n > i + 0.5 ? m.ledOn : m.ledOff));
}

/** a wheel seen from the seat: a tyre with pale blocks of tread, so it shows that it turns */
function tyre(m: Mats, r: number, wide: number) {
  const s = shape().box(m.rubber, wide, r * 2, r * 2, 0, 0, 0).box(m.rubber, wide, r * 2, r * 2, 0, 0, 0, Math.PI / 4).box(m.steel, wide + 0.03, r * 0.9, r * 0.9, 0, 0, 0);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    s.box(m.tread, wide * 0.8, 0.04, 0.08, 0, Math.cos(a) * r * 1.04, Math.sin(a) * r * 1.04, a);
  }
  return s.build() as THREE.Group;
}

function kartRig(m: Mats): Rig {
  const root = new THREE.Group();
  const s = shape();
  // the floor and the side pods beside the seat, the nose with its stripe, the bumper far in front
  s.box(m.dark, 0.9, 0.08, 1.5, 0, -0.84, -0.7);
  for (const x of [-0.52, 0.52]) s.box(m.paint, 0.24, 0.26, 1.0, x, -0.7, -0.78).box(m.white, 0.18, 0.03, 0.8, x, -0.56, -0.78).box(m.steel, 0.34, 0.05, 0.05, x * 0.85, -0.7, -1.5);
  s.box(m.paint, 0.58, 0.18, 0.8, 0, -0.57, -1.2).box(m.white, 0.13, 0.02, 0.8, 0, -0.475, -1.2);
  s.box(m.paint, 0.42, 0.15, 0.42, 0, -0.6, -1.8).box(m.white, 0.13, 0.02, 0.42, 0, -0.52, -1.8);
  s.box(m.yellow, 1.2, 0.06, 0.22, 0, -0.68, -2.08).box(m.dark, 1.0, 0.08, 0.08, 0, -0.64, -2.22);
  for (const x of [-0.2, 0.2]) s.box(m.glow(0xfff6c8, 2), 0.13, 0.05, 0.1, x, -0.535, -1.96);
  // the cowl in front of the wheel, with the lights of the speed on it
  s.box(m.paint, 0.6, 0.2, 0.14, 0, -0.47, -0.86).box(m.black, 0.44, 0.08, 0.04, 0, -0.39, -0.8, -0.5);
  s.build(root);
  const lights = speedLights(m, root, 5, [0, -0.385, -0.775], 0.075);
  const wheel = steeringWheel(m, root, [0, -0.36, -0.6], -0.5, 0.17, m.red, m.paint);
  // the front wheels: each hangs in a pivot that turns with the steering
  const pivots = [-0.74, 0.74].map(x => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.68, -1.56);
    pivot.add(tyre(m, 0.22, 0.22));
    root.add(pivot);
    return pivot;
  });
  return {
    root,
    lean: -0.025,
    shake: [0.0012, 0.004, 47],
    pose(p) {
      wheel.turn(p.r.steer * 0.8);
      for (const pivot of pivots) {
        pivot.rotation.y = p.r.steer * 0.5;
        pivot.children[0].rotation.x = -p.r.roll / 0.22;
      }
      lights(p);
    },
  };
}

function rollerRig(m: Mats): Rig {
  const root = new THREE.Group();
  const yellow = lambert(0xffb020), amber = m.glow(0xff8a1e, 1.1), iron = lambert(0x9aa0b4), ironDark = lambert(0x565c70);
  // the drum, wider than the view: slabs in two greys round it and bolts on its ends show it rolling
  const drum = new THREE.Group();
  const slabs = shape();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    slabs.box(k % 2 ? iron : ironDark, 2.7, 0.1, 0.165, 0, Math.cos(a) * 0.57, Math.sin(a) * 0.57, a);
    if (k % 2) for (const x of [-1.36, 1.36]) slabs.box(m.dark, 0.04, 0.1, 0.1, x, Math.cos(a) * 0.42, Math.sin(a) * 0.42, a);
  }
  slabs.box(ironDark, 2.68, 0.8, 0.8, 0, 0, 0).box(ironDark, 2.68, 0.8, 0.8, 0, 0, 0, Math.PI / 4);
  slabs.build(drum);
  drum.position.set(0, -1.06, -1.9);
  root.add(drum);
  const s = shape();
  // the yoke that holds the drum, the hood with its vents and lamps, the exhaust stack
  for (const x of [-1.47, 1.47]) s.box(yellow, 0.12, 0.2, 1.6, x, -0.86, -1.3).box(m.dark, 0.18, 0.26, 0.26, x, -0.98, -1.9);
  s.box(yellow, 0.84, 0.3, 0.62, 0, -0.76, -1.0).box(m.dark, 0.88, 0.05, 0.66, 0, -0.92, -1.0);
  for (const z of [-0.86, -1.0, -1.14]) s.box(m.dark, 0.46, 0.012, 0.06, -0.1, -0.606, z);
  for (const x of [-0.34, 0.34]) s.box(m.glow(0xffe14a, 2), 0.13, 0.06, 0.08, x, -0.58, -1.27);
  s.box(m.steel, 0.07, 0.5, 0.07, 0.3, -0.38, -1.22).box(m.dark, 0.1, 0.04, 0.1, 0.3, -0.12, -1.22);
  // the cab: two posts, the roof's edge above the screen, the sill and the console
  for (const x of [-1.02, 1.02]) s.box(m.dark, 0.05, 1.5, 0.05, x, -0.2, -0.76).box(yellow, 0.08, 0.1, 0.8, x, -0.7, -0.42);
  s.box(yellow, 2.2, 0.08, 0.2, 0, 0.56, -0.78).box(m.dark, 2.1, 0.04, 0.08, 0, 0.51, -0.76);
  s.box(m.dark, 2.0, 0.1, 0.12, 0, -0.7, -0.8).box(m.dark, 0.7, 0.16, 0.16, 0, -0.56, -0.86).box(m.black, 0.46, 0.07, 0.04, 0, -0.49, -0.79, -0.5);
  // the lever beside the seat
  s.beam(m.steel, 0.03, [0.44, -0.8, -0.6], [0.42, -0.5, -0.7]).box(m.red, 0.05, 0.05, 0.05, 0.42, -0.48, -0.7);
  s.build(root);
  // the beacon on the roof turns: its light sweeps along the roof's edge
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.03), amber);
  beacon.position.set(0, 0.485, -0.74);
  root.add(beacon);
  const lights = speedLights(m, root, 5, [0, -0.485, -0.765], 0.075);
  const wheel = steeringWheel(m, root, [0, -0.4, -0.6], -0.85, 0.19, yellow, m.steel);
  return {
    root,
    lean: -0.012,
    shake: [0.003, 0.007, 23],
    pose(p) {
      wheel.turn(p.r.steer * 0.8);
      drum.rotation.x = -p.r.roll / 0.6;
      // it hops over what it flattens
      drum.position.y = -1.06 + Math.sin(Math.PI * p.r.thump) * 0.09;
      beacon.position.x = Math.sin(p.time * 5) * 0.8;
      beacon.visible = p.driven;
      lights(p);
    },
  };
}

function policeRig(m: Mats): Rig {
  const root = new THREE.Group();
  const silver = lambert(0xdfe3e8), blue = lambert(0x2f5fbf), band = lambert(0xe8e23a), trim = lambert(0x2a3440);
  const s = shape();
  // the hood with its blue band, seen over the dashboard
  s.box(silver, 1.56, 0.1, 1.4, 0, -0.56, -1.7).box(blue, 0.5, 0.012, 1.4, 0, -0.505, -1.7).box(m.dark, 1.56, 0.07, 0.07, 0, -0.53, -2.42);
  for (const x of [-0.29, 0.29]) s.box(band, 0.04, 0.014, 1.4, x, -0.505, -1.7);
  for (const x of [-0.7, 0.7]) s.box(silver, 0.16, 0.06, 1.2, x, -0.5, -1.7);
  // the dashboard: the hump over the dials, the radio with its lights, the doors' sills
  s.box(trim, 1.9, 0.16, 0.52, 0, -0.5, -0.8).box(m.dark, 0.52, 0.1, 0.22, 0, -0.38, -0.84).box(m.black, 0.4, 0.08, 0.04, 0, -0.36, -0.74, -0.4);
  s.box(m.black, 0.24, 0.1, 0.12, 0.46, -0.38, -0.8).box(m.ledOn, 0.03, 0.03, 0.02, 0.4, -0.36, -0.735).box(m.red, 0.03, 0.03, 0.02, 0.45, -0.36, -0.735).box(m.steel, 0.08, 0.025, 0.02, 0.5, -0.39, -0.735);
  for (const x of [-0.96, 0.96]) s.box(trim, 0.12, 0.2, 1.0, x, -0.5, -0.5);
  // the posts beside the screen, the roof's edge and the mirror that hangs from it
  for (const x of [-1, 1]) s.beam(silver, 0.07, [x * 1.0, -0.44, -1.04], [x * 0.82, 0.42, -0.64]);
  s.box(trim, 1.7, 0.12, 0.14, 0, 0.44, -0.64).box(silver, 1.8, 0.05, 0.2, 0, 0.5, -0.68);
  s.box(m.dark, 0.03, 0.08, 0.03, 0, 0.36, -0.62).box(m.dark, 0.28, 0.1, 0.03, 0, 0.29, -0.62).box(lambert(0x9fc4e8), 0.24, 0.07, 0.012, 0, 0.29, -0.602);
  s.build(root);
  // the blue lights on the roof, one then the other: they show on the hood and under the roof's edge
  const lit = m.glow(0x4f9bff, 1.6);
  const flashes = [-1, 1].map(k => {
    const flash = shape().box(lit, 0.44, 0.012, 1.1, k * 0.52, -0.503, -1.75).box(lit, 0.6, 0.03, 0.04, k * 0.42, 0.375, -0.6).build();
    root.add(flash);
    return flash;
  });
  const lights = speedLights(m, root, 5, [0, -0.355, -0.718], 0.07);
  const wheel = steeringWheel(m, root, [0, -0.36, -0.6], -0.45, 0.17, silver, blue);
  return {
    root,
    lean: -0.03,
    shake: [0.001, 0.003, 41],
    pose(p) {
      wheel.turn(p.r.steer * 0.8);
      flashes.forEach((f, i) => (f.visible = p.driven && Math.floor(p.time * 5) % 2 === i));
      lights(p);
    },
  };
}

function boardRig(m: Mats): Rig {
  const root = new THREE.Group();
  const deck = lambert(0x2bd4d4), grip = lambert(0x1c3a52);
  const board = new THREE.Group();
  const s = shape();
  // the deck runs out from under the feet to a point, grip stripes across it, the rails glowing along its edges
  s.box(deck, 0.74, 0.07, 0.9, 0, -0.52, -0.65).box(deck, 0.56, 0.07, 0.4, 0, -0.52, -1.3).box(deck, 0.36, 0.07, 0.3, 0, -0.51, -1.65).box(deck, 0.18, 0.07, 0.16, 0, -0.5, -1.88);
  for (const [z, w] of [[-0.5, 0.56], [-0.72, 0.56], [-0.94, 0.56], [-1.2, 0.4], [-1.42, 0.4], [-1.66, 0.22]]) s.box(grip, w, 0.016, 0.09, 0, -0.48, z);
  for (const x of [-0.39, 0.39]) s.box(m.glow(0x2bf0ff, 3), 0.07, 0.05, 1.0, x, -0.55, -0.66).box(m.glow(0x2bf0ff, 3), 0.07, 0.05, 0.44, x * 0.77, -0.55, -1.3).box(m.glow(0x2bf0ff, 3), 0.06, 0.05, 0.3, x * 0.5, -0.54, -1.65);
  s.box(m.glow(0xff2bd6, 2.6), 0.12, 0.03, 0.08, 0, -0.455, -1.86);
  // the rider's feet on it, one in front of the other
  s.box(m.dark, 0.13, 0.07, 0.26, -0.12, -0.45, -0.78, 0, 0.5).box(m.dark, 0.13, 0.07, 0.26, 0.14, -0.45, -0.46, 0, 0.9);
  s.beam(m.suit, 0.12, [-0.1, -0.42, -0.7], [-0.04, -0.95, -0.1]).beam(m.suit, 0.12, [0.14, -0.42, -0.4], [0.08, -0.95, 0.0]);
  s.build(board);
  root.add(board);
  // the arms held out for balance
  const arms = [-1, 1].map(k => {
    const arm = bar(m.suit, 0.085), fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.1), m.skin);
    root.add(arm, fist);
    return { arm, fist, from: new THREE.Vector3(k * 0.4, -0.7, 0.1), k };
  });
  return {
    root,
    lean: 0.2,
    shake: [0, 0.0015, 60],
    pose(p) {
      // it floats: a slow bob, the nose up a little at speed
      board.position.y = Math.sin(p.time * 4) * 0.018;
      board.rotation.x = 0.03 * p.pace + p.r.boost * 0.03;
      for (const a of arms) {
        // (the arm on the inside of the turn goes down, the other up)
        a.fist.position.set(a.k * (0.74 + 0.04 * p.pace), -0.4 + a.k * p.r.steer * 0.1 + Math.sin(p.time * 4 + a.k) * 0.012, -0.8);
        aim(a.arm, a.from, a.fist.position);
      }
    },
  };
}

function unicornRig(m: Mats): Rig {
  const root = new THREE.Group();
  const coat = lambert(0xf6f4ff), pink = lambert(0xffc8e0), leather = lambert(0x8a5a3a), gold = m.glow(0xffc22e, 0.45);
  // the withers and the saddle's horn, right below
  shape().box(coat, 0.6, 0.3, 0.9, 0, -1.02, -0.3).box(lambert(0xff8fc8), 0.64, 0.05, 0.4, 0, -0.86, -0.05).box(leather, 0.3, 0.12, 0.12, 0, -0.8, -0.26).build(root);
  // the neck up to the head, the ears, the muzzle with its bridle, and the horn out in front
  const neck = new THREE.Group();
  neck.position.set(0, -0.86, -0.36);
  const s = shape();
  s.beam(coat, 0.32, [0, 0, 0], [0, 0.34, -0.62], 0.3).box(coat, 0.38, 0.3, 0.56, 0, 0.36, -0.82).box(pink, 0.3, 0.2, 0.22, 0, 0.3, -1.18);
  for (const x of [-0.15, 0.15]) s.box(coat, 0.08, 0.16, 0.08, x, 0.58, -0.6).box(pink, 0.04, 0.1, 0.02, x, 0.58, -0.555);
  s.box(leather, 0.4, 0.045, 0.05, 0, 0.39, -1.04).box(leather, 0.045, 0.32, 0.05, -0.2, 0.36, -1.04).box(leather, 0.045, 0.32, 0.05, 0.2, 0.36, -1.04);
  s.beam(gold, 0.11, [0, 0.5, -0.8], [0, 0.58, -0.98]).beam(m.glow(0xffd24a, 0.6), 0.08, [0, 0.58, -0.98], [0, 0.64, -1.14]).beam(m.glow(0xffe98a, 0.8), 0.05, [0, 0.64, -1.14], [0, 0.68, -1.27]);
  s.build(neck);
  root.add(neck);
  // the mane, in the colours of the rainbow, from behind the horn down the neck toward the rider: it flutters
  const maneGeo = new THREE.BoxGeometry(0.11, 0.1, 0.115);
  const mane = [0xff5a5f, 0xffa23b, 0xffe14a, 0x3bd16f, 0x3d8bfd, 0xb15cff].map((c, i) => {
    const lock = new THREE.Mesh(maneGeo, lambert(c));
    lock.position.set(0, 0.55 - i * 0.04, -0.72 + i * 0.1);
    neck.add(lock);
    return lock;
  });
  // the reins, from the bit back to the rider's fists
  const reins = [-1, 1].map(k => {
    const rein = bar(leather, 0.022), arm = bar(m.suit, 0.095), fist = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.1), m.skin);
    fist.position.set(k * 0.2, -0.37, -0.52);
    root.add(rein, arm, fist);
    return { rein, arm, fist, k, from: new THREE.Vector3(k * 0.3, -0.72, 0.1) };
  });
  return {
    root,
    lean: 0.07,
    shake: [0, 0, 1],
    pose(p) {
      // the gallop: the head nods with every stride; the horn stabs at what it spears
      const stride = Math.sin(p.r.stride), stab = Math.sin(Math.PI * p.r.thump);
      neck.rotation.x = stride * 0.035 * p.pace - stab * 0.1;
      neck.position.set(0, -0.86 + Math.abs(stride) * 0.035 * p.pace, -0.36 - stab * 0.12);
      neck.rotation.y = -p.r.steer * 0.12;
      mane.forEach((lock, i) => (lock.position.x = Math.sin(p.time * 9 + i * 0.9) * (0.012 + 0.03 * p.pace) * (0.4 + i * 0.2)));
      neck.updateMatrix();
      for (const h of reins) {
        h.fist.position.y = -0.37 - Math.abs(stride) * 0.02 * p.pace;
        aim(h.rein, h.fist.position, scratchB.set(h.k * 0.21, 0.3, -1.06).applyMatrix4(neck.matrix));
        aim(h.arm, h.from, h.fist.position);
      }
    },
  };
}

const RIGS: Record<VehicleKind, (m: Mats) => Rig> = { kart: kartRig, roller: rollerRig, police: policeRig, hoverboard: boardRig, unicorn: unicornRig };

const near = (a: Vec2, b: Vec2, reach: number) => Math.hypot(a.x - b.x, a.z - b.z) <= reach;

/** lines that fly past with a boost */
const STREAKS = 14;

export function createCockpit(): Cockpit {
  const scene = new THREE.Scene();
  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 2, 1);
  scene.add(ambient, sun);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.02, 12);
  const m = materials();
  const rigs = new Map<VehicleKind, Rig>();
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xd8fdff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const streakGeo = new THREE.BoxGeometry(0.012, 0.012, 0.7);
  const streaks = Array.from({ length: STREAKS }, (_, i) => {
    const line = new THREE.Mesh(streakGeo, streakMat);
    const a = (i / STREAKS) * Math.PI * 2 + 0.3, far = 0.95 + (i % 3) * 0.22;
    // (round the edge of the view, none across the middle or the cockpit)
    line.position.set(Math.cos(a) * far * 1.5, Math.sin(a) * far * 0.8 + 0.25, 0);
    line.visible = false;
    scene.add(line);
    return line;
  });
  // per player: in split screen both views draw a cockpit, each with its own steering and jolts
  const rides = new Map<number, { vehicleId: number; kind: VehicleKind; ride: Ride; pitch: number; time: number; pace: number; air: number; paint: number; suit: number; driven: boolean }>();
  const out = { shown: false, fov: 0, lift: 0, vehicleId: -1 };
  const pose: Pose = { r: newRide({ x: 0, z: 0 }, 0), time: 0, pace: 0, driven: false };

  return {
    update(s, playerId, look, events, time, frameDt) {
      out.shown = false;
      out.fov = out.lift = 0;
      const p = s.players.find(x => x.id === playerId);
      const v = look && p && p.downUntil === null && p.vehicleId !== null ? s.vehicles.find(x => x.id === p.vehicleId) : undefined;
      if (!look || !p || !v) {
        rides.delete(playerId);
        return out;
      }
      let st = rides.get(playerId);
      if (!st || st.vehicleId !== v.id) rides.set(playerId, (st = { vehicleId: v.id, kind: v.kind, ride: newRide(v.vel, look.yaw), pitch: look.pitch, time, pace: 0, air: 0, paint: 0, suit: 0, driven: true }));
      const r = st.ride;
      const top = VEHICLES[v.kind].speed;
      stepRide(r, { vel: v.vel, top, viewYaw: look.yaw, boosting: s.tick < p.boostUntil }, frameDt);
      for (const e of events) {
        // a boost kicks the nose up; ramming something knocks the cockpit (the roller rides over it); a hit
        // rattles it; a jump lifts the nose and the landing slams it down
        if (e.type === 'boost' && e.playerId === p.id) jolt(r, 0.3, -0.5);
        else if (e.type === 'kartRam' && near(e.pos, v.pos, 4)) {
          r.thump = 1;
          jolt(r, v.kind === 'roller' ? 1.3 : 0.6, 0.5);
        } else if (e.type === 'vehicleHit' && e.vehicleId === v.id) jolt(r, -0.5, 0.4);
        else if (e.type === 'kartJump' && near(e.pos, v.pos, 1.5)) jolt(r, 0.8, -0.8);
        else if (e.type === 'kartLand' && near(e.pos, v.pos, 1.5)) jolt(r, -1.7, 0.9);
      }
      st.air += ((v.air > 0 ? 1 : 0) - st.air) * Math.min(1, frameDt * 10);
      st.pitch = look.pitch;
      st.time = time;
      st.pace = Math.min(1, r.speed / top);
      st.paint = KART_PAINT[v.id % KART_PAINT.length];
      st.suit = playerColor(p.color);
      st.driven = v.driverId !== null;
      out.shown = true;
      out.fov = BOOST_FOV * r.boost;
      out.lift = vehicleHop(v);
      out.vehicleId = v.id;
      return out;
    },
    setTheme(theme) {
      // (the day's sun is the full light; a night floor leaves about two thirds of it)
      const dim = Math.max(0.5, Math.min(1, theme.sunIntensity / 1.7));
      ambient.intensity = 1.4 * dim;
      sun.intensity = 1.6 * dim;
      // (in the floor's colours too, so the kart from inside has the paint it has from outside: bluish at night)
      ambient.color.setHex(theme.hemiSky);
      sun.color.setHex(theme.sunColor);
      const g = Math.min(theme.glow, 1.4);
      for (const mat of m.glows) mat.emissiveIntensity = mat.userData.baseGlow * g;
    },
    render(renderer, playerId, fov, aspect) {
      const st = rides.get(playerId);
      if (!st) return;
      let rig = rigs.get(st.kind);
      if (!rig) {
        rigs.set(st.kind, (rig = RIGS[st.kind](m)));
        scene.add(rig.root);
      }
      for (const [kind, other] of rigs) other.root.visible = kind === st.kind;
      const r = st.ride, t = st.time;
      m.paint.color.setHex(st.paint);
      m.suit.color.setHex(st.suit);
      pose.r = r;
      pose.time = t;
      pose.pace = st.pace;
      pose.driven = st.driven;
      rig.pose(pose);
      // the cockpit stays level while the view tilts (half of it), sinks back under a boost and when it pulls
      // away, nods when it brakes, and turns a little the way it drives
      const [idle, run, rate] = rig.shake;
      rig.root.position.set(0, r.bump + Math.sin(t * rate) * (idle + run * st.pace) + Math.sin(t * rate * 0.37) * idle, -0.03 * r.boost - 0.012 * r.tilt);
      rig.root.rotation.set((PITCH_START - st.pitch) * LEVEL + r.tilt * 0.022 + r.boost * 0.012 + st.air * 0.07 - r.nod, r.swing, rig.lean * r.steer);
      streakMat.opacity = 0.55 * r.boost;
      for (let i = 0; i < STREAKS; i++) {
        const line = streaks[i];
        line.visible = r.boost > 0.02;
        if (line.visible) line.position.z = -4.2 + ((t * (5 + (i % 4)) + i * 1.7) % 4.6);
      }
      // (in a narrow view the lens is widened, so the cockpit's sides stay in the picture)
      const tan = Math.tan((fov * Math.PI) / 360) * Math.max(1, FULL_ASPECT / aspect);
      const lens = (Math.atan(tan) * 360) / Math.PI;
      if (camera.aspect !== aspect || camera.fov !== lens) {
        camera.aspect = aspect;
        camera.fov = lens;
        camera.updateProjectionMatrix();
      }
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
  };
}
