import * as THREE from 'three';
import type { Part, Sculpt } from './figure';
import { DOMINIK, dominikPieces } from './dominik-limbs';
import { MONSTER_LIFT, MONSTER_PARTS } from './monster-parts';
import { voxelBody, type BodyKind } from './voxel-body';

/**
 * Two characters are monsters at player size: the Baby Dino (the T-Rex) and Dominik (the last boss). They are
 * not modelled again: their figures are put together from the monsters' own voxel bodies and parts, so they
 * change when the monsters do. A monster looks along +z, a figure along -z: everything is turned round.
 */
type MonsterPart = NonNullable<(typeof MONSTER_PARTS)[keyof typeof MONSTER_PARTS]>[number];
type Vec3 = [number, number, number];

function shade(base: number, how: MonsterPart['color']): number {
  if (typeof how === 'number') return how;
  if (how === 'body') return base;
  const mix = how === 'dark' ? (c: number) => Math.round(c * 0.62) : (c: number) => Math.round(c + (255 - c) * 0.4);
  return (mix((base >> 16) & 255) << 16) | (mix((base >> 8) & 255) << 8) | mix(base & 255);
}

interface Frame {
  /** monster units to figure units */
  scale: number;
  /** how high the middle of the body box is over the floor, in monster units */
  mid: number;
}
/** a point of the monster in the figure's space */
const place = (f: Frame, x: number, y: number, z: number): Vec3 => [-x * f.scale, (y + f.mid) * f.scale, -z * f.scale];

/**
 * A voxel body turned and scaled into the figure's space, tinted with `color` (white: as it is), with `pivot`
 * (a point of the figure) moved to the origin. Built once per body, colour and pivot and shared by every
 * figure that needs it: a voxel body has many thousand cubes.
 */
const bodies = new Map<string, THREE.BufferGeometry>();
function body(kind: BodyKind, w: number, h: number, d: number, f: Frame, color: number, offset: Vec3 = [0, 0, 0], pivot: Vec3 = [0, 0, 0], paint?: (g: THREE.BufferGeometry) => void, variant = ''): THREE.BufferGeometry {
  const key = `${kind}:${color}:${variant}`;
  let g = bodies.get(key);
  if (g) return g;
  // (a copy: some voxel bodies are kept and shared with the monsters that wear them)
  g = voxelBody(kind, w, h, d).geometry.clone();
  paint?.(g);
  g.translate(offset[0], offset[1] + f.mid, offset[2]).rotateY(Math.PI).scale(f.scale, f.scale, f.scale).translate(-pivot[0], -pivot[1], -pivot[2]);
  const tint = new THREE.Color(color);
  const col = g.getAttribute('color');
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * tint.r, col.getY(i) * tint.g, col.getZ(i) * tint.b);
  g.userData.shared = true;
  bodies.set(key, g);
  return g;
}

/**
 * Sorts a monster's parts onto the figure's moving parts: its legs (by side), the arm that swings and the one
 * that holds the weapon, a tail of up to three pieces, a jaw, and the rest on the body.
 */
function parts(s: Sculpt, list: MonsterPart[], f: Frame, base: number): void {
  const made = new Map<string, Part>();
  const part = (name: string, pivot: Vec3, parent = 'body') => made.get(name) ?? made.set(name, name === 'body' ? s.get('body')! : s.part(name, pivot, parent)).get(name)!;
  let tail = 0;
  for (const m of list) {
    const [x, y, z] = m.at, [w, h, d] = m.size;
    let target: Part, at = place(f, x, y, z);
    if (m.anim === 'leg') target = part(x > 0 ? 'legL' : 'legR', place(f, x, y + h / 2, z));
    else if (m.anim === 'arm') {
      // a monster's arm hangs from `at`, its shoulder
      target = part(x > 0 ? 'armL' : 'armR', at);
      at = place(f, x, y - h / 2, z);
    } else if (m.anim === 'wag') {
      const name = tail === 0 ? 'tail' : `tail${tail + 1}`;
      target = part(name, place(f, x, y, z + d / 2), tail === 0 ? 'body' : tail === 1 ? 'tail' : `tail${tail}`);
      tail++;
    } else if (m.anim === 'jaw') target = part('jaw', place(f, ...(m.pivot ?? m.at)));
    else target = part('body', [0, 0, 0]);
    const sc = f.scale;
    if (m.glow) target.glow(shade(base, m.color), 1.4, w * sc, h * sc, d * sc, at[0], at[1], at[2]);
    else target.box(shade(base, m.color), w * sc, h * sc, d * sc, at[0], at[1], at[2]);
  }
}

const TREX = { w: 1.1, h: 2.0, d: 2.2, eyeY: 1.8, eyeX: 0.26, eye: 0.16 };
/** as small as the baby dinos that run about in the game */
const DINO_SCALE = 0.55;

/** The Baby Dino: the T-Rex in the player's colour, with a cap worn back to front and a neckerchief. */
export function dinoFigure(s: Sculpt, c: number, l: number): void {
  const f: Frame = { scale: DINO_SCALE, mid: TREX.h / 2 + (MONSTER_LIFT.trex ?? 0) };
  const shape = voxelBody('trex', TREX.w, TREX.h, TREX.d);
  const front = shape.frontAt(TREX.eyeX, TREX.eyeY - TREX.h / 2);
  shape.geometry.dispose();
  const b = s.part('body');
  b.solid(body('trex', TREX.w, TREX.h, TREX.d, f, c));
  parts(s, MONSTER_PARTS.trex ?? [], f, c);
  // friendly eyes, and what no monster wears: the cap and the neckerchief
  const eyeY = TREX.eyeY - TREX.h / 2;
  for (const side of [-1, 1]) {
    b.box(0xffffff, 0.09, 0.1, 0.02, ...place(f, side * TREX.eyeX, eyeY, front + 0.01));
    b.box(0x14141c, 0.05, 0.06, 0.02, ...place(f, side * TREX.eyeX, eyeY - 0.01, front + 0.03));
  }
  const top = place(f, 0, TREX.h / 2, 0.7);
  b.box(l, 0.5, 0.08, 0.44, top[0], top[1] + 0.03, top[2]).box(0xe8ecf4, 0.5, 0.03, 0.2, top[0], top[1] + 0.005, top[2] + 0.3).box(0xe8ecf4, 0.1, 0.03, 0.1, top[0], top[1] + 0.085, top[2]);
  const neck = place(f, 0, 0.3, 0.45);
  b.box(0xe8ecf4, 0.54, 0.09, 0.44, neck[0], neck[1], neck[2]).box(0xe8ecf4, 0.2, 0.2, 0.05, neck[0], neck[1] - 0.1, neck[2] - 0.24);
}

/** where his shorts begin (in the body's own frame, from its middle), and how bright their navy is (r + g + b) */
const SHORTS_TOP = -0.16, NAVY_SUM = 0.62;

/**
 * Dominik at player size: the boss's body, head, neck and limbs as the game draws them, without his hammer (he
 * holds the player's weapon in his open right hand). His shorts and his wristbands are in the player's colour:
 * that is how one tells the players and the teams apart.
 */
export function dominikFigure(s: Sculpt, c: number): void {
  const f: Frame = { scale: DOMINIK.small, mid: DOMINIK.height / 2 + DOMINIK.lift };
  const pieces = dominikPieces(), j = pieces.joints;
  /** a piece of his that hangs from a joint, turned and scaled into the figure's space (the joint stays its origin) */
  const hung = (key: string, g: THREE.BufferGeometry, down = 0) => {
    let made = bodies.get(key);
    if (!made) {
      made = g.clone().translate(0, -down, 0).rotateY(Math.PI).scale(f.scale, f.scale, f.scale);
      made.userData.shared = true;
      bodies.set(key, made);
    }
    return made;
  };
  const b = s.part('body');
  // the shorts: whatever is navy below the hem of the shirt takes the player's colour, keeping its shading
  const dye = (g: THREE.BufferGeometry) => {
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    const to = new THREE.Color(c);
    for (let i = 0; i < col.count; i++) {
      const r = col.getX(i), gr = col.getY(i), bl = col.getZ(i);
      if (pos.getY(i) > SHORTS_TOP || bl < r * 1.5 || bl < gr * 1.2) continue;
      const shade = Math.min(1.6, (r + gr + bl) / NAVY_SUM);
      col.setXYZ(i, to.r * shade, to.g * shade, to.b * shade);
    }
  };
  b.solid(body('dominik', DOMINIK.width, DOMINIK.height, DOMINIK.depth, f, 0xffffff, [0, 0, 0], [0, 0, 0], dye, `shorts${c}`));
  // (the neck is given in the body's frame, like the body itself)
  let neckG = bodies.get('dominikNeck');
  if (!neckG) {
    neckG = pieces.neck.clone().translate(0, f.mid, 0).rotateY(Math.PI).scale(f.scale, f.scale, f.scale);
    neckG.userData.shared = true;
    bodies.set('dominikNeck', neckG);
  }
  b.solid(neckG);
  const nape = place(f, 0, DOMINIK.height / 2, DOMINIK.head.z);
  const head = s.part('head', nape, 'body');
  head.solid(body('dominikHead', DOMINIK.head.w, DOMINIK.head.h, DOMINIK.head.d, f, 0xffffff, [0, DOMINIK.head.y, DOMINIK.head.z], nape));
  // his left is at the monster's +x, which is the figure's -x: that arm swings (legL and armL are on that side);
  // the right one holds the weapon
  for (const left of [true, false]) {
    const side = left ? 1 : -1;
    const shoulder = place(f, side * j.shoulder.x, j.shoulder.y, j.shoulder.z);
    const arm = s.part(left ? 'armL' : 'armR', shoulder, 'body');
    arm.solid(hung('dominikUpper', pieces.upper)).solid(hung(left ? 'dominikForeL' : 'dominikForeR', left ? pieces.left : pieces.right, j.upperArm));
    // a wristband in the player's colour (on the left the watch sits next to it)
    arm.box(c, 0.2 * f.scale, 0.07 * f.scale, 0.2 * f.scale, shoulder[0], shoulder[1] - (j.upperArm + 0.36) * f.scale, shoulder[2]);
    const knee = place(f, side * j.knee.x, j.knee.y, j.knee.z);
    s.part(left ? 'legL' : 'legR', knee, 'body').solid(hung('dominikLeg', pieces.leg));
  }
}
