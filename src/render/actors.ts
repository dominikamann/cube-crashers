import * as THREE from 'three';
import { HOLD_TICKS, JUMP_TICKS } from '../sim/config/balance';
import { jumpTicks } from '../sim/systems/versus';
import { wallTop } from './world';
import { CLIMB_TICKS } from '../sim/map/ladders';
import { perchable } from '../sim/map/perch';
import { JETPACK } from '../sim/config/rare';
import { BUILD_TICKS, UPGRADE_TICKS } from '../sim/config/towers';
import { BOMB, HOTDOG } from '../sim/config/weapons';
import type { FloorMap } from '../sim/map/tilemap';
import { zoneTiles } from '../sim/systems/nests';
import { KART } from '../sim/systems/vehicles';
import type { Nest, Player, SimEvent, SimState, Tower, TowerKind, Vehicle, VehicleKind } from '../sim/types';
import { box, glowMat, lambert, setGlow } from './pool';
import { looksFor, type Look } from '../characters';
import { animate, buildFigure, DANCE_SECONDS } from './cast';
import { bake, FIGURE_GLOW, FIGURE_LIT, FIGURE_SOLID } from './figure';
import { weaponModel, type HeldKind } from './viewmodel';
import type { Theme } from './theme';
import { NORMAL, palette, playerColor } from './palette';

/** the normal suit colours; playerColor() gives the ones shown right now (colour-blind mode changes some) */
export const PLAYER_COLORS = NORMAL.players;

export interface Actors {
  /** `localIds`: the players on this screen (two in split screen) */
  update(s: SimState, events: SimEvent[], theme: Theme, time: number, frameDt: number, localIds: number[]): void;
  /** where the camera of view `i` should look */
  playerPos(i?: number): THREE.Vector3;
  /** the model of player `id` (first person hides it for that view) */
  playerModel(id: number): THREE.Object3D | undefined;
  /** the ground crosshair of view `i` (first person has one in the middle of the screen instead) */
  reticle(i: number): THREE.Object3D | undefined;
  /** a new floor: move the elevator */
  setMap(map: FloorMap): void;
}

/** how far the weapon in a figure's hand is scaled up from the first-person model */
const HELD_SCALE = 1.2;
// three little stars that circle over a downed player
const dizzyGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
const dizzyMat = glowMat(0xffe14a, 1.6);

function makePlayer(color: number, look: Look) {
  const root = new THREE.Group();
  const pal = palette();
  const figure = buildFigure(look, playerColor(color));
  const body = figure.parts.body;
  // the weapon it holds: swapped for the model of the one that is selected
  const held = new THREE.Group();
  held.position.set(...figure.model.hand);
  held.scale.setScalar(HELD_SCALE);
  body.add(held);
  root.add(body);
  const dizzy = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const star = new THREE.Mesh(dizzyGeo, dizzyMat);
    star.position.set(Math.cos((i * Math.PI * 2) / 3) * 0.32, 0, Math.sin((i * Math.PI * 2) / 3) * 0.32);
    dizzy.add(star);
  }
  dizzy.visible = false;
  root.add(dizzy);

  // the sword's slash: a glowing band that sweeps across the front and fades
  const swordMat = glowMat(0xff3bd6, 2.2);
  Object.assign(swordMat, { side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const sword = new THREE.Mesh(new THREE.RingGeometry(0.55, 1, 20, 1, -Math.PI * 0.18, Math.PI * 0.36).rotateX(-Math.PI / 2), swordMat);
  sword.visible = false;
  root.add(sword);
  // the fly swatter: a paddle on a handle, held upright and swung sideways across the front
  const swatter = new THREE.Group();
  const paddle = new THREE.Group();
  const mesh = lambert(0x3bd16f);
  paddle.add(box(0.06, 0.06, 0.9, lambert(0x8a5a2b), 0, 0, -0.45));
  paddle.add(box(0.95, 0.05, 0.8, mesh, 0, 0, -1.25));
  for (const o of [-0.3, 0, 0.3]) paddle.add(box(0.03, 0.07, 0.8, lambert(0x1f8a44), o, 0, -1.25));
  swatter.add(paddle);
  swatter.position.y = 0.85;
  swatter.visible = false;
  root.add(swatter);
  // the light is not part of `root`: root blinks while invulnerable, and a light switching on and off
  // changes the scene's light count, which recompiles every shader
  const light = new THREE.PointLight(0x2bf0ff, 0, 5);
  // jetpack on the back, flame below while flying
  const pack = new THREE.Group();
  pack.add(box(0.45, 0.5, 0.22, lambert(0xd0d4e0), 0, 0.8, 0.32));
  pack.add(box(0.14, 0.22, 0.14, lambert(0x444455), -0.13, 0.48, 0.34));
  pack.add(box(0.14, 0.22, 0.14, lambert(0x444455), 0.13, 0.48, 0.34));
  const flame = box(0.22, 0.45, 0.22, glowMat(0xff9f2e, 3), 0, 0.15, 0.34);
  flame.castShadow = false;
  pack.add(flame);
  pack.position.set(...figure.model.back);
  pack.visible = false;
  body.add(pack);
  // golden glint around a player holding a rare weapon
  const glint = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.72, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true }));
  glint.position.y = 0.05;
  glint.visible = false;
  root.add(glint);
  // colour-blind mode marks the teams by shape too: a triangle (▲) for team 0, a ball (●) for team 1
  const marks = [new THREE.ConeGeometry(0.26, 0.4, 3), new THREE.SphereGeometry(0.2, 12, 8)].map((g, team) => {
    const m = new THREE.Mesh(g, glowMat(pal.teams[team], 1.6));
    m.position.y = 2.55;
    m.visible = false;
    root.add(m);
    return m;
  });
  return {
    color, pal, look, figure, held, heldKind: null as HeldKind | null, dizzy, marks, root, body, sword, swordMat, swatter, paddle, light, pack, flame, glint,
    swordT: 1, swatT: 1, yaw: 0, lastX: NaN, lastZ: NaN,
    // what the animation remembers from frame to frame
    step: 0, pace: 0, ahead: 0, aside: 0, idle: 0, land: 0, dash: 0, kick: 0, wasAir: false, lastCooldown: 0,
  };
}

const scaffoldMat = new THREE.LineBasicMaterial({ color: 0xffcf3a });
const scaffoldGeo = (() => {
  // a scaffold: the outline of a box with cross braces on the sides
  const pts: number[] = [];
  const w = 0.75, h = 2.4;
  const corners = [[-w, -w], [w, -w], [w, w], [-w, w]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    for (const y of [0, h / 2, h]) pts.push(ax, y, az, bx, y, bz);
    pts.push(ax, 0, az, ax, h, az);
    pts.push(ax, 0, az, bx, h / 2, bz, ax, h / 2, az, bx, h, bz);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
})();

/** geometries and materials shared by many actors: never disposed with one of them */
const SHARED = new Set<object>();

/** frees the GPU resources of an actor that left the scene (shared ones stay) */
function disposeTree(root: THREE.Object3D): void {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !SHARED.has(mesh.geometry) && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) if (!SHARED.has(m)) m.dispose();
  });
}

function makeTower(kind: TowerKind): { root: THREE.Group; body: THREE.Group; head: THREE.Object3D; lightColor: number; scaffold: THREE.LineSegments; pips: THREE.Group; level: number } {
  const outer = new THREE.Group();
  const root = new THREE.Group();
  outer.add(root);
  let head: THREE.Object3D;
  let lightColor: number;
  if (kind === 'laser') {
    const stone = lambert(0x9a9aa8);
    root.add(box(1.2, 0.8, 1.2, stone, 0, 0.6, 0));
    root.add(box(1.0, 0.8, 1.0, lambert(0x8a8a98), 0, 1.4, 0));
    head = box(0.7, 0.5, 0.7, glowMat(0xff8c42, 1.4), 0, 2.05, 0);
    head.add(box(0.15, 0.15, 0.6, glowMat(0xffd0a0, 2), 0, 0, -0.5));
    lightColor = 0xff8c42;
  } else if (kind === 'popcorn') {
    root.add(box(1.2, 0.9, 1.2, lambert(0xe23b3b), 0, 0.65, 0));
    for (const x of [-0.45, 0, 0.45]) root.add(box(0.2, 0.92, 1.22, lambert(0xffffff), x, 0.65, 0));
    head = new THREE.Group();
    (head as THREE.Group).add(box(0.5, 0.5, 0.9, lambert(0x555566), 0, 0, -0.1));
    (head as THREE.Group).add(box(0.6, 0.35, 0.6, lambert(0xfff6e0), 0, 0.35, 0.2));
    head.position.y = 1.4;
    head.rotation.x = -0.5;
    lightColor = 0xffe14a;
  } else if (kind === 'tesla') {
    // a copper coil on a dark base, a glowing ball on top
    root.add(box(1.1, 0.5, 1.1, lambert(0x3a3550), 0, 0.45, 0));
    for (let i = 0; i < 4; i++) root.add(box(0.62 - i * 0.06, 0.16, 0.62 - i * 0.06, lambert(i % 2 ? 0xb06a2a : 0xd88a3a), 0, 0.8 + i * 0.22, 0));
    head = box(0.5, 0.5, 0.5, glowMat(0x9fd0ff, 1.6), 0, 1.95, 0);
    lightColor = 0x9fd0ff;
  } else if (kind === 'bumper') {
    // a pinball bumper: a fat ring with a glowing cap
    root.add(box(1.2, 0.35, 1.2, lambert(0xffffff), 0, 0.3, 0));
    root.add(box(1.0, 0.5, 1.0, lambert(0xff2bd6), 0, 0.72, 0));
    head = box(0.7, 0.25, 0.7, glowMat(0xffe14a, 1.4), 0, 1.1, 0);
    lightColor = 0xff2bd6;
  } else {
    root.add(box(1.1, 0.6, 1.1, lambert(0xbfe9ff), 0, 0.5, 0));
    root.add(box(0.7, 0.7, 0.7, glowMat(0x5fc8f0, 0.5), 0, 1.1, 0));
    head = box(0.45, 0.9, 0.45, glowMat(0x9fe8ff, 0.9), 0, 1.85, 0);
    head.rotation.y = Math.PI / 4;
    lightColor = 0x7fdcff;
  }
  root.add(head);
  const scaffold = new THREE.LineSegments(scaffoldGeo, scaffoldMat);
  const pips = new THREE.Group();
  pips.position.set(0, 0.12, 0.72);
  outer.add(scaffold, pips);
  return { root: outer, body: root, head, lightColor, scaffold, pips, level: 0 };
}

/** the paint of each kart, by its id, so a grid of them is colourful */
const KART_PAINT = [0xe23b3b, 0x3d8bfd, 0x3bd16f, 0xffa23b, 0xb15cff, 0x2bd4d4, 0xff6ab0, 0xf4f4fa];

function makeKart(kind: VehicleKind = 'kart', id = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  if (kind === 'roller') {
    // a steamroller: a big drum in front (bolts round its rim show it rolling), a yellow body with a glass cabin,
    // a beacon on the roof, an exhaust stack and two fat rear wheels
    const drum = new THREE.Group();
    const drumMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 14).rotateZ(Math.PI / 2), lambert(0x6a6f80));
    drumMesh.castShadow = true;
    drum.add(drumMesh);
    for (let i = 0; i < 6; i++) for (const x of [-0.86, 0.86]) drum.add(box(0.04, 0.12, 0.12, lambert(0x3a3f52), x, Math.sin((i / 6) * Math.PI * 2) * 0.38, Math.cos((i / 6) * Math.PI * 2) * 0.38));
    drum.position.set(0, 0.55, -0.7);
    const yellow = lambert(0xffb020), dark = lambert(0x333344), steel = lambert(0x8a90a4);
    body.add(drum, box(1.3, 0.55, 1.25, yellow, 0, 0.62, 0.45), box(1.34, 0.1, 1.29, dark, 0, 0.36, 0.45), box(1.9, 0.14, 0.2, yellow, 0, 0.72, -0.7));
    for (const x of [-0.9, 0.9]) body.add(box(0.1, 0.4, 0.9, yellow, x, 0.62, -0.5));
    body.add(box(0.95, 0.55, 0.75, lambert(0x9fd8ff), 0, 1.17, 0.55), box(1.0, 0.08, 0.8, dark, 0, 0.92, 0.55), box(1.06, 0.1, 0.86, yellow, 0, 1.5, 0.55));
    for (const [x, z] of [[-0.48, 0.2], [0.48, 0.2], [-0.48, 0.9], [0.48, 0.9]]) body.add(box(0.08, 0.56, 0.08, dark, x, 1.18, z));
    body.add(box(0.2, 0.12, 0.2, glowMat(0xffa23b, 2.4), 0, 1.61, 0.55), box(0.1, 0.5, 0.1, steel, 0.5, 1.15, -0.05), box(0.14, 0.06, 0.14, dark, 0.5, 1.42, -0.05));
    for (const x of [-0.3, 0.3]) body.add(box(0.22, 0.14, 0.06, glowMat(0xffe14a, 2), x, 0.75, -0.2));
    body.add(box(0.35, 0.14, 0.06, glowMat(0xff3b3b, 1.6), 0, 0.7, 1.09));
    const wheels: THREE.Group[] = [drum];
    for (const x of [-0.72, 0.72]) {
      const w = new THREE.Group();
      w.add(box(0.3, 0.7, 0.7, dark, 0, 0, 0), box(0.32, 0.5, 0.5, dark, 0, 0, 0), box(0.34, 0.3, 0.3, steel, 0, 0, 0), box(0.36, 0.1, 0.44, yellow, 0, 0, 0));
      (w.children[1] as THREE.Mesh).rotation.x = Math.PI / 4;
      w.position.set(x, 0.35, 0.75);
      body.add(w);
      wheels.push(w);
    }
    root.add(body);
    return { root, body, yaw: 0, wheels };
  }
  if (kind === 'unicorn') {
    // a white voxel unicorn: golden horn, a mane and a tail in rainbow colours, four legs that gallop
    const coat = lambert(0xf6f4ff), hoof = lambert(0xc9b8ff);
    body.add(box(0.62, 0.55, 1.25, coat, 0, 0.95, 0.05));
    body.add(box(0.36, 0.5, 0.36, coat, 0, 1.3, -0.55), box(0.38, 0.36, 0.6, coat, 0, 1.55, -0.78), box(0.28, 0.2, 0.2, lambert(0xffc8e0), 0, 1.47, -1.07));
    body.add(box(0.08, 0.08, 0.04, lambert(0x2a2a50), -0.16, 1.62, -0.96), box(0.08, 0.08, 0.04, lambert(0x2a2a50), 0.16, 1.62, -0.96));
    body.add(box(0.07, 0.14, 0.07, coat, -0.12, 1.79, -0.62), box(0.07, 0.14, 0.07, coat, 0.12, 1.79, -0.62));
    // a saddle on a blanket
    body.add(box(0.66, 0.06, 0.6, lambert(0xff8fc8), 0, 1.25, 0.1), box(0.4, 0.1, 0.42, lambert(0x8a5a3a), 0, 1.31, 0.1), box(0.4, 0.14, 0.08, lambert(0x8a5a3a), 0, 1.36, 0.32));
    const horn = new THREE.Group();
    horn.add(box(0.1, 0.1, 0.22, glowMat(0xffd84a, 1.1), 0, 0, 0), box(0.07, 0.07, 0.18, glowMat(0xffe98a, 1.1), 0, 0.02, -0.17), box(0.04, 0.04, 0.12, glowMat(0xfff6c8, 1.2), 0, 0.04, -0.3));
    horn.position.set(0, 1.78, -0.92);
    horn.rotation.x = 0.55;
    body.add(horn);
    const rainbow = [0xff5a5f, 0xffa23b, 0xffe14a, 0x3bd16f, 0x3d8bfd, 0xb15cff];
    rainbow.forEach((c, i) => body.add(box(0.12, 0.16, 0.14, lambert(c), 0, 1.68 - i * 0.07, -0.5 + i * 0.13)));
    const tail = new THREE.Group();
    rainbow.forEach((c, i) => tail.add(box(0.14, 0.1, 0.12, lambert(c), 0, -i * 0.09, i * 0.06)));
    tail.position.set(0, 1.08, 0.7);
    body.add(tail);
    const legs: THREE.Group[] = [];
    for (const [x, z] of [[-0.2, -0.42], [0.2, -0.42], [-0.2, 0.48], [0.2, 0.48]]) {
      const leg = new THREE.Group();
      leg.add(box(0.16, 0.5, 0.16, coat, 0, -0.25, 0), box(0.18, 0.12, 0.2, hoof, 0, -0.55, 0));
      leg.position.set(x, 0.72, z);
      body.add(leg);
      legs.push(leg);
    }
    root.add(body);
    return { root, body, yaw: 0, legs, tail };
  }
  if (kind === 'hoverboard') {
    // a hoverboard: a tapered deck with grip stripes, glowing rails underneath, two fins and a thruster at the back
    const deck = lambert(0x2bd4d4), dark = lambert(0x1c3a52);
    body.add(box(0.8, 0.1, 1.2, deck, 0, 0.45, 0.05), box(0.6, 0.1, 0.35, deck, 0, 0.45, -0.7), box(0.36, 0.1, 0.2, deck, 0, 0.47, -0.96), box(0.6, 0.1, 0.25, deck, 0, 0.47, 0.76));
    for (const z of [-0.4, -0.1, 0.2, 0.5]) body.add(box(0.6, 0.02, 0.1, dark, 0, 0.51, z));
    for (const x of [-0.3, 0.3]) body.add(box(0.1, 0.05, 1.3, glowMat(0x2bf0ff, 3), x, 0.37, 0), box(0.05, 0.2, 0.3, deck, x * 1.2, 0.55, 0.72));
    body.add(box(0.3, 0.12, 0.2, dark, 0, 0.42, 0.9), box(0.22, 0.08, 0.06, glowMat(0xff2bd6, 2.6), 0, 0.42, 1.02), box(0.5, 0.03, 0.9, glowMat(0x9ff6ff, 1.2), 0, 0.33, 0));
    root.add(body);
    return { root, body, yaw: 0 };
  }
  // a little racing kart built from small cubes: a low floor, side pods, a nose with a bumper and headlights, a
  // seat with a headrest, the engine and two exhausts behind it, a rear wing, and four wheels that turn
  const paint = lambert(KART_PAINT[id % KART_PAINT.length]), dark = lambert(0x23232e), steel = lambert(0x8a90a4), white = lambert(0xf4f4fa), yellow = lambert(0xffe14a);
  body.add(box(0.95, 0.12, 2.0, dark, 0, 0.3, 0));
  for (const x of [-0.42, 0.42]) body.add(box(0.26, 0.3, 1.05, paint, x, 0.5, 0.1), box(0.2, 0.06, 0.8, white, x, 0.67, 0.1));
  body.add(box(0.62, 0.26, 0.55, paint, 0, 0.47, -0.72), box(0.44, 0.2, 0.3, paint, 0, 0.43, -1.08), box(0.14, 0.03, 0.8, white, 0, 0.61, -0.82));
  body.add(box(1.2, 0.07, 0.26, yellow, 0, 0.3, -1.2), box(1.0, 0.1, 0.1, dark, 0, 0.36, -1.3));
  for (const x of [-0.22, 0.22]) body.add(box(0.14, 0.1, 0.05, glowMat(0xfff6c8, 2), x, 0.47, -1.24));
  // the cockpit: steering column and wheel, the seat
  body.add(box(0.05, 0.3, 0.05, steel, 0, 0.62, -0.38));
  // the steering wheel: a rim with a spoke and a red top mark, tilted toward the driver; it turns with the kart
  const column = new THREE.Group();
  column.position.set(0, 0.82, -0.34);
  column.rotation.x = -1.05;
  const steering = new THREE.Group();
  steering.add(box(0.36, 0.05, 0.06, dark, 0, 0, -0.15), box(0.36, 0.05, 0.06, dark, 0, 0, 0.15), box(0.06, 0.05, 0.36, dark, -0.15, 0, 0), box(0.06, 0.05, 0.36, dark, 0.15, 0, 0));
  steering.add(box(0.3, 0.04, 0.06, steel, 0, 0, 0), box(0.1, 0.06, 0.1, paint, 0, 0, 0), box(0.08, 0.06, 0.07, glowMat(0xff3b3b, 1.2), 0, 0, -0.15));
  column.add(steering);
  body.add(column);
  body.add(box(0.62, 0.1, 0.5, dark, 0, 0.4, 0.2), box(0.62, 0.62, 0.12, dark, 0, 0.72, 0.5), box(0.5, 0.5, 0.04, paint, 0, 0.72, 0.43), box(0.3, 0.2, 0.14, dark, 0, 1.12, 0.5));
  // the engine, its exhausts and the tail lights
  body.add(box(0.6, 0.34, 0.4, steel, 0, 0.55, 0.82), box(0.44, 0.08, 0.3, dark, 0, 0.76, 0.82));
  for (const x of [-0.2, 0.2]) body.add(box(0.1, 0.1, 0.36, steel, x, 0.6, 1.12), box(0.07, 0.07, 0.04, glowMat(0xff8a2b, 2), x, 0.6, 1.31));
  for (const x of [-0.4, 0.4]) body.add(box(0.14, 0.1, 0.05, glowMat(0xff3b3b, 2), x, 0.42, 1.02));
  // the rear wing on two posts
  for (const x of [-0.42, 0.42]) body.add(box(0.06, 0.42, 0.06, steel, x, 0.92, 0.98), box(0.05, 0.24, 0.4, paint, x * 1.48, 1.16, 1.0));
  body.add(box(1.24, 0.07, 0.36, yellow, 0, 1.16, 1.0));
  // wheels: a tyre with a light hub and a bolt, so you see them turn (the rear ones are bigger)
  const wheels: THREE.Group[] = [];
  const pivots: THREE.Group[] = [];
  for (const [x, z, r] of [[-0.66, -0.75, 0.24], [0.66, -0.75, 0.24], [-0.68, 0.72, 0.3], [0.68, 0.72, 0.3]]) {
    const w = new THREE.Group();
    w.add(box(0.28, r * 2, r * 2, dark, 0, 0, 0), box(0.3, r * 1.5, r * 1.5, dark, 0, 0, 0), box(0.31, r * 0.9, r * 0.9, steel, 0, 0, 0), box(0.33, r * 0.35, r * 1.2, white, 0, 0, 0));
    (w.children[1] as THREE.Mesh).rotation.x = Math.PI / 4;
    // the front wheels hang in a pivot that turns with the steering
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    pivot.add(w);
    body.add(pivot, box(0.36, 0.06, 0.06, steel, x * 0.72, r, z));
    wheels.push(w);
    if (z < 0) pivots.push(pivot);
  }
  root.add(body);
  return { root, body, yaw: 0, wheels, steering, pivots };
}

const tileQuad = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
const ZONE_IDLE = new THREE.Color(0xff2bd6).multiplyScalar(0.55);
const ZONE_LIT = new THREE.Color(0x2bf0ff).multiplyScalar(1.6);

SHARED.add(scaffoldGeo).add(scaffoldMat).add(tileQuad).add(FIGURE_LIT).add(FIGURE_GLOW).add(FIGURE_SOLID).add(dizzyGeo).add(dizzyMat);

/** how big a nest's pile of cubes is while its zone is held, against its full size */
const NEST_HELD_SIZE = 0.4;

function makeNest(map: FloorMap, pos: { x: number; z: number }) {
  const root = new THREE.Group();
  const dark = lambert(0x2a1040);
  const glow = glowMat(0xff2bd6, 1.6);
  const cubes: THREE.Mesh[] = [];
  const layout: [number, number, number, number][] = [
    [0, 0.6, 0, 1.3], [-0.9, 0.4, 0.3, 0.8], [0.8, 0.45, -0.4, 0.9], [0.2, 1.5, 0.1, 0.8],
    [-0.5, 1.2, -0.6, 0.6], [0.6, 1.1, 0.7, 0.55], [0, 2.2, 0, 0.5], [-0.8, 0.3, -0.9, 0.5], [1.0, 0.3, 0.6, 0.5],
  ];
  layout.forEach(([x, y, z, size], i) => {
    const m = box(size, size, size, i % 3 === 2 ? glow : dark, x, y, z);
    m.userData.home = new THREE.Vector3(x, y, z);
    cubes.push(m);
    root.add(m);
  });
  // the hold zone: the floor tiles themselves light up, nearest to the nest first
  const tiles = zoneTiles(map, pos)
    .map(t => ({ x: t.tx + 0.5 - pos.x, z: t.tz + 0.5 - pos.z }))
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const fillMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false });
  const fill = new THREE.InstancedMesh(tileQuad, fillMat, Math.max(1, tiles.length));
  fill.count = tiles.length;
  const o = new THREE.Object3D();
  tiles.forEach((t, i) => {
    o.position.set(t.x, 0.03, t.z);
    o.updateMatrix();
    fill.setMatrixAt(i, o.matrix);
    fill.setColorAt(i, ZONE_IDLE);
  });
  // a glowing outline along the outer edge of the zone
  const key = new Set(tiles.map(t => `${t.x},${t.z}`));
  const edges: { x: number; z: number; sx: number; sz: number }[] = [];
  for (const t of tiles) {
    if (!key.has(`${t.x + 1},${t.z}`)) edges.push({ x: t.x + 0.5, z: t.z, sx: 0.1, sz: 1.1 });
    if (!key.has(`${t.x - 1},${t.z}`)) edges.push({ x: t.x - 0.5, z: t.z, sx: 0.1, sz: 1.1 });
    if (!key.has(`${t.x},${t.z + 1}`)) edges.push({ x: t.x, z: t.z + 0.5, sx: 1.1, sz: 0.1 });
    if (!key.has(`${t.x},${t.z - 1}`)) edges.push({ x: t.x, z: t.z - 0.5, sx: 1.1, sz: 0.1 });
  }
  const zoneMat = glowMat(0xff2bd6, 1.5);
  const zone = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 1), zoneMat, Math.max(1, edges.length));
  zone.count = edges.length;
  edges.forEach((e, i) => {
    o.position.set(e.x, 0.04, e.z);
    o.scale.set(e.sx, 1, e.sz);
    o.updateMatrix();
    zone.setMatrixAt(i, o.matrix);
  });
  root.add(zone, fill);
  // the planted charge: a yellow block with a blinking light, only after planting
  const charge = new THREE.Group();
  const chargeLight = glowMat(0xff3030, 2);
  charge.add(box(0.5, 0.35, 0.35, lambert(0xffcf3a), 0, 0.18, 0), box(0.14, 0.12, 0.14, chargeLight, 0, 0.42, 0));
  charge.position.set(0.9, 0, 0.9);
  root.add(charge);
  // the objective has to be readable from afar: a pink light column and a floating "!"
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 14, 16, 1, true), beaconMat);
  beacon.position.y = 7;
  const mark = new THREE.Group();
  const markMat = glowMat(0xff2bd6, 2.2);
  mark.add(box(0.32, 0.9, 0.32, markMat, 0, 0.55, 0), box(0.32, 0.32, 0.32, markMat, 0, -0.2, 0));
  mark.position.y = 4;
  root.add(beacon, mark);
  return { root, cubes, zone, zoneMat, fill, tiles: tiles.length, lit: -1, dark, glow, charge, chargeLight, beacon, beaconMat, mark, plantedAt: -1 };
}

export function createActors(scene: THREE.Scene, map: FloorMap): Actors {
  const players = new Map<number, ReturnType<typeof makePlayer>>();
  let looks = new Map<number, Look>();
  let looksKey = '';
  /** the winners of a versus match dance until the next one starts */
  const winners = new Set<number>();
  /** who dances right now (the dance key), and until when */
  const dancing = new Map<number, number>();
  let danceNow = 0;
  let lastTick = 0;
  const towers = new Map<number, ReturnType<typeof makeTower> & { built: number }>();
  const karts = new Map<number, ReturnType<typeof makeKart>>();
  const nests = new Map<number, ReturnType<typeof makeNest>>();
  const foci = [new THREE.Vector3(map.spawn.x, 0, map.spawn.z), new THREE.Vector3(map.spawn.x, 0, map.spawn.z)];
  const focus = foci[0];
  // a fixed set of tower lights, moved to the towers nearest the camera: adding a light to the scene
  // would recompile every shader and freeze the game for a moment
  const towerLights = Array.from({ length: 6 }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 6);
    scene.add(l);
    return l;
  });

  // crosshair on the ground at the aim point, one per player on this screen
  const ringGeo = new THREE.RingGeometry(0.32, 0.42, 24).rotateX(-Math.PI / 2);
  const dotGeo = new THREE.CircleGeometry(0.07, 12).rotateX(-Math.PI / 2);
  const reticles = [0, 1].map(() => {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false, forceSinglePass: true });
    const ringMesh = new THREE.Mesh(ringGeo, mat);
    const dot = new THREE.Mesh(dotGeo, mat);
    group.add(ringMesh, dot);
    group.renderOrder = ringMesh.renderOrder = dot.renderOrder = 10;
    group.visible = false;
    scene.add(group);
    return { group, mat };
  });

  // versus: the king of the cube zone (a glowing disc with a rim) and the teams' cubes with their bases
  const kingRing = new THREE.Group();
  const kingFillMat = new THREE.MeshBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  kingRing.add(new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), kingFillMat));
  kingRing.add(new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2), glowMat(0xffcf3a, 2)));
  kingRing.visible = false;
  scene.add(kingRing);
  const cubes = [0xff5a5f, 0x3d8bfd].map(color => {
    const cube = box(0.8, 0.8, 0.8, glowMat(color, 1.6), 0, 0, 0);
    const base = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 32).rotateX(-Math.PI / 2), glowMat(color, 1.2));
    cube.visible = base.visible = false;
    scene.add(cube, base);
    return { cube, base };
  });

  // elevator: platform, and a light column once it is open
  const elevator = new THREE.Group();
  const plate = box(2.6, 0.12, 2.6, lambert(0x6a7088), 0, 0.06, 0);
  plate.receiveShadow = true;
  const plateGlow = glowMat(0x157a94, 0.3);
  elevator.add(plate, box(2.2, 0.04, 2.2, plateGlow, 0, 0.14, 0));
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x2bf0ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 14, 16, 1, true), beaconMat);
  beacon.position.y = 7;
  beacon.visible = false;
  elevator.add(beacon);
  elevator.position.set(map.elevator.x, 0, map.elevator.z);
  elevator.visible = !['race', 'lane', 'maze'].includes(map.id);
  scene.add(elevator);

  function updatePlayer(s: SimState, p: Player, look: Look, theme: Theme, time: number, frameDt: number) {
    let v = players.get(p.id);
    // a new suit colour (teams), another character or colour-blind mode switched: a new model
    if (v && (v.color !== p.color || v.pal !== palette() || v.look.kind !== look.kind || v.look.face !== look.face || v.look.antenna !== look.antenna)) {
      scene.remove(v.root, v.light);
      disposeTree(v.root);
      v = undefined;
    }
    if (!v) {
      v = makePlayer(p.color, look);
      scene.add(v.root, v.light);
      players.set(p.id, v);
    }
    const driving = p.vehicleId !== null;
    const down = p.downUntil !== null;
    // on the moon (coin-op chaos) a jump lasts longer and goes higher
    const length = jumpTicks(s);
    const jump = p.air > 0 ? Math.sin(Math.PI * (1 - Math.min(1, p.air / length))) * 1.3 * (length > JUMP_TICKS ? 1.6 : 1) : 0;
    // after a flight: sinking gently onto the floor, or onto the block below (eased, slow at the bottom)
    const sinking = !p.flying && (p.descent ?? 0) > 0;
    const below = sinking && perchable(s.map, p.pos.x, p.pos.z) ? wallTop(s.map, p.pos.x, p.pos.z) : 0;
    const left = sinking ? p.descent! / JETPACK.descentTicks : 0;
    const fly = p.flying ? 2.5 + Math.sin(time * 6) * 0.1 : sinking ? below + (2.5 - below) * (1 - (1 - left) * (1 - left)) : 0;
    // landed on top of a wall block with the jetpack
    // or on the way up a ladder: up the rungs, then over the top
    const climbed = p.climb ? 1 - p.climb.ticks / CLIMB_TICKS : 0;
    const perch = p.perched ? wallTop(s.map, p.pos.x, p.pos.z) : p.climb ? wallTop(s.map, p.climb.top.x, p.climb.top.z) * Math.min(1, climbed * 1.2) : 0;
    const over = p.climb ? Math.max(0, climbed - 0.8) / 0.2 : 0;
    // on a unicorn you sit up on its back
    const mount = driving && s.vehicles.find(c => c.id === p.vehicleId)?.kind === 'unicorn' ? 0.95 : 0.35;
    const x = p.climb ? p.pos.x + (p.climb.top.x - p.pos.x) * over : p.pos.x;
    const z = p.climb ? p.pos.z + (p.climb.top.z - p.pos.z) * over : p.pos.z;
    v.root.position.set(x, perch + jump + fly + (driving ? mount : 0), z);
    v.pack.visible = p.jetpack || p.flying;
    v.flame.visible = p.flying || sinking;
    // a short braking flame on the way down
    v.flame.scale.set(1, (0.7 + Math.random() * 0.6) * (sinking ? 0.5 : 1), 1);
    v.glint.visible = p.rare !== null && !down;
    const marked = palette().teamMarks && s.versus?.mode === 'team' && p.team !== undefined && !down;
    v.marks.forEach((m, team) => {
      m.visible = marked && p.team === team;
      m.rotation.y = time * 1.5;
      m.position.y = 2.55 + Math.sin(time * 3) * 0.05;
    });
    v.glint.rotation.y = time * 3;
    v.glint.scale.setScalar(1 + 0.1 * Math.sin(time * 8));
    v.yaw = Math.atan2(-p.aim.x, -p.aim.z);
    // the weapon in its hand is the one that is selected
    const weapon = p.weapons[p.selected];
    const kind: HeldKind = p.rare && p.rareSelected ? 'rare' : (weapon?.kind ?? 'pixelBlaster');
    if (v.heldKind !== kind) {
      disposeTree(v.held);
      v.held.clear();
      v.held.add(bake(weaponModel(kind)));
      v.heldKind = kind;
      v.lastCooldown = 0;
    }
    // a fresh cooldown means a shot: the weapon kicks back
    const cooldown = kind === 'rare' ? (p.rare?.cooldown ?? 0) : (weapon?.cooldown ?? 0);
    if (cooldown > v.lastCooldown) v.kick = 1;
    v.lastCooldown = cooldown;
    v.kick = Math.max(0, v.kick - frameDt * 7);
    // steps go by the ground covered, so feet do not slide; a jump in place (a respawn) is not a step
    const dx = Number.isNaN(v.lastX) ? 0 : p.pos.x - v.lastX, dz = Number.isNaN(v.lastZ) ? 0 : p.pos.z - v.lastZ;
    const dist = Math.hypot(dx, dz);
    const moved = dist > 0.001 && dist < 2;
    v.lastX = p.pos.x;
    v.lastZ = p.pos.z;
    const air = p.air > 0 || p.flying || sinking;
    const moving = (!driving && !air && moved) || !!p.climb;
    v.step += p.climb ? frameDt * 10 : moving ? dist * 2.6 : 0;
    const ease = Math.min(1, frameDt * 10);
    v.pace += ((moving ? 1 : 0) - v.pace) * ease;
    // which way it goes, seen from itself: forward is where it aims
    v.ahead += ((moved ? (dx * p.aim.x + dz * p.aim.z) / dist : 0) - v.ahead) * ease;
    v.aside += ((moved ? (dx * -p.aim.z + dz * p.aim.x) / dist : 0) - v.aside) * ease;
    if (v.wasAir && !air) v.land = 1;
    v.wasAir = air;
    v.land = Math.max(0, v.land - frameDt * 5);
    v.dash = p.dashTicks > 0 ? 1 : Math.max(0, v.dash - frameDt * 6);
    // (a dance ends when the player walks off, jumps or drives)
    if (moved || air || driving) dancing.delete(p.id);
    const won = !down && (s.phase === 'won' || winners.has(p.id) || (dancing.get(p.id) ?? 0) > danceNow);
    v.idle = moved || air || down || driving || v.kick > 0 || won ? 0 : v.idle + frameDt;
    animate(v.figure, { t: time + p.id * 1.7, step: v.step, pace: v.pace, ahead: v.ahead, aside: v.aside, idle: v.idle, air, land: v.land, dash: v.dash, down, driving, climbing: !!p.climb, win: won, kick: v.kick });
    // a winner turns on the spot, a dancer too; a figure with a dance of its own does that instead
    const until = dancing.get(p.id) ?? 0;
    const k = until > danceNow ? 1 - (until - danceNow) / DANCE_SECONDS : ((time + p.id * 1.7) % DANCE_SECONDS) / DANCE_SECONDS;
    v.body.rotation.y = v.yaw + (won ? (v.figure.model.dance ? v.figure.model.dance(v.figure.parts, k, time) : time * 5) : 0);
    v.held.visible = !down && !won;
    v.held.position.z = v.figure.model.hand[2] + v.kick * 0.1;
    v.held.rotation.x = v.kick * 0.3;
    v.dizzy.visible = down;
    v.dizzy.position.y = Math.min(1.2, v.figure.model.height * 0.75);
    v.dizzy.rotation.y = time * 4;
    // blink while invulnerable (not during the dash itself)
    const blinking = !down && s.tick < p.invulnUntil && p.dashTicks === 0;
    v.root.visible = !blinking || Math.floor(time * 12) % 2 === 0;

    if (v.swordT < 1) {
      v.swordT = Math.min(1, v.swordT + frameDt / 0.2);
      v.sword.visible = v.swordT < 1;
      // a fast sweep from right to left across the front (eased out), fading as it goes
      const sweep = 1 - (1 - v.swordT) ** 3;
      v.sword.rotation.y = v.yaw + Math.PI + (0.5 - sweep) * 2.4;
      v.sword.scale.setScalar(2.2 + 0.2 * ((p.weapons.find(w => w.kind === 'laserSword')?.level ?? 1) - 1));
      v.sword.position.y = 0.7;
      v.swordMat.opacity = 1 - v.swordT * v.swordT;
    }
    if (v.swatT < 1) {
      v.swatT = Math.min(1, v.swatT + frameDt / 0.3);
      v.swatter.visible = v.swatT < 1;
      // a wind-up to the right, then a fast flat sweep across to the left (eased out), the face of the paddle leading
      const wind = Math.min(1, v.swatT / 0.25);
      const sweep = v.swatT < 0.25 ? 0 : 1 - (1 - (v.swatT - 0.25) / 0.75) ** 3;
      v.swatter.rotation.y = v.yaw - 1.0 * wind + 2.2 * sweep;
      v.paddle.rotation.set(0, 0, Math.PI / 2);
      v.swatter.position.y = 0.85;
    }
    // a soft light above the head (not inside it), and the suit's own lights kept low: at night a player
    // must not turn into a white blob
    v.light.intensity = 1.4 * theme.pointLights;
    v.light.position.set(v.root.position.x, v.root.position.y + 2.8, v.root.position.z);
    setGlow(v.root, Math.min(theme.glow, 1.1));
  }

  function updateTower(t: Tower, v: ReturnType<typeof makeTower> & { built: number }, theme: Theme, time: number) {
    const age = time - v.built;
    const pop = age < 0.3 ? 0.4 + 0.6 * (age / 0.3) + Math.sin((age / 0.3) * Math.PI) * 0.25 : 1;
    // a new tower rises out of its scaffold while it is being built
    const building = t.buildLeft > 0 && !t.upgrading;
    const progress = building ? 1 - t.buildLeft / BUILD_TICKS : 1;
    v.scaffold.visible = t.buildLeft > 0;
    v.body.scale.set(pop, Math.max(0.08, progress) * pop, pop);
    if (t.upgrading) v.scaffold.rotation.y = time * 1.5;
    else v.scaffold.rotation.y = 0;
    v.scaffold.scale.y = t.upgrading ? 1 + 0.15 * (1 - t.buildLeft / UPGRADE_TICKS) : 1;
    if (v.level !== t.level) {
      v.level = t.level;
      disposeTree(v.pips);
      v.pips.clear();
      for (let i = 1; i < t.level; i++) v.pips.add(box(0.22, 0.22, 0.08, glowMat(0xffcf3a, 1.5), (i - t.level / 2) * 0.3, 0, 0));
      if (t.level > 1) v.built = time;
    }
    if (building) return;
    if (t.kind === 'laser') v.head.rotation.y = time * 2;
    if (t.kind === 'frost') v.head.position.y = 1.85 + Math.sin(time * 2) * 0.1;
    if (t.kind === 'tesla') v.head.rotation.y = time * 3;
    // the bumper's cap squashes after each bump
    if (t.kind === 'bumper') v.head.scale.y = 1 + 0.6 * Math.max(0, t.cooldown - 1);
    v.body.rotation.z = t.hp < t.maxHp * 0.5 ? Math.sin(time * 30) * 0.02 : 0;
    setGlow(v.root, theme.glow);
  }

  function updateKart(k: Vehicle, theme: Theme, time: number) {
    let v = karts.get(k.id);
    if (!v) {
      v = makeKart(k.kind, k.id);
      scene.add(v.root);
      karts.set(k.id, v);
    }
    const speed = Math.hypot(k.vel.x, k.vel.z);
    const yawBefore = v.yaw;
    if (speed > 0.5) v.yaw = Math.atan2(-k.vel.x, -k.vel.z);
    if ('steering' in v && v.steering) {
      // the steering wheel and the front wheels follow the turn the kart is making, eased so they do not twitch
      // (a kart turns on the spot: a heading that follows with a little lag, and the wheels are turned by how far
      // the two are apart, so the turn shows for a moment)
      const st = v as { steer?: number; steerAt?: number; lagYaw?: number };
      const dt = Math.max(1e-3, Math.min(0.1, time - (st.steerAt ?? time - 1 / 60)));
      const lag = st.lagYaw ?? yawBefore;
      const off = Math.atan2(Math.sin(v.yaw - lag), Math.cos(v.yaw - lag));
      st.lagYaw = lag + off * Math.min(1, dt * 5);
      st.steer = (st.steer ?? 0) + (Math.max(-1, Math.min(1, off / 0.7)) - (st.steer ?? 0)) * Math.min(1, dt * 14);
      st.steerAt = time;
      v.steering.rotation.y = st.steer * 1.5;
      for (const pivot of v.pivots!) pivot.rotation.y = st.steer * 0.5;
    }
    const hop = k.air > 0 ? Math.sin(Math.PI * (1 - k.air / KART.airTicks)) * 1.6 : 0;
    v.root.position.set(k.pos.x, hop, k.pos.z);
    v.root.rotation.y = v.yaw;
    v.body.rotation.x = k.air > 0 ? -0.25 : 0;
    if ('legs' in v && v.legs) {
      // a gallop: front and back legs swing in pairs, faster the faster it runs; the tail streams behind
      const pace = Math.min(1, speed / 8);
      const step = time * (6 + speed * 1.4);
      v.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(step + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.6) * 0.8 * pace));
      v.tail!.rotation.x = 0.4 + pace * 0.8 + Math.sin(time * 9) * 0.1;
      v.body.position.y = Math.abs(Math.sin(step)) * 0.12 * pace;
      setGlow(v.root, theme.glow);
      return;
    }
    if ('wheels' in v && v.wheels) {
      // the wheels (and the roller's drum) turn with the ground they cover; the body leans back a little at speed
      const roll = ((v as { roll?: number }).roll ?? 0) + (speed * Math.max(0, Math.min(0.1, time - ((v as { at?: number }).at ?? time)))) / 0.27;
      Object.assign(v, { roll, at: time });
      for (const w of v.wheels) w.rotation.x = -roll;
    }
    const hover = k.kind === 'hoverboard' ? 0.25 + Math.sin(time * 4 + k.id) * 0.08 : 0;
    v.body.position.y = hover + (k.driverId === null ? Math.sin(time * 3 + k.id) * 0.03 : Math.sin(time * 40) * 0.015 * Math.min(1, speed / 6));
    setGlow(v.root, theme.glow);
  }

  function updateNest(n: Nest, s: SimState, theme: Theme, time: number) {
    let v = nests.get(n.id);
    // endless mode moves a nest to a new spot: rebuild its zone there
    if (v && (v.root.position.x !== n.pos.x || v.root.position.z !== n.pos.z)) {
      scene.remove(v.root);
      disposeTree(v.root);
      v = undefined;
    }
    if (!v) {
      v = makeNest(s.map, n.pos);
      v.root.position.set(n.pos.x, 0, n.pos.z);
      scene.add(v.root);
      nests.set(n.id, v);
    }
    const planted = n.state === 'planted';
    const frac = planted ? n.progress / HOLD_TICKS : 0;
    // planting turns the nest from purple to an angry red-orange, with a short pop
    if (planted && v.plantedAt < 0) {
      v.plantedAt = time;
      v.dark.color.setHex(0x5a0d1e);
      v.glow.color.setHex(0xff6a1f);
      v.glow.emissive.setHex(0xff6a1f);
    } else if (!planted && v.plantedAt >= 0) {
      v.plantedAt = -1;
      v.dark.color.setHex(0x2a1040);
      v.glow.color.setHex(0xff2bd6);
      v.glow.emissive.setHex(0xff2bd6);
    }
    const sincePlant = planted ? time - v.plantedAt : 99;
    const pop = sincePlant < 0.5 ? 1 + Math.sin((sincePlant / 0.5) * Math.PI) * 0.35 : 1;
    // while its zone is held the pile draws in to a small, calm heap, so what is on screen is the zone (the
    // charge's light and the heap's glow still say how close it is to blowing up)
    const held = planted ? Math.max(NEST_HELD_SIZE, 1 - (sincePlant / 0.6) * (1 - NEST_HELD_SIZE)) : 1;
    const jitter = 0.04 * held;
    v.cubes.forEach((c, i) => {
      const home = c.userData.home as THREE.Vector3;
      c.position.set(
        home.x * held + Math.sin(time * 9 + i * 1.7) * jitter,
        home.y * held + Math.sin(time * 5 + i) * jitter,
        home.z * held + Math.cos(time * 7 + i * 2.3) * jitter,
      );
      c.rotation.y = Math.sin(time * 2 + i) * 0.3;
      c.scale.setScalar(pop * held);
    });
    v.glow.emissiveIntensity = (1.2 + Math.sin(time * (planted ? 8 + frac * 14 : 3)) * 0.5) * Math.min(theme.glow, 1.5);
    v.charge.visible = planted;
    v.chargeLight.emissiveIntensity = Math.sin(time * (6 + frac * 18)) > 0 ? 3 : 0.2;
    v.beacon.visible = !planted;
    v.beaconMat.opacity = 0.16 + 0.08 * Math.sin(time * 3);
    v.mark.visible = !planted;
    v.mark.position.y = 4 + Math.sin(time * 2.5) * 0.3;
    v.mark.rotation.y = time * 1.8;
    v.zone.visible = planted;
    v.fill.visible = planted;
    v.zoneMat.emissiveIntensity = (1.2 + 0.6 * Math.sin(time * 6)) * Math.min(theme.glow, 1.4);
    const lit = Math.floor(frac * v.tiles);
    if (lit !== v.lit) {
      for (let i = Math.min(lit, Math.max(0, v.lit)); i < Math.max(lit, v.lit); i++) v.fill.setColorAt(i, i < lit ? ZONE_LIT : ZONE_IDLE);
      if (v.lit < 0) for (let i = 0; i < v.tiles; i++) v.fill.setColorAt(i, i < lit ? ZONE_LIT : ZONE_IDLE);
      v.lit = lit;
      v.fill.instanceColor!.needsUpdate = true;
    }
    (v.fill.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.1 * Math.sin(time * 4);
  }

  function sweep<T extends { root: THREE.Object3D }>(map_: Map<number, T>, alive: Set<number>) {
    for (const [id, v] of map_) {
      if (alive.has(id)) continue;
      scene.remove(v.root);
      disposeTree(v.root);
      map_.delete(id);
    }
  }

  return {
    update(s, events, theme, time, frameDt, localIds) {
      // a new match: nobody has won yet
      if (s.tick < lastTick) winners.clear();
      lastTick = s.tick;
      for (const e of events) if (e.type === 'versusEnd') for (const id of e.winners) winners.add(id);
      for (const e of events) if (e.type === 'emote' && e.emote === 'dance') dancing.set(e.playerId, time + DANCE_SECONDS);
      danceNow = time;
      // who looks like what: worked out again only when someone joins, leaves or changes
      const key = s.players.map(p => `${p.id}:${p.name}:${p.character ?? ''}`).join('|');
      if (key !== looksKey) {
        looks = looksFor(s.players);
        looksKey = key;
      }
      for (const p of s.players) updatePlayer(s, p, looks.get(p.id)!, theme, time, frameDt);
      const here = new Set(s.players.map(p => p.id));
      for (const [id, v] of players) {
        if (here.has(id)) continue;
        scene.remove(v.root, v.light);
        disposeTree(v.root);
        players.delete(id);
      }
      for (const e of events) {
        if (e.type === 'shot' && (e.weapon === 'laserSword' || e.weapon === 'flySwatter')) {
          const shooter = s.players.find(p => p.pos.x === e.pos.x && p.pos.z === e.pos.z);
          const v = shooter ? players.get(shooter.id) : undefined;
          if (v && e.weapon === 'laserSword') v.swordT = 0;
          if (v && e.weapon === 'flySwatter') v.swatT = 0;
        }
      }

      const aliveTowers = new Set<number>();
      for (const t of s.towers) {
        aliveTowers.add(t.id);
        let v = towers.get(t.id);
        if (!v) {
          v = { ...makeTower(t.kind), built: time };
          v.root.position.set(t.pos.x, 0.12, t.pos.z);
          scene.add(v.root);
          towers.set(t.id, v);
        }
        updateTower(t, v, theme, time);
      }
      sweep(towers, aliveTowers);
      const nearest = s.towers.slice().sort((a, b) => Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) - Math.hypot(b.pos.x - focus.x, b.pos.z - focus.z));
      towerLights.forEach((l, i) => {
        const t = nearest[i];
        l.intensity = t ? 5 * theme.pointLights : 0;
        if (t) {
          l.position.set(t.pos.x, 2.5, t.pos.z);
          l.color.setHex(towers.get(t.id)!.lightColor);
        }
      });

      for (const k of s.vehicles) updateKart(k, theme, time);
      sweep(karts, new Set(s.vehicles.map(k => k.id)));

      const liveNests = s.nests.filter(n => n.state !== 'destroyed');
      for (const n of liveNests) updateNest(n, s, theme, time);
      sweep(nests, new Set(liveNests.map(n => n.id)));

      beacon.visible = s.elevatorOpen;
      beaconMat.opacity = 0.22 + 0.1 * Math.sin(time * 4);
      plateGlow.emissiveIntensity = (s.elevatorOpen ? 2.5 : 0.3) * Math.min(theme.glow, 1.4);

      // versus: the king zone and the two cubes with their bases
      const vs = s.versus;
      kingRing.visible = !!vs?.king;
      if (vs?.king) {
        kingRing.position.set(vs.king.pos.x, 0.06, vs.king.pos.z);
        kingRing.scale.setScalar(vs.king.radius);
        kingRing.rotation.y = time * 0.6;
        kingFillMat.opacity = 0.22 + 0.08 * Math.sin(time * 4);
      }
      cubes.forEach((c, team) => {
        const f = vs?.flags?.[team];
        const tc = palette().teams[team];
        for (const mat of [c.cube.material, c.base.material] as THREE.MeshStandardMaterial[]) if (mat.color.getHex() !== tc) (mat.color.setHex(tc), mat.emissive.setHex(tc));
        c.cube.visible = c.base.visible = !!f;
        if (!f) return;
        const carried = f.carrier !== null;
        c.cube.position.set(f.pos.x, carried ? 2.2 : 0.9 + Math.sin(time * 2 + team) * 0.15, f.pos.z);
        c.cube.rotation.set(time * 0.8, time * 1.3, 0);
        c.base.position.set(f.base.x, 0.05, f.base.z);
      });
      reticles.forEach((r, i) => {
        const p0 = i < localIds.length ? (s.players.find(p => p.id === localIds[i]) ?? (i === 0 ? s.players[0] : undefined)) : undefined;
        r.group.visible = !!p0 && p0.downUntil === null;
        if (!p0) return;
        foci[i].set(p0.pos.x, 0, p0.pos.z);
        // a lobbed weapon lands at the aim point, but never further than its range: show where it lands
        const held = p0.rareSelected ? undefined : p0.weapons[p0.selected]?.kind;
        const range = held === 'hotdogSlinger' ? HOTDOG.range : held === 'bomb' ? BOMB.range : Infinity;
        const ax = p0.aimPoint.x - p0.pos.x, az = p0.aimPoint.z - p0.pos.z;
        const k = Math.min(1, range / Math.max(0.001, Math.hypot(ax, az)));
        r.group.position.set(p0.pos.x + ax * k, 0.08, p0.pos.z + az * k);
        r.group.rotation.y = time * 1.5;
        const ready = (p0.weapons[p0.selected]?.cooldown ?? 0) === 0;
        // in split screen the crosshairs wear the suit colours, so nobody aims with the other's
        r.mat.color.setHex(!ready ? 0xff6b6b : localIds.length > 1 ? playerColor(p0.color) : 0xffffff);
        r.group.scale.setScalar(ready ? 1 : 0.8);
      });
    },
    playerPos: (i = 0) => foci[i],
    playerModel: id => players.get(id)?.root,
    reticle: i => reticles[i]?.group,
    setMap(m) {
      elevator.position.set(m.elevator.x, 0, m.elevator.z);
      // the rally track has no elevator to ride
      elevator.visible = !['race', 'lane', 'maze'].includes(m.id);
      // towers, karts and nests of the old floor go; the next update builds the new ones
      sweep(towers, new Set());
      sweep(karts, new Set());
      sweep(nests, new Set());
    },
  };
}
