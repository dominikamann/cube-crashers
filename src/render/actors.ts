import * as THREE from 'three';
import { HOLD_TICKS, JUMP_TICKS } from '../sim/config/balance';
import { BUILD_TICKS, UPGRADE_TICKS } from '../sim/config/towers';
import type { FloorMap } from '../sim/map/tilemap';
import { zoneTiles } from '../sim/systems/nests';
import { KART } from '../sim/systems/vehicles';
import type { Nest, Player, SimEvent, SimState, Tower, TowerKind, Vehicle, VehicleKind } from '../sim/types';
import { box, glowMat, lambert, setGlow } from './pool';
import type { Theme } from './theme';

/** suit colours of the up to six players (also used by the HUD and minimap) */
export const PLAYER_COLORS = [0x3d8bfd, 0xff5a5f, 0x3bd16f, 0xffb020, 0xb15cff, 0x2bd4d4];

export interface Actors {
  update(s: SimState, events: SimEvent[], theme: Theme, time: number, frameDt: number, localId: number): void;
  playerPos(): THREE.Vector3;
  /** a new floor: move the elevator */
  setMap(map: FloorMap): void;
}

function makePlayer(color: number) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const suit = lambert(PLAYER_COLORS[color % PLAYER_COLORS.length]);
  const skin = lambert(0xffd2a8);
  const dark = lambert(0x2a2a50);
  body.add(box(0.22, 0.4, 0.22, dark, -0.13, 0.2, 0));
  body.add(box(0.22, 0.4, 0.22, dark, 0.13, 0.2, 0));
  body.add(box(0.6, 0.6, 0.4, suit, 0, 0.7, 0));
  body.add(box(0.16, 0.5, 0.16, suit, -0.4, 0.7, 0));
  body.add(box(0.16, 0.5, 0.16, suit, 0.4, 0.7, 0));
  body.add(box(0.46, 0.46, 0.46, skin, 0, 1.25, 0));
  body.add(box(0.48, 0.12, 0.08, glowMat(0x2bf0ff, 3), 0, 1.3, -0.24));
  body.add(box(0.5, 0.14, 0.5, lambert(0x6b3a1e), 0, 1.5, 0));
  // the blaster arm always points at the crosshair
  const gun = new THREE.Group();
  gun.add(box(0.14, 0.14, 0.7, lambert(0x444455), 0, 0, -0.45));
  gun.add(box(0.1, 0.1, 0.12, glowMat(0xfff27a, 2.5), 0, 0, -0.84));
  gun.position.y = 0.8;
  root.add(body, gun);

  const sword = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 24, 1, -Math.PI * 0.39, Math.PI * 0.78).rotateX(-Math.PI / 2), glowMat(0xff3bd6, 3));
  (sword.material as THREE.Material).side = THREE.DoubleSide;
  sword.visible = false;
  root.add(sword);
  const light = new THREE.PointLight(0x2bf0ff, 0, 5);
  light.position.y = 1.6;
  root.add(light);
  // jetpack on the back, flame below while flying
  const pack = new THREE.Group();
  pack.add(box(0.45, 0.5, 0.22, lambert(0xd0d4e0), 0, 0.8, 0.32));
  pack.add(box(0.14, 0.22, 0.14, lambert(0x444455), -0.13, 0.48, 0.34));
  pack.add(box(0.14, 0.22, 0.14, lambert(0x444455), 0.13, 0.48, 0.34));
  const flame = box(0.22, 0.45, 0.22, glowMat(0xff9f2e, 3), 0, 0.15, 0.34);
  flame.castShadow = false;
  pack.add(flame);
  pack.visible = false;
  body.add(pack);
  // golden glint around a player holding a rare weapon
  const glint = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.72, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  glint.position.y = 0.05;
  glint.visible = false;
  root.add(glint);
  return { root, body, gun, sword, light, pack, flame, glint, swordT: 1, yaw: 0, lastX: 0, lastZ: 0 };
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

function makeKart(kind: VehicleKind = 'kart') {
  const root = new THREE.Group();
  const body = new THREE.Group();
  if (kind === 'roller') {
    // a steamroller: big drum in front, cabin behind
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 12).rotateZ(Math.PI / 2), lambert(0x6a6f80));
    drum.position.set(0, 0.55, -0.7);
    drum.castShadow = true;
    body.add(drum, box(1.3, 0.6, 1.2, lambert(0xffb020), 0, 0.6, 0.45), box(0.9, 0.6, 0.7, lambert(0x333344), 0, 1.2, 0.55), box(0.35, 0.2, 0.25, glowMat(0xffe14a, 2), 0, 0.95, 1.08));
    root.add(body);
    return { root, body, yaw: 0 };
  }
  if (kind === 'hoverboard') {
    // a glowing board floating above the ground
    body.add(box(0.9, 0.12, 1.6, lambert(0x2bd4d4), 0, 0.45, 0), box(0.7, 0.05, 1.3, glowMat(0x2bf0ff, 3), 0, 0.37, 0), box(0.3, 0.1, 0.25, glowMat(0xff2bd6, 2), 0, 0.5, 0.8));
    root.add(body);
    return { root, body, yaw: 0 };
  }
  body.add(box(1.1, 0.35, 1.7, lambert(0xe23b3b), 0, 0.4, 0));
  body.add(box(0.9, 0.3, 0.5, lambert(0xffffff), 0, 0.6, -0.55));
  body.add(box(0.8, 0.5, 0.2, lambert(0x333344), 0, 0.8, 0.55));
  body.add(box(1.2, 0.1, 0.35, lambert(0xffe14a), 0, 1.0, 0.75));
  body.add(box(0.5, 0.25, 0.25, glowMat(0x2bf0ff, 2), 0, 0.45, 0.9));
  const wheel = lambert(0x222230);
  for (const [x, z] of [[-0.65, -0.55], [0.65, -0.55], [-0.65, 0.55], [0.65, 0.55]]) body.add(box(0.25, 0.45, 0.45, wheel, x, 0.25, z));
  root.add(body);
  return { root, body, yaw: 0 };
}

const tileQuad = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
const ZONE_IDLE = new THREE.Color(0xff2bd6).multiplyScalar(0.55);
const ZONE_LIT = new THREE.Color(0x2bf0ff).multiplyScalar(1.6);

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
  const towers = new Map<number, ReturnType<typeof makeTower> & { built: number }>();
  const karts = new Map<number, ReturnType<typeof makeKart>>();
  const nests = new Map<number, ReturnType<typeof makeNest>>();
  const focus = new THREE.Vector3(map.spawn.x, 0, map.spawn.z);
  // a fixed set of tower lights, moved to the towers nearest the camera: adding a light to the scene
  // would recompile every shader and freeze the game for a moment
  const towerLights = Array.from({ length: 6 }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 6);
    scene.add(l);
    return l;
  });

  // crosshair on the ground at the aim point
  const reticle = new THREE.Group();
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 24).rotateX(-Math.PI / 2), reticleMat);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12).rotateX(-Math.PI / 2), reticleMat);
  reticle.add(ringMesh, dot);
  reticle.renderOrder = 10;
  ringMesh.renderOrder = 10;
  dot.renderOrder = 10;
  scene.add(reticle);

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
  scene.add(elevator);

  function updatePlayer(s: SimState, p: Player, theme: Theme, time: number, frameDt: number) {
    let v = players.get(p.id);
    if (!v) {
      v = makePlayer(p.color);
      scene.add(v.root);
      players.set(p.id, v);
    }
    const driving = p.vehicleId !== null;
    const down = p.downUntil !== null;
    const jump = p.air > 0 ? Math.sin(Math.PI * (1 - p.air / JUMP_TICKS)) * 1.3 : 0;
    const fly = p.flying ? 2.5 + Math.sin(time * 6) * 0.1 : 0;
    v.root.position.set(p.pos.x, jump + fly + (driving ? 0.35 : 0), p.pos.z);
    v.pack.visible = p.jetpack || p.flying;
    v.flame.visible = p.flying;
    v.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
    v.glint.visible = p.rare !== null && !down;
    v.glint.rotation.y = time * 3;
    v.glint.scale.setScalar(1 + 0.1 * Math.sin(time * 8));
    v.yaw = Math.atan2(-p.aim.x, -p.aim.z);
    v.body.rotation.y = v.yaw;
    v.gun.rotation.y = v.yaw;
    v.gun.visible = !down;
    const moved = Math.hypot(p.pos.x - v.lastX, p.pos.z - v.lastZ) > 0.001;
    v.lastX = p.pos.x;
    v.lastZ = p.pos.z;
    const moving = !driving && p.air === 0 && !p.flying && moved;
    v.body.position.y = moving && !down ? Math.abs(Math.sin(time * 14)) * 0.06 : 0;
    v.body.rotation.z = down ? Math.PI / 2 : 0;
    if (down) v.body.position.y = 0.25;
    v.body.scale.setScalar(driving ? 0.8 : 1);
    // blink while invulnerable (not during the dash itself)
    const blinking = !down && s.tick < p.invulnUntil && p.dashTicks === 0;
    v.root.visible = !blinking || Math.floor(time * 12) % 2 === 0;

    if (v.swordT < 1) {
      v.swordT += frameDt / 0.16;
      v.sword.visible = v.swordT < 1;
      v.sword.rotation.y = v.yaw + Math.PI + (v.swordT - 0.5) * 0.8;
      v.sword.scale.setScalar(2.2 + 0.2 * ((p.weapons.find(w => w.kind === 'laserSword')?.level ?? 1) - 1));
      v.sword.position.y = 0.7;
    }
    v.light.intensity = 4 * theme.pointLights;
    setGlow(v.root, theme.glow);
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
      v.pips.clear();
      for (let i = 1; i < t.level; i++) v.pips.add(box(0.22, 0.22, 0.08, glowMat(0xffcf3a, 1.5), (i - t.level / 2) * 0.3, 0, 0));
      if (t.level > 1) v.built = time;
    }
    if (building) return;
    if (t.kind === 'laser') v.head.rotation.y = time * 2;
    if (t.kind === 'frost') v.head.position.y = 1.85 + Math.sin(time * 2) * 0.1;
    v.body.rotation.z = t.hp < t.maxHp * 0.5 ? Math.sin(time * 30) * 0.02 : 0;
    setGlow(v.root, theme.glow);
  }

  function updateKart(k: Vehicle, theme: Theme, time: number) {
    let v = karts.get(k.id);
    if (!v) {
      v = makeKart(k.kind);
      scene.add(v.root);
      karts.set(k.id, v);
    }
    const speed = Math.hypot(k.vel.x, k.vel.z);
    if (speed > 0.5) v.yaw = Math.atan2(-k.vel.x, -k.vel.z);
    const hop = k.air > 0 ? Math.sin(Math.PI * (1 - k.air / KART.airTicks)) * 1.6 : 0;
    v.root.position.set(k.pos.x, hop, k.pos.z);
    v.root.rotation.y = v.yaw;
    v.body.rotation.x = k.air > 0 ? -0.25 : 0;
    const hover = k.kind === 'hoverboard' ? 0.25 + Math.sin(time * 4 + k.id) * 0.08 : 0;
    v.body.position.y = hover + (k.driverId === null ? Math.sin(time * 3 + k.id) * 0.03 : Math.sin(time * 40) * 0.015 * Math.min(1, speed / 6));
    setGlow(v.root, theme.glow);
  }

  function updateNest(n: Nest, s: SimState, theme: Theme, time: number) {
    let v = nests.get(n.id);
    // endless mode moves a nest to a new spot: rebuild its zone there
    if (v && (v.root.position.x !== n.pos.x || v.root.position.z !== n.pos.z)) {
      scene.remove(v.root);
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
    // shakes harder the closer it gets to blowing up
    const jitter = planted ? 0.08 + frac * 0.18 : 0.04;
    v.cubes.forEach((c, i) => {
      const home = c.userData.home as THREE.Vector3;
      c.position.set(
        home.x + Math.sin(time * 9 + i * 1.7) * jitter,
        home.y + Math.sin(time * 5 + i) * jitter,
        home.z + Math.cos(time * 7 + i * 2.3) * jitter,
      );
      c.rotation.y = Math.sin(time * 2 + i) * 0.3;
      c.scale.setScalar(pop);
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
      v.root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        for (const m of mats) m.dispose();
      });
      map_.delete(id);
    }
  }

  return {
    update(s, events, theme, time, frameDt, localId) {
      for (const p of s.players) updatePlayer(s, p, theme, time, frameDt);
      const here = new Set(s.players.map(p => p.id));
      for (const [id, v] of players) {
        if (here.has(id)) continue;
        scene.remove(v.root);
        players.delete(id);
      }
      for (const e of events) {
        if (e.type === 'shot' && e.weapon === 'laserSword') {
          const shooter = s.players.find(p => p.pos.x === e.pos.x && p.pos.z === e.pos.z);
          const v = shooter ? players.get(shooter.id) : undefined;
          if (v) v.swordT = 0;
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

      const p0 = s.players.find(p => p.id === localId) ?? s.players[0];
      if (p0) {
        focus.set(p0.pos.x, 0, p0.pos.z);
        reticle.visible = p0.downUntil === null;
        reticle.position.set(p0.aimPoint.x, 0.08, p0.aimPoint.z);
        reticle.rotation.y = time * 1.5;
        const ready = (p0.weapons[p0.selected]?.cooldown ?? 0) === 0;
        reticleMat.color.setHex(ready ? 0xffffff : 0xff6b6b);
        reticle.scale.setScalar(ready ? 1 : 0.8);
      }
    },
    playerPos: () => focus,
    setMap(m) {
      elevator.position.set(m.elevator.x, 0, m.elevator.z);
      // towers, karts and nests of the old floor go; the next update builds the new ones
      sweep(towers, new Set());
      sweep(karts, new Set());
      sweep(nests, new Set());
    },
  };
}
