/**
 * The colours that carry meaning (teams, health, shots, warnings), in one place so colour-blind mode
 * switches them all at once. Renderers and the HUD read palette() every frame, so a switch shows at once.
 */

export interface Palette {
  /** suit colours 0–9 (a player's `color` indexes this) */
  players: readonly number[];
  /** team 0 and team 1; the sim dresses team 0 in suit 1 and team 1 in suit 0 */
  teams: readonly [number, number];
  /** a second cue beside the colour: a shape over each team player, on the minimap and in the HUD text */
  teamMarks: boolean;
  /** monster shots against the players' own bolts */
  hostileShot: number;
  playerShot: number;
  /** monster eyes, and the eyes the moment before an attack */
  eyes: number;
  angryEyes: number;
  /** telegraphs on the floor: a charge lane, a blast ring */
  warn: number;
  /** warnings and angry eyes blink hard on and off, so they read by brightness and motion, not hue */
  blinkWarnings: boolean;
  /** the "no monsters" sign on the glitch floor (CSS colour, painted into its texture) */
  glitchSign: string;
  /** health bar fill at 0..1 */
  health(frac: number): number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function hsl(h: number, s: number, l: number): number {
  // the same conversion THREE.Color.setHSL does, kept here so tests need no three.js
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

export const NORMAL: Palette = {
  players: [0x3d8bfd, 0xff5a5f, 0x3bd16f, 0xffb020, 0xb15cff, 0x2bd4d4, 0xff6fd8, 0xe8e8f0, 0xb8e04a, 0xb0703c],
  teams: [0xff5a5f, 0x3d8bfd],
  teamMarks: false,
  hostileShot: 0xff3b3b,
  playerShot: 0xfff27a,
  eyes: 0xfff27a,
  angryEyes: 0xff2b2b,
  warn: 0xff2b4b,
  blinkWarnings: false,
  glitchSign: '#ff2a4a',
  health: f => hsl(0.33 * clamp01(f), 0.85, 0.5),
};

/**
 * Built for red-green colour blindness (the common kinds): blue against orange instead of red against
 * green, health that also gets darker as it drops, and warnings that blink.
 */
export const COLOR_BLIND: Palette = {
  // red becomes orange; the old orange moves to yellow so the two stay apart
  players: [0x3d8bfd, 0xff8c1a, 0x3bd16f, 0xffe14a, 0xb15cff, 0x2bd4d4, 0xff6fd8, 0xe8e8f0, 0xb8e04a, 0xb0703c],
  teams: [0xff8c1a, 0x3d8bfd],
  teamMarks: true,
  // monster shots: violet, darker than the bright yellow bolts of the players
  hostileShot: 0xb04cff,
  playerShot: 0xfff27a,
  eyes: 0xfff27a,
  angryEyes: 0xff2bd6,
  warn: 0xffffff,
  blinkWarnings: true,
  glitchSign: '#ffe14a',
  // light sky blue when healthy, through grey-violet, to a dark burnt orange when nearly gone
  health: f => (f >= 0.5 ? mix(0x7a6cc0, 0x9fe2ff, (clamp01(f) - 0.5) * 2) : mix(0x7a2e00, 0x7a6cc0, clamp01(f) * 2)),
};

let current: Palette = NORMAL;

export function setColorBlind(on: boolean): void {
  current = on ? COLOR_BLIND : NORMAL;
}

export function palette(): Palette {
  return current;
}

export function isColorBlind(): boolean {
  return current === COLOR_BLIND;
}

export function playerColor(i: number): number {
  return current.players[((i % current.players.length) + current.players.length) % current.players.length];
}

export const cssColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** the shapes that mark team 0 and team 1 when teamMarks is on */
export const TEAM_SYMBOLS = ['▲', '●'] as const;

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** relative luminance (WCAG), 0 = black, 1 = white */
export function luminance(c: number): number {
  return 0.2126 * linear((c >> 16) & 255) + 0.7152 * linear((c >> 8) & 255) + 0.0722 * linear(c & 255);
}

/** WCAG contrast ratio, 1..21 */
export function contrast(a: number, b: number): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hue(c: number): number {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** how far apart two colours are around the colour wheel, 0..180 degrees */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}
