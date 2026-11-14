import * as THREE from 'three';
import { FLASH } from './pool';
import { Sculpt } from './figure';

/**
 * Die Hex, the witch of the Town's Fasnet, and the small ones that dance with her: a figure of boxes in the game's
 * voxel style. She stands on y = 0 and looks along +z (as the monsters do), about 2.3 high before `scale`.
 *
 * Her carved wooden mask has two faces, the grinning one in front and the glaring one at the back of her head: at
 * the phase change she turns her head round (see `face`). A red headscarf with straw braids, a black cape, a
 * mustard-yellow blouse, a green skirt with the red underskirt showing under its hem, white bloomers to the knee,
 * patterned socks, straw shoes over dark ones, black gloves, and a broom of birch twigs in her right hand.
 */
export const WITCH_LOOK = {
  /** the boss and the small ones, against the figure as built */
  scale: 1.12,
  small: 0.5,
  height: 2.3,
};

/** what she is doing, as the figure needs it */
export interface WitchPose {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** walking or standing; crouched and looking about; a charge (`ready`: still crouched before the run); in mid-hop;
   *  sitting on a player; sweeping the broom; throwing twigs; dazed; dancing round the fire */
  act: 'walk' | 'scan' | 'charge' | 'hop' | 'press' | 'sweep' | 'throw' | 'reel' | 'dance';
  /** how far into it (0 to 1) */
  t: number;
  ready?: boolean;
  /** how high in a hop (0 to 1) */
  air: number;
  /** her steps follow the ground she covers: the phase of her stride, and whether she is moving */
  stride: number;
  moving: boolean;
  /** 0: the grinning face in front, 1: the glaring one (in between while she turns her head) */
  face: number;
  /** her broom's twigs are alight */
  burning: boolean;
  /** seconds, running (for what moves by itself: the cape, the braids, her look) */
  time: number;
  tint?: number;
}

export interface WitchFigures {
  begin(): void;
  add(p: WitchPose): void;
  end(): void;
}

type C = number;
const WOOD = 0xbd8752, WOOD_DARK = 0x8e4f2c, CARVE = 0x3a2314, TEETH = 0xf0e6d0, CHEEK = 0xd24a3c, GLINT = 0xff3020;
const SCARF = 0xc4262e, SCARF_DARK = 0x9a1c24, STRAW = 0xe2c062, STRAW_DARK = 0xc29a3e;
const BLOUSE = 0xd6a12a, BLOUSE_DARK = 0xb4841c, CAPE = 0x18181d, CAPE_EDGE = 0x26262c, GLOVE = 0x111114;
const SKIRT = 0x2f7d3a, SKIRT_DARK = 0x235f2c, UNDER = 0xc0262c, BLOOMERS = 0xf1eee6, SHOE = 0x2b2119;
const SOCK = [0xb8232f, 0xf2efe8, 0x2f6b3a, 0xf2efe8];
const STICK = 0x5e3b1e, STICK_DARK = 0x4a2e17, BAND = 0x2a2420, TWIG = [0x6b5236, 0x4c3a26, 0xe8e2d4, 0x7a5f3c], HOT = [0xff6a14, 0xffb52e, 0xff3a0a, 0xffe07a];

/** the two faces of her mask, top row first, 8 wide: d carved dark, k eye, w teeth, c red cheek, r glint, n nose */
const GRIN = ['........', '.dd..dd.', 'd......d', '.kk..kk.', 'c..nn..c', 'c..nn..c', 'dwwwwwwd', '.dwwwwd.', '..dddd..'];
const GLARE = ['dd....dd', '.dd..dd.', '..dddd..', '.rk..kr.', '...nn...', '...nn...', '.dddddd.', 'dwwwwwwd', 'd......d'];

const HEAD = { w: 0.36, h: 0.44, d: 0.32, y: 1.79 };

/** one figure's moving parts */
interface Figure {
  root: THREE.Group;
  parts: Record<string, THREE.Group>;
  meshes: THREE.Mesh[];
  materials: THREE.Material[];
  seen: boolean;
}

function build(): Figure {
  const f = new Sculpt();
  const body = f.part('body', [0, 0.95, 0]);
  // the skirt: three bands wider to the hem, the red underskirt a little longer under it, the waistband darker
  const skirt = f.part('skirt', [0, 0.98, 0], 'body');
  skirt.box(SKIRT_DARK, 0.5, 0.08, 0.4, 0, 0.97, 0);
  skirt.box(SKIRT, 0.56, 0.16, 0.44, 0, 0.86, 0);
  skirt.box(SKIRT, 0.64, 0.17, 0.5, 0, 0.7, 0);
  skirt.box(SKIRT_DARK, 0.72, 0.15, 0.56, 0, 0.55, 0);
  skirt.box(UNDER, 0.7, 0.09, 0.54, 0, 0.44, 0);
  // (a fold or two in the green)
  for (const s of [-1, 1]) skirt.box(SKIRT_DARK, 0.04, 0.3, 0.02, s * 0.16, 0.66, 0.255);
  // legs: white bloomers to the knee, then the socks in stripes, dark shoes with straw shoes over them
  for (const [name, side] of [['L', 1], ['R', -1]] as const) {
    const leg = f.part(`leg${name}`, [side * 0.13, 0.95, 0], 'body');
    leg.box(BLOOMERS, 0.18, 0.4, 0.19, side * 0.13, 0.76, 0);
    leg.box(BLOOMERS, 0.2, 0.05, 0.21, side * 0.13, 0.58, 0);
    const shin = f.part(`shin${name}`, [side * 0.13, 0.58, 0], `leg${name}`);
    for (let i = 0; i < 8; i++) shin.box(SOCK[i % SOCK.length], 0.15, 0.062, 0.15, side * 0.13, 0.54 - i * 0.062, 0);
    shin.box(SHOE, 0.17, 0.07, 0.3, side * 0.13, 0.035, 0.05);
    shin.box(STRAW, 0.19, 0.08, 0.24, side * 0.13, 0.1, 0.06);
    shin.box(STRAW_DARK, 0.2, 0.04, 0.2, side * 0.13, 0.15, 0.04);
    // (the plaited straw sticks out over the toes)
    for (let i = 0; i < 3; i++) shin.box(i % 2 ? STRAW_DARK : STRAW, 0.05, 0.05, 0.08, side * 0.13 + (i - 1) * 0.06, 0.1, 0.21);
  }
  // the blouse, the cape over the shoulders and down her back
  const torso = f.part('torso', [0, 1.0, 0], 'body');
  torso.box(BLOUSE_DARK, 0.48, 0.07, 0.3, 0, 1.03, 0);
  torso.box(BLOUSE, 0.46, 0.44, 0.28, 0, 1.28, 0);
  torso.box(BLOUSE_DARK, 0.06, 0.36, 0.02, 0, 1.28, 0.145);
  for (let i = 0; i < 3; i++) torso.box(CAPE_EDGE, 0.03, 0.03, 0.02, 0, 1.18 + i * 0.1, 0.16);
  torso.box(CAPE, 0.58, 0.09, 0.36, 0, 1.5, -0.01);
  torso.box(CAPE_EDGE, 0.14, 0.12, 0.14, 0, 1.56, 0);
  const cape = f.part('cape', [0, 1.5, -0.16], 'torso');
  cape.box(CAPE, 0.6, 1.0, 0.05, 0, 1.0, -0.18);
  cape.box(CAPE_EDGE, 0.64, 0.06, 0.06, 0, 0.5, -0.18);
  for (const s of [-1, 1]) cape.box(CAPE_EDGE, 0.03, 0.9, 0.02, s * 0.14, 1.0, -0.21);
  // the head: the wooden mask with a face on each side, the red scarf over the top and the sides, the straw braids
  const head = f.part('head', [0, 1.58, 0], 'torso');
  head.box(WOOD, HEAD.w, HEAD.h, HEAD.d, 0, HEAD.y, 0);
  head.box(WOOD_DARK, HEAD.w - 0.02, HEAD.h - 0.04, 0.02, 0, HEAD.y, -HEAD.d / 2 - 0.005);
  const face = (rows: string[], back: boolean) => {
    const cw = HEAD.w / 8, ch = HEAD.h / 9.5, z = (HEAD.d / 2 + 0.012) * (back ? -1 : 1);
    rows.forEach((row, r) =>
      [...row].forEach((c, i) => {
        if (c === '.') return;
        const x = ((i - 3.5) * cw) * (back ? -1 : 1), y = HEAD.y + HEAD.h / 2 - ch * (r + 0.75);
        const color: C = c === 'w' ? TEETH : c === 'c' ? CHEEK : c === 'k' ? 0x0d0907 : c === 'r' ? GLINT : c === 'n' ? (back ? WOOD_DARK : WOOD) : CARVE;
        // the nose stands out of the wood, the rest is cut into it
        const deep = c === 'n' ? 0.07 : 0.012;
        head.box(color, cw, ch, deep, x, y, z + (deep / 2 - 0.006) * (back ? -1 : 1));
      }),
    );
  };
  face(GRIN, false);
  face(GLARE, true);
  head.box(SCARF, HEAD.w + 0.06, 0.1, HEAD.d + 0.06, 0, HEAD.y + HEAD.h / 2 + 0.03, 0);
  head.box(SCARF_DARK, HEAD.w + 0.04, 0.03, HEAD.d + 0.08, 0, HEAD.y + HEAD.h / 2 - 0.02, 0);
  for (const s of [-1, 1]) head.box(SCARF, 0.05, HEAD.h - 0.04, HEAD.d + 0.04, s * (HEAD.w / 2 + 0.025), HEAD.y + 0.02, 0);
  // (the knot of the scarf under her ear)
  head.box(SCARF_DARK, 0.08, 0.08, 0.08, HEAD.w / 2 + 0.05, HEAD.y - HEAD.h / 2 + 0.04, 0);
  head.box(SCARF, 0.05, 0.12, 0.04, HEAD.w / 2 + 0.06, HEAD.y - HEAD.h / 2 - 0.05, 0.03);
  for (const [name, side] of [['L', 1], ['R', -1]] as const) {
    const braid = f.part(`braid${name}`, [side * (HEAD.w / 2 + 0.04), HEAD.y - 0.08, 0.02], 'head');
    for (let i = 0; i < 5; i++) braid.box(i % 2 ? STRAW_DARK : STRAW, 0.075, 0.1, 0.075, side * (HEAD.w / 2 + 0.04) + (i % 2 ? 0.015 : -0.015), HEAD.y - 0.14 - i * 0.085, 0.02);
    braid.box(SCARF, 0.09, 0.04, 0.09, side * (HEAD.w / 2 + 0.04), HEAD.y - 0.58, 0.02);
    braid.box(STRAW, 0.06, 0.07, 0.06, side * (HEAD.w / 2 + 0.04), HEAD.y - 0.63, 0.02);
  }
  // arms: mustard sleeves, black gloves
  for (const [name, side] of [['L', 1], ['R', -1]] as const) {
    const arm = f.part(`arm${name}`, [side * 0.31, 1.45, 0], 'torso');
    arm.box(BLOUSE, 0.14, 0.32, 0.14, side * 0.31, 1.3, 0);
    arm.box(BLOUSE_DARK, 0.15, 0.05, 0.15, side * 0.31, 1.15, 0);
    const fore = f.part(`fore${name}`, [side * 0.31, 1.15, 0], `arm${name}`);
    fore.box(BLOUSE, 0.12, 0.22, 0.12, side * 0.31, 1.03, 0);
    fore.box(GLOVE, 0.13, 0.14, 0.13, side * 0.31, 0.86, 0.01);
  }
  // the broom in her right hand: she holds the long stick by its end, a little crooked and dark; at its far end the
  // bundle of birch twigs, tied with two bands, fanning out wider toward the tip (and the same bundle burning, shown
  // when it is alight). It points along her forearm, away from her: everything below the hand in its own frame
  const hand = [-0.31, 0.86, 0.02] as [number, number, number];
  const broom = f.part('broom', hand, 'foreR');
  const STICK_LEN = 1.3;
  broom.box(STICK, 0.06, 0.7, 0.06, hand[0], hand[1] - 0.27, hand[2]);
  // (the lower half bends off a little: an old stick, not a turned one)
  broom.box(STICK_DARK, 0.055, 0.66, 0.055, hand[0] + 0.025, hand[1] - 0.93, hand[2] + 0.01, [0.03, 0, 0.06]);
  for (const y of [STICK_LEN - 0.02, STICK_LEN + 0.1]) broom.box(BAND, 0.1, 0.045, 0.1, hand[0] + 0.035, hand[1] - y, hand[2] + 0.012);
  const bundle = (name: string, colors: number[], glow: boolean) => {
    const p = f.part(name, hand, 'broom');
    const top = hand[1] - STICK_LEN + 0.02;
    for (let i = 0; i < 18; i++) {
      // an inner ring of long twigs and an outer ring of shorter ones, each leaning out the more the further out it sits
      const outer = i % 2 === 1, a = (i / 18) * Math.PI * 2 + (outer ? 0.2 : 0);
      const r = outer ? 0.045 : 0.02, len = (outer ? 0.48 : 0.6) + (i % 3) * 0.05, tilt = outer ? 0.28 : 0.14;
      const x = hand[0] + 0.035 + Math.cos(a) * (r + Math.sin(tilt) * len * 0.5), z = hand[2] + 0.012 + Math.sin(a) * (r + Math.sin(tilt) * len * 0.5);
      const y = top - Math.cos(tilt) * len * 0.5;
      const rot: [number, number, number] = [-Math.sin(a) * tilt, 0, Math.cos(a) * tilt];
      if (glow) p.glow(colors[i % colors.length], 1.6, 0.035, len, 0.035, x, y, z, rot);
      else p.box(colors[i % colors.length], 0.035, len, 0.035, x, y, z, rot);
    }
    return p;
  };
  bundle('twigs', TWIG, false);
  bundle('hot', HOT, true);
  const parts = f.finish();
  for (const [name, g] of Object.entries(parts)) g.name = name;
  const root = new THREE.Group();
  root.add(parts.body);
  void body;
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return { root, parts, meshes, materials: meshes.map(m => m.material as THREE.Material), seen: false };
}

/** an even ease in and out between 0 and 1 */
const ease = (t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};
/** a wavering number between about -1 and 1 that never settles into a beat */
const waver = (t: number, seed: number) => (Math.sin(t * 1.37 + seed) + Math.sin(t * 0.61 + seed * 2.3) * 0.7 + Math.sin(t * 2.93 + seed * 0.7) * 0.4) / 2.1;

export function createWitchFigures(scene: THREE.Scene): WitchFigures {
  const figures = new Map<number, Figure>();
  const spare: Figure[] = [];
  const flash = new THREE.MeshBasicMaterial({ color: 0xffffff });

  function pose(f: Figure, p: WitchPose): void {
    const P = f.parts;
    const t = p.time, seed = p.id * 0.731;
    const set = (name: string, x = 0, y = 0, z = 0) => P[name].rotation.set(x, y, z);
    // what every pose starts from: standing, the broom held slanting down before her
    let crouch = 0, lean = 0.08, twist = 0, headYaw = 0, headTilt = 0, bob = 0;
    let hipL = 0, hipR = 0, kneeL = 0, kneeR = 0;
    let armL = 0.15, armLz = 0.18, foreL = -0.3, armR = -0.25, armRz = -0.12, foreR = -0.35, broom = -0.75, broomZ = 0;
    let flare = 1, capeLift = 0.12;
    // walking: her stride, a little uneven, and a quick look about now and then
    const swing = p.moving ? Math.sin(p.stride) : 0;
    hipL = swing * 0.55;
    hipR = -swing * 0.55;
    kneeL = p.moving ? Math.max(0, Math.sin(p.stride + 1.2)) * 0.7 : 0;
    kneeR = p.moving ? Math.max(0, Math.sin(p.stride + Math.PI + 1.2)) * 0.7 : 0;
    armL += -swing * 0.35;
    bob = p.moving ? Math.abs(Math.sin(p.stride)) * 0.05 : 0;
    capeLift += p.moving ? 0.25 : 0.05 * Math.sin(t * 1.3 + seed);
    // (she looks round in jerks, as a bird does, not smoothly)
    headYaw = Math.round(waver(t * 0.8, seed) * 3) * 0.28;
    switch (p.act) {
      case 'scan': {
        // down on her haunches, leaning in, the head going from side to side in quick jerks; the broom across her
        const k = ease(p.t * 5);
        crouch = 0.38 * k;
        lean = 0.08 + 0.42 * k;
        headYaw = p.t < 0.8 ? Math.sign(Math.sin(p.t * 19 + seed)) * 0.9 * (1 - p.t * 0.6) : 0;
        headTilt = -0.25 * k;
        armL = -0.6 * k;
        foreL = -0.5;
        armR = -0.5 * k;
        broom = -1.1;
        broomZ = 0.9 * k;
        hipL = hipR = 0;
        kneeL = kneeR = 0;
        break;
      }
      case 'charge': {
        // crouched, the broom raised high behind her head; then off she runs, bent forward, the broom over her
        armR = -2.7;
        foreR = -0.4;
        broom = 0.6;
        armL = -0.9;
        foreL = -0.6;
        if (p.ready) {
          crouch = 0.3;
          lean = 0.35;
        } else {
          const run = Math.sin(t * 22 + seed);
          lean = 0.55;
          hipL = run * 0.9;
          hipR = -run * 0.9;
          kneeL = Math.max(0, Math.sin(t * 22 + seed + 1.2)) * 1.1;
          kneeR = Math.max(0, -Math.sin(t * 22 + seed + 1.2)) * 1.1;
          bob = Math.abs(run) * 0.1;
          capeLift = 1.1;
          flare = 1.12;
        }
        break;
      }
      case 'hop': {
        // knees drawn up, the broom raised over her head, the skirt flying out and the cape up behind her
        const up = p.air;
        hipL = hipR = -1.1 * up;
        kneeL = kneeR = 1.7 * up;
        armR = -2.9 * up - 0.25 * (1 - up);
        foreR = -0.2;
        broom = 0.4 * up;
        armL = -2.2 * up;
        armLz = 0.5;
        lean = 0.15 + 0.25 * up;
        flare = 1 + 0.35 * up;
        capeLift = 0.4 + 1.3 * up;
        break;
      }
      case 'press': {
        // over the player she holds down: bent far forward, both hands pressing down, pushing again and again
        const push = Math.max(0, Math.sin(t * 9 + seed));
        crouch = 0.42 + 0.06 * push;
        lean = 0.85 + 0.08 * push;
        armL = armR = -1.3 - 0.25 * push;
        armLz = 0.05;
        armRz = -0.05;
        foreL = foreR = -0.2;
        broom = -0.2;
        broomZ = 1.2;
        headTilt = 0.35;
        hipL = hipR = 0.15;
        kneeL = kneeR = 0.6;
        capeLift = 0.3;
        break;
      }
      case 'sweep': {
        // the burning broom drawn back to one side, then swept round across her front, low, its twigs ahead
        const strike = p.t > 0.72 ? ease((p.t - 0.72) / 0.18) : 0;
        twist = 0.9 - 1.9 * strike;
        crouch = 0.15;
        lean = 0.3;
        armR = -1.4;
        armRz = -1.1 + 0.6 * strike;
        foreR = -0.3;
        broom = 0.45;
        broomZ = 0;
        armL = -0.4;
        capeLift = 0.3 + 0.8 * strike;
        break;
      }
      case 'throw': {
        // an arm thrown over: back, then forward
        const k = p.t < 0.45 ? -ease(p.t / 0.45) : -1 + 2.2 * ease((p.t - 0.45) / 0.3);
        armR = -1.6 + k * 1.1;
        foreR = -0.6;
        broom = -0.8;
        twist = -0.35 * k;
        lean = 0.2 - 0.1 * k;
        break;
      }
      case 'reel': {
        // thrown off and dazed: she sways, her head lolls, the broom hangs down
        const sway = Math.sin(t * 7 + seed);
        twist = sway * 0.3;
        headTilt = 0.3 + 0.2 * Math.sin(t * 5);
        headYaw = sway * 0.5;
        armL = armR = 0.2;
        armLz = 0.5 + 0.2 * sway;
        armRz = -0.5 + 0.2 * sway;
        broom = -1.2;
        crouch = 0.12;
        lean = -0.1;
        break;
      }
      case 'dance': {
        // round the fire: hops that come at no steady beat, knees high in turn, arms and broom up, a spin now and then
        const beat = t * 4.1 + Math.sin(t * 1.7 + seed) * 1.6 + Math.sin(t * 0.53 + seed * 2) * 2.4;
        const hop = Math.abs(Math.sin(beat));
        bob = hop * 0.28;
        hipL = Math.sin(beat) > 0 ? -1.0 * hop : 0.1;
        hipR = Math.sin(beat) <= 0 ? -1.0 * hop : 0.1;
        kneeL = Math.sin(beat) > 0 ? 1.5 * hop : 0.2;
        kneeR = Math.sin(beat) <= 0 ? 1.5 * hop : 0.2;
        armR = -2.6 + 0.3 * Math.sin(beat * 0.5);
        foreR = -0.25;
        broom = 0.3;
        broomZ = 0.4 * Math.sin(beat * 0.5);
        armL = -2.4 + 0.4 * Math.cos(beat * 0.5);
        armLz = 0.45;
        twist = Math.sin(t * 2.3 + seed) * 0.6;
        lean = 0.1 + 0.15 * hop;
        flare = 1.1 + 0.15 * Math.abs(Math.sin(t * 2.3 + seed));
        capeLift = 0.5 + 0.4 * hop;
        headYaw = Math.sin(beat * 0.7) * 0.5;
        break;
      }
      case 'walk':
        break;
    }
    const hipY = 0.95 - crouch * 0.95;
    P.body.position.y = hipY + bob;
    set('body', 0, twist, 0);
    set('torso', lean, 0, 0);
    // (bent knees in a crouch: the thighs come forward, the shins back, so the feet stay on the floor)
    const bend = Math.acos(Math.max(-1, Math.min(1, 1 - crouch * 2.2)));
    set('legL', -bend * 0.75 - hipL - lean * 0.3, 0, 0.04);
    set('legR', -bend * 0.75 - hipR - lean * 0.3, 0, -0.04);
    set('shinL', bend * 1.5 + kneeL, 0, 0);
    set('shinR', bend * 1.5 + kneeR, 0, 0);
    P.skirt.scale.set(flare, 1, flare);
    set('skirt', -lean * 0.4, 0, 0);
    // (the cape hangs from her shoulders: it does not lean with her, and flies out behind when she moves)
    set('cape', Math.max(0.04, capeLift * 0.6 - lean * 0.7), 0, Math.sin(t * 2.1 + seed) * 0.05);
    // the mask: the glaring face comes round to the front as she turns her head (with a little overshoot)
    const turn = p.face <= 0 || p.face >= 1 ? p.face : p.face + Math.sin(p.face * Math.PI) * 0.12;
    set('head', headTilt - lean * 0.5, headYaw + turn * Math.PI, 0);
    for (const [name, s] of [['braidL', 1], ['braidR', -1]] as const) set(name, Math.max(-0.2, capeLift * 0.3 - lean * 0.6) + Math.sin(t * 3 + seed + s) * 0.08, 0, s * (0.08 + bob * 0.8));
    set('armL', armL - lean * 0.5, 0, armLz);
    set('armR', armR - lean * 0.5, 0, armRz);
    set('foreL', foreL, 0, 0);
    set('foreR', foreR, 0, 0);
    set('broom', broom, 0, broomZ);
    P.twigs.visible = !p.burning;
    P.hot.visible = p.burning;
    // on the flames the hot twigs flicker
    if (p.burning) P.hot.scale.setScalar(1 + 0.08 * Math.sin(t * 31 + seed));
  }

  return {
    begin() {
      for (const f of figures.values()) f.seen = false;
    },
    add(p) {
      let f = figures.get(p.id);
      if (!f) {
        f = spare.pop() ?? build();
        figures.set(p.id, f);
        scene.add(f.root);
      }
      f.seen = true;
      f.root.position.set(p.x, p.y, p.z);
      f.root.rotation.set(0, p.yaw, 0);
      f.root.scale.setScalar(p.scale);
      pose(f, p);
      const white = p.tint === FLASH;
      f.meshes.forEach((m, i) => (m.material = white ? flash : f!.materials[i]));
    },
    end() {
      for (const [id, f] of figures) {
        if (f.seen) continue;
        scene.remove(f.root);
        figures.delete(id);
        // (kept for the next one; beyond a few, its geometries go: the materials are shared by every figure)
        if (spare.length < 8) spare.push(f);
        else for (const m of f.meshes) m.geometry.dispose();
      }
    },
  };
}
