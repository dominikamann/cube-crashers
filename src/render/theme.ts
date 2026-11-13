/** Look A1 (day with neon accents) and A2 (night voxel), see docs/design/style-reference.html. */
export interface Theme {
  /** horizon colour (also the fog) */
  background: number;
  /** colour at the top of the sky */
  skyTop: number;
  /** cool light from the side opposite the sun */
  fillColor: number;
  fillIntensity: number;
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
  wallA: number;
  wallB: number;
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
    background: 0xbfe6f5,
    skyTop: 0x4aa3e0,
    fillColor: 0x9fc4ff,
    fillIntensity: 0.45,
    fogNear: 22,
    fogFar: 48,
    hemiSky: 0xffffff,
    hemiGround: 0x88aa66,
    hemiIntensity: 1.1,
    sunColor: 0xfff1d6,
    sunIntensity: 1.7,
    roadA: 0xeadcb4,
    roadB: 0xe0d1a5,
    grassA: 0x7cc56a,
    grassB: 0x6db85c,
    wallA: 0x5b8def,
    wallB: 0x4f7fe0,
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
    skyTop: 0x07061a,
    fillColor: 0x6a5cff,
    fillIntensity: 0.5,
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
    wallA: 0x3d49a8,
    wallB: 0x35409a,
    laneEdge: 0x2bf0ff,
    laneEdgeIntensity: 3,
    glow: 2.2,
    pointLights: 1,
    bloomStrength: 0.3,
    bloomRadius: 0.15,
    bloomThreshold: 0.72,
  },
};

const COLOR_KEYS = new Set<keyof Theme>([
  'background',
  'skyTop',
  'fillColor',
  'hemiSky',
  'hemiGround',
  'sunColor',
  'roadA',
  'roadB',
  'grassA',
  'grassB',
  'wallA',
  'wallB',
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

/** Day and night palettes of each floor theme. Arena, rooftop and shaft get theirs with the bosses. */
export function themeFor(id: string): { day: Theme; night: Theme } {
  switch (id) {
    case 'candy':
      return {
        day: {
          ...THEMES.day,
          background: 0xffe3f1,
          skyTop: 0xff9fcf,
          roadA: 0xfbe2ee,
          roadB: 0xf6d2e4,
          wallA: 0x7fd8c0,
          wallB: 0x6cc9b0,
          hemiGround: 0xd9a6c4,
          sunColor: 0xfff4e8,
        },
        night: THEMES.night,
      };
    case 'neon': {
      const neonNight: Theme = {
        ...THEMES.night,
        background: 0x14102e,
        skyTop: 0x05030f,
        roadA: 0x2f2a5c,
        roadB: 0x29244f,
        wallA: 0x6a2fb8,
        wallB: 0x5a26a0,
        fillColor: 0xff3bd6,
        fillIntensity: 0.6,
        glow: 2.4,
      };
      return { day: neonNight, night: neonNight };
    }
    case 'arena':
      return {
        day: { ...THEMES.day, background: 0xf2d9b0, skyTop: 0xe08a4a, roadA: 0xd9c49c, roadB: 0xcfb88e, wallA: 0x9a7a5a, wallB: 0x8a6c4f, sunColor: 0xffe0b0 },
        night: THEMES.night,
      };
    case 'rooftop':
      return {
        day: { ...THEMES.day, background: 0xffb48a, skyTop: 0x5a3a9a, roadA: 0x8f95a8, roadB: 0x858b9e, wallA: 0x4a5070, wallB: 0x424866, sunColor: 0xffc890, sunIntensity: 1.5 },
        night: THEMES.night,
      };
    case 'maze': {
      // a dark glitch grid: deep blue floor, glowing blue walls
      const mazeLook: Theme = {
        ...THEMES.night,
        background: 0x05051a,
        skyTop: 0x000008,
        roadA: 0x141433,
        roadB: 0x11112d,
        wallA: 0x2a3cff,
        wallB: 0x2433d8,
        fillColor: 0x2bf0ff,
        fillIntensity: 0.4,
        glow: 2.4,
      };
      return { day: mazeLook, night: mazeLook };
    }
    case 'lane': {
      // an arcade hall at night: dark carpet, purple walls, neon trim
      const laneLook: Theme = {
        ...THEMES.night,
        background: 0x1c1238,
        skyTop: 0x07051a,
        roadA: 0x2c2350,
        roadB: 0x271f48,
        wallA: 0x5a2fb0,
        wallB: 0x4f299c,
        fillColor: 0xff2bd6,
        fillIntensity: 0.5,
        glow: 2.2,
      };
      return { day: laneLook, night: laneLook };
    }
    case 'race': {
      // asphalt at dusk: dark road, neon-blue barriers, warm sky on the horizon
      const raceLook: Theme = {
        ...THEMES.night,
        background: 0x2a1f4a,
        skyTop: 0x0a0820,
        roadA: 0x3c3f4f,
        roadB: 0x373a49,
        wallA: 0x1f6fb8,
        wallB: 0x1b62a3,
        fillColor: 0x2bf0ff,
        fillIntensity: 0.55,
        // calmer than the city at night: headlights and neon would flood the track
        glow: 1.1,
        bloomStrength: 0.25,
        bloomThreshold: 0.8,
      };
      return { day: raceLook, night: raceLook };
    }
    case 'waldsee':
      // a summer day in Upper Swabia: grey cobbles, a soft blue sky; at night the lanterns
      return {
        day: { ...THEMES.day, background: 0xcfe6f2, skyTop: 0x5aa9e0, roadA: 0xc9c3b6, roadB: 0xc0baad, hemiGround: 0x7fae66, sunColor: 0xfff2dc, fogNear: 30, fogFar: 70 },
        night: { ...THEMES.night, roadA: 0x55566a, roadB: 0x4e4f62 },
      };
    case 'jungle':
      // deep greens under a warm, misty sky
      return {
        day: { ...THEMES.day, background: 0xcfe8b0, skyTop: 0x6fbf6a, roadA: 0x8fbf5a, roadB: 0x84b451, wallA: 0x7a5a3a, wallB: 0x6b4e32, hemiGround: 0x4a7a3a, sunColor: 0xfff0c0, fogNear: 18, fogFar: 44 },
        night: THEMES.night,
      };
    case 'servers': {
      // a cool, dark hall lit by the racks
      const serverLook: Theme = {
        ...THEMES.night,
        background: 0x0c1424,
        skyTop: 0x03060c,
        roadA: 0x2a3348,
        roadB: 0x252d40,
        wallA: 0x39435c,
        wallB: 0x323b52,
        fillColor: 0x2bb8ff,
        fillIntensity: 0.55,
        glow: 1.6,
      };
      return { day: serverLook, night: serverLook };
    }
    case 'underwater': {
      // blue-green water: light from above, the far side lost in the haze
      const sea: Theme = {
        ...THEMES.day,
        background: 0x1f6f8f,
        skyTop: 0x0b3a5a,
        fillColor: 0x4fe0ff,
        fillIntensity: 0.6,
        fogNear: 12,
        fogFar: 34,
        hemiSky: 0x9ff0ff,
        hemiGround: 0x1f4f6f,
        sunColor: 0xbff4ff,
        sunIntensity: 1.2,
        roadA: 0xd9c89a,
        roadB: 0xcfbd8e,
        wallA: 0x6a8a9a,
        wallB: 0x5f7f8f,
        glow: 1.3,
      };
      return { day: sea, night: sea };
    }
    case 'shaft':
      return {
        day: { ...THEMES.night, background: 0x2a1f4a, skyTop: 0x0b0820, roadA: 0x6a7088, roadB: 0x626880, wallA: 0x3a3f5c, wallB: 0x333852 },
        night: THEMES.night,
      };
    default:
      return THEMES;
  }
}
