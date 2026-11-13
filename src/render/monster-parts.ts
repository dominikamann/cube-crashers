import type { EnemyKind } from '../sim/types';
import type { InstancedPool } from './pool';

/**
 * What makes a monster more than a box: feet, arms, tails, wings and feelers built from small voxels.
 * Coordinates are in the body's own frame: x to its right, y up from the body's centre, z forward.
 */
interface Part {
  at: [number, number, number];
  size: [number, number, number];
  /** a fixed colour, or a shade of the body's colour */
  color: number | 'body' | 'dark' | 'light';
  /** drawn unlit (reads as glowing) */
  glow?: boolean;
  /**
   * leg: steps in the walk cycle · arm: swings from the shoulder (`at` is the shoulder) · wag: a tail swinging
   * from its front end · flap: wings · orbit: circles the body · sway: tips from side to side
   */
  anim?: 'leg' | 'arm' | 'wag' | 'flap' | 'orbit' | 'sway' | 'jaw';
  /** jaw: the hinge it turns around (same frame as `at`) */
  pivot?: [number, number, number];
  /** phase offset within the animation */
  ph?: number;
  /** turned by this much round the body's own front-to-back axis (a leg that slants up or down) */
  tilt?: number;
  amp?: number;
  /** sway: how far the part rises while an attack winds up (the Kraken's tentacles), slamming down after */
  lift?: number;
}

const PI = Math.PI;
const GOLD = 0xffe14a;

const feet = (x: number, y: number, w: number, h: number, d: number, amp = 0.1): Part[] => [
  { at: [-x, y, 0], size: [w, h, d], color: 'dark', anim: 'leg', ph: 0, amp },
  { at: [x, y, 0], size: [w, h, d], color: 'dark', anim: 'leg', ph: PI, amp },
];
const fourLegs = (x: number, y: number, z: number, w: number, h: number, amp = 0.12): Part[] => [
  { at: [-x, y, z], size: [w, h, w], color: 'dark', anim: 'leg', ph: 0, amp },
  { at: [x, y, z], size: [w, h, w], color: 'dark', anim: 'leg', ph: PI, amp },
  { at: [-x, y, -z], size: [w, h, w], color: 'dark', anim: 'leg', ph: PI, amp },
  { at: [x, y, -z], size: [w, h, w], color: 'dark', anim: 'leg', ph: 0, amp },
];
const arms = (x: number, y: number, w: number, h: number, color: Part['color'] = 'dark', amp = 0.6): Part[] => [
  { at: [-x, y, 0], size: [w, h, w], color, anim: 'arm', ph: PI, amp },
  { at: [x, y, 0], size: [w, h, w], color, anim: 'arm', ph: 0, amp },
];

/**
 * A spider's eight legs, each in three slanted pieces: up from the body to a high knee, down and out to the
 * floor well outside it, and a small foot. They step in two groups of four, like a real one's. `reach`: how far
 * out the feet stand, `rise`: how high the knees are over the body's middle, `foot`: how far under it the feet
 * are; `at`: where the four pairs leave the body along its length; `thick`: how thick a leg is; `knee`: the
 * colour of the bands at the knees.
 */
function spiderLegs(reach: number, rise: number, foot: number, at: number[], thick: number, knee: number): Part[] {
  const legs: Part[] = [];
  const hip = reach * 0.24, kneeX = reach * 0.62;
  at.forEach((z, i) => {
    for (const side of [-1, 1]) {
      const ph = (i % 2 === 0) === side > 0 ? 0 : PI;
      // the front pairs reach forward, the back pairs back
      const splay = (1.5 - i) * reach * 0.24;
      const anim = { anim: 'leg' as const, ph, amp: reach * 0.15 };
      const piece = (x0: number, y0: number, x1: number, y1: number, zAt: number, t: number, color: Part['color']): Part => ({
        at: [(side * (x0 + x1)) / 2, (y0 + y1) / 2, zAt],
        size: [Math.hypot(x1 - x0, y1 - y0) + t * 0.5, t, t],
        color,
        tilt: side * Math.atan2(y1 - y0, x1 - x0),
        ...anim,
      });
      legs.push(piece(hip, 0, kneeX, rise, z + splay * 0.45, thick * 1.25, 'dark'));
      legs.push({ at: [side * kneeX, rise, z + splay * 0.6], size: [thick * 1.7, thick * 1.7, thick * 1.7], color: knee, ...anim });
      legs.push(piece(kneeX, rise, reach * 0.94, -foot * 0.45, z + splay * 0.8, thick, 'dark'));
      legs.push({ at: [side * reach * 0.94, -foot * 0.45, z + splay * 0.9], size: [thick * 1.3, thick * 1.3, thick * 1.3], color: knee, ...anim });
      legs.push(piece(reach * 0.94, -foot * 0.45, reach, -foot, z + splay, thick * 0.8, 'body'));
    }
  });
  return legs;
}
export const MONSTER_PARTS: Partial<Record<EnemyKind, Part[]>> = {
  // one of the Tarantula Queen's brood: eight quick legs, two red eyes
  spiderling: [
    ...spiderLegs(0.5, 0.14, 0.26, [0.2, 0.08, -0.04, -0.16], 0.05, 0xd9701e),
    { at: [-0.07, 0.07, 0.31], size: [0.06, 0.06, 0.03], color: 0xff3b3b, glow: true },
    { at: [0.07, 0.07, 0.31], size: [0.06, 0.06, 0.03], color: 0xff3b3b, glow: true },
  ],
  blob: [
    ...feet(0.2, -0.42, 0.2, 0.14, 0.28),
    ...arms(0.42, 0.12, 0.12, 0.3),
    { at: [0, 0.43, 0], size: [0.06, 0.16, 0.06], color: 'dark' },
    { at: [0, 0.56, 0], size: [0.14, 0.14, 0.14], color: GOLD, glow: true, anim: 'sway', amp: 0.3 },
  ],
  hunter: [
    ...fourLegs(0.2, -0.255, 0.28, 0.1, 0.16),
    { at: [-0.15, 0.25, 0.3], size: [0.1, 0.16, 0.08], color: 'light' },
    { at: [0.15, 0.25, 0.3], size: [0.1, 0.16, 0.08], color: 'light' },
    { at: [0, 0.05, -0.56], size: [0.08, 0.08, 0.3], color: 'dark', anim: 'wag', amp: 0.7 },
  ],
  tank: [
    ...feet(0.35, -0.625, 0.36, 0.2, 0.5, 0.08),
    ...arms(0.74, 0.3, 0.26, 0.62, 'dark', 0.35),
    { at: [-0.72, 0.4, 0], size: [0.34, 0.2, 0.42], color: 'light' },
    { at: [0.72, 0.4, 0], size: [0.34, 0.2, 0.42], color: 'light' },
  ],
  splitter: [
    ...feet(0.22, -0.46, 0.22, 0.12, 0.3),
    // the core that shows through the gap between its halves
    { at: [0, 0, 0], size: [0.1, 0.5, 0.5], color: GOLD, glow: true },
    { at: [-0.2, 0.5, 0.15], size: [0.06, 0.22, 0.06], color: 'light', anim: 'sway', amp: 0.25 },
    { at: [0.2, 0.5, 0.15], size: [0.06, 0.22, 0.06], color: 'light', anim: 'sway', ph: PI, amp: 0.25 },
    { at: [-0.2, 0.64, 0.15], size: [0.1, 0.1, 0.1], color: GOLD, glow: true, anim: 'sway', amp: 0.25 },
    { at: [0.2, 0.64, 0.15], size: [0.1, 0.1, 0.1], color: GOLD, glow: true, anim: 'sway', ph: PI, amp: 0.25 },
  ],
  splitling: feet(0.12, -0.24, 0.12, 0.06, 0.16, 0.06),
  shooter: [
    ...feet(0.14, -0.57, 0.14, 0.14, 0.2),
    // a cannon for an arm
    { at: [0.36, 0.05, 0.18], size: [0.14, 0.14, 0.5], color: 0x1c6f66 },
    { at: [0.36, 0.05, 0.46], size: [0.18, 0.18, 0.08], color: 0xff5a3b, glow: true },
    { at: [-0.34, 0.25, 0], size: [0.1, 0.36, 0.1], color: 'dark', anim: 'arm', amp: 0.5 },
    // a dish on its head
    { at: [0, 0.56, 0], size: [0.05, 0.14, 0.05], color: 'dark' },
    { at: [0, 0.65, 0], size: [0.28, 0.05, 0.28], color: 'light', anim: 'sway', amp: 0.2 },
  ],
  bomber: [
    ...feet(0.2, -0.37, 0.16, 0.14, 0.24, 0.16),
    // arms up in panic
    { at: [-0.42, 0.25, 0], size: [0.1, 0.34, 0.1], color: 'dark', anim: 'sway', amp: 0.5 },
    { at: [0.42, 0.25, 0], size: [0.1, 0.34, 0.1], color: 'dark', anim: 'sway', ph: PI, amp: 0.5 },
  ],
  rammer: [
    ...fourLegs(0.4, -0.5, 0.42, 0.24, 0.2),
    { at: [0, 0.1, -0.8], size: [0.12, 0.12, 0.3], color: 'dark', anim: 'wag', amp: 0.5 },
    // a bumper plate on its nose
    { at: [0, -0.05, 0.68], size: [0.9, 0.5, 0.08], color: 'light' },
  ],
  swarmer: [
    { at: [-0.45, 0.05, 0], size: [0.42, 0.04, 0.3], color: 'light', anim: 'flap', amp: 0.7 },
    { at: [0.45, 0.05, 0], size: [0.42, 0.04, 0.3], color: 'light', anim: 'flap', amp: 0.7 },
    { at: [0, -0.02, -0.3], size: [0.06, 0.06, 0.2], color: GOLD },
  ],
  shielder: [
    ...feet(0.2, -0.495, 0.18, 0.14, 0.26),
    // a helmet crest, and the arm that holds the shield
    { at: [0, 0.5, 0], size: [0.1, 0.16, 0.5], color: 0xff5a5f },
    { at: [0.3, 0, 0.32], size: [0.12, 0.12, 0.3], color: 'dark' },
  ],
  healer: [
    ...feet(0.14, -0.435, 0.14, 0.12, 0.2),
    // arms raised, a medic's pack on the back
    { at: [-0.36, 0.2, 0], size: [0.1, 0.34, 0.1], color: 'light', anim: 'sway', amp: 0.35 },
    { at: [0.36, 0.2, 0], size: [0.1, 0.34, 0.1], color: 'light', anim: 'sway', ph: PI, amp: 0.35 },
    { at: [0, 0.05, -0.34], size: [0.36, 0.4, 0.14], color: 0xffffff },
    { at: [0, 0.05, -0.42], size: [0.24, 0.08, 0.02], color: 0xff3b3b },
    { at: [0, 0.05, -0.42], size: [0.08, 0.24, 0.02], color: 0xff3b3b },
  ],
  teleporter: [
    { at: [0, -0.45, 0], size: [0.3, 0.16, 0.3], color: 'dark', anim: 'sway', amp: 0.3 },
    { at: [0, -0.62, 0], size: [0.16, 0.12, 0.16], color: 'dark', anim: 'sway', ph: PI, amp: 0.4 },
    { at: [0, 0.05, 0], size: [0.14, 0.14, 0.14], color: 0xd8ccff, glow: true, anim: 'orbit', ph: 0, amp: 0.58 },
    { at: [0, 0.05, 0], size: [0.14, 0.14, 0.14], color: 0xd8ccff, glow: true, anim: 'orbit', ph: PI, amp: 0.58 },
  ],
  croc: [
    // four short legs splayed out to the sides, each with a clawed foot
    ...[[-1, 0.42, 0], [1, 0.42, PI], [-1, -0.45, PI], [1, -0.45, 0]].flatMap(([side, z, ph]): Part[] => [
      { at: [side * 0.48, -0.14, z], size: [0.3, 0.12, 0.15], color: 'body', anim: 'leg', ph, amp: 0.1 },
      { at: [side * 0.62, -0.24, z + 0.04], size: [0.16, 0.12, 0.22], color: 'dark', anim: 'leg', ph, amp: 0.1 },
      { at: [side * 0.62, -0.28, z + 0.17], size: [0.14, 0.04, 0.05], color: 0xf2f0e6, anim: 'leg', ph, amp: 0.1 },
    ]),
    // the tail: two pieces, sweeping
    { at: [0, -0.1, -1.18], size: [0.3, 0.2, 0.5], color: 'body', anim: 'wag', amp: 0.45 },
    { at: [0, -0.12, -1.5], size: [0.18, 0.14, 0.4], color: 'dark', anim: 'wag', ph: 0.6, amp: 0.7 },
    // the lower jaw hinged under the eyes, with its teeth: it opens before a lunge and snaps during one
    { at: [0, -0.2, 0.68], size: [0.5, 0.1, 0.66], color: 'light', anim: 'jaw', pivot: [0, -0.15, 0.36] },
    ...[0.52, 0.68, 0.84].flatMap((z): Part[] => [
      { at: [-0.2, -0.11, z], size: [0.05, 0.1, 0.05], color: 0xffffff, anim: 'jaw', pivot: [0, -0.15, 0.36] },
      { at: [0.2, -0.11, z], size: [0.05, 0.1, 0.05], color: 0xffffff, anim: 'jaw', pivot: [0, -0.15, 0.36] },
    ]),
    // the upper teeth along the snout, and a red mouth inside
    ...[0.48, 0.62, 0.76, 0.9].flatMap((z): Part[] => [
      { at: [-0.25, -0.2, z], size: [0.05, 0.09, 0.05], color: 0xffffff },
      { at: [0.25, -0.2, z], size: [0.05, 0.09, 0.05], color: 0xffffff },
    ]),
    { at: [0, -0.17, 0.55], size: [0.36, 0.04, 0.4], color: 0xc0303a },
  ],
  monkey: [
    ...feet(0.16, -0.51, 0.16, 0.12, 0.24),
    // long arms that swing, big ears, a curly tail
    ...arms(0.41, 0.1, 0.11, 0.55, 'dark', 0.9),
    { at: [-0.42, 0.28, 0], size: [0.12, 0.2, 0.1], color: 'light' },
    { at: [0.42, 0.28, 0], size: [0.12, 0.2, 0.1], color: 'light' },
    { at: [0, -0.2, -0.3], size: [0.07, 0.07, 0.45], color: 'dark', anim: 'wag', amp: 0.9 },
  ],
  trex: [
    // strong legs: thigh, shin and a clawed foot, stepping together
    ...[-1, 1].flatMap((side): Part[] => {
      const ph = side < 0 ? 0 : PI;
      return [
        { at: [side * 0.42, -0.62, -0.05], size: [0.34, 0.5, 0.46], color: 'body', anim: 'leg', ph, amp: 0.16 },
        { at: [side * 0.44, -0.98, 0.02], size: [0.22, 0.4, 0.24], color: 'dark', anim: 'leg', ph, amp: 0.16 },
        { at: [side * 0.44, -1.22, 0.12], size: [0.3, 0.14, 0.52], color: 'dark', anim: 'leg', ph, amp: 0.16 },
        ...[-0.1, 0, 0.1].map((x): Part => ({ at: [side * 0.44 + x, -1.24, 0.42], size: [0.06, 0.08, 0.1], color: 0xf2f0e6, anim: 'leg', ph, amp: 0.16 })),
      ];
    }),
    // a long tail as counterweight, three pieces that sweep
    { at: [0, -0.25, -0.72], size: [0.5, 0.42, 0.6], color: 'body', anim: 'wag', amp: 0.25 },
    { at: [0, -0.22, -1.2], size: [0.34, 0.3, 0.55], color: 'body', anim: 'wag', ph: 0.5, amp: 0.4 },
    { at: [0, -0.2, -1.6], size: [0.2, 0.18, 0.5], color: 'dark', anim: 'wag', ph: 1, amp: 0.55 },
    // tiny arms that come up before a stomp
    { at: [-0.42, 0.12, 0.42], size: [0.1, 0.3, 0.1], color: 'dark', anim: 'arm', ph: PI, amp: 0.5 },
    { at: [0.42, 0.12, 0.42], size: [0.1, 0.3, 0.1], color: 'dark', anim: 'arm', amp: 0.5 },
    // the lower jaw, hinged under the brow: a trough with a chin, rims that carry the teeth, a dark mouth and a
    // red tongue. It gapes before a stomp and chomps on it
    ...((): Part[] => {
      const jaw = (at: Part['at'], size: Part['size'], color: Part['color']): Part => ({ at, size, color, anim: 'jaw', pivot: [0, 0.42, 0.42] });
      return [
        jaw([0, 0.33, 0.78], [0.46, 0.12, 0.7], 'body'),
        jaw([0, 0.26, 0.7], [0.34, 0.07, 0.5], 'light'),
        jaw([-0.2, 0.41, 0.8], [0.07, 0.08, 0.66], 'body'),
        jaw([0.2, 0.41, 0.8], [0.07, 0.08, 0.66], 'body'),
        jaw([0, 0.41, 1.11], [0.4, 0.08, 0.06], 'body'),
        jaw([0, 0.395, 0.76], [0.33, 0.03, 0.6], 0x7a1c26),
        jaw([0, 0.42, 0.7], [0.2, 0.05, 0.42], 0xd9414e),
        // its teeth stand on the rims, between the upper ones
        ...[0.54, 0.7, 0.86, 1.01].flatMap(z => [jaw([-0.2, 0.49, z], [0.05, 0.09, 0.05], 0xffffff), jaw([0.2, 0.49, z], [0.05, 0.09, 0.05], 0xffffff)]),
        jaw([-0.08, 0.49, 1.11], [0.05, 0.08, 0.05], 0xffffff),
        jaw([0.08, 0.49, 1.11], [0.05, 0.08, 0.05], 0xffffff),
      ];
    })(),
    // the roof of the mouth
    { at: [0, 0.545, 0.8], size: [0.36, 0.02, 0.6], color: 0x7a1c26 },
    // the upper teeth
    ...[0.62, 0.78, 0.94, 1.08].flatMap((z): Part[] => [
      { at: [-0.22, 0.52, z], size: [0.06, 0.12, 0.06], color: 0xffffff },
      { at: [0.22, 0.52, z], size: [0.06, 0.12, 0.06], color: 0xffffff },
    ]),
  ],
  fish: [
    { at: [0, 0, -0.4], size: [0.06, 0.32, 0.22], color: 'light', anim: 'wag', amp: 0.8 },
    { at: [0, 0.23, 0], size: [0.04, 0.12, 0.24], color: 'dark' },
  ],
  shark: [
    // the fin on its back, a tail that sweeps, side fins
    { at: [0, 0.45, -0.1], size: [0.08, 0.38, 0.32], color: 'dark' },
    { at: [0, 0.05, -0.95], size: [0.08, 0.5, 0.3], color: 'dark', anim: 'wag', amp: 0.6 },
    { at: [-0.42, -0.12, 0.15], size: [0.3, 0.05, 0.22], color: 'dark' },
    { at: [0.42, -0.12, 0.15], size: [0.3, 0.05, 0.22], color: 'dark' },
    // the lower jaw that gapes before a charge, teeth above and below
    { at: [0, -0.24, 0.6], size: [0.34, 0.1, 0.42], color: 'light', anim: 'jaw', pivot: [0, -0.2, 0.4] },
    ...[0.5, 0.64, 0.78].flatMap((z): Part[] => [
      { at: [-0.12, -0.16, z], size: [0.05, 0.08, 0.05], color: 0xffffff, anim: 'jaw', pivot: [0, -0.2, 0.4] },
      { at: [0.12, -0.16, z], size: [0.05, 0.08, 0.05], color: 0xffffff, anim: 'jaw', pivot: [0, -0.2, 0.4] },
      { at: [-0.14, -0.08, z], size: [0.05, 0.08, 0.05], color: 0xffffff },
      { at: [0.14, -0.08, z], size: [0.05, 0.08, 0.05], color: 0xffffff },
    ]),
  ],
  kraken: [
    // eight long, thick tentacles fanning out around it, each in five pieces that thin out and wave, with
    // light suckers along the underside
    ...Array.from({ length: 8 }, (_, i): Part[] => {
      const a = (i / 8) * Math.PI * 2;
      return [1.6, 2.3, 3.0, 3.65, 4.25].flatMap((r, k): Part[] => [
        {
          at: [Math.cos(a) * r, -0.95 + k * 0.08, Math.sin(a) * r],
          size: [0.85 - k * 0.14, 0.6 - k * 0.09, 0.85 - k * 0.14],
          color: k >= 3 ? 'light' : 'body',
          anim: 'sway',
          ph: i * 0.8 + k * 0.6,
          amp: 0.2 + k * 0.08,
          // the tentacles rear up while an attack is telegraphed and slam down when it lands
          lift: 0.3 + k * 0.28,
        },
        { at: [Math.cos(a) * r, -1.22 + k * 0.08, Math.sin(a) * r], size: [0.3 - k * 0.04, 0.06, 0.3 - k * 0.04], color: 0xffd0e4, anim: 'sway', ph: i * 0.8 + k * 0.6, amp: 0.2 + k * 0.08, lift: 0.3 + k * 0.28 },
      ]);
    }).flat(),
    // a beak under the eyes: the lower half snaps with the attacks
    { at: [0, -0.42, 1.42], size: [0.5, 0.26, 0.44], color: 0x3a1a3a },
    { at: [0, -0.5, 1.68], size: [0.3, 0.16, 0.2], color: 0x3a1a3a },
    { at: [0, -0.7, 1.42], size: [0.44, 0.18, 0.4], color: 0x2a1030, anim: 'jaw', pivot: [0, -0.62, 1.1] },
    { at: [0, -0.68, 1.66], size: [0.26, 0.12, 0.18], color: 0x2a1030, anim: 'jaw', pivot: [0, -0.62, 1.1] },
  ],
  phantom: [
    { at: [-0.24, -0.5, 0], size: [0.18, 0.18, 0.6], color: 'light', anim: 'sway', amp: 0.4 },
    { at: [0.24, -0.5, 0], size: [0.18, 0.18, 0.6], color: 'light', anim: 'sway', ph: PI, amp: 0.4 },
  ],
  ghost: [
    { at: [-0.27, -0.5, 0], size: [0.22, 0.2, 0.8], color: 'body', anim: 'sway', amp: 0.3 },
    { at: [0, -0.5, 0], size: [0.22, 0.2, 0.8], color: 'body', anim: 'sway', ph: PI * 0.66, amp: 0.3 },
    { at: [0.27, -0.5, 0], size: [0.22, 0.2, 0.8], color: 'body', anim: 'sway', ph: PI * 1.33, amp: 0.3 },
  ],
};

/** how far the body is lifted off the ground to stand on its legs (tiles, before scaling) */
export const MONSTER_LIFT: Partial<Record<EnemyKind, number>> = {
  spiderling: 0.12,
  blob: 0.14,
  hunter: 0.16,
  tank: 0.2,
  splitter: 0.12,
  splitling: 0.06,
  shooter: 0.14,
  bomber: 0.14,
  rammer: 0.2,
  shielder: 0.14,
  healer: 0.12,
  croc: 0.12,
  monkey: 0.12,
  trex: 0.3,
};

function shade(base: number, how: Part['color']): number {
  if (typeof how === 'number') return how;
  if (how === 'body') return base;
  const r = (base >> 16) & 255, g = (base >> 8) & 255, b = base & 255;
  const mix = how === 'dark' ? (c: number) => Math.round(c * 0.62) : (c: number) => Math.round(c + (255 - c) * 0.4);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

export interface PartPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** the body's scale along its own axes (squash and stretch included) */
  sx: number;
  sy: number;
  sz: number;
  lean: number;
  tilt: number;
  /** flash, frozen or slowed: overrides every part's colour */
  tint: number | undefined;
  /** 0 = at rest, 1 = winding up an attack, above 1 = in the attack (a jaw snaps) */
  attack?: number;
  /** the walk cycle (radians), the clock, and whether the monster is held still */
  phase: number;
  time: number;
  still: boolean;
}

/** Adds the parts of one monster to the pools (lit ones and glowing ones). */
/**
 * The Rhino (a rammer in the rules, with a body of its own) wears these: thick legs, a big horn and
 * a small one on its nose, ears, a heavy brow and a short tail.
 */
const SPIDER_ORANGE = 0xd9701e;
/** how far the Tarantula Queen's body is lifted on her legs */
export const SPIDER_LIFT = 0.28;
export const SPIDER_PARTS: Part[] = [
  ...spiderLegs(1.75, 0.5, 0.82, [0.62, 0.3, -0.02, -0.34], 0.15, SPIDER_ORANGE),
  // the two feelers beside her jaws, and the fangs under them, which rise before she strikes
  { at: [-0.26, -0.28, 1.34], size: [0.14, 0.14, 0.42], color: 'dark', anim: 'sway', amp: 0.12 },
  { at: [0.26, -0.28, 1.34], size: [0.14, 0.14, 0.42], color: 'dark', anim: 'sway', ph: PI, amp: 0.12 },
  { at: [-0.13, -0.34, 1.22], size: [0.16, 0.2, 0.2], color: 'dark' },
  { at: [0.13, -0.34, 1.22], size: [0.16, 0.2, 0.2], color: 'dark' },
  { at: [-0.13, -0.56, 1.26], size: [0.08, 0.3, 0.08], color: 0xf2ead8, anim: 'sway', amp: 0.1, lift: 0.14 },
  { at: [0.13, -0.56, 1.26], size: [0.08, 0.3, 0.08], color: 0xf2ead8, anim: 'sway', ph: PI, amp: 0.1, lift: 0.14 },
  // eight eyes: two big ones in front, the others round them
  { at: [-0.14, 0.2, 1.22], size: [0.13, 0.13, 0.05], color: 0xff3b3b, glow: true },
  { at: [0.14, 0.2, 1.22], size: [0.13, 0.13, 0.05], color: 0xff3b3b, glow: true },
  ...[[-0.33, 0.24, 1.14], [0.33, 0.24, 1.14], [-0.2, 0.36, 1.1], [0.2, 0.36, 1.1], [-0.4, 0.34, 1.0], [0.4, 0.34, 1.0]].map(([x, y, z]): Part => ({ at: [x, y, z], size: [0.07, 0.07, 0.05], color: 0xff7a5a, glow: true })),
  // the spinnerets at her rear
  { at: [-0.1, -0.1, -1.36], size: [0.1, 0.1, 0.2], color: 'dark', anim: 'wag', amp: 0.3 },
  { at: [0.1, -0.1, -1.36], size: [0.1, 0.1, 0.2], color: 'dark', anim: 'wag', ph: PI, amp: 0.3 },
];

/** how far the Rhino's body is lifted for its legs */
export const RHINO_LIFT = 0.23;
export const RHINO_PARTS: Part[] = [
  // thick legs under the shoulders and the hips
  { at: [-0.3, -0.5, 0.1], size: [0.26, 0.36, 0.26], color: 'dark', anim: 'leg', ph: 0, amp: 0.1 },
  { at: [0.3, -0.5, 0.1], size: [0.26, 0.36, 0.26], color: 'dark', anim: 'leg', ph: PI, amp: 0.1 },
  { at: [-0.3, -0.5, -0.58], size: [0.26, 0.36, 0.26], color: 'dark', anim: 'leg', ph: PI, amp: 0.1 },
  { at: [0.3, -0.5, -0.58], size: [0.26, 0.36, 0.26], color: 'dark', anim: 'leg', ph: 0, amp: 0.1 },
  // a thin tail
  { at: [0, 0.05, -0.84], size: [0.06, 0.06, 0.22], color: 'dark', anim: 'wag', amp: 0.5 },
  // the horns on its snout: the big one in three steps that taper, a small one behind it
  { at: [0, 0.14, 0.68], size: [0.2, 0.2, 0.2], color: 0xf2ead8 },
  { at: [0, 0.32, 0.72], size: [0.14, 0.2, 0.14], color: 0xf2ead8 },
  { at: [0, 0.48, 0.75], size: [0.08, 0.16, 0.08], color: 0xfff8ea },
  { at: [0, 0.2, 0.46], size: [0.13, 0.16, 0.13], color: 0xf2ead8 },
  // ears that twitch
  { at: [-0.2, 0.28, 0.27], size: [0.1, 0.18, 0.08], color: 'dark', anim: 'sway', amp: 0.15 },
  { at: [0.2, 0.28, 0.27], size: [0.1, 0.18, 0.08], color: 'dark', anim: 'sway', ph: PI, amp: 0.15 },
];

/**
 * The Segment Worm is a giant centipede: a head with pincers and feelers, a body of segments that each have a
 * pair of legs, a back spike and glowing spots, and a tail that ends in a stinger.
 */
const WORM_GLOW = 0x7dfcff;
const wormLegs: Part[] = [
  { at: [-0.6, -0.36, 0], size: [0.3, 0.1, 0.14], color: 'dark', anim: 'leg', ph: 0, amp: 0.16 },
  { at: [0.6, -0.36, 0], size: [0.3, 0.1, 0.14], color: 'dark', anim: 'leg', ph: PI, amp: 0.16 },
];
export const WORM_PARTS: Record<'head' | 'body' | 'tail', Part[]> = {
  head: [
    ...wormLegs,
    // pincers that open and close, feelers with glowing tips, a crest
    { at: [-0.3, -0.2, 0.62], size: [0.12, 0.12, 0.4], color: 'light', anim: 'wag', amp: 0.35 },
    { at: [0.3, -0.2, 0.62], size: [0.12, 0.12, 0.4], color: 'light', anim: 'wag', ph: PI, amp: 0.35 },
    { at: [-0.24, 0.6, 0.3], size: [0.06, 0.36, 0.06], color: 'dark', anim: 'sway', amp: 0.3 },
    { at: [0.24, 0.6, 0.3], size: [0.06, 0.36, 0.06], color: 'dark', anim: 'sway', ph: PI, amp: 0.3 },
    { at: [-0.24, 0.82, 0.3], size: [0.12, 0.12, 0.12], color: WORM_GLOW, glow: true, anim: 'sway', amp: 0.3 },
    { at: [0.24, 0.82, 0.3], size: [0.12, 0.12, 0.12], color: WORM_GLOW, glow: true, anim: 'sway', ph: PI, amp: 0.3 },
    { at: [0, 0.48, -0.1], size: [0.5, 0.12, 0.6], color: 'light' },
    // a crest of two short spikes
    { at: [0, 0.62, -0.25], size: [0.2, 0.18, 0.2], color: 0xf2ead8 },
    { at: [0, 0.78, -0.25], size: [0.1, 0.16, 0.1], color: 0xfff8ea },
  ],
  body: [
    ...wormLegs,
    { at: [0, 0.47, 0], size: [0.6, 0.1, 0.5], color: 'light' },
    // a tall bone spike on every segment, in two steps that taper
    { at: [0, 0.62, 0], size: [0.24, 0.22, 0.24], color: 0xf2ead8 },
    { at: [0, 0.84, 0], size: [0.14, 0.24, 0.14], color: 0xfff8ea },
    { at: [0, 1.0, 0], size: [0.07, 0.12, 0.07], color: 0xffffff },
    { at: [-0.49, 0.08, 0], size: [0.04, 0.18, 0.18], color: WORM_GLOW, glow: true },
    { at: [0.49, 0.08, 0], size: [0.04, 0.18, 0.18], color: WORM_GLOW, glow: true },
  ],
  tail: [
    ...wormLegs,
    { at: [0, 0.47, 0], size: [0.6, 0.1, 0.5], color: 'light' },
    // the stinger
    { at: [0, 0.1, -0.7], size: [0.16, 0.16, 0.5], color: 'light', anim: 'wag', amp: 0.6 },
    { at: [0, 0.1, -1.0], size: [0.1, 0.1, 0.2], color: WORM_GLOW, glow: true, anim: 'wag', amp: 0.6 },
  ],
};

export function addMonsterParts(lit: InstancedPool, glow: InstancedPool, kind: EnemyKind, bodyColor: number, id: number, p: PartPose, override?: Part[]): void {
  const parts = override ?? MONSTER_PARTS[kind];
  if (!parts) return;
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  for (const part of parts) {
    let [lx, ly, lz] = part.at;
    let rx = p.lean, ry = p.yaw, rz = p.tilt + (part.tilt ?? 0);
    const amp = part.amp ?? 0.1;
    const ph = part.ph ?? 0;
    switch (part.anim) {
      case 'leg':
        if (!p.still) {
          lz += Math.sin(p.phase + ph) * amp;
          ly += Math.max(0, Math.cos(p.phase + ph)) * amp * 0.6;
        }
        break;
      case 'arm': {
        // hangs from the shoulder and swings with the steps; thrown up before an attack, down as it lands
        const a = p.attack === 1 ? -1.4 - 0.1 * Math.sin(p.time * 16) : p.attack && p.attack > 1 ? 0.7 : p.still ? 0 : Math.sin(p.phase + ph) * amp;
        ly -= (part.size[1] / 2) * Math.cos(a);
        lz -= (part.size[1] / 2) * Math.sin(a);
        rx += a;
        break;
      }
      case 'wag': {
        const a = Math.sin(p.time * 10 + id) * amp;
        lx -= (part.size[2] / 2) * Math.sin(a);
        lz += (part.size[2] / 2) * (1 - Math.cos(a));
        ry += a;
        break;
      }
      case 'flap':
        rz += Math.sin(p.time * 34 + id) * amp * Math.sign(part.at[0]);
        break;
      case 'orbit': {
        const a = p.time * 4 + ph + id;
        lx = Math.cos(a) * amp;
        lz = Math.sin(a) * amp;
        ly += Math.sin(p.time * 3 + ph) * 0.12;
        break;
      }
      case 'sway':
        rz += Math.sin(p.time * 5 + id + ph) * amp * (p.attack === 1 ? 2 : 1);
        if (part.lift && p.attack) ly += p.attack <= 1 ? part.lift * (0.8 + 0.2 * Math.sin(p.time * 9 + ph)) : -part.lift * 0.12;
        break;
      case 'jaw': {
        // wide open while winding up, snapping shut again and again during the attack
        const a = p.attack === undefined || p.attack === 0 ? 0.08 : p.attack <= 1 ? 0.75 : 0.45 * Math.abs(Math.sin(p.time * 22));
        const [, py, pz] = part.pivot ?? [lx, ly, lz];
        const dy = ly - py, dz = lz - pz;
        // turn around the hinge: the front drops
        ly = py + dy * Math.cos(a) - dz * Math.sin(a);
        lz = pz + dy * Math.sin(a) + dz * Math.cos(a);
        // (the piece turns the same way it swings, so the teeth stay upright on the jaw)
        rx += a;
        break;
      }
    }
    const wx = p.x + lx * p.sx * c + lz * p.sz * sn;
    const wz = p.z - lx * p.sx * sn + lz * p.sz * c;
    (part.glow ? glow : lit).addScaled(wx, p.y + ly * p.sy, wz, ry, part.size[0] * p.sx, part.size[1] * p.sy, part.size[2] * p.sz, p.tint ?? shade(bodyColor, part.color), rx, rz);
  }
}
