import * as THREE from 'three';
import { box, glowMat } from './pool';

/** the Laser Sword's colours: its white-hot core, the glow round it, and the haze further out */
export const BLADE_COLORS = { core: 0xfff0fb, glow: 0xff2bd6, haze: 0x9c1a9c };
/** how long the blade takes to run out of the hilt and to sink back into it (seconds) */
export const BLADE_OUT = 0.16, BLADE_IN = 0.12;
/** how long the blade is, from the hilt's mouth */
const LENGTH = 0.8;

/** how far the blade is out of the hilt (0 to 1) a frame later: out while it is `drawn`, in when it is not */
export function bladeStep(out: number, drawn: boolean, dt: number): number {
  return drawn ? Math.min(1, out + dt / BLADE_OUT) : Math.max(0, out - dt / BLADE_IN);
}

/** how it runs out: fast from the hilt, slowing as it reaches its length (and the same way back) */
export function bladeReach(out: number): number {
  const k = Math.max(0, Math.min(1, out));
  return 1 - (1 - k) ** 2;
}

/** a light that is never quite still: how wide the glow is right now (about 1; `seed` keeps two swords apart) */
export function bladeFlicker(time: number, seed: number): number {
  return 1 + 0.05 * Math.sin(time * 41 + seed) + 0.035 * Math.sin(time * 97 + seed * 2.3) + 0.02 * Math.sin(time * 13 + seed * 0.7);
}

/**
 * The blade of the Laser Sword, pointing along -z from the hilt's mouth at its origin: a white-hot core, and
 * round it two shells of light that is added to the picture (a coloured glow, a wider faint haze), so it glows
 * also where the picture has no bloom (the weapon in the hand in first person). Named `blade`; its glow, named
 * `halo`, is a group of its own, so bake() in figure.ts leaves it as it is when it merges the blade.
 */
export function swordBlade(): THREE.Group {
  const blade = new THREE.Group();
  blade.name = 'blade';
  blade.add(box(0.034, 0.034, LENGTH, glowMat(BLADE_COLORS.core, 3.2), 0, 0, -LENGTH / 2));
  // (its colour at the edges, flat and wide in two ways: the white core shows between them from every side, and
  // the blade reads in its colour also on a bright floor in daylight, where added light hardly shows)
  const edge = glowMat(BLADE_COLORS.glow, 2.4);
  blade.add(box(0.064, 0.02, LENGTH, edge, 0, 0, -LENGTH / 2), box(0.02, 0.064, LENGTH, edge, 0, 0, -LENGTH / 2));
  // (the tip: the core rounded off a step past its colour)
  blade.add(box(0.03, 0.03, 0.02, glowMat(BLADE_COLORS.core, 3.2), 0, 0, -LENGTH - 0.01));
  const halo = new THREE.Group();
  halo.name = 'halo';
  const shell = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const [w, color, opacity] of [[0.085, BLADE_COLORS.glow, 0.85], [0.17, BLADE_COLORS.haze, 0.45]] as const) {
    const m = box(w, w, LENGTH + w * 0.6, shell(color, opacity), 0, 0, -LENGTH / 2 - w * 0.15);
    m.castShadow = false;
    halo.add(m);
  }
  blade.add(halo);
  return blade;
}

/**
 * Shows a blade `out` of the hilt (0 to 1), its glow flickering, wider at a higher `level`. `hide`: the blade is
 * somewhere else for the moment (a swing draws it as it sweeps).
 */
export function showBlade(blade: THREE.Object3D, out: number, time: number, seed: number, level = 1, hide = false): void {
  const reach = bladeReach(out);
  blade.visible = reach > 0.01 && !hide;
  if (!blade.visible) return;
  blade.scale.set(1, 1, reach);
  const halo = blade.children.find(c => c.name === 'halo');
  if (!halo) return;
  const wide = bladeFlicker(time, seed) * (1 + 0.07 * (level - 1));
  halo.scale.set(wide, wide, 1);
}
