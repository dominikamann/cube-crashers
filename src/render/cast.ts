import * as THREE from 'three';
import { BOT_CHASSIS, type BotChassis, type CharacterId, type Look } from '../characters';
import { Part, Sculpt } from './figure';
import { dinoFigure, dominikFigure } from './monster-figure';

/**
 * The player figures. Every character is built from boxes in its own space: it stands on y = 0, looks
 * along -z, its right is +x, and it is about as tall and wide as the others. The player's colour is on its
 * biggest surfaces, above all on what the camera sees from above.
 *
 * Parts with these names move by themselves (see animate): body (everything hangs on it), legL, legR, armL,
 * armR, head, tail. A character's own `move` does the rest.
 */
export interface Tones {
  /** the player's colour, a lighter and a darker shade of it */
  c: number;
  l: number;
  d: number;
}

/** what a figure is doing right now, as animate() needs it */
export interface Pose {
  /** seconds, running */
  t: number;
  /** grows with the distance walked: one step each PI */
  step: number;
  /** 0 standing to 1 moving at full pace */
  pace: number;
  /** which way it moves, in its own frame (forward, to its right), each -1..1 */
  ahead: number;
  aside: number;
  /** seconds it has been standing still */
  idle: number;
  /** in the air (a jump, the jetpack) */
  air: boolean;
  /** 1 the moment it lands, fading to 0 */
  land: number;
  /** 1 while dashing, fading to 0 after */
  dash: number;
  down: boolean;
  driving: boolean;
  /** on a ladder */
  climbing: boolean;
  /** the game is won: a little dance */
  win: boolean;
  /** 1 the moment it fires, fading to 0 */
  kick: number;
}

type Parts = Record<string, THREE.Group>;
type Vec3 = [number, number, number];

interface Model {
  build(s: Sculpt, t: Tones, look: Look): void;
  /** how it gets about: on two legs, waddling, floating, on wheels, hopping */
  gait: 'walk' | 'waddle' | 'float' | 'roll' | 'hop';
  /** where it holds its weapon */
  hand: Vec3;
  /** how far behind its middle its back is (the jetpack sits there) and how high */
  back: Vec3;
  /** how it lies when downed: on its side, on its back, on its face, upside down, or it stays up (and `move` does it) */
  down: 'side' | 'back' | 'front' | 'flip' | 'stay';
  /** its height (to lie down by, and for what sits on top) */
  height: number;
  /** its own moves, after the common ones */
  move?(p: Parts, a: Pose): void;
}

const WHITE = 0xe8ecf4, DARK = 0x2a2a50, BLACK = 0x14141c, STEEL = 0xaab2c4, IRON = 0x4a5066, GOLD = 0xffcf3a, ORANGE = 0xff9a2e, PINK = 0xff8fb0, CREAM = 0xfff0d8;
const SCREEN = 0x10131c;

/** a pair of eyes on a face that looks along -z */
function eyes(p: Part, x: number, y: number, z: number, w = 0.07, h = 0.1): void {
  p.pair(BLACK, w, h, 0.03, x, y, z);
  p.pair(WHITE, w * 0.45, h * 0.35, 0.02, x - w * 0.2, y + h * 0.25, z - 0.012);
}

/** short dark legs with white sneakers */
function sneakers(s: Sculpt, x: number, hip: number, toe: number): void {
  for (const side of [-1, 1]) {
    s.part(side < 0 ? 'legL' : 'legR', [side * x, hip, 0], 'body')
      .box(DARK, 0.09, hip - 0.1, 0.09, side * x, hip / 2 + 0.05, 0)
      .box(WHITE, 0.2, 0.12, 0.3, side * x, 0.06, -0.04)
      .box(toe, 0.21, 0.07, 0.1, side * x, 0.045, -0.15);
  }
}

/** thin dark arms with white gloves */
function gloves(s: Sculpt, x: number, shoulder: number): void {
  for (const side of [-1, 1]) {
    s.part(side < 0 ? 'armL' : 'armR', [side * x, shoulder, 0], 'body')
      .box(DARK, 0.08, 0.3, 0.08, side * x, shoulder - 0.15, 0)
      .box(WHITE, 0.15, 0.13, 0.15, side * x, shoulder - 0.34, 0);
  }
}

const HUMANS: Record<Exclude<CharacterId, 'babyDino' | 'dominik'>, Model> = {
  astronaut: {
    gait: 'walk',
    hand: [0.42, 0.8, -0.34],
    back: [0, 0, 0.14],
    down: 'side',
    height: 1.55,
    build(s, { c, l, d }) {
      const body = s.part('body');
      // the suit: a chest panel with lights, a belt, shoulder rings, an air pack with two tanks
      body.box(c, 0.58, 0.46, 0.36, 0, 0.69, 0).box(d, 0.6, 0.08, 0.38, 0, 0.5, 0).glow(GOLD, 0.8, 0.12, 0.08, 0.03, 0, 0.5, -0.2);
      body.box(WHITE, 0.3, 0.18, 0.03, 0, 0.78, -0.195).glow(0xff5a5f, 1.3, 0.05, 0.05, 0.02, -0.08, 0.81, -0.215).glow(0x3bd16f, 1.3, 0.05, 0.05, 0.02, 0, 0.81, -0.215).glow(0x2bf0ff, 1.3, 0.05, 0.05, 0.02, 0.08, 0.81, -0.215);
      body.box(DARK, 0.2, 0.04, 0.02, 0, 0.74, -0.215);
      body.pair(l, 0.22, 0.12, 0.3, 0.39, 0.9, 0);
      body.box(WHITE, 0.44, 0.44, 0.14, 0, 0.72, 0.25).pair(STEEL, 0.13, 0.4, 0.13, 0.12, 0.72, 0.35).pair(IRON, 0.09, 0.05, 0.09, 0.12, 0.94, 0.35).glow(0x2bf0ff, 1.2, 0.06, 0.1, 0.02, 0, 0.8, 0.325);
      for (const side of [-1, 1]) {
        s.part(side < 0 ? 'legL' : 'legR', [side * 0.14, 0.46, 0], 'body')
          .box(c, 0.21, 0.26, 0.22, side * 0.14, 0.33, 0)
          .box(d, 0.22, 0.06, 0.23, side * 0.14, 0.3, 0)
          .box(WHITE, 0.24, 0.16, 0.32, side * 0.14, 0.1, -0.04)
          .box(DARK, 0.25, 0.04, 0.33, side * 0.14, 0.02, -0.04);
        s.part(side < 0 ? 'armL' : 'armR', [side * 0.4, 0.88, 0], 'body')
          .box(c, 0.16, 0.3, 0.16, side * 0.4, 0.7, 0)
          .box(d, 0.17, 0.05, 0.17, side * 0.4, 0.6, 0)
          .box(WHITE, 0.18, 0.14, 0.18, side * 0.4, 0.5, 0);
      }
      // a big helmet with a glass visor, a stripe over the top and a radio antenna
      const head = s.part('head', [0, 0.94, 0], 'body');
      head.box(STEEL, 0.4, 0.06, 0.36, 0, 0.96, 0).box(c, 0.58, 0.5, 0.54, 0, 1.24, 0).box(WHITE, 0.14, 0.03, 0.56, 0, 1.495, 0);
      head.box(DARK, 0.48, 0.3, 0.04, 0, 1.24, -0.27).glow(0x1f9fd0, 0.45, 0.42, 0.22, 0.03, 0, 1.24, -0.285).glow(0xbff6ff, 1.1, 0.12, 0.05, 0.02, -0.11, 1.3, -0.3).glow(0xbff6ff, 1.1, 0.05, 0.05, 0.02, 0.0, 1.3, -0.3);
      head.pair(WHITE, 0.06, 0.18, 0.2, 0.31, 1.22, 0.02);
      head.box(DARK, 0.03, 0.2, 0.03, 0.2, 1.59, 0.12).glow(0xff5a5f, 1.5, 0.07, 0.07, 0.07, 0.2, 1.71, 0.12);
    },
    move(p, a) {
      // standing about: a look to the left and to the right
      p.head.rotation.y = a.idle > 2 ? Math.sin((a.idle - 2) * 1.3) * 0.5 : 0;
    },
  },

  knight: {
    gait: 'walk',
    hand: [0.42, 0.8, -0.34],
    back: [0, 0, 0.06],
    down: 'back',
    height: 1.65,
    build(s, { c, l, d }) {
      const body = s.part('body');
      // a tabard in the player's colour with a cross, over steel
      body.box(c, 0.58, 0.48, 0.38, 0, 0.7, 0).box(l, 0.08, 0.32, 0.03, 0, 0.72, -0.2).box(l, 0.26, 0.08, 0.03, 0, 0.78, -0.2);
      body.box(0x7a4a2a, 0.6, 0.07, 0.4, 0, 0.5, 0).glow(GOLD, 0.8, 0.1, 0.09, 0.03, 0, 0.5, -0.21);
      body.pair(c, 0.26, 0.14, 0.34, 0.4, 0.93, 0).pair(STEEL, 0.27, 0.04, 0.35, 0.4, 0.85, 0);
      s.part('cape', [0, 0.94, 0.2], 'body').box(c, 0.52, 0.62, 0.05, 0, 0.62, 0.225).box(d, 0.52, 0.06, 0.055, 0, 0.3, 0.225);
      for (const side of [-1, 1]) {
        s.part(side < 0 ? 'legL' : 'legR', [side * 0.14, 0.46, 0], 'body')
          .box(STEEL, 0.2, 0.28, 0.22, side * 0.14, 0.32, 0)
          .box(IRON, 0.22, 0.07, 0.24, side * 0.14, 0.34, 0)
          .box(IRON, 0.24, 0.16, 0.32, side * 0.14, 0.08, -0.04);
        const arm = s.part(side < 0 ? 'armL' : 'armR', [side * 0.4, 0.88, 0], 'body');
        arm.box(STEEL, 0.16, 0.3, 0.16, side * 0.4, 0.7, 0).box(IRON, 0.18, 0.13, 0.18, side * 0.4, 0.5, 0);
        // the shield on the left arm
        if (side < 0) arm.box(c, 0.07, 0.46, 0.4, -0.53, 0.64, -0.03).box(l, 0.03, 0.22, 0.14, -0.57, 0.66, -0.03).box(STEEL, 0.08, 0.05, 0.42, -0.53, 0.89, -0.03).box(STEEL, 0.08, 0.05, 0.3, -0.53, 0.4, -0.03);
      }
      // a great helm with a slit to see through and a crest
      const head = s.part('head', [0, 0.94, 0], 'body');
      head.box(STEEL, 0.52, 0.46, 0.5, 0, 1.2, 0).box(IRON, 0.54, 0.05, 0.52, 0, 0.99, 0).box(BLACK, 0.42, 0.06, 0.03, 0, 1.24, -0.255).box(IRON, 0.06, 0.4, 0.03, 0, 1.2, -0.26);
      for (const x of [-0.14, -0.08, 0.08, 0.14]) head.box(BLACK, 0.03, 0.03, 0.03, x, 1.1, -0.255);
      head.box(c, 0.14, 0.16, 0.5, 0, 1.5, 0.02).box(c, 0.14, 0.12, 0.3, 0, 1.62, 0.1).box(l, 0.15, 0.06, 0.12, 0, 1.6, -0.14);
    },
    move(p, a) {
      // the cape lifts behind him as he runs and hangs still when he stands
      p.cape.rotation.x = a.down ? 0 : 0.08 + a.pace * 0.55 + a.dash * 0.7 + Math.sin(a.t * 9) * 0.06 * a.pace + (a.air ? 0.5 : 0);
      // standing about: he raises the shield
      p.armL.rotation.x += a.idle > 3 ? Math.min(1, (a.idle - 3) * 2) * (0.9 + Math.sin(a.t * 2) * 0.1) : 0;
    },
  },

  cat: {
    gait: 'walk',
    hand: [0.36, 0.56, -0.3],
    back: [0, -0.2, -0.02],
    down: 'side',
    height: 1.45,
    build(s, { c, l, d }) {
      const body = s.part('body');
      body.box(c, 0.46, 0.42, 0.36, 0, 0.5, 0).box(l, 0.28, 0.3, 0.03, 0, 0.48, -0.19);
      body.box(WHITE, 0.4, 0.06, 0.34, 0, 0.72, -0.01).glow(GOLD, 0.9, 0.09, 0.09, 0.05, 0, 0.67, -0.2);
      for (const side of [-1, 1]) {
        s.part(side < 0 ? 'legL' : 'legR', [side * 0.13, 0.3, 0], 'body').box(c, 0.18, 0.22, 0.2, side * 0.13, 0.2, 0).box(l, 0.2, 0.1, 0.27, side * 0.13, 0.05, -0.03);
        s.part(side < 0 ? 'armL' : 'armR', [side * 0.3, 0.66, 0], 'body').box(c, 0.13, 0.26, 0.14, side * 0.3, 0.53, 0).box(l, 0.15, 0.1, 0.16, side * 0.3, 0.38, 0);
      }
      // a big head: ears, green eyes, a pale muzzle with whiskers, stripes on top
      const head = s.part('head', [0, 0.75, 0], 'body');
      head.box(c, 0.62, 0.5, 0.5, 0, 1.0, 0).box(l, 0.3, 0.18, 0.05, 0, 0.9, -0.265).box(PINK, 0.08, 0.05, 0.03, 0, 0.98, -0.295).box(BLACK, 0.12, 0.02, 0.02, 0, 0.87, -0.295);
      head.pair(c, 0.18, 0.16, 0.12, 0.21, 1.32, 0.04).pair(c, 0.1, 0.08, 0.1, 0.21, 1.43, 0.04).pair(PINK, 0.09, 0.1, 0.03, 0.21, 1.31, -0.03);
      head.pair(0x9dff5a, 0.11, 0.13, 0.03, 0.16, 1.07, -0.255, 0.9).pair(BLACK, 0.04, 0.13, 0.02, 0.16, 1.07, -0.275);
      for (const y of [0.9, 0.96]) head.pair(WHITE, 0.14, 0.02, 0.02, 0.37, y, -0.2);
      for (const z of [-0.06, 0.08, 0.2]) head.box(d, 0.32, 0.03, 0.07, 0, 1.255, z);
      // the tail: up behind the back, with a pale tip
      s.part('tail', [0, 0.4, 0.18], 'body').box(c, 0.1, 0.1, 0.3, 0, 0.42, 0.33).box(c, 0.1, 0.36, 0.1, 0, 0.62, 0.45).box(l, 0.12, 0.13, 0.12, 0, 0.86, 0.45);
    },
    move(p, a) {
      // the tail waves slowly, and lashes when running
      p.tail.rotation.y = Math.sin(a.t * (2 + a.pace * 8)) * (0.35 + a.pace * 0.3);
      p.tail.rotation.x = a.air ? -0.6 : 0;
      // standing about: washing its face with the left paw
      const wash = a.idle > 2.5 && (a.idle - 2.5) % 5 < 2.2;
      if (wash) {
        p.armL.rotation.x = 2.5 + Math.sin(a.t * 10) * 0.25;
        p.armL.rotation.z = -0.5;
        p.head.rotation.z = 0.15;
      } else {
        p.armL.rotation.z = 0;
        p.head.rotation.z = 0;
      }
    },
  },

  duck: {
    gait: 'waddle',
    hand: [0.44, 0.52, -0.3],
    back: [0, -0.22, 0.12],
    down: 'flip',
    height: 1.25,
    build(s, { c, l, d }) {
      const body = s.part('body');
      // a round body, a pale breast, a tail that points up
      body.box(c, 0.64, 0.44, 0.72, 0, 0.46, 0.04).box(c, 0.5, 0.1, 0.56, 0, 0.72, 0.06).box(l, 0.48, 0.3, 0.04, 0, 0.44, -0.33);
      body.box(c, 0.3, 0.16, 0.16, 0, 0.68, 0.45).box(l, 0.2, 0.12, 0.1, 0, 0.8, 0.5);
      for (const side of [-1, 1]) {
        s.part(side < 0 ? 'legL' : 'legR', [side * 0.15, 0.24, 0], 'body').box(ORANGE, 0.08, 0.2, 0.08, side * 0.15, 0.14, 0).box(ORANGE, 0.24, 0.05, 0.32, side * 0.15, 0.03, -0.07);
        s.part(side < 0 ? 'wingL' : 'wingR', [side * 0.33, 0.62, 0.04], 'body').box(d, 0.08, 0.3, 0.46, side * 0.36, 0.48, 0.06).box(d, 0.08, 0.14, 0.2, side * 0.36, 0.42, 0.34);
      }
      const head = s.part('head', [0, 0.74, -0.14], 'body');
      head.box(c, 0.44, 0.42, 0.42, 0, 0.98, -0.16).box(ORANGE, 0.26, 0.06, 0.18, 0, 0.94, -0.45).box(0xe07a1e, 0.22, 0.05, 0.16, 0, 0.885, -0.43);
      eyes(head, 0.13, 1.05, -0.375);
      head.box(c, 0.1, 0.1, 0.1, 0, 1.24, -0.1).box(c, 0.06, 0.08, 0.06, 0.03, 1.31, -0.05);
    },
    move(p, a) {
      // wings flap in the air and on a dash, and flutter while downed (feet up)
      const flap = a.air || a.dash > 0.2 || a.down || a.win ? Math.abs(Math.sin(a.t * 22)) * 1.2 : a.pace * 0.15;
      p.wingL.rotation.z = -flap;
      p.wingR.rotation.z = flap;
      // standing about: pecking at the floor
      const peck = a.idle > 2 && (a.idle - 2) % 3 < 1;
      p.head.rotation.x = peck ? -Math.abs(Math.sin(a.t * 9)) * 0.5 : -Math.sin(a.step * 2) * 0.12 * a.pace;
      if (a.down) p.legL.rotation.x = -(p.legR.rotation.x = Math.sin(a.t * 12) * 0.5);
    },
  },

  cabinet: {
    gait: 'walk',
    hand: [0.46, 0.66, -0.32],
    back: [0, 0, 0.14],
    down: 'back',
    height: 1.5,
    build(s, { c, l, d }) {
      const body = s.part('body');
      // an arcade cabinet: a control panel with a stick and buttons, a screen with an invader, a lit marquee
      body.box(c, 0.64, 0.5, 0.54, 0, 0.55, 0).box(c, 0.64, 0.64, 0.46, 0, 1.12, 0.04).box(d, 0.66, 0.06, 0.56, 0, 1.46, 0);
      body.box(DARK, 0.64, 0.08, 0.22, 0, 0.83, -0.3).box(STEEL, 0.04, 0.1, 0.04, -0.17, 0.91, -0.32).glow(0xff3b3b, 1.3, 0.08, 0.08, 0.08, -0.17, 0.98, -0.32);
      body.glow(GOLD, 1.3, 0.08, 0.03, 0.08, 0.05, 0.885, -0.32).glow(0x2bf0ff, 1.3, 0.08, 0.03, 0.08, 0.19, 0.885, -0.32);
      body.box(SCREEN, 0.5, 0.36, 0.03, 0, 1.06, -0.2);
      const invader = ['.#...#.', '..###..', '.#####.', '##.#.##', '#######', '#.#.#.#'];
      invader.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && body.glow(0x7dff6a, 1.4, 0.05, 0.05, 0.02, (i - 3) * 0.05, 1.19 - j * 0.05, -0.22)));
      body.glow(GOLD, 1.2, 0.56, 0.12, 0.04, 0, 1.35, -0.2).box(DARK, 0.2, 0.2, 0.02, 0, 0.52, -0.275).glow(ORANGE, 1.4, 0.04, 0.08, 0.02, 0, 0.54, -0.29);
      body.pair(l, 0.02, 0.9, 0.12, 0.325, 0.9, 0.05).box(l, 0.22, 0.02, 0.5, 0, 1.495, 0);
      sneakers(s, 0.17, 0.32, c);
      gloves(s, 0.37, 0.92);
    },
    move(p, a) {
      // standing about: it rocks from foot to foot
      p.body.rotation.z += a.idle > 2 ? Math.sin((a.idle - 2) * 4) * 0.06 : 0;
    },
  },

  cube: {
    gait: 'hop',
    hand: [0.54, 0.56, -0.3],
    back: [0, -0.1, 0.24],
    down: 'front',
    height: 1.1,
    build(s, { c, l, d }) {
      const body = s.part('body');
      // a cube with a face: pale corners, big eyes, a grin
      body.box(c, 0.84, 0.84, 0.84, 0, 0.66, 0).box(l, 0.44, 0.02, 0.44, 0, 1.085, 0).box(d, 0.22, 0.03, 0.22, 0, 1.09, 0);
      for (const x of [-0.36, 0.36]) for (const y of [0.3, 1.02]) for (const z of [-0.36, 0.36]) body.box(l, 0.14, 0.14, 0.14, x, y, z);
      body.pair(WHITE, 0.2, 0.26, 0.03, 0.19, 0.76, -0.425).pair(BLACK, 0.1, 0.14, 0.03, 0.17, 0.72, -0.44).pair(PINK, 0.1, 0.06, 0.02, 0.31, 0.56, -0.425);
      body.box(BLACK, 0.26, 0.06, 0.03, 0, 0.48, -0.425).pair(BLACK, 0.06, 0.06, 0.03, 0.16, 0.53, -0.425);
      for (const side of [-1, 1]) {
        s.part(side < 0 ? 'legL' : 'legR', [side * 0.2, 0.24, 0], 'body').box(DARK, 0.1, 0.14, 0.1, side * 0.2, 0.18, 0).box(DARK, 0.2, 0.12, 0.3, side * 0.2, 0.06, -0.03);
        s.part(side < 0 ? 'mittL' : 'mittR', [side * 0.58, 0.56, -0.05], 'body').box(WHITE, 0.18, 0.18, 0.18, side * 0.58, 0.56, -0.05);
      }
    },
    move(p, a) {
      // the mitts float beside it: they bob, punch forward on a shot, and go up when it dances
      const bob = Math.sin(a.t * 3) * 0.04;
      p.mittL.position.y = 0.56 + bob + (a.win ? 0.5 : 0);
      p.mittR.position.y = 0.56 - bob + (a.win ? 0.5 : 0);
      p.mittL.position.z = -0.05 + Math.sin(a.step) * 0.15 * a.pace;
      p.mittR.position.z = -0.2 + a.kick * 0.12;
      // standing about: it rolls its corners, a slow wobble
      p.body.rotation.z += a.idle > 2 ? Math.sin((a.idle - 2) * 2.2) * 0.1 : 0;
    },
  },

  joystick: {
    gait: 'walk',
    hand: [0.5, 0.5, -0.28],
    back: [0, 0.1, -0.1],
    down: 'stay',
    height: 1.5,
    build(s, { c, l }) {
      const body = s.part('body');
      // the base with two fire buttons and a cable at the back
      body.box(c, 0.86, 0.3, 0.86, 0, 0.3, 0).box(l, 0.88, 0.05, 0.88, 0, 0.2, 0).box(DARK, 0.7, 0.04, 0.7, 0, 0.465, 0);
      body.glow(0xff3b3b, 1.3, 0.17, 0.06, 0.17, -0.2, 0.51, -0.2).glow(GOLD, 1.3, 0.17, 0.06, 0.17, 0.2, 0.51, -0.2);
      body.box(DARK, 0.08, 0.08, 0.2, 0, 0.26, 0.5).box(DARK, 0.08, 0.2, 0.08, 0, 0.14, 0.62);
      for (const side of [-1, 1]) s.part(side < 0 ? 'legL' : 'legR', [side * 0.24, 0.16, 0], 'body').box(DARK, 0.16, 0.16, 0.26, side * 0.24, 0.08, -0.02);
      // the stick: a rubber boot, a shaft, and the ball on top, which has the eyes
      const stick = s.part('stick', [0, 0.48, 0.08], 'body');
      stick.box(DARK, 0.24, 0.1, 0.24, 0, 0.53, 0.08).box(DARK, 0.16, 0.08, 0.16, 0, 0.62, 0.08).box(STEEL, 0.08, 0.5, 0.08, 0, 0.9, 0.08);
      stick.box(c, 0.42, 0.42, 0.42, 0, 1.3, 0.08).box(l, 0.14, 0.03, 0.14, -0.08, 1.52, 0);
      eyes(stick, 0.1, 1.33, -0.135, 0.09, 0.12);
    },
    move(p, a) {
      if (a.down) {
        // the stick flops over to the side
        p.stick.rotation.set(0, 0, 1.35);
        return;
      }
      // the stick leans the way it walks, as if someone steered it; standing about it draws circles
      const idle = a.idle > 2 ? Math.min(1, a.idle - 2) : 0;
      p.stick.rotation.x = -a.ahead * 0.45 * a.pace + Math.sin(a.idle * 3) * 0.3 * idle - a.dash * 0.5 + a.kick * 0.2;
      p.stick.rotation.z = -a.aside * 0.45 * a.pace + Math.cos(a.idle * 3) * 0.3 * idle + (a.win ? Math.sin(a.t * 12) * 0.5 : 0);
    },
  },

  ghost: {
    gait: 'float',
    hand: [0.48, 0.66, -0.3],
    back: [0, 0, 0.18],
    down: 'stay',
    height: 1.3,
    build(s, { c, l }) {
      s.part('body');
      const shell = s.part('shell', [0, 0, 0], 'body');
      // the ghost from the maze: a round top, a hem of four points
      shell.box(c, 0.76, 0.6, 0.66, 0, 0.72, 0).box(c, 0.64, 0.16, 0.56, 0, 1.1, 0).box(c, 0.44, 0.1, 0.4, 0, 1.23, 0).box(l, 0.2, 0.03, 0.16, -0.1, 1.285, -0.06);
      [-0.285, -0.095, 0.095, 0.285].forEach((x, i) => shell.box(c, 0.19, i % 2 ? 0.12 : 0.22, 0.66, x, i % 2 ? 0.36 : 0.31, 0));
      // (a dark rim, so the eyes show on a white ghost too)
      s.part('eyes', [0, 0.86, -0.34], 'body').pair(DARK, 0.25, 0.31, 0.03, 0.17, 0.86, -0.335).pair(WHITE, 0.2, 0.26, 0.05, 0.17, 0.86, -0.345).pair(0x2b4bff, 0.1, 0.12, 0.03, 0.17, 0.82, -0.375);
      for (const side of [-1, 1]) s.part(side < 0 ? 'mittL' : 'mittR', [side * 0.46, 0.66, -0.08], 'body').box(c, 0.14, 0.14, 0.2, side * 0.46, 0.66, -0.08);
    },
    move(p, a) {
      // downed like in the maze: the shell sinks into a puddle and only the eyes are left, looking about
      const flat = a.down ? 0.12 : 1;
      p.shell.scale.set(a.down ? 1.25 : 1, flat, a.down ? 1.25 : 1);
      p.shell.position.y = a.down ? -0.02 : 0;
      p.eyes.position.y = a.down ? 0.5 + Math.sin(a.t * 3) * 0.05 : 0.86;
      p.eyes.rotation.y = a.down ? Math.sin(a.t * 2) * 0.6 : 0;
      p.mittL.visible = p.mittR.visible = !a.down;
      p.mittL.position.z = -0.08 + Math.sin(a.step) * 0.12 * a.pace;
      p.mittR.position.z = -0.2 + a.kick * 0.12;
      p.mittL.position.y = p.mittR.position.y = 0.66 + (a.win ? 0.45 : 0);
      // standing about: it sways like a sheet in the wind
      p.shell.rotation.z = a.down ? 0 : Math.sin(a.t * 2.2) * (a.idle > 2 ? 0.12 : 0.04);
    },
  },

  mushroom: {
    gait: 'walk',
    hand: [0.36, 0.44, -0.3],
    back: [0, -0.3, 0],
    down: 'side',
    height: 1.45,
    build(s, { c, l }) {
      const body = s.part('body');
      body.box(CREAM, 0.44, 0.34, 0.36, 0, 0.4, 0).box(c, 0.46, 0.18, 0.38, 0, 0.44, 0).glow(GOLD, 0.8, 0.07, 0.07, 0.03, 0, 0.44, -0.2);
      for (const side of [-1, 1]) {
        s.part(side < 0 ? 'legL' : 'legR', [side * 0.12, 0.24, 0], 'body').box(CREAM, 0.12, 0.12, 0.12, side * 0.12, 0.19, 0).box(0x7a4a2a, 0.2, 0.14, 0.3, side * 0.12, 0.07, -0.03);
        s.part(side < 0 ? 'armL' : 'armR', [side * 0.29, 0.54, 0], 'body').box(CREAM, 0.12, 0.26, 0.12, side * 0.29, 0.41, 0);
      }
      // the face under a wide spotted cap
      const head = s.part('head', [0, 0.58, 0], 'body');
      head.box(CREAM, 0.5, 0.36, 0.46, 0, 0.76, 0).box(BLACK, 0.12, 0.03, 0.02, 0, 0.66, -0.235);
      eyes(head, 0.12, 0.79, -0.24, 0.07, 0.14);
      const cap = s.part('cap', [0, 0.93, 0], 'head');
      cap.box(l, 0.9, 0.04, 0.9, 0, 0.93, 0).box(c, 0.98, 0.2, 0.98, 0, 1.05, 0).box(c, 0.86, 0.16, 0.86, 0, 1.23, 0).box(c, 0.6, 0.12, 0.6, 0, 1.37, 0);
      cap.box(WHITE, 0.28, 0.03, 0.28, 0, 1.435, 0);
      for (const x of [-0.3, 0.3]) for (const z of [-0.28, 0.28]) cap.box(WHITE, 0.2, 0.03, 0.2, x, 1.315, z);
      cap.box(WHITE, 0.26, 0.14, 0.03, 0, 1.06, -0.495).box(WHITE, 0.26, 0.14, 0.03, 0, 1.06, 0.495).pair(WHITE, 0.03, 0.14, 0.26, 0.495, 1.06, 0);
    },
    move(p, a) {
      // the cap is soft: it squashes on a landing and bounces with every step
      const squash = a.land * 0.35 + Math.abs(Math.sin(a.step)) * 0.08 * a.pace;
      p.cap.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      // standing about: it nods off, and wakes with a start
      const nap = a.idle > 3 ? (a.idle - 3) % 4 : 0;
      p.head.rotation.x = nap > 0 ? -Math.min(0.5, nap * 0.2) * (nap < 3.6 ? 1 : 0) : 0;
    },
  },

  cup: {
    gait: 'walk',
    hand: [0.46, 0.6, -0.32],
    back: [0, 0, 0.18],
    down: 'side',
    height: 1.35,
    build(s, { c, l }) {
      const body = s.part('body');
      // a soda cup: wider toward the top, a white band, a lid, and a striped straw
      body.box(c, 0.5, 0.3, 0.5, 0, 0.45, 0).box(c, 0.56, 0.3, 0.56, 0, 0.75, 0).box(c, 0.62, 0.26, 0.62, 0, 1.03, 0);
      body.box(WHITE, 0.575, 0.1, 0.575, 0, 0.7, 0).box(WHITE, 0.64, 0.04, 0.64, 0, 0.92, 0);
      eyes(body, 0.13, 1.04, -0.315);
      body.box(BLACK, 0.14, 0.03, 0.02, 0, 0.94, -0.325).pair(PINK, 0.08, 0.05, 0.02, 0.23, 0.97, -0.315);
      body.box(l, 0.7, 0.07, 0.7, 0, 1.195, 0).box(WHITE, 0.5, 0.07, 0.5, 0, 1.265, 0);
      const straw = s.part('straw', [0.1, 1.28, 0.1], 'body');
      [0, 1, 2, 3, 4].forEach(i => straw.box(i % 2 ? WHITE : 0xff3b3b, 0.07, 0.1, 0.07, 0.1, 1.35 + i * 0.1, 0.1));
      straw.box(0xff3b3b, 0.07, 0.07, 0.2, 0.1, 1.82, 0.03);
      sneakers(s, 0.14, 0.32, c);
      gloves(s, 0.36, 0.88);
    },
    move(p, a) {
      // the straw rattles as it runs and turns round when it has nothing to do
      p.straw.rotation.z = Math.sin(a.step * 2) * 0.15 * a.pace - 0.15 + a.land * 0.4;
      p.straw.rotation.y = a.idle > 2 ? (a.idle - 2) * 2.5 : 0;
    },
  },
};

/** the face on a bot's screen: pixels in the bot's own light */
function botFace(p: Part, face: number, glow: number, y: number, z: number, w: number, h: number): void {
  p.box(SCREEN, w, h, 0.03, 0, y, z);
  const px = (x: number, dy: number, pw = 0.06, ph = 0.06) => p.glow(glow, 1.5, pw, ph, 0.02, x, y + dy, z - 0.02);
  if (face === 0) {
    // two square eyes and a straight mouth
    px(-w * 0.24, 0.03, 0.1, 0.12);
    px(w * 0.24, 0.03, 0.1, 0.12);
    px(0, -h * 0.32, w * 0.3, 0.03);
  } else if (face === 1) {
    // one bar of light across
    px(0, 0.01, w * 0.8, 0.07);
  } else if (face === 2) {
    // a single big eye
    px(0, 0, 0.2, 0.2);
    p.box(SCREEN, 0.08, 0.08, 0.02, 0.02, y + 0.01, z - 0.035);
  } else {
    // laughing eyes and a grin
    for (const side of [-1, 1]) {
      px(side * w * 0.24, 0.07, 0.1, 0.04);
      px(side * (w * 0.24 - 0.05), 0.03, 0.04, 0.05);
      px(side * (w * 0.24 + 0.05), 0.03, 0.04, 0.05);
    }
    px(0, -h * 0.3, w * 0.4, 0.04);
    px(-w * 0.22, -h * 0.3 + 0.04, 0.04, 0.05);
    px(w * 0.22, -h * 0.3 + 0.04, 0.04, 0.05);
  }
}

/** what a bot wears on top: a rod with a bulb, a pair of short feelers, or a dish */
function botAntenna(s: Sculpt, on: string, antenna: number, y: number, z = 0.05): void {
  const a = s.part('antenna', [0, y, z], on);
  if (antenna === 0) a.box(IRON, 0.04, 0.26, 0.04, 0, y + 0.13, z).glow(0xff5a5f, 1.6, 0.1, 0.1, 0.1, 0, y + 0.3, z);
  else if (antenna === 1) a.pair(IRON, 0.04, 0.16, 0.04, 0.16, y + 0.08, z).pair(GOLD, 0.08, 0.08, 0.08, 0.16, y + 0.19, z, 1.5);
  else a.box(IRON, 0.05, 0.14, 0.05, 0, y + 0.07, z).box(STEEL, 0.34, 0.04, 0.3, 0, y + 0.16, z, [0.5, 0, 0]).glow(0x3bd16f, 1.6, 0.06, 0.12, 0.06, 0, y + 0.22, z - 0.04, [0.5, 0, 0]);
}

/** a bot's arm: a thin rod with a two-finger claw */
function claws(s: Sculpt, x: number, shoulder: number, z = 0): void {
  for (const side of [-1, 1]) {
    s.part(side < 0 ? 'armL' : 'armR', [side * x, shoulder, z], 'body')
      .box(IRON, 0.09, 0.3, 0.09, side * x, shoulder - 0.16, z)
      .box(STEEL, 0.16, 0.08, 0.14, side * x, shoulder - 0.33, z)
      .box(STEEL, 0.05, 0.1, 0.12, side * x - 0.055, shoulder - 0.41, z)
      .box(STEEL, 0.05, 0.1, 0.12, side * x + 0.055, shoulder - 0.41, z);
  }
}

/** a bot scans the room in jerks; its antenna quivers */
function botMove(p: Parts, a: Pose): void {
  if (p.head) p.head.rotation.y = a.idle > 1.5 ? [0, 0.6, 0, -0.6][Math.floor((a.idle - 1.5) / 0.7) % 4] : 0;
  if (p.antenna) p.antenna.rotation.z = Math.sin(a.t * 17) * 0.06 + Math.sin(a.step) * 0.2 * a.pace + (a.down ? 0.9 : 0);
}

const BOTS: Record<BotChassis, Model> = {
  boxy: {
    gait: 'walk',
    hand: [0.42, 0.78, -0.34],
    back: [0, 0, 0.1],
    down: 'side',
    height: 1.5,
    build(s, { c, l }, look) {
      const body = s.part('body');
      // the classic: a box on two legs with a box for a head
      body.box(STEEL, 0.6, 0.46, 0.4, 0, 0.68, 0).box(c, 0.46, 0.3, 0.04, 0, 0.72, -0.21).glow(l, 1.5, 0.1, 0.1, 0.03, 0, 0.74, -0.235);
      for (const y of [0.52, 0.57]) body.box(IRON, 0.3, 0.02, 0.02, 0, y, -0.205);
      body.pair(c, 0.2, 0.16, 0.3, 0.4, 0.88, 0).box(IRON, 0.36, 0.3, 0.1, 0, 0.7, 0.25).pair(IRON, 0.05, 0.05, 0.05, 0.24, 0.5, -0.205);
      for (const side of [-1, 1])
        s.part(side < 0 ? 'legL' : 'legR', [side * 0.15, 0.44, 0], 'body').box(IRON, 0.14, 0.28, 0.14, side * 0.15, 0.3, 0).box(STEEL, 0.22, 0.14, 0.3, side * 0.15, 0.08, -0.03);
      claws(s, 0.4, 0.88);
      const head = s.part('head', [0, 0.93, 0], 'body');
      head.box(IRON, 0.16, 0.08, 0.16, 0, 0.95, 0).box(STEEL, 0.58, 0.44, 0.48, 0, 1.21, 0).box(c, 0.6, 0.08, 0.5, 0, 1.45, 0).pair(IRON, 0.06, 0.14, 0.14, 0.32, 1.2, 0);
      botFace(head, look.face, l, 1.2, -0.25, 0.46, 0.28);
      botAntenna(s, 'head', look.antenna, 1.49);
    },
    move: botMove,
  },

  wheel: {
    gait: 'roll',
    hand: [0.42, 0.84, -0.32],
    back: [0, 0.14, 0.1],
    down: 'side',
    height: 1.5,
    build(s, { c, l }, look) {
      const body = s.part('body');
      // one fat wheel under a fork, and a body that balances on it
      s.part('wheel', [0, 0.3, 0], 'body').box(IRON, 0.2, 0.44, 0.44, 0, 0.3, 0).box(IRON, 0.2, 0.44, 0.44, 0, 0.3, 0, [Math.PI / 4, 0, 0]).box(c, 0.24, 0.2, 0.2, 0, 0.3, 0).box(STEEL, 0.26, 0.08, 0.08, 0, 0.3, 0);
      body.pair(STEEL, 0.06, 0.42, 0.08, 0.15, 0.5, 0).box(STEEL, 0.5, 0.4, 0.4, 0, 0.86, 0).box(c, 0.38, 0.24, 0.04, 0, 0.88, -0.21).glow(l, 1.5, 0.08, 0.08, 0.03, 0, 0.88, -0.235);
      body.pair(c, 0.14, 0.12, 0.26, 0.31, 1.0, 0).box(IRON, 0.3, 0.26, 0.08, 0, 0.86, 0.24);
      claws(s, 0.34, 1.0);
      const head = s.part('head', [0, 1.07, 0], 'body');
      head.box(IRON, 0.14, 0.06, 0.14, 0, 1.08, 0).box(STEEL, 0.46, 0.3, 0.44, 0, 1.26, 0).box(c, 0.34, 0.08, 0.32, 0, 1.45, 0);
      botFace(head, look.face, l, 1.26, -0.23, 0.38, 0.2);
      botAntenna(s, 'head', look.antenna, 1.49);
    },
    move(p, a) {
      botMove(p, a);
      // the wheel turns with the ground; the body leans into the ride
      p.wheel.rotation.x = -a.step * 1.2 * Math.sign(a.ahead || 1);
    },
  },

  treads: {
    gait: 'roll',
    hand: [0.46, 0.66, -0.34],
    back: [0, -0.14, 0.2],
    down: 'side',
    height: 1.35,
    build(s, { c, l }, look) {
      const body = s.part('body');
      // two tracks, a low hull, and a head on a long neck
      body.pair(IRON, 0.2, 0.3, 0.8, 0.34, 0.17, 0);
      for (const z of [-0.28, 0, 0.28]) body.pair(STEEL, 0.22, 0.14, 0.14, 0.34, 0.17, z);
      body.box(c, 0.5, 0.3, 0.6, 0, 0.36, 0).box(STEEL, 0.56, 0.08, 0.5, 0, 0.54, 0).glow(l, 1.5, 0.2, 0.06, 0.03, 0, 0.4, -0.31);
      body.box(IRON, 0.12, 0.38, 0.12, 0, 0.76, 0.05).box(STEEL, 0.76, 0.08, 0.1, 0, 0.84, 0.05);
      claws(s, 0.38, 0.84, 0.05);
      const head = s.part('head', [0, 0.94, 0.05], 'body');
      head.box(STEEL, 0.56, 0.34, 0.4, 0, 1.12, 0).box(c, 0.58, 0.06, 0.42, 0, 1.32, 0).pair(IRON, 0.05, 0.12, 0.12, 0.3, 1.12, 0);
      botFace(head, look.face, l, 1.12, -0.21, 0.46, 0.22);
      botAntenna(s, 'head', look.antenna, 1.35);
    },
    move(p, a) {
      botMove(p, a);
      // the neck is a spring: the head bobs after every stop and landing
      p.head.position.y = 0.94 + Math.sin(a.t * 14) * 0.02 * a.pace - a.land * 0.12;
    },
  },

  hover: {
    gait: 'float',
    hand: [0.48, 0.62, -0.3],
    back: [0, -0.1, 0.16],
    down: 'side',
    height: 1.15,
    build(s, { c, l }, look) {
      const body = s.part('body');
      // a little saucer: a ring in the player's colour, a thruster below, a dome with the face
      body.box(c, 0.9, 0.1, 0.9, 0, 0.62, 0).box(STEEL, 0.8, 0.16, 0.8, 0, 0.62, 0).box(IRON, 0.5, 0.14, 0.5, 0, 0.48, 0).glow(l, 1.6, 0.3, 0.05, 0.3, 0, 0.395, 0);
      body.box(STEEL, 0.56, 0.3, 0.52, 0, 0.85, 0).box(c, 0.42, 0.08, 0.4, 0, 1.04, 0);
      for (const x of [-0.3, 0, 0.3]) body.glow(GOLD, 1.3, 0.08, 0.05, 0.02, x, 0.62, -0.455);
      botFace(body, look.face, l, 0.86, -0.27, 0.44, 0.22);
      claws(s, 0.44, 0.6);
      botAntenna(s, 'body', look.antenna, 1.08);
    },
    move(p, a) {
      botMove(p, a);
      // it tilts as it turns over and spins slowly when it has nothing to do
      p.body.rotation.z += Math.sin(a.t * 1.7) * 0.05;
    },
  },
};

/** the two that are monsters at player size (see monster-figure.ts) */
const EARNED: Record<'babyDino' | 'dominik', Model> = {
  babyDino: {
    gait: 'waddle',
    hand: [0.3, 0.6, -0.5],
    back: [0, 0.22, 0.1],
    down: 'side',
    height: 1.3,
    build: (s, { c, l }) => dinoFigure(s, c, l),
    move(p, a) {
      // the tail sweeps, further toward its tip
      const sweep = a.t * (4 + a.pace * 6);
      p.tail.rotation.y = Math.sin(sweep) * 0.2;
      p.tail2.rotation.y = Math.sin(sweep - 0.6) * 0.3;
      p.tail3.rotation.y = Math.sin(sweep - 1.2) * 0.4;
      // it snaps with every shot, pants on a dash, and roars now and then when it has nothing to do
      const roar = a.idle > 3 && (a.idle - 3) % 5 < 1.2;
      p.jaw.rotation.x = -(0.06 + a.kick * 0.5 + a.dash * 0.4 + (roar ? 0.55 + Math.sin(a.t * 30) * 0.05 : 0) + (a.down ? 0.5 : 0) + (a.win ? Math.abs(Math.sin(a.t * 7)) * 0.5 : 0));
      if (roar) p.body.rotation.x += 0.18;
    },
  },
  dominik: {
    gait: 'walk',
    hand: [0.23, 1.14, -0.5],
    back: [0, 0.3, 0.0],
    down: 'back',
    height: 1.64,
    build: (s, { c }) => dominikFigure(s, c),
    move(p, a) {
      // standing about: he looks round for someone to be angry at
      p.head.rotation.y = a.idle > 2 ? Math.sin((a.idle - 2) * 1.6) * 0.6 : 0;
    },
  },
};

export const MODELS: Record<string, Model> = { ...HUMANS, ...EARNED, ...BOTS };

export interface Figure {
  model: Model;
  parts: Parts;
  /** what it costs to draw */
  cost: { boxes: number; meshes: number };
}

/** Builds the figure of a look in the player's colour. */
export function buildFigure(look: Look, hue: number): Figure {
  const model = MODELS[look.kind] ?? (look.bot ? BOTS[BOT_CHASSIS[0]] : HUMANS.astronaut);
  const base = new THREE.Color(hue);
  const tones: Tones = { c: hue, l: base.clone().lerp(new THREE.Color(0xffffff), 0.45).getHex(), d: base.clone().lerp(new THREE.Color(0x000000), 0.35).getHex() };
  const s = new Sculpt();
  model.build(s, tones, look);
  const cost = s.cost();
  const parts = s.finish();
  parts.body.rotation.order = 'YXZ';
  return { model, parts, cost };
}

/**
 * Moves a figure's parts for this frame. The body's place and heading (position, rotation.y) are the
 * caller's; this adds the walk, the lean, squash and stretch, and the character's own moves.
 */
export function animate(f: Figure, a: Pose): void {
  const p = f.parts, m = f.model, body = p.body;
  const stride = Math.sin(a.step), busy = a.down || a.driving ? 0 : a.pace;
  // getting about: a bounce on two legs, a waddle, a float, a hop
  let lift = 0, roll = 0;
  if (!a.down && !a.driving) {
    if (m.gait === 'walk') lift = Math.abs(stride) * 0.07 * busy;
    else if (m.gait === 'waddle') {
      lift = Math.abs(stride) * 0.04 * busy;
      roll = stride * 0.16 * busy;
    } else if (m.gait === 'float') lift = 0.22 + Math.sin(a.t * 3) * 0.06;
    else if (m.gait === 'hop') lift = Math.abs(stride) * 0.2 * busy;
    else lift = Math.sin(a.t * 40) * 0.008 * busy;
    // idle: breathing
    if (a.idle > 0.3 && m.gait !== 'float') lift += Math.sin(a.t * 2.4) * 0.012;
  }
  if (a.win && !a.down) lift += Math.abs(Math.sin(a.t * 7)) * 0.35;
  // squash on a landing, stretch in the air and on a dash
  const squash = a.down ? 0 : a.land * 0.22 - (a.air ? 0.08 : 0);
  const seat = a.driving ? 0.8 : 1;
  body.scale.set(seat * (1 + squash * 0.6), seat * (1 - squash), seat * (1 + squash * 0.6 + a.dash * 0.12));
  // leaning into the run, and hard into a dash
  let pitch = -a.ahead * 0.14 * busy - a.dash * 0.45, tilt = -a.aside * 0.14 * busy + roll;
  let y = lift;
  if (a.down) {
    pitch = tilt = 0;
    if (m.down === 'side') {
      tilt = Math.PI / 2;
      y = 0.28;
    } else if (m.down === 'back') {
      pitch = Math.PI / 2;
      y = 0.28;
    } else if (m.down === 'front') {
      pitch = -Math.PI / 2;
      y = 0.44;
    } else if (m.down === 'flip') {
      tilt = Math.PI;
      y = m.height - 0.2;
    }
  } else if (a.climbing) pitch = 0.25;
  body.position.y = y;
  body.rotation.x = pitch;
  body.rotation.z = tilt;
  // legs swing with the steps; sitting they point forward, in the air they trail
  const swing = a.down || a.driving ? 0 : stride * 0.8 * a.pace;
  const rest = a.driving ? 1.3 : a.air ? -0.35 : a.dash * -0.6;
  if (p.legL) p.legL.rotation.x = rest + swing;
  if (p.legR) p.legR.rotation.x = rest - swing * (a.air ? -1 : 1) + (a.air ? 0.5 : 0);
  // the free arm swings against the legs and goes up in the air; the other one holds the weapon out
  if (p.armL) {
    p.armL.rotation.x = a.win ? 2.9 + Math.sin(a.t * 12) * 0.3 : -swing * 0.8 + (a.air ? 2.6 : 0) + (a.climbing ? 2.4 + Math.sin(a.t * 9) * 0.5 : 0) + a.dash * -0.9;
    p.armL.rotation.z = 0;
  }
  if (p.armR) p.armR.rotation.x = a.down ? 0 : a.win ? 2.9 - Math.sin(a.t * 12) * 0.3 : a.climbing ? 2.4 - Math.sin(a.t * 9) * 0.5 : 1.25 + a.kick * 0.35;
  if (p.head) p.head.rotation.set(a.down ? 0 : a.kick * 0.08, 0, 0);
  m.move?.(p, a);
}
