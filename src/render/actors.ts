import * as THREE from 'three';
import type { Player, SimState, Tower, TowerKind } from '../sim/types';
import { box, glowMat, lambert, setGlow } from './pool';
import type { Theme } from './theme';

export interface Actors {
  update(s: SimState, theme: Theme, time: number, frameDt: number): void;
  playerPos(): THREE.Vector3;
}

function makePlayer(): { root: THREE.Group; body: THREE.Group; disco: THREE.Mesh; sword: THREE.Mesh; light: THREE.PointLight } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const suit = lambert(0x3d8bfd);
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
  root.add(body);

  const disco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), glowMat(0xd8e6ff, 1.2));
  disco.castShadow = true;
  root.add(disco);
  const sword = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 32), glowMat(0xff3bd6, 3));
  sword.rotation.x = Math.PI / 2;
  sword.visible = false;
  root.add(sword);
  const light = new THREE.PointLight(0x2bf0ff, 0, 5);
  light.position.y = 1.6;
  root.add(light);
  return { root, body, disco, sword, light };
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

export function createActors(scene: THREE.Scene): Actors {
  const players = new Map<number, ReturnType<typeof makePlayer> & { lastPos: THREE.Vector3 }>();
  const towers = new Map<number, ReturnType<typeof makeTower> & { built: number }>();
  const focus = new THREE.Vector3();

  function updatePlayer(p: Player, theme: Theme, time: number, frameDt: number) {
    let v = players.get(p.id);
    if (!v) {
      v = { ...makePlayer(), lastPos: new THREE.Vector3(p.pos.x, 0, p.pos.z) };
      scene.add(v.root);
      players.set(p.id, v);
    }
    const dx = p.pos.x - v.lastPos.x, dz = p.pos.z - v.lastPos.z;
    const moving = Math.hypot(dx, dz) > 0.001;
    v.root.position.set(p.pos.x, 0, p.pos.z);
    if (moving) v.body.rotation.y = Math.atan2(-dx, -dz);
    v.body.position.y = moving ? Math.abs(Math.sin(time * 14)) * 0.08 : 0;
    v.lastPos.set(p.pos.x, 0, p.pos.z);

    const down = p.downUntil !== null;
    v.body.rotation.z = down ? Math.PI / 2 : 0;
    v.body.position.y += down ? 0.25 : 0;

    const disco = p.weapons.find(w => w.kind === 'discoBall');
    v.disco.visible = !!disco && !down;
    v.disco.position.set(Math.cos(time * 2.5) * 2, 1.4, Math.sin(time * 2.5) * 2);
    v.disco.rotation.y = time * 4;
    if (v.sword.visible) {
      v.sword.userData.t = (v.sword.userData.t ?? 0) + frameDt;
      const k = v.sword.userData.t / 0.18;
      const sword = p.weapons.find(w => w.kind === 'laserSword');
      const r = 1.8 + 0.2 * ((sword?.level ?? 1) - 1);
      v.sword.scale.setScalar(r * (0.6 + 0.4 * Math.min(1, k)));
      v.sword.position.y = 0.7;
      if (k >= 1) v.sword.visible = false;
    }
    v.light.intensity = 4 * theme.pointLights;
    setGlow(v.root, theme.glow);
  }

  return {
    update(s, theme, time, frameDt) {
      for (const p of s.players) updatePlayer(p, theme, time, frameDt);
      for (const e of s.events) {
        if (e.type === 'shot' && e.weapon === 'laserSword') {
          for (const v of players.values()) {
            v.sword.visible = true;
            v.sword.userData.t = 0;
          }
        }
      }

      const alive = new Set<number>();
      for (const t of s.towers) {
        alive.add(t.id);
        let v = towers.get(t.id);
        if (!v) {
          v = { ...makeTower(t.kind), built: time };
          v.root.position.set(t.pos.x, 0.15, t.pos.z);
          scene.add(v.root);
          towers.set(t.id, v);
        }
        updateTower(t, v, theme, time);
      }
      for (const [id, v] of towers) {
        if (!alive.has(id)) {
          scene.remove(v.root);
          towers.delete(id);
        }
      }
      const p0 = s.players[0];
      if (p0) focus.set(p0.pos.x, 0, p0.pos.z);
    },
    playerPos: () => focus,
  };

  function updateTower(t: Tower, v: ReturnType<typeof makeTower> & { built: number }, theme: Theme, time: number) {
    const age = time - v.built;
    const pop = age < 0.3 ? 0.4 + 0.6 * (age / 0.3) + Math.sin((age / 0.3) * Math.PI) * 0.25 : 1;
    v.root.scale.setScalar(pop);
    if (t.kind === 'laser') v.head.rotation.y = time * 2;
    if (t.kind === 'frost') v.head.position.y = 1.85 + Math.sin(time * 2) * 0.1;
    const damaged = t.hp < t.maxHp * 0.5;
    v.root.rotation.z = damaged ? Math.sin(time * 30) * 0.02 : 0;
    v.light.intensity = 5 * theme.pointLights;
    setGlow(v.root, theme.glow);
  }
}
