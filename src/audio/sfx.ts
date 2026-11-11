import type { SimEvent, WeaponKind } from '../sim/types';
import type { SynthParams } from './synth';

export type SoundId =
  | `shot_${WeaponKind}`
  | 'enemyHit'
  | 'enemyKilled'
  | 'coin'
  | 'crate'
  | 'towerBuilt'
  | 'buildDenied'
  | 'tower_laser'
  | 'tower_popcorn'
  | 'tower_frost'
  | 'baseHit'
  | 'playerHit'
  | 'playerDown'
  | 'playerRespawn'
  | 'waveStart'
  | 'bossSpawn'
  | 'bossPhase'
  | 'bossTelegraph'
  | 'bossImpact'
  | 'wormSplit'
  | 'bossDead'
  | 'gameWon'
  | 'gameLost'
  | 'uiClick';

const notes = (wave: SynthParams['wave'], freqs: number[], gap: number, volume: number, decay = 0.1, sustain = 0.04): SynthParams[] =>
  freqs.map((freq, i) => ({ wave, freq, attack: 0.003, sustain, decay, volume, at: i * gap }));

export const SOUNDS: Record<SoundId, SynthParams[]> = {
  shot_pixelBlaster: [{ wave: 'square', freq: 880, freqEnd: 440, attack: 0.002, sustain: 0.03, decay: 0.06, volume: 0.12 }],
  shot_laserSword: [
    { wave: 'sawtooth', freq: 300, freqEnd: 900, attack: 0.005, sustain: 0.05, decay: 0.12, volume: 0.12, lowpass: 2500 },
    { wave: 'noise', freq: 1000, attack: 0.01, sustain: 0.06, decay: 0.12, volume: 0.12, lowpass: 3000 },
  ],
  shot_candyCannon: notes('triangle', [1200, 1400, 1300, 1600, 1500], 0.03, 0.12, 0.05, 0.01),
  shot_hotdogSlinger: [
    { wave: 'sine', freq: 180, freqEnd: 80, attack: 0.005, sustain: 0.05, decay: 0.15, volume: 0.35 },
    { wave: 'noise', freq: 600, attack: 0.005, sustain: 0.02, decay: 0.08, volume: 0.12, lowpass: 800 },
  ],
  shot_joystickBoomerang: [
    { wave: 'square', freq: 500, freqEnd: 900, attack: 0.01, sustain: 0.12, decay: 0.1, volume: 0.07, vibrato: { rate: 20, depth: 40 } },
  ],
  shot_discoBall: notes('triangle', [1047, 1319, 1568, 2093], 0.035, 0.08, 0.08, 0.01),
  enemyHit: [{ wave: 'square', freq: 220, freqEnd: 170, attack: 0.001, sustain: 0.01, decay: 0.03, volume: 0.06 }],
  enemyKilled: [
    { wave: 'noise', freq: 1200, attack: 0.001, sustain: 0.03, decay: 0.15, volume: 0.25, lowpass: 3000 },
    { wave: 'square', freq: 400, freqEnd: 80, attack: 0.001, sustain: 0.02, decay: 0.12, volume: 0.1 },
  ],
  coin: [
    { wave: 'square', freq: 988, attack: 0.002, sustain: 0.04, decay: 0.03, volume: 0.09 },
    { wave: 'square', freq: 1319, attack: 0.002, sustain: 0.05, decay: 0.12, volume: 0.09, at: 0.05 },
  ],
  crate: [
    ...notes('square', [523, 659, 784, 1047], 0.07, 0.12, 0.15),
    { wave: 'triangle', freq: 131, attack: 0.005, sustain: 0.25, decay: 0.2, volume: 0.25 },
  ],
  towerBuilt: [
    { wave: 'noise', freq: 400, attack: 0.002, sustain: 0.04, decay: 0.12, volume: 0.35, lowpass: 600 },
    { wave: 'triangle', freq: 523, freqEnd: 1047, attack: 0.01, sustain: 0.1, decay: 0.15, volume: 0.15, at: 0.08 },
  ],
  buildDenied: [
    { wave: 'square', freq: 140, attack: 0.002, sustain: 0.08, decay: 0.04, volume: 0.12 },
    { wave: 'square', freq: 120, attack: 0.002, sustain: 0.08, decay: 0.06, volume: 0.12, at: 0.13 },
  ],
  tower_laser: [{ wave: 'sawtooth', freq: 1200, freqEnd: 600, attack: 0.002, sustain: 0.03, decay: 0.05, volume: 0.05, lowpass: 4000 }],
  tower_popcorn: [
    { wave: 'noise', freq: 1500, attack: 0.001, sustain: 0.02, decay: 0.06, volume: 0.2, lowpass: 1500 },
    { wave: 'sine', freq: 300, freqEnd: 150, attack: 0.002, sustain: 0.03, decay: 0.1, volume: 0.18 },
  ],
  tower_frost: [{ wave: 'triangle', freq: 2000, freqEnd: 2400, attack: 0.02, sustain: 0.1, decay: 0.2, volume: 0.05, vibrato: { rate: 30, depth: 60 } }],
  baseHit: [
    { wave: 'sine', freq: 90, freqEnd: 40, attack: 0.002, sustain: 0.1, decay: 0.3, volume: 0.5 },
    { wave: 'square', freq: 220, attack: 0.002, sustain: 0.08, decay: 0.05, volume: 0.07 },
  ],
  playerHit: [{ wave: 'square', freq: 300, freqEnd: 150, attack: 0.001, sustain: 0.02, decay: 0.06, volume: 0.07 }],
  playerDown: [{ wave: 'square', freq: 600, freqEnd: 80, attack: 0.005, sustain: 0.3, decay: 0.2, volume: 0.14 }],
  playerRespawn: notes('triangle', [523, 659, 784, 1047], 0.06, 0.15, 0.12),
  waveStart: notes('square', [659, 784, 1047], 0.1, 0.1, 0.15, 0.05),
  bossSpawn: Array.from({ length: 6 }, (_, i) => ({
    wave: 'square' as const,
    freq: i % 2 ? 450 : 600,
    attack: 0.02,
    sustain: 0.4,
    decay: 0.08,
    volume: 0.1,
    vibrato: { rate: 8, depth: 15 },
    lowpass: 2500,
    at: i * 0.5,
  })),
  bossPhase: [
    { wave: 'noise', freq: 500, attack: 0.002, sustain: 0.1, decay: 0.4, volume: 0.4, lowpass: 900 },
    { wave: 'square', freq: 300, freqEnd: 600, attack: 0.01, sustain: 0.15, decay: 0.1, volume: 0.1 },
  ],
  bossTelegraph: [{ wave: 'sawtooth', freq: 200, freqEnd: 800, attack: 0.05, sustain: 0.8, decay: 0.15, volume: 0.05, lowpass: 2000 }],
  bossImpact: [
    { wave: 'noise', freq: 600, attack: 0.002, sustain: 0.1, decay: 0.5, volume: 0.5, lowpass: 900 },
    { wave: 'sine', freq: 80, freqEnd: 30, attack: 0.002, sustain: 0.1, decay: 0.4, volume: 0.45 },
  ],
  wormSplit: [
    { wave: 'noise', freq: 900, attack: 0.002, sustain: 0.05, decay: 0.2, volume: 0.3, lowpass: 1200 },
    { wave: 'square', freq: 200, freqEnd: 60, attack: 0.002, sustain: 0.05, decay: 0.2, volume: 0.12 },
  ],
  bossDead: [
    { wave: 'noise', freq: 500, attack: 0.005, sustain: 0.3, decay: 1.5, volume: 0.5, lowpass: 1200 },
    { wave: 'sine', freq: 100, freqEnd: 20, attack: 0.005, sustain: 0.3, decay: 1.0, volume: 0.45 },
    ...notes('square', [523, 659, 784, 1047, 1319], 0.1, 0.11, 0.3).map(n => ({ ...n, at: (n.at ?? 0) + 0.6 })),
  ],
  gameWon: notes('square', [523, 659, 784, 1047, 784, 1047, 1319], 0.12, 0.11, 0.25, 0.06),
  gameLost: notes('sawtooth', [523, 466, 415, 392], 0.25, 0.1, 0.3, 0.12).map(n => ({ ...n, lowpass: 1800 })),
  uiClick: [{ wave: 'square', freq: 1200, attack: 0.001, sustain: 0.01, decay: 0.03, volume: 0.06 }],
};

/** Sounds whose pitch is randomly varied a little each time, so repeats don't get monotonous. */
export const JITTER: ReadonlySet<SoundId> = new Set<SoundId>([
  'enemyHit',
  'enemyKilled',
  'shot_pixelBlaster',
  'shot_candyCannon',
  'tower_laser',
  'tower_popcorn',
  'playerHit',
]);

export const MAX_COIN_STREAK_STEPS = 12;
const SEMITONE = 1.059;

export function soundsForEvent(e: SimEvent): { id: SoundId; pitch: number }[] {
  const one = (id: SoundId, pitch = 1) => [{ id, pitch }];
  switch (e.type) {
    case 'shot':
      return one(`shot_${e.weapon}`);
    case 'enemyHit':
      return one('enemyHit');
    case 'enemyKilled':
      return one('enemyKilled', e.kind === 'tank' || e.kind === 'miniboss' ? 0.7 : e.kind === 'splitling' ? 1.4 : 1);
    case 'coinPicked':
      return one('coin', SEMITONE ** Math.min(e.streak, MAX_COIN_STREAK_STEPS));
    case 'crateOpened':
      return one('crate');
    case 'towerBuilt':
      return one('towerBuilt');
    case 'buildDenied':
      return one('buildDenied');
    case 'towerFired':
      return one(`tower_${e.kind}`);
    case 'baseHit':
      return one('baseHit');
    case 'playerHit':
      return one('playerHit');
    case 'playerDown':
      return one('playerDown');
    case 'playerRespawn':
      return one('playerRespawn');
    case 'waveStart':
      return one('waveStart');
    case 'waveCleared':
      return [];
    case 'bossSpawn':
      return one('bossSpawn');
    case 'bossPhase':
      return one('bossPhase');
    case 'bossTelegraph':
      return one('bossTelegraph');
    case 'bossImpact':
      return one('bossImpact');
    case 'wormSplit':
      return one('wormSplit');
    case 'bossDead':
      return one('bossDead');
    case 'gameWon':
      return one('gameWon');
    case 'gameLost':
      return one('gameLost');
  }
}
