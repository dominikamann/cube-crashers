import * as THREE from 'three';
import type { Part, Sculpt } from './figure';
import { MONSTER_LIFT, MONSTER_PARTS } from './monster-parts';
import { voxelBody, type BodyKind } from './voxel-body';

/**
 * One character is a monster at player size: the Baby Dino (the T-Rex). It is not modelled again: its figure
 * is put together from the monster's own voxel body and parts, so it changes when the monster does. A monster
 * looks along +z, a figure along -z: everything is turned round.
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
 * A voxel body turned and scaled into the figure's space, tinted with `color`. Built once per body and colour
 * and shared by every figure that needs it: a voxel body has many thousand cubes.
 */
const bodies = new Map<string, THREE.BufferGeometry>();
function body(kind: BodyKind, w: number, h: number, d: number, f: Frame, color: number): THREE.BufferGeometry {
  const key = `${kind}:${color}`;
  let g = bodies.get(key);
  if (g) return g;
  // (a copy: some voxel bodies are kept and shared with the monsters that wear them)
  g = voxelBody(kind, w, h, d).geometry.clone();
  g.translate(0, f.mid, 0).rotateY(Math.PI).scale(f.scale, f.scale, f.scale);
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

/** The Baby Dino: the T-Rex in the player's colour from head to tail, with friendly eyes. */
export function dinoFigure(s: Sculpt, c: number): void {
  const f: Frame = { scale: DINO_SCALE, mid: TREX.h / 2 + (MONSTER_LIFT.trex ?? 0) };
  const shape = voxelBody('trex', TREX.w, TREX.h, TREX.d);
  const front = shape.frontAt(TREX.eyeX, TREX.eyeY - TREX.h / 2);
  shape.geometry.dispose();
  const b = s.part('body');
  b.solid(body('trex', TREX.w, TREX.h, TREX.d, f, c));
  parts(s, MONSTER_PARTS.trex ?? [], f, c);
  // friendly eyes: no monster has those
  const eyeY = TREX.eyeY - TREX.h / 2;
  for (const side of [-1, 1]) {
    b.box(0xffffff, 0.09, 0.1, 0.02, ...place(f, side * TREX.eyeX, eyeY, front + 0.01));
    b.box(0x14141c, 0.05, 0.06, 0.02, ...place(f, side * TREX.eyeX, eyeY - 0.01, front + 0.03));
  }
}
