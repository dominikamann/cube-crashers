import * as THREE from 'three';
import { KART_PAINT } from './actors';
import type { SimState, WeaponKind } from '../sim/types';
import { playerColor } from './palette';
import { box, glowMat, lambert } from './pool';

/**
 * First person: the weapon in your hand, bottom right, drawn after the world so it never pokes into walls.
 * It bobs while you walk and kicks back when you fire.
 */
export interface ViewModel {
  update(s: SimState, playerId: number, time: number, frameDt: number): void;
  render(renderer: THREE.WebGLRenderer, aspect: number): void;
}

type Look = WeaponKind | 'rare';

function makeModel(kind: Look): THREE.Group {
  const g = new THREE.Group();
  const dark = lambert(0x2a2550);
  const metal = lambert(0x8a90a8);
  switch (kind) {
    case 'laserSword':
      g.add(box(0.07, 0.07, 0.22, dark, 0, 0, 0.05));
      g.add(box(0.11, 0.03, 0.03, metal, 0, 0, -0.07));
      g.add(box(0.035, 0.035, 0.75, glowMat(0xff2bd6, 2.2), 0, 0, -0.45));
      g.rotation.x = 0.55;
      break;
    case 'flySwatter':
      g.add(box(0.04, 0.04, 0.5, lambert(0x8a5a2b), 0, 0, -0.2));
      g.add(box(0.36, 0.03, 0.32, lambert(0x3bd16f), 0, 0, -0.6));
      for (const o of [-0.11, 0, 0.11]) g.add(box(0.015, 0.04, 0.32, lambert(0x1f8a44), o, 0, -0.6));
      // upright: the face of the paddle points to the side it swings toward
      g.rotation.set(0.2, 0, Math.PI / 2);
      break;
    case 'pixelRail':
      g.add(box(0.1, 0.1, 0.55, lambert(0x2a2550), 0, 0, -0.15));
      for (const z of [-0.2, -0.32, -0.44]) g.add(box(0.14, 0.14, 0.04, glowMat(0x9ff8ff, 1.4), 0, 0, z));
      g.add(box(0.04, 0.04, 0.3, metal, 0, 0, -0.55));
      g.add(box(0.06, 0.13, 0.08, dark, 0, -0.12, 0.02));
      break;
    case 'bubbleWand':
      g.add(box(0.04, 0.04, 0.45, lambert(0x8a5a2b), 0, 0, -0.1));
      g.add(box(0.16, 0.16, 0.03, glowMat(0xff9ee8, 1.1), 0, 0.02, -0.38));
      g.add(box(0.1, 0.1, 0.035, lambert(0xffffff), 0, 0.02, -0.38));
      break;
    case 'magnetGlove':
      g.add(box(0.16, 0.14, 0.2, lambert(0x3a3f55), 0, 0, -0.05));
      g.add(box(0.06, 0.06, 0.18, lambert(0xff3b3b), -0.06, 0, -0.24), box(0.06, 0.06, 0.18, lambert(0x7fb2ff), 0.06, 0, -0.24));
      g.add(box(0.06, 0.03, 0.04, lambert(0xd0d0d0), -0.06, 0, -0.34), box(0.06, 0.03, 0.04, lambert(0xd0d0d0), 0.06, 0, -0.34));
      break;
    case 'yoyoLauncher':
      g.add(box(0.06, 0.12, 0.08, dark, 0, -0.08, 0));
      g.add(box(0.18, 0.18, 0.08, lambert(0x2bd4ff), 0, 0.02, -0.2), box(0.08, 0.08, 0.1, lambert(0xffcf3a), 0, 0.02, -0.2));
      break;
    case 'candyCannon':
      g.add(box(0.16, 0.16, 0.5, lambert(0xff7ac8), 0, 0, -0.15));
      g.add(box(0.2, 0.2, 0.06, lambert(0xffffff), 0, 0, -0.42));
      g.add(box(0.06, 0.12, 0.08, dark, 0, -0.12, 0));
      break;
    case 'hotdogSlinger':
      g.add(box(0.12, 0.12, 0.45, lambert(0xe0a050), 0, 0, -0.15));
      g.add(box(0.06, 0.06, 0.5, lambert(0xc0503a), 0, 0.07, -0.17));
      g.add(box(0.06, 0.12, 0.08, dark, 0, -0.1, 0));
      break;
    case 'joystickBoomerang':
      g.add(box(0.2, 0.06, 0.2, dark, 0, 0, -0.1));
      g.add(box(0.03, 0.14, 0.03, metal, 0, 0.09, -0.1));
      g.add(box(0.07, 0.07, 0.07, glowMat(0xff3b3b, 1.2), 0, 0.18, -0.1));
      break;
    case 'discoBall':
      g.add(box(0.2, 0.2, 0.2, glowMat(0xd8e0ff, 0.6), 0, 0.02, -0.15));
      break;
    case 'bananaMine':
      g.add(box(0.07, 0.07, 0.2, lambert(0xffe14d), 0, 0, -0.05), box(0.07, 0.07, 0.18, lambert(0xffe14d), 0, 0.05, -0.22));
      break;
    case 'bomb':
      g.add(box(0.2, 0.2, 0.2, lambert(0x22222a), 0, 0, -0.12));
      g.add(box(0.03, 0.08, 0.03, glowMat(0xffb020, 2), 0, 0.14, -0.12));
      break;
    case 'rare':
      g.add(box(0.18, 0.15, 0.55, lambert(0xffcf3a), 0, 0, -0.15));
      g.add(box(0.08, 0.08, 0.3, glowMat(0x2bf0ff, 1.8), 0, 0.02, -0.5));
      g.add(box(0.06, 0.12, 0.08, dark, 0, -0.12, 0));
      break;
    default:
      // the pixel blaster
      g.add(box(0.1, 0.12, 0.4, dark, 0, 0, -0.1));
      g.add(box(0.05, 0.05, 0.25, metal, 0, 0.02, -0.38));
      g.add(box(0.11, 0.03, 0.3, glowMat(0x2bf0ff, 1.6), 0, 0.075, -0.12));
      g.add(box(0.06, 0.13, 0.08, dark, 0, -0.12, 0.02));
  }
  return g;
}

export function createViewModel(): ViewModel {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 2, 1);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  const hand = new THREE.Group();
  // a smaller weapon down in the corner: it frames the view instead of filling a quarter of it
  hand.scale.setScalar(0.68);
  // one material per suit colour shown so far (colour-blind mode adds a few)
  const suits = new Map<number, THREE.Material>();
  const suit = (c: number) => {
    let m = suits.get(c);
    if (!m) suits.set(c, (m = lambert(c)));
    return m;
  };
  const arm = box(0.12, 0.12, 0.5, suit(playerColor(0)), 0.02, -0.08, 0.3);
  const fist = box(0.12, 0.12, 0.12, lambert(0xffd2a8), 0, -0.06, 0.05);
  hand.add(arm, fist);
  scene.add(hand);
  // driving in first person: the kart's cockpit in front of you, a steering wheel in two gloves that turns as you steer
  const cockpit = new THREE.Group();
  const cockpitPaint = lambert(0xe23b3b), cockpitDark = lambert(0x23232e), cockpitSteel = lambert(0x8a90a4);
  cockpit.add(box(1.1, 0.22, 0.5, cockpitPaint, 0, -0.2, -0.55), box(0.7, 0.16, 0.5, cockpitPaint, 0, -0.14, -1.0), box(0.16, 0.02, 0.9, lambert(0xf4f4fa), 0, -0.05, -0.85), box(0.06, 0.3, 0.06, cockpitSteel, 0, -0.02, -0.38));
  const fpWheel = new THREE.Group();
  fpWheel.add(box(0.44, 0.06, 0.06, cockpitDark, 0, 0.19, 0), box(0.44, 0.06, 0.06, cockpitDark, 0, -0.19, 0), box(0.06, 0.44, 0.06, cockpitDark, -0.19, 0, 0), box(0.06, 0.44, 0.06, cockpitDark, 0.19, 0, 0));
  fpWheel.add(box(0.36, 0.05, 0.05, cockpitSteel, 0, 0, 0), box(0.12, 0.12, 0.06, cockpitPaint, 0, 0, 0), box(0.1, 0.07, 0.07, glowMat(0xff3b3b, 1.4), 0, 0.19, 0.01));
  // the gloves at ten and two
  fpWheel.add(box(0.1, 0.12, 0.1, lambert(0xffd2a8), -0.19, 0.08, 0.04), box(0.1, 0.12, 0.1, lambert(0xffd2a8), 0.19, 0.08, 0.04));
  fpWheel.position.set(0, 0.12, -0.3);
  fpWheel.rotation.x = -0.45;
  cockpit.add(fpWheel);
  cockpit.position.set(0, -0.42, -0.25);
  cockpit.visible = false;
  scene.add(cockpit);
  const steerOf = new Map<number, { yaw: number; steer: number }>();
  // a shot: a flash at the muzzle and a tracer from there to the crosshair
  const flash = box(0.12, 0.12, 0.04, glowMat(0xfff2a0, 2), 0, 0.02, -0.62);
  flash.visible = false;
  hand.add(flash);
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -8)]);
  const tracerMat = new THREE.LineBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0 });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  scene.add(tracer);
  const muzzle = new THREE.Vector3();
  const models = new Map<Look, THREE.Group>();
  let shown: THREE.Group | null = null;
  let lastKind: Look | null = null;
  // per player: in split screen both views draw a hand, each with its own kick and bob
  const states = new Map<number, { kick: number; lastCooldown: number; kind: Look | null; lastPos: { x: number; z: number }; walk: number }>();

  return {
    update(s, playerId, time, frameDt) {
      const p = s.players.find(x => x.id === playerId);
      const ride = p && p.downUntil === null && p.vehicleId !== null ? s.vehicles.find(v => v.id === p.vehicleId) : undefined;
      cockpit.visible = !!ride && (ride.kind === 'kart' || ride.kind === 'roller');
      if (ride && cockpit.visible) {
        // a kart turns on the spot, so the wheel shows the turn a moment longer: a heading that follows the real
        // one with a little lag, and the wheel is turned by how far the two are apart
        const speed = Math.hypot(ride.vel.x, ride.vel.z);
        // the cockpit has the paint of the kart you sit in (the roller is yellow)
        cockpitPaint.color.setHex(ride.kind === 'roller' ? 0xffb020 : KART_PAINT[ride.id % KART_PAINT.length]);
        let st = steerOf.get(ride.id);
        if (!st) steerOf.set(ride.id, (st = { yaw: speed > 0.5 ? Math.atan2(-ride.vel.x, -ride.vel.z) : 0, steer: 0 }));
        const yaw = speed > 0.5 ? Math.atan2(-ride.vel.x, -ride.vel.z) : st.yaw;
        const off = Math.atan2(Math.sin(yaw - st.yaw), Math.cos(yaw - st.yaw));
        st.yaw += off * Math.min(1, frameDt * 5);
        st.steer += (Math.max(-1, Math.min(1, off / 0.7)) - st.steer) * Math.min(1, frameDt * 14);
        fpWheel.rotation.z = st.steer * 1.7;
        // the engine shakes it a little at speed
        cockpit.position.y = -0.42 + Math.sin(time * 40) * 0.004 * Math.min(1, speed / 6);
      }
      hand.visible = !!p && p.downUntil === null && p.vehicleId === null;
      if (!p || !hand.visible) return;
      const w = p.weapons[p.selected];
      const kind: Look = p.rare && p.rareSelected ? 'rare' : (w?.kind ?? 'pixelBlaster');
      let st = states.get(p.id);
      if (!st) states.set(p.id, (st = { kick: 0, lastCooldown: 0, kind: null, lastPos: { ...p.pos }, walk: 0 }));
      if (kind !== lastKind) {
        if (shown) hand.remove(shown);
        let m = models.get(kind);
        if (!m) models.set(kind, (m = makeModel(kind)));
        hand.add(m);
        shown = m;
        lastKind = kind;
      }
      if (st.kind !== kind) {
        st.kind = kind;
        st.lastCooldown = 0;
      }
      arm.material = suit(playerColor(p.color));
      // a fresh cooldown means a shot: kick back
      const cd = kind === 'rare' ? (p.rare?.cooldown ?? 0) : (w?.cooldown ?? 0);
      if (cd > st.lastCooldown) st.kick = 1;
      st.lastCooldown = cd;
      st.kick = Math.max(0, st.kick - frameDt * 7);
      const moved = Math.hypot(p.pos.x - st.lastPos.x, p.pos.z - st.lastPos.z) > 0.001;
      st.lastPos = { ...p.pos };
      st.walk = Math.max(0, Math.min(1, st.walk + (moved ? 1 : -1) * frameDt * 6));
      const kick = st.kick, walk = st.walk;
      const bob = Math.sin(time * 11) * 0.018 * walk;
      hand.position.set(0.34 + Math.cos(time * 5.5) * 0.01 * walk, -0.31 + bob - kick * 0.03, -0.66 + kick * 0.09);
      hand.rotation.set(kick * 0.25, -0.12, 0);
      if (kind === 'laserSword') {
        // a slash from the right across to the left
        const t = 1 - kick;
        hand.rotation.set(-0.2 * Math.sin(Math.PI * t), 0.9 - t * 1.8 * (kick > 0 ? 1 : 0), -0.6 * Math.sin(Math.PI * t) * (kick > 0 ? 1 : 0));
        hand.position.x = 0.3 - Math.sin(Math.PI * t) * 0.25 * (kick > 0 ? 1 : 0);
        if (kick === 0) hand.rotation.set(0, -0.12, 0);
      } else if (kind === 'flySwatter') {
        // held upright, then swung flat from the right across to the left
        const t = 1 - kick;
        const swinging = kick > 0;
        hand.rotation.set(0, swinging ? 1.0 - t * 2.2 : -0.12, swinging ? -0.25 * Math.sin(Math.PI * t) : 0);
        hand.position.x = 0.3 - (swinging ? Math.sin(Math.PI * t) * 0.3 : 0);
      }
      // melee and thrown things have no muzzle
      const shoots = !['laserSword', 'flySwatter', 'bananaMine', 'bomb', 'discoBall', 'joystickBoomerang', 'magnetGlove', 'yoyoLauncher'].includes(kind);
      flash.visible = shoots && kick > 0.65;
      flash.rotation.z = time * 20;
      tracerMat.opacity = shoots ? Math.max(0, kick - 0.4) * 1.6 : 0;
      if (tracerMat.opacity > 0) {
        hand.updateMatrixWorld();
        muzzle.set(0, 0.02, -0.6).applyMatrix4(hand.matrixWorld);
        const pos = tracerGeo.getAttribute('position') as THREE.BufferAttribute;
        pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
        pos.setXYZ(1, 0, 0, -8);
        pos.needsUpdate = true;
      }
    },
    render(renderer, aspect) {
      if (!hand.visible || !shown) return;
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
  };
}
