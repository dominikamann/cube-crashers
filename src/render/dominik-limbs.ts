import * as THREE from 'three';
import { BOSS } from '../sim/systems/boss';
import { TICK_RATE } from '../sim/types';
import { BODY } from './dominik-body';
import { HEAD_BACK, HEAD_FRONT, HEAD_LEFT, type Portrait } from './dominik-face';
import { InstancedPool } from './pool';
import { sculpt, type VoxelColor } from './voxel-mesh';

/**
 * How Angry Dominik stands, in his own frame (before `scale`). His body (chin to knees, with the shoulders) is a
 * box `width` x `height` x `depth`; the head sits on top of it (`head`: its size and where its middle is, measured
 * from the body's), its chin a little above the collar; the lower legs hang under it (`lift`). His eyes, where the lasers start: `eyeY` above the foot
 * of the body box, `eyeX` to each side, `front` ahead of his middle. All in all he stands 3.9 high, seven and a
 * half heads. His left is at +x: he looks along +z.
 */
export const DOMINIK = {
  scale: 1.15,
  small: 0.42,
  lift: 1.02,
  width: 1.3947,
  height: 2.3245,
  depth: 0.634,
  head: { w: 0.4, h: 0.6, d: 0.5375, y: 1.408, z: 0.04 },
  eyeY: 2.576,
  eyeX: 0.081,
  front: 0.246,
};
/**
 * His neck, short and thick: a column `w` wide and `d` deep from `foot` (inside the shirt) up to `top` (inside the
 * head, at the ear lobes), both above the foot of the body box. Its middle is at `z` at its foot and comes forward
 * by `lean` for every unit it rises: he carries his head ahead of his shoulders. The collar of the shirt lies round
 * it at `collar` (at his middle), higher behind than in front (`slope`).
 */
export const DOMINIK_NECK = { w: 0.29, d: 0.34, foot: 2.19, top: 2.47, z: -0.045, lean: 0.25, collar: 2.272, slope: 0.3 };
/** the size of a voxel of his body: his limbs are made of the same */
const CELL = DOMINIK.width / BODY.cols;

type Rgb = [number, number, number];
const rgb = (hex: number): Rgb => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const lit = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const SKIN = rgb(parseInt(BODY.skin, 16)), CLOTH = rgb(0x1b1c21), HEM = rgb(0x26272d);
const ease = (lo: number, hi: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
/** inside an oval (a little boxier than an ellipse) with half-axes rx and rz? */
const oval = (x: number, z: number, rx: number, rz: number) => rx > 0 && rz > 0 && Math.abs(x / rx) ** 2.4 + Math.abs(z / rz) ** 2.4 <= 1;
/** skin, a shade darker where it turns away to the back */
const skin = (z: number, rz: number) => lit(SKIN, 0.97 + 0.07 * Math.max(-1, Math.min(1, z / rz)));

/** where his joints are, from the middle of the body box: shoulders, knees; and how long the pieces of an arm are */
const SHOULDER = { x: 0.55, y: 2.095 - DOMINIK.height / 2, z: -0.02 };
const KNEE = { x: BODY.leg[0] * CELL, y: -DOMINIK.height / 2, z: -0.01 };
const UPPER_ARM = 0.62, FOREARM = 0.5, FIST = 0.605;

/** the colour of a portrait `up` rows above its foot, `t` (0 to 1) along what is head in that row */
function fromPortrait(p: Portrait, up: number, t: number): Rgb {
  const row = p.rows[p.h - 1 - up];
  const filled: number[] = [];
  for (let c = 0; c < p.w; c++) if (row.slice(c * 6, c * 6 + 6) !== '......') filled.push(c);
  if (filled.length === 0) return SKIN;
  const c = filled[Math.max(0, Math.min(filled.length - 1, Math.floor(t * filled.length)))];
  return rgb(parseInt(row.slice(c * 6, c * 6 + 6), 16));
}

/**
 * The neck, in the body's frame: one solid column of skin. Its skin is that of the lowest rows of his portraits:
 * the chin with its stubble in front, the cheeks at the sides, the nape behind, each voxel a little different; in
 * the shadow of the jaw it is darker than the face everywhere. Below the collar line it is shirt, and at that line
 * the collar lies round it: a low ring, a little wider than the neck, as black as the shirt.
 */
function neck(): THREE.BufferGeometry {
  const N = DOMINIK_NECK, half = DOMINIK.height / 2, rx = N.w / 2, rz = N.d / 2, RIM = 0.024;
  return sculpt([-rx - RIM, N.foot - half, N.z - rz - RIM], [rx + RIM, N.top - half, N.z + N.lean * (N.top - N.foot) + rz + RIM], CELL, (x, y, z): VoxelColor => {
    const up = y + half, cz = N.z + N.lean * (up - N.foot), collar = N.collar - N.slope * (z - cz);
    if (up > collar - 0.045 && up < collar + 0.008 && oval(x, z - cz, rx + RIM, rz + RIM)) return CLOTH;
    if (!oval(x, z - cz, rx, rz)) return null;
    if (up < collar) return CLOTH;
    // (which of the portraits' lowest rows, and where along it: a different pixel for every voxel)
    const pick = Math.abs(Math.round(x / CELL) * 7 + Math.round(up / CELL) * 3 + Math.round(z / CELL) * 5), across = (x / rx + 1) / 2, along = (z - cz) / rz;
    const tone = Math.abs(x) > rx * 0.72 ? fromPortrait(HEAD_LEFT, pick % 3, 0.3 + 0.3 * ((pick * 13) % 10) / 10) : along > 0 ? fromPortrait(HEAD_FRONT, pick % 2, 0.2 + 0.6 * across) : fromPortrait(HEAD_BACK, pick % 3, 0.2 + 0.6 * across);
    return lit(tone, 0.86 - 0.14 * ease(collar + 0.02, N.top - 0.08, up));
  }, 0.06, 0.9);
}

/**
 * An upper arm, hanging from the shoulder joint (its origin): a round shoulder cap and the short sleeve of the
 * shirt over it, the bare arm coming out of the sleeve down to the elbow. The same for both sides.
 */
function upperArm(): THREE.BufferGeometry {
  const SLEEVE = -0.36;
  return sculpt([-0.15, -UPPER_ARM - 0.09, -0.17], [0.15, 0.1, 0.17], CELL, (x, y, z): VoxelColor => {
    if (y > SLEEVE) {
      // round on top, a little narrower toward its hem
      const cap = y > -0.03 ? Math.sqrt(Math.max(0, 1 - ((y + 0.03) / 0.115) ** 2)) : 1 - 0.07 * ((y + 0.03) / (SLEEVE + 0.03));
      if (oval(x, z, 0.126 * cap, 0.15 * cap)) return y < SLEEVE + 0.022 ? HEM : lit(CLOTH, 1 + 0.16 * Math.sin(y * 31 + z * 14) * Math.sin(x * 23 + 1));
    }
    if (y > SLEEVE + 0.02) return null;
    // the bare arm: thinner toward the elbow, which is round
    const k = (SLEEVE - y) / (SLEEVE + UPPER_ARM);
    const end = y < -UPPER_ARM ? Math.sqrt(Math.max(0, 1 - ((-UPPER_ARM - y) / 0.085) ** 2)) : 1;
    const rx = (0.098 - 0.012 * k) * end, rz = (0.112 - 0.016 * k) * end;
    return oval(x, z, rx, rz) ? skin(z, rz) : null;
  }, 0.05, 0.85);
}

/**
 * A forearm with its hand, hanging from the elbow (its origin): thick below the elbow, thin at the wrist. `side`:
 * 1 for his left arm, -1 for his right (the palm faces his leg). The hand hangs with its fingers a little curled
 * (`hanging`), is open with the fingers straight (`open`: the hammer has just left it), or is closed round the
 * hammer's handle, which runs through it front to back (`grip`): four fingers side by side and the thumb laid
 * across them. `watch`: the black watch he wears, its face on the outside of the wrist.
 */
function forearm(hand: 'hanging' | 'open' | 'grip', side: number, watch = false): THREE.BufferGeometry {
  const FINGER = 3 * CELL, REACH = [0.078, 0.092, 0.1, 0.088];
  return sculpt([-0.125, -0.72, -0.11], [0.125, 0.09, 0.125], CELL, (x, y, z): VoxelColor => {
    if (y > -FOREARM - 0.03) {
      const k = Math.max(0, -y / FOREARM);
      const top = y > 0 ? Math.sqrt(Math.max(0, 1 - (y / 0.085) ** 2)) : 1;
      // (as thick as the upper arm where the two meet, a little thicker below the elbow, thin at the wrist)
      const rx = (0.086 - 0.03 * k + 0.007 * Math.sin(Math.PI * Math.min(1, k * 1.6))) * top, rz = (0.096 - 0.03 * k + 0.009 * Math.sin(Math.PI * Math.min(1, k * 1.6))) * top;
      if (watch && y < -0.4 && y > -0.48) {
        // the strap round the wrist, and the case with its dark glass on the outside
        const out = x * side;
        const glass = out > rx && Math.abs(z) < 0.03 && y < -0.412 && y > -0.468;
        if (out > rx * 0.5 && out < rx + 0.024 && Math.abs(z) < 0.042) return glass && out > rx + 0.012 ? rgb(Math.abs(z) < 0.011 && y > -0.43 ? 0x7dfcff : 0x24384d) : rgb(0x101114);
        if (y < -0.418 && y > -0.462 && oval(x, z, rx + 0.012, rz + 0.012)) return rgb(0x15161a);
      }
      if (oval(x, z, rx, rz)) return skin(z, rz);
    }
    // which finger this is (0 behind, 3 in front), and whether it is the gap between two
    const slot = (z + 2 * FINGER) / FINGER, finger = Math.floor(slot), gap = slot - finger > 0.68 && finger < 3;
    if (hand === 'grip') {
      const r = Math.hypot(x, y + FIST);
      // the thumb, across the fingers on the side of his leg
      if (Math.hypot(x + side * 0.062, y + FIST - 0.05) < 0.02 && z > -0.035 && z < 0.085) return lit(SKIN, 1.03);
      if (finger >= 0 && finger < 4 && r <= (gap ? 0.06 : 0.076)) return lit(SKIN, gap ? 0.7 : 0.95 + 0.08 * ((y + FIST) / 0.076));
      // the back of the hand, up to the wrist
      return y > -FIST && y < -FOREARM && Math.abs(x) < 0.05 && Math.abs(z) < 0.058 ? skin(z, 0.06) : null;
    }
    const down = -FOREARM - y, curl = hand === 'open' ? 0.12 : 1;
    // the palm
    if (down >= 0 && down < 0.105) {
      if (Math.abs(x) <= 0.029 && z > -2 * FINGER && z < 2 * FINGER - CELL) return skin(z, 0.07);
      // the thumb, in front of it and pointing a little forward
      const along = (down - 0.02) / 0.1;
      if (along > 0 && along < 1 && Math.abs(z - (2 * FINGER + 0.004 + (hand === 'open' ? 0.05 : 0.022) * along)) < 0.014 && Math.abs(x + side * 0.008) < 0.016) return lit(SKIN, 1.02);
      return null;
    }
    if (finger < 0 || finger > 3 || gap || slot - finger > 0.68) return null;
    const t = (down - 0.105) / REACH[finger];
    if (t > 1) return null;
    // (the fingers bend toward the palm's side as they go down)
    return Math.abs(x + side * 0.055 * curl * t * t) <= 0.0155 ? lit(SKIN, 0.98 + 0.05 * (finger % 2)) : null;
  }, 0.05, 0.85);
}

/**
 * A lower leg with its foot, hanging from the knee (its origin): a calf that swells to the back and thins to the
 * ankle, a short sock, and a dark sneaker with a white sole, laces and a toe cap. The same for both sides.
 */
function lowerLeg(): THREE.BufferGeometry {
  const ANKLE = -0.8, FLOOR = -DOMINIK.lift, SOLE = FLOOR + 0.055;
  /** half the width of the shoe at `z` (heel at -0.15, toe at 0.33), 0 outside it */
  const shoe = (z: number) => {
    if (z < -0.15 || z > 0.33) return 0;
    const heel = z < 0 ? Math.sqrt(1 - 0.7 * (z / 0.15) ** 2) : 1;
    const toe = z > 0.2 ? Math.sqrt(Math.max(0, 1 - ((z - 0.2) / 0.132) ** 2)) : 1;
    return 0.112 * heel * (0.4 + 0.6 * toe) * (1 - 0.1 * ease(0, 0.2, z));
  };
  /** how high the shoe is at `z`: up to the ankle at the heel, low over the toes */
  const upper = (z: number) => ANKLE + 0.01 - 0.1 * ease(0, 0.27, z) - 0.03 * ease(0.26, 0.33, z);
  return sculpt([-0.15, FLOOR, -0.19], [0.15, 0.07, 0.34], CELL, (x, y, z): VoxelColor => {
    if (y < SOLE) return Math.abs(x) <= shoe(z) ? rgb(y < FLOOR + 0.012 ? 0xc9c7bd : 0xf2f0e6) : null;
    const top = upper(z);
    if (y < top) {
      // the upper: a little narrower than the sole, rounder toward its top
      const w = (shoe(z) - 0.008) * (1 - 0.22 * ((y - SOLE) / (top - SOLE)) ** 3);
      if (Math.abs(x) <= w && z > -0.142 && z < 0.322) {
        const surface = y > top - 0.024;
        if (surface && z > 0.045 && z < 0.215 && Math.abs(x) < 0.04) return rgb(Math.floor(z / 0.021) % 2 ? 0xc3c7cf : 0x24262b);
        if (z > 0.25) return rgb(0x45484f);
        if (surface && z < 0.03) return rgb(0x212328);
        return rgb(y < SOLE + 0.022 ? 0x2a2c32 : 0x383b42);
      }
    }
    if (y < ANKLE + 0.015 && y > ANKLE - 0.02) return null;
    if (y <= ANKLE + 0.015) return null;
    // the leg: knee, calf, ankle
    const k = Math.max(0, -y / -ANKLE);
    const swell = Math.sin(Math.PI * Math.min(1, k / 0.62));
    const rx = 0.112 + 0.012 * swell - 0.056 * ease(0.3, 1, k), rz = 0.122 + 0.022 * swell - 0.062 * ease(0.3, 1, k);
    const cz = -0.024 * Math.sin(Math.PI * Math.min(1, k / 0.75));
    // (a short sock shows above the shoe)
    if (y < ANKLE + 0.075) return oval(x, z - cz, rx + 0.01, rz + 0.01) ? rgb(0xe9e6dc) : null;
    return oval(x, z - cz, rx, rz) ? skin(z - cz, rz) : null;
  }, 0.05, 0.85);
}

/** runes of five by nine pixels: his name, as a smith of old would have cut it */
const RUNES = [
  ['.X...', '.XX..', '.X.X.', '.XX.X', '.X.X.', '.X..X', '.X...', '.X...', '.X...'],
  ['X...X', 'XX.XX', 'X.X.X', 'XX.XX', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X'],
  ['.X...', '.XX..', '.X.X.', '.XX.X', '.X.X.', '.X..X', '.X...', '.X...', '.X...'],
  ['..X..', '..X..', 'X.X..', '.XX..', '..X..', '..XX.', '..X.X', '..X..', '..X..'],
  ['..X..', '..X..', 'X.X..', '.XX..', '..X..', '..XX.', '..X.X', '..X..', '..X..'],
];
const HAMMER_CELL = 0.0125;
const STEEL = rgb(0x8a919e), STEEL_LIGHT = rgb(0xc9ced6), STEEL_DARK = rgb(0x555b67), LEATHER = rgb(0x5d3d22), LEATHER_DARK = rgb(0x38230f), RUNE = rgb(0x7dfcff);
/**
 * A voxel of his hammer, standing upright with the grip at the origin: a short thick handle wrapped in leather,
 * with a steel pommel and a strap under it; on top a heavy head of steel, longer (along z) than it is high, its
 * ends bevelled, with a sunk panel on each side that carries glowing runes, a bolt of lightning cut into its top
 * and a glowing square on each end. `glow` picks the glowing voxels, or all the others.
 */
function hammerVoxel(x: number, y: number, z: number, glow: boolean): VoxelColor {
  const HX = 0.2, HY = 0.24, HZ = 0.5, AT = 0.72, P = 0.025;
  const ax = Math.abs(x), ay = Math.abs(y - AT), az = Math.abs(z);
  const solid = (c: Rgb): VoxelColor => (glow ? null : c), light = (): VoxelColor => (glow ? RUNE : null);
  if (ax <= HX && ay <= HY && az <= HZ) {
    // the ends are bevelled, the long edges broken
    const end = az - (HZ - 0.085);
    if (end > 0 && (ax > HX - end || ay > HY - end)) return null;
    if (HX - ax + (HY - ay) < 0.035) return null;
    if (az > HZ - HAMMER_CELL) return Math.max(ax / (HX - 0.085), ay / (HY - 0.085)) > 0.42 && Math.max(ax / (HX - 0.085), ay / (HY - 0.085)) < 0.72 ? light() : solid(STEEL_LIGHT);
    if (az > HZ - 0.13) return solid(az < HZ - 0.085 ? STEEL_LIGHT : lit(STEEL, 1.08));
    // the panels on the sides, one voxel deep, and the runes in them
    if (ay < HY - 0.05 && ax > HX - 2 * HAMMER_CELL) {
      if (ax > HX - HAMMER_CELL) return null;
      const pz = Math.floor(((x > 0 ? -z : z) + 14.5 * P) / P), py = Math.floor((AT + 4.5 * P - y) / P);
      const on = pz >= 0 && pz < 29 && py >= 0 && py < 9 && pz % 6 < 5 && RUNES[Math.floor(pz / 6)][py][pz % 6] === 'X';
      return on ? light() : solid(STEEL_DARK);
    }
    // the bolt on top
    if (y - AT > HY - HAMMER_CELL && az < HZ - 0.15) {
      const t = (((z + 1) * 5) % 1) * 2;
      if (Math.abs(x - 0.07 * (t < 1 ? t - 0.5 : 1.5 - t)) < 0.014) return light();
    }
    return solid(lit(STEEL, 0.95 + 0.1 * Math.abs(Math.sin(y * 170 + z * 31))));
  }
  const r = Math.hypot(x, z);
  if (y >= 0.42 && y < AT && r <= 0.062) return solid(STEEL_LIGHT);
  if (y >= -0.13 && y < 0.42 && r <= 0.043) return solid((((y * 22 + Math.atan2(z, x) / (Math.PI * 2)) % 1) + 1) % 1 < 0.24 ? LEATHER_DARK : LEATHER);
  if (y >= -0.19 && y < -0.13 && r <= 0.064) return solid(STEEL_LIGHT);
  if (y >= -0.215 && y < -0.19 && r <= 0.045) return solid(STEEL);
  // the strap: a loop of leather under the pommel
  if (Math.abs(x) < 0.013 && Math.abs(Math.hypot(y + 0.3, z) - 0.082) < 0.014) return solid(LEATHER);
  return null;
}
let hammerShapes: { lit: THREE.BufferGeometry; glow: THREE.BufferGeometry } | null = null;
/** His hammer, upright with the grip at the origin (1.34 from the strap to the top): what is steel and leather, and what glows. */
export function hammerGeometry(): { lit: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const box: [[number, number, number], [number, number, number]] = [[-0.2, -0.4, -0.5], [0.2, 0.96, 0.5]];
  hammerShapes ??= {
    lit: sculpt(box[0], box[1], HAMMER_CELL, (x, y, z) => hammerVoxel(x, y, z, false), 0.07, 0.35),
    glow: sculpt(box[0], box[1], HAMMER_CELL, (x, y, z) => hammerVoxel(x, y, z, true), 0),
  };
  return hammerShapes;
}
/**
 * On his knees for the slam: how far the body comes down, how far it leans forward, and how far the lower legs
 * fold back (so that the shins lie on the floor behind him)
 */
export const KNEEL = { drop: 0.9, lean: 0.2, shins: 1.37 };
/**
 * his hammer in the air: from when it leaves his hand to when he has it back, in seconds after the throw is
 * called. It follows the blows the rules deal along its line (see boss.ts and `hammerAlong`)
 */
export const HAMMER_FLIGHT: [number, number] = [BOSS.warnTicks / TICK_RATE, (BOSS.warnTicks + 16 + 8 * BOSS.hammerLine) / TICK_RATE];
/**
 * How far from him his thrown hammer is, `seconds` after the throw was called (null: in his hand). The rules
 * strike the spots along its line one after the other, out and back (the i-th, 1 + i * BOSS.waveStep tiles from
 * him, after the warning and 4 ticks per spot; on the way back 16 ticks later): the hammer is over each spot as
 * it is struck.
 */
export function hammerAlong(seconds: number): number | null {
  const ticks = seconds * TICK_RATE - BOSS.warnTicks, n = BOSS.hammerLine;
  if (ticks < 0) return null;
  const spot = ticks <= 4 * n ? ticks / 4 : ticks <= 4 * n + 16 ? n : 2 * n - (ticks - 16) / 4;
  return spot < 0 ? null : 1 + spot * BOSS.waveStep;
}
/** how long he stands in the lightning when he has fallen, before he bursts (seconds) */
export const DOMINIK_DEATH = 1.5;
/** the material of whatever glows on him: unlit, in the voxels' own colours */
export const dominikGlow = () => new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });

export interface DominikPose {
  id: number;
  /** the middle of his body box, and how it is turned and scaled (as his body is drawn) */
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  lean: number;
  tilt: number;
  tint: number | undefined;
  /** the walk cycle (radians) and whether he stands still */
  phase: number;
  still: boolean;
  /** 0 = at rest, 1 = winding up an attack, 2 = in the attack */
  attack: number;
  /** his eyes aim or burn: the hammer stays down */
  laser: boolean;
  /** the hammer is in the air: his hand is empty and open, the arm thrown forward */
  thrown: boolean;
  /** the hammer is coming down on the floor, or lies on it after the blow */
  slam: boolean;
  /** how far he has dropped to his knees for that blow (0 to 1): the lower legs fold back under him */
  kneel: number;
}

let shapes: Record<'upper' | 'left' | 'grip' | 'open' | 'leg' | 'neck', THREE.BufferGeometry> | null = null;

export interface DominikLimbs {
  begin(): void;
  add(p: DominikPose, dt: number): void;
  end(): void;
}

/**
 * Angry Dominik's neck, arms, lower legs and hammer. The arms hang from the shoulders and bend at the elbow, the lower
 * legs swing from the knees. His right hand holds the hammer: arm and hammer rise together when he winds up, and
 * come down together with the blow.
 */
export function createDominikLimbs(scene: THREE.Scene, material: THREE.Material): DominikLimbs {
  // (made once and kept: a new game draws him with the same pieces)
  shapes ??= { upper: upperArm(), left: forearm('hanging', 1, true), grip: forearm('grip', -1), open: forearm('open', -1), leg: lowerLeg(), neck: neck() };
  const upper = new InstancedPool(scene, shapes.upper, material, 8);
  const lower = new InstancedPool(scene, shapes.grip, material, 4);
  const lowerOpen = new InstancedPool(scene, shapes.open, material, 4);
  const lowerWatch = new InstancedPool(scene, shapes.left, material, 4);
  const legs = new InstancedPool(scene, shapes.leg, material, 8);
  const necks = new InstancedPool(scene, shapes.neck, material, 4);
  const hammer = hammerGeometry();
  const hammers = new InstancedPool(scene, hammer.lit, material, 4);
  const runes = new InstancedPool(scene, hammer.glow, dominikGlow(), 4, false);
  const pools = [upper, lower, lowerOpen, lowerWatch, legs, necks, hammers, runes];
  /** where each one's right arm is on its way to its pose: shoulder, elbow, and the turn of the wrist */
  const arms = new Map<number, { a: number; b: number; w: number; seen: boolean }>();
  const turn = new THREE.Euler(), v = new THREE.Vector3();
  /** where the far end of a piece `length` long is, that hangs from (x, y, z), swung by `swing` and spread by `spread` */
  const end = (x: number, y: number, z: number, length: number, swing: number, spread: number): [number, number, number] => [
    x + length * Math.sin(spread),
    y - length * Math.cos(spread) * Math.cos(swing),
    z - length * Math.cos(spread) * Math.sin(swing),
  ];
  return {
    begin() {
      for (const p of pools) p.begin();
      for (const a of arms.values()) a.seen = false;
    },
    add(p, dt) {
      turn.set(p.lean, p.yaw, p.tilt, 'YXZ');
      /**
       * draws a piece whose origin is at `at` in his body: swung by `swing` round his left-right axis (forward is
       * negative), after being spread by `spread` away from hanging straight down (to his left is positive)
       */
      const put = (pool: InstancedPool, at: [number, number, number], swing: number, spread = 0) => {
        v.set(at[0] * p.sx, at[1] * p.sy, at[2] * p.sz).applyEuler(turn);
        pool.addScaled(p.x + v.x, p.y + v.y, p.z + v.z, p.yaw, p.sx, p.sy, p.sz, p.tint, p.lean + swing, p.tilt + spread);
      };
      put(necks, [0, 0, 0], 0);
      const step = p.still ? 0 : Math.sin(p.phase);
      // the legs swing from the knees as he walks, and fold back under him when he drops to his knees
      for (const side of [-1, 1]) put(legs, [side * KNEE.x, KNEE.y, KNEE.z], p.kneel * KNEEL.shins + (p.still ? 0 : -0.42 * side * step + 0.12));
      // the right arm: at rest it is held a little away from him, the forearm pointing ahead and the hammer
      // standing upright in the fist. Winding up it goes up and back over the shoulder; with the blow it comes
      // down in front of him, the hammer ahead of it. For the slam he drops to his knees and drives it into the
      // floor: the arm straight down, the hammer's head ahead of the fist, one end of it on the ground
      const want =
        p.slam ? { a: -KNEEL.lean, b: 0, w: 0.96 }
        : p.thrown ? { a: -1.25, b: -0.25, w: 0 }
        : p.laser ? { a: 0.15, b: -0.7, w: -0.5 }
        : p.attack === 1 ? { a: -2.45, b: -0.85, w: 0.15 }
        : p.attack === 2 ? { a: -0.6, b: -0.3, w: 0.85 }
        : { a: 0.12 + 0.05 * step, b: -1.42, w: -0.12 };
      let arm = arms.get(p.id);
      if (!arm) arms.set(p.id, (arm = { ...want, seen: true }));
      arm.seen = true;
      // (up slowly, down fast)
      const k = 1 - Math.exp(-dt * (p.slam ? 26 : p.attack === 2 || p.thrown ? 22 : p.attack === 1 ? 7 : 6));
      arm.a += (want.a - arm.a) * k;
      arm.b += (want.b - arm.b) * k;
      arm.w += (want.w - arm.w) * k;
      const out = -0.2, bend = arm.a + arm.b;
      const shoulder: [number, number, number] = [-SHOULDER.x, SHOULDER.y, SHOULDER.z];
      const elbow = end(...shoulder, UPPER_ARM, arm.a, out);
      put(upper, shoulder, arm.a, out);
      put(p.thrown ? lowerOpen : lower, elbow, bend, out);
      if (!p.thrown) {
        const fist = end(...elbow, FIST, bend, out);
        put(hammers, fist, bend + Math.PI / 2 + arm.w);
        put(runes, fist, bend + Math.PI / 2 + arm.w);
      }
      // the left arm swings with his steps, a little bent; it goes back for balance when the hammer goes up
      const la = p.attack === 1 && !p.laser ? 0.5 : p.attack === 2 && !p.laser ? -0.35 : 0.04 + 0.34 * step;
      const lb = -0.14 - (p.still ? 0 : 0.18 * (1 + step));
      const left: [number, number, number] = [SHOULDER.x, SHOULDER.y, SHOULDER.z];
      put(upper, left, la, 0.07);
      put(lowerWatch, end(...left, UPPER_ARM, la, 0.07), la + lb, 0.07);
    },
    end() {
      for (const p of pools) p.end();
      for (const [id, a] of arms) if (!a.seen) arms.delete(id);
    },
  };
}
