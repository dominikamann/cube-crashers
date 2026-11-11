/** Look A1 (day with neon accents) and A2 (night voxel), see docs/design/style-reference.html. */
export interface Theme {
  background: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  roadA: number;
  roadB: number;
  grassA: number;
  grassB: number;
  laneEdge: number;
  laneEdgeIntensity: number;
  /** how strongly emissive accents glow */
  glow: number;
  /** intensity of point lights at the player and towers */
  pointLights: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
}

export const THEMES: { day: Theme; night: Theme } = {
  day: {
    background: 0x9fd8ef,
    fogNear: 22,
    fogFar: 48,
    hemiSky: 0xffffff,
    hemiGround: 0x88aa66,
    hemiIntensity: 1.1,
    sunColor: 0xffffff,
    sunIntensity: 1.6,
    roadA: 0xeadcb4,
    roadB: 0xe0d1a5,
    grassA: 0x7cc56a,
    grassB: 0x6db85c,
    laneEdge: 0x2bf0ff,
    laneEdgeIntensity: 0.6,
    glow: 1,
    pointLights: 0,
    bloomStrength: 0.25,
    bloomRadius: 0.15,
    bloomThreshold: 0.95,
  },
  night: {
    background: 0x1a1840,
    fogNear: 24,
    fogFar: 50,
    hemiSky: 0x8890e0,
    hemiGround: 0x303050,
    hemiIntensity: 1.1,
    sunColor: 0xa0b0ff,
    sunIntensity: 1.1,
    roadA: 0x4a4880,
    roadB: 0x423f78,
    grassA: 0x2d5a5a,
    grassB: 0x264f4f,
    laneEdge: 0x2bf0ff,
    laneEdgeIntensity: 3,
    glow: 2.2,
    pointLights: 1,
    bloomStrength: 0.45,
    bloomRadius: 0.15,
    bloomThreshold: 0.6,
  },
};

const COLOR_KEYS = new Set<keyof Theme>([
  'background',
  'hemiSky',
  'hemiGround',
  'sunColor',
  'roadA',
  'roadB',
  'grassA',
  'grassB',
  'laneEdge',
]);

function mixColor(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 255, cb = (b >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

export function blendTheme(a: Theme, b: Theme, t: number): Theme {
  if (t <= 0) return { ...a };
  if (t >= 1) return { ...b };
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof Theme)[]) {
    out[key] = COLOR_KEYS.has(key) ? mixColor(a[key], b[key], t) : a[key] + (b[key] - a[key]) * t;
  }
  return out;
}
