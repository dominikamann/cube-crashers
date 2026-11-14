import * as THREE from 'three';
import type { RareKind, SimState, WeaponKind } from '../sim/types';
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

/** a weapon to show in a hand: one of the weapons, or the rare one a player carries (`rare`: a rare one, whichever) */
export type HeldKind = WeaponKind | RareKind | 'rare';
type Look = HeldKind;

/** what flashes at the muzzle in first person when it fires, and the line a shot draws from there (none: it throws, swings or sprays) */
const FLASH: Partial<Record<Look, number>> = { pixelBlaster: 0xfff2a0, candyCannon: 0xff9ee8, pixelRail: 0x9ff8ff, bubbleWand: 0xd8f6ff, hotdogSlinger: 0xffd400, slushMachine: 0x9fe8ff, bubblegumBazooka: 0xff7fc8, leafBlower: 0xe8fff0, rare: 0x2bf0ff };
const TRACER: Partial<Record<Look, number>> = { pixelBlaster: 0xfff2a0, pixelRail: 0x9ff8ff };

/** The model of a weapon, pointing along -z with its grip at the origin (also what the figures of other players hold). */
export function weaponModel(kind: HeldKind): THREE.Group {
  const g = new THREE.Group();
  const dark = lambert(0x2a2550);
  const metal = lambert(0x8a90a8);
  /** a box turned about the upright axis (for arms and bends) */
  const turned = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, turn: number) => {
    const m = box(w, h, d, mat, x, y, z);
    m.rotation.y = turn;
    return m;
  };
  const grip = (y = -0.12, z = 0.02) => box(0.06, 0.13, 0.08, dark, 0, y, z);
  switch (kind) {
    case 'laserSword':
      // a hilt with rings and a guard, and a blade of light with a bright edge
      g.add(box(0.07, 0.07, 0.22, dark, 0, 0, 0.05), box(0.05, 0.05, 0.04, metal, 0, 0, 0.18));
      for (const z of [0.0, 0.06, 0.12]) g.add(box(0.078, 0.078, 0.02, metal, 0, 0, z));
      g.add(box(0.13, 0.035, 0.035, metal, 0, 0, -0.07), box(0.035, 0.035, 0.035, glowMat(0xff8cf0, 2), 0, 0, -0.075));
      g.add(box(0.05, 0.022, 0.74, glowMat(0xff2bd6, 2.2), 0, 0, -0.45), box(0.022, 0.05, 0.74, glowMat(0xff2bd6, 2.2), 0, 0, -0.45));
      g.add(box(0.014, 0.052, 0.76, glowMat(0xffc8f6, 2.6), 0, 0, -0.45));
      g.rotation.x = 0.55;
      break;
    case 'flySwatter':
      g.add(box(0.04, 0.04, 0.5, lambert(0x8a5a2b), 0, 0, -0.2));
      g.add(box(0.36, 0.03, 0.32, lambert(0x3bd16f), 0, 0, -0.6));
      for (const o of [-0.11, 0, 0.11]) g.add(box(0.015, 0.04, 0.32, lambert(0x1f8a44), o, 0, -0.6), box(0.36, 0.04, 0.015, lambert(0x1f8a44), 0, 0, -0.6 + o));
      for (const o of [-0.17, 0.17]) g.add(box(0.025, 0.045, 0.34, lambert(0x1f8a44), o, 0, -0.6), box(0.36, 0.045, 0.025, lambert(0x1f8a44), 0, 0, -0.6 + o * 0.94));
      // upright: the face of the paddle points to the side it swings toward
      g.rotation.set(0.2, 0, Math.PI / 2);
      break;
    case 'pixelRail':
      // two rails with the charge between them, coils round the body, a sight on top
      g.add(box(0.1, 0.1, 0.5, dark, 0, 0, -0.12), box(0.08, 0.1, 0.14, dark, 0, -0.02, 0.18));
      for (const z of [-0.06, -0.18, -0.3]) g.add(box(0.14, 0.14, 0.04, glowMat(0x9ff8ff, 1.4), 0, 0, z));
      for (const x of [-0.045, 0.045]) g.add(box(0.022, 0.05, 0.42, metal, x, 0, -0.56));
      g.add(box(0.03, 0.03, 0.4, glowMat(0xd8fdff, 2.2), 0, 0, -0.55));
      g.add(box(0.03, 0.04, 0.12, metal, 0, 0.09, -0.02), box(0.02, 0.02, 0.02, glowMat(0x9ff8ff, 2), 0, 0.09, -0.09));
      g.add(grip());
      break;
    case 'bubbleWand':
      // a ring on a stick with a film of soap in it, and a little pot of suds
      g.add(box(0.04, 0.04, 0.42, lambert(0x8a5a2b), 0, 0, -0.08));
      for (const o of [-0.08, 0.08]) g.add(box(0.03, 0.19, 0.03, glowMat(0xff9ee8, 1.1), o, 0.03, -0.38), box(0.19, 0.03, 0.03, glowMat(0xff9ee8, 1.1), 0, 0.03 + o, -0.38));
      g.add(box(0.13, 0.13, 0.012, glowMat(0xd8f6ff, 0.7), 0, 0.03, -0.38));
      g.add(box(0.035, 0.035, 0.02, lambert(0xffffff), -0.03, 0.06, -0.39));
      g.add(box(0.07, 0.07, 0.07, lambert(0x7fdcff), 0, -0.02, 0.1), box(0.08, 0.02, 0.08, lambert(0xffffff), 0, 0.025, 0.1));
      break;
    case 'magnetGlove':
      // a glove with a horseshoe magnet on it, a spark between its poles
      g.add(box(0.16, 0.14, 0.2, lambert(0x3a3f55), 0, 0, -0.05), box(0.18, 0.16, 0.05, lambert(0x8a90a8), 0, 0, 0.06));
      g.add(box(0.18, 0.07, 0.06, lambert(0xd0d0d0), 0, 0, -0.16));
      g.add(box(0.06, 0.07, 0.18, lambert(0xff3b3b), -0.06, 0, -0.27), box(0.06, 0.07, 0.18, lambert(0x3d8bfd), 0.06, 0, -0.27));
      g.add(box(0.06, 0.07, 0.04, lambert(0xf0f0f0), -0.06, 0, -0.38), box(0.06, 0.07, 0.04, lambert(0xf0f0f0), 0.06, 0, -0.38));
      g.add(box(0.03, 0.03, 0.03, glowMat(0xfff2a0, 2.4), 0, 0, -0.39));
      break;
    case 'yoyoLauncher':
      // a yo-yo in the hand, a star on each side, its string round a finger
      g.add(box(0.06, 0.12, 0.08, dark, 0, -0.08, 0));
      for (const x of [-0.045, 0.045]) {
        g.add(box(0.05, 0.2, 0.2, lambert(0x2bd4ff), x, 0.02, -0.2), box(0.05, 0.13, 0.26, lambert(0x1fb4e8), x, 0.02, -0.2), box(0.05, 0.26, 0.13, lambert(0x1fb4e8), x, 0.02, -0.2));
        g.add(box(0.012, 0.12, 0.04, glowMat(0xffe14a, 1.4), x * 1.6, 0.02, -0.2), box(0.012, 0.04, 0.12, glowMat(0xffe14a, 1.4), x * 1.6, 0.02, -0.2));
      }
      g.add(box(0.06, 0.08, 0.08, lambert(0xffcf3a), 0, 0.02, -0.2), box(0.012, 0.012, 0.2, lambert(0xfffdf5), 0, 0.1, -0.08));
      break;
    case 'candyCannon':
      // a pink barrel with white stripes and a wide mouth, a glass of sweets on top
      g.add(box(0.16, 0.16, 0.5, lambert(0xff7ac8), 0, 0, -0.15));
      for (const z of [-0.02, -0.18]) g.add(box(0.168, 0.168, 0.05, lambert(0xffffff), 0, 0, z));
      g.add(box(0.2, 0.2, 0.05, lambert(0xffffff), 0, 0, -0.4), box(0.23, 0.23, 0.04, lambert(0xff4d9e), 0, 0, -0.44));
      g.add(box(0.1, 0.1, 0.02, lambert(0x4a1030), 0, 0, -0.455));
      g.add(box(0.12, 0.1, 0.14, lambert(0xbfefff), 0, 0.12, 0.02), box(0.14, 0.02, 0.16, lambert(0xffffff), 0, 0.18, 0.02));
      g.add(box(0.04, 0.04, 0.04, glowMat(0xff4d6d, 0.8), -0.03, 0.14, 0.095), box(0.04, 0.04, 0.04, glowMat(0xffe14a, 0.8), 0.03, 0.12, 0.095), box(0.04, 0.04, 0.04, glowMat(0x4dd2ff, 0.8), 0.0, 0.1, 0.095));
      g.add(grip(-0.13, 0.02));
      break;
    case 'hotdogSlinger':
      // a bun with the next hot dog in it, mustard on top, a bottle of ketchup behind
      g.add(box(0.14, 0.05, 0.42, lambert(0xd99a48), 0, -0.04, -0.15));
      for (const x of [-0.055, 0.055]) g.add(box(0.045, 0.1, 0.42, lambert(0xe8b25e), x, 0.01, -0.15));
      g.add(box(0.07, 0.07, 0.52, lambert(0xc0432f), 0, 0.045, -0.17), box(0.05, 0.05, 0.56, lambert(0xa8361f), 0, 0.045, -0.17));
      for (let k = 0; k < 5; k++) g.add(box(0.03, 0.02, 0.05, lambert(0xffd400), k % 2 ? 0.015 : -0.015, 0.085, -0.33 + k * 0.08));
      g.add(box(0.07, 0.11, 0.07, lambert(0xd8261c), 0, 0.03, 0.12), box(0.035, 0.04, 0.035, lambert(0xffffff), 0, 0.1, 0.12));
      g.add(grip(-0.1, 0));
      break;
    case 'joystickBoomerang':
      // the boomerang itself: two arms, a red knob on each, a strip of light along them
      for (const k of [-1, 1]) {
        g.add(turned(0.08, 0.04, 0.26, dark, k * 0.09, 0.02, -0.18, -k * 0.72));
        g.add(turned(0.03, 0.02, 0.22, glowMat(0x2bf0ff, 1.5), k * 0.09, 0.045, -0.18, -k * 0.72));
        g.add(box(0.065, 0.065, 0.065, glowMat(0xff3b3b, 1.2), k * 0.18, 0.035, -0.285));
      }
      g.add(turned(0.1, 0.05, 0.1, lambert(0x3a3470), 0, 0.02, -0.075, Math.PI / 4), turned(0.05, 0.02, 0.05, glowMat(0xffe14a, 1.4), 0, 0.05, -0.075, Math.PI / 4));
      break;
    case 'discoBall':
      // a little mirror ball on its cord
      g.add(box(0.18, 0.18, 0.18, glowMat(0xd8e0ff, 0.6), 0, 0.02, -0.15));
      g.add(box(0.23, 0.12, 0.12, glowMat(0xb8c4f0, 0.5), 0, 0.02, -0.15), box(0.12, 0.23, 0.12, glowMat(0xb8c4f0, 0.5), 0, 0.02, -0.15), box(0.12, 0.12, 0.23, glowMat(0xb8c4f0, 0.5), 0, 0.02, -0.15));
      g.add(box(0.04, 0.04, 0.005, glowMat(0xff3df0, 1.6), -0.04, 0.06, -0.035), box(0.04, 0.04, 0.005, glowMat(0x3df0ff, 1.6), 0.04, 0.0, -0.035));
      g.add(box(0.02, 0.08, 0.02, metal, 0, 0.17, -0.15));
      break;
    case 'bananaMine':
      // a banana, bent like a bow, with a dark stalk and a little red light strapped to it
      for (let k = -2; k <= 2; k++) g.add(turned(0.085 - 0.006 * k * k, 0.085 - 0.006 * k * k, 0.105, lambert(k % 2 ? 0xffe135 : 0xffd21f), 0, 0.02 - 0.018 * k * k, -0.2 - k * 0.09, 0));
      g.add(box(0.035, 0.04, 0.05, lambert(0x6b4a1f), 0, -0.045, 0.045), box(0.03, 0.03, 0.03, lambert(0x3a2a12), 0, -0.05, -0.43));
      g.add(box(0.095, 0.095, 0.035, lambert(0x2a2a35), 0, 0.02, -0.2), box(0.035, 0.035, 0.035, glowMat(0xff3b3b, 2), 0, 0.085, -0.2));
      break;
    case 'bomb':
      // a round black bomb, a steel cap, a fuse that burns
      g.add(box(0.18, 0.18, 0.18, lambert(0x26262e), 0, 0, -0.12));
      g.add(box(0.23, 0.13, 0.13, lambert(0x1c1c22), 0, 0, -0.12), box(0.13, 0.23, 0.13, lambert(0x1c1c22), 0, 0, -0.12), box(0.13, 0.13, 0.23, lambert(0x1c1c22), 0, 0, -0.12));
      g.add(box(0.045, 0.045, 0.01, lambert(0x8088a0), -0.04, 0.04, -0.025));
      g.add(box(0.08, 0.035, 0.08, metal, 0, 0.13, -0.12), box(0.03, 0.06, 0.03, lambert(0xc8a060), 0, 0.17, -0.12));
      g.add(box(0.05, 0.05, 0.05, glowMat(0xffb020, 2.4), 0, 0.215, -0.12), box(0.025, 0.025, 0.025, glowMat(0xffffff, 3), 0, 0.25, -0.12));
      break;
    case 'slushMachine':
      // a tank of blue slush on a nozzle, ice piled on top
      g.add(box(0.16, 0.18, 0.3, glowMat(0x4fc8ff, 0.5), 0, 0.03, -0.05), box(0.18, 0.03, 0.32, lambert(0xffffff), 0, 0.13, -0.05), box(0.18, 0.03, 0.32, lambert(0xd0d4e0), 0, -0.07, -0.05));
      g.add(box(0.06, 0.05, 0.06, lambert(0xffffff), -0.03, 0.17, -0.02), box(0.05, 0.04, 0.05, lambert(0xd8f6ff), 0.04, 0.165, -0.1));
      g.add(box(0.08, 0.08, 0.22, metal, 0, 0, -0.3), box(0.12, 0.12, 0.04, glowMat(0x9fe8ff, 1.4), 0, 0, -0.42));
      g.add(grip(-0.14, 0.02));
      break;
    case 'bubblegumBazooka':
      // a fat pink tube, a ball of gum in its mouth
      g.add(box(0.17, 0.17, 0.6, lambert(0xff7fc8), 0, 0.02, -0.15));
      for (const z of [0.12, -0.42]) g.add(box(0.2, 0.2, 0.05, lambert(0xffffff), 0, 0.02, z));
      g.add(box(0.13, 0.13, 0.06, glowMat(0xff4fa8, 0.9), 0, 0.02, -0.46), box(0.04, 0.04, 0.02, lambert(0xffffff), -0.03, 0.05, -0.49));
      g.add(box(0.05, 0.06, 0.1, lambert(0x4dd2ff), 0, 0.13, -0.05), grip(-0.12, 0));
      break;
    case 'leafBlower':
      // a motor in a housing, a long nozzle that widens, a leaf caught on it
      g.add(box(0.18, 0.18, 0.2, lambert(0xff9f43), 0, 0.02, 0.0), box(0.19, 0.06, 0.12, lambert(0x2a2a35), 0, 0.02, 0.0), box(0.1, 0.1, 0.42, lambert(0x3a3f55), 0, 0, -0.3));
      g.add(box(0.14, 0.14, 0.06, lambert(0x2a2a35), 0, 0, -0.52), box(0.08, 0.02, 0.05, lambert(0x7cc56a), 0.02, 0.06, -0.4));
      g.add(box(0.05, 0.04, 0.16, lambert(0x2a2a35), 0, 0.14, 0.0), grip(-0.13, 0.02));
      break;
    case 'pizzaCutter':
      // a wheel of pizza on a handle
      g.add(box(0.05, 0.05, 0.3, lambert(0x8a5a2b), 0, 0, 0), box(0.03, 0.03, 0.12, metal, 0, 0, -0.2));
      g.add(box(0.035, 0.26, 0.26, lambert(0xf2c14e), 0, 0, -0.36), box(0.035, 0.18, 0.33, lambert(0xd9953a), 0, 0, -0.36), box(0.035, 0.33, 0.18, lambert(0xd9953a), 0, 0, -0.36));
      for (const [y, z] of [[0.06, -0.3], [-0.05, -0.33], [0.02, -0.43], [-0.07, -0.42]]) g.add(box(0.045, 0.05, 0.05, lambert(0xc0392b), 0, y, z));
      break;
    case 'thunderHammer':
      // a heavy head of steel on a short handle, lightning in its face
      g.add(box(0.05, 0.05, 0.42, lambert(0x4a3222), 0, 0, -0.1), box(0.06, 0.06, 0.04, metal, 0, 0, 0.12));
      g.add(box(0.3, 0.18, 0.16, lambert(0x8a919e), 0, 0, -0.36), box(0.04, 0.2, 0.18, lambert(0x5d6168), -0.15, 0, -0.36), box(0.04, 0.2, 0.18, lambert(0x5d6168), 0.15, 0, -0.36));
      g.add(box(0.2, 0.04, 0.165, glowMat(0x7dfcff, 2), 0, 0.03, -0.36), box(0.06, 0.1, 0.165, glowMat(0x7dfcff, 2), 0.03, -0.01, -0.36));
      break;
    case 'missileLauncher':
      // a dark tube on the shoulder with the missile's red nose in its mouth, a sight with a light on top
      g.add(box(0.2, 0.2, 0.7, lambert(0x3d4a3a), 0, 0.04, -0.15), box(0.23, 0.23, 0.05, dark, 0, 0.04, 0.18), box(0.23, 0.23, 0.05, dark, 0, 0.04, -0.48));
      g.add(box(0.12, 0.12, 0.08, lambert(0xff3b3b), 0, 0.04, -0.53), box(0.07, 0.07, 0.05, lambert(0xff3b3b), 0, 0.04, -0.58));
      g.add(box(0.06, 0.07, 0.16, dark, 0, 0.18, -0.1), box(0.04, 0.04, 0.02, glowMat(0xff2b2b, 2.2), 0, 0.185, -0.185));
      g.add(grip(-0.13, 0.02));
      break;
    case 'rare':
      g.add(box(0.18, 0.15, 0.55, lambert(0xffcf3a), 0, 0, -0.15));
      g.add(box(0.08, 0.08, 0.3, glowMat(0x2bf0ff, 1.8), 0, 0.02, -0.5));
      g.add(box(0.06, 0.12, 0.08, dark, 0, -0.12, 0));
      break;
    default:
      // the pixel blaster: a short barrel, cells of light along its sides, the charge glowing in its mouth
      g.add(box(0.1, 0.12, 0.4, dark, 0, 0, -0.1));
      g.add(box(0.05, 0.05, 0.25, metal, 0, 0.02, -0.38), box(0.085, 0.085, 0.04, metal, 0, 0.02, -0.49));
      g.add(box(0.035, 0.035, 0.02, glowMat(0xfff27a, 2.2), 0, 0.02, -0.515));
      g.add(box(0.11, 0.03, 0.3, glowMat(0x2bf0ff, 1.6), 0, 0.075, -0.12));
      for (const z of [-0.2, -0.11, -0.02]) g.add(box(0.108, 0.04, 0.05, glowMat(0x2bf0ff, 1.2), 0, 0, z));
      g.add(box(0.04, 0.04, 0.05, metal, 0, 0.1, 0.07));
      g.add(grip());
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
  // a shot: a flash at the muzzle and a tracer from there to the crosshair
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0, toneMapped: false });
  const flash = new THREE.Group();
  // (a star of two crossed bars and a bright middle)
  flash.add(box(0.2, 0.05, 0.03, flashMat), box(0.05, 0.2, 0.03, flashMat), box(0.09, 0.09, 0.05, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
  flash.position.set(0, 0.02, -0.64);
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
      hand.visible = !!p && p.downUntil === null && p.vehicleId === null;
      if (!p || !hand.visible) return;
      const w = p.weapons[p.selected];
      const rare = p.rare && p.rareSelected ? p.rare.kind : null;
      const kind: Look = rare ?? w?.kind ?? 'pixelBlaster';
      let st = states.get(p.id);
      if (!st) states.set(p.id, (st = { kick: 0, lastCooldown: 0, kind: null, lastPos: { ...p.pos }, walk: 0 }));
      if (kind !== lastKind) {
        if (shown) hand.remove(shown);
        let m = models.get(kind);
        if (!m) models.set(kind, (m = weaponModel(kind)));
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
      const cd = rare ? (p.rare?.cooldown ?? 0) : (w?.cooldown ?? 0);
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
      // what shoots flashes at the muzzle in its own colour; a bolt and a beam draw a line from there
      const flashColor = FLASH[kind], tracerColor = TRACER[kind];
      flash.visible = flashColor !== undefined && kick > 0.65;
      if (flash.visible) {
        flashMat.color.setHex(flashColor!);
        flash.rotation.z = time * 20;
        flash.scale.setScalar((kind === 'pixelRail' ? 1.7 : 1) * (0.6 + 0.6 * kick));
      }
      tracerMat.opacity = tracerColor !== undefined ? Math.max(0, kick - 0.4) * 1.6 : 0;
      if (tracerColor !== undefined) tracerMat.color.setHex(tracerColor);
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
