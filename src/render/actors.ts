import * as THREE from 'three';
import { HOLD_RADIUS, HOLD_TICKS, JUMP_TICKS } from '../sim/config/balance';
import type { FloorMap } from '../sim/map/tilemap';
import { KART } from '../sim/systems/vehicles';
import type { Nest, Player, SimEvent, SimState, Tower, TowerKind, Vehicle } from '../sim/types';
import { box, glowMat, lambert, setGlow } from './pool';
import type { Theme } from './theme';

/** suit colours of the up to six players (also used by the HUD and minimap) */
export const PLAYER_COLORS = [0x3d8bfd, 0xff5a5f, 0x3bd16f, 0xffb020, 0xb15cff, 0x2bd4d4];

export interface Actors {
  update(s: SimState, events: SimEvent[], theme: Theme, time: number, frameDt: number, localId: number): void;
  playerPos(): THREE.Vector3;
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

function makeTower(kind: TowerKind): { root: THREE.Group; head: THREE.Object3D; light: THREE.PointLight } {
  const root = new THREE.Group();
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
  const light = new THREE.PointLight(lightColor, 0, 6);
  light.position.y = 2.4;
  root.add(light);
  return { root, head, light };
}

function makeKart() {
  const root = new THREE.Group();
  const body = new THREE.Group();
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

function makeNest() {
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
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const zone = new THREE.Mesh(new THREE.RingGeometry(HOLD_RADIUS - 0.12, HOLD_RADIUS, 64).rotateX(-Math.PI / 2), zoneMat);
  zone.position.y = 0.05;
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x2bf0ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const fill = new THREE.Mesh(new THREE.CircleGeometry(HOLD_RADIUS, 64).rotateX(-Math.PI / 2), fillMat);
  fill.position.y = 0.04;
  root.add(zone, fill);
  return { root, cubes, zone, fill, glow };
}

export function createActors(scene: THREE.Scene, map: FloorMap): Actors {
  const players = new Map<number, ReturnType<typeof makePlayer>>();
  const towers = new Map<number, ReturnType<typeof makeTower> & { built: number }>();
  const karts = new Map<number, ReturnType<typeof makeKart>>();
  const nests = new Map<number, ReturnType<typeof makeNest>>();
  const focus = new THREE.Vector3(map.spawn.x, 0, map.spawn.z);

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
    v.pack.visible = p.jetFuel > 0 || p.flying;
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
    v.root.scale.setScalar(pop);
    if (t.kind === 'laser') v.head.rotation.y = time * 2;
    if (t.kind === 'frost') v.head.position.y = 1.85 + Math.sin(time * 2) * 0.1;
    v.root.rotation.z = t.hp < t.maxHp * 0.5 ? Math.sin(time * 30) * 0.02 : 0;
    v.light.intensity = 5 * theme.pointLights;
    setGlow(v.root, theme.glow);
  }

  function updateKart(k: Vehicle, theme: Theme, time: number) {
    let v = karts.get(k.id);
    if (!v) {
      v = makeKart();
      scene.add(v.root);
      karts.set(k.id, v);
    }
    const speed = Math.hypot(k.vel.x, k.vel.z);
    if (speed > 0.5) v.yaw = Math.atan2(-k.vel.x, -k.vel.z);
    const hop = k.air > 0 ? Math.sin(Math.PI * (1 - k.air / KART.airTicks)) * 1.6 : 0;
    v.root.position.set(k.pos.x, hop, k.pos.z);
    v.root.rotation.y = v.yaw;
    v.body.rotation.x = k.air > 0 ? -0.25 : 0;
    v.body.position.y = k.driverId === null ? Math.sin(time * 3 + k.id) * 0.03 : Math.sin(time * 40) * 0.015 * Math.min(1, speed / 6);
    setGlow(v.root, theme.glow);
  }

  function updateNest(n: Nest, s: SimState, theme: Theme, time: number) {
    let v = nests.get(n.id);
    if (!v) {
      v = makeNest();
      v.root.position.set(n.pos.x, 0, n.pos.z);
      scene.add(v.root);
      nests.set(n.id, v);
    }
    const planted = n.state === 'planted';
    const jitter = planted ? 0.12 : 0.04;
    v.cubes.forEach((c, i) => {
      const home = c.userData.home as THREE.Vector3;
      c.position.set(
        home.x + Math.sin(time * 9 + i * 1.7) * jitter,
        home.y + Math.sin(time * 5 + i) * jitter,
        home.z + Math.cos(time * 7 + i * 2.3) * jitter,
      );
      c.rotation.y = Math.sin(time * 2 + i) * 0.3;
    });
    v.glow.emissiveIntensity = (1.2 + Math.sin(time * (planted ? 12 : 3)) * 0.5) * Math.min(theme.glow, 1.5);
    v.zone.visible = planted;
    v.fill.visible = planted;
    v.fill.scale.setScalar(Math.max(0.02, n.progress / HOLD_TICKS));
    (v.zone.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.2 * Math.sin(time * 6);
    void s;
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
  };
}
