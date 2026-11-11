import type { EnemyKind, RareKind, SimEvent, WeaponKind } from '../sim/types';
import type { SynthParams } from './synth';

export type SoundId =
  | `shot_${WeaponKind}`
  | 'select'
  | 'enemyHit'
  | 'enemyKilled'
  | 'coin'
  | 'towerBuilt'
  | 'buildDenied'
  | 'tower_laser'
  | 'tower_popcorn'
  | 'tower_frost'
  | 'playerHit'
  | 'playerDown'
  | 'playerRespawn'
  | 'creditLost'
  | 'playerDowned'
  | 'playerRevived'
  | 'jump'
  | 'stomp'
  | 'dash'
  | 'boost'
  | 'comboUp'
  | 'comboLost'
  | 'windup_shooter'
  | 'windup_bomber'
  | 'windup_rammer'
  | 'enemyShot'
  | 'explosion'
  | 'blastWarning'
  | 'nestPlanted'
  | 'nestDestroyed'
  | 'alarm'
  | 'overload'
  | 'elevatorOpen'
  | 'offerOpened'
  | 'cardPicked'
  | 'crateCoins'
  | 'powerupSpawned'
  | 'powerupPicked'
  | 'kartEnter'
  | 'kartRam'
  | 'kartJump'
  | 'kartLand'
  | 'kartDestroyed'
  | 'jetpackPicked'
  | 'jetpackEmpty'
  | `rare_${RareKind}`
  | 'rareExpired'
  | 'bubblePop'
  | 'gameWon'
  | 'gameLost'
  | 'uiClick';

const notes = (wave: SynthParams['wave'], freqs: number[], gap: number, volume: number, decay = 0.1, sustain = 0.04): SynthParams[] =>
  freqs.map((freq, i) => ({ wave, freq, attack: 0.003, sustain, decay, volume, at: i * gap }));

const siren = (count: number, a: number, b: number, step: number, volume: number): SynthParams[] =>
  Array.from({ length: count }, (_, i) => ({
    wave: 'square' as const,
    freq: i % 2 ? a : b,
    attack: 0.02,
    sustain: step * 0.8,
    decay: 0.08,
    volume,
    vibrato: { rate: 8, depth: 15 },
    lowpass: 2500,
    at: i * step,
  }));

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
  shot_bananaMine: [
    { wave: 'triangle', freq: 500, freqEnd: 250, attack: 0.003, sustain: 0.04, decay: 0.08, volume: 0.14 },
    { wave: 'noise', freq: 500, attack: 0.002, sustain: 0.01, decay: 0.05, volume: 0.1, lowpass: 900 },
  ],
  shot_bomb: [{ wave: 'sine', freq: 260, freqEnd: 520, attack: 0.01, sustain: 0.12, decay: 0.12, volume: 0.22 }],
  select: [{ wave: 'square', freq: 700, freqEnd: 1000, attack: 0.001, sustain: 0.015, decay: 0.04, volume: 0.07 }],
  enemyHit: [{ wave: 'square', freq: 220, freqEnd: 170, attack: 0.001, sustain: 0.01, decay: 0.03, volume: 0.06 }],
  enemyKilled: [
    { wave: 'noise', freq: 1200, attack: 0.001, sustain: 0.03, decay: 0.15, volume: 0.25, lowpass: 3000 },
    { wave: 'square', freq: 400, freqEnd: 80, attack: 0.001, sustain: 0.02, decay: 0.12, volume: 0.1 },
  ],
  coin: [
    { wave: 'square', freq: 988, attack: 0.002, sustain: 0.04, decay: 0.03, volume: 0.09 },
    { wave: 'square', freq: 1319, attack: 0.002, sustain: 0.05, decay: 0.12, volume: 0.09, at: 0.05 },
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
  playerHit: [{ wave: 'square', freq: 300, freqEnd: 150, attack: 0.001, sustain: 0.02, decay: 0.06, volume: 0.07 }],
  playerDown: [{ wave: 'square', freq: 600, freqEnd: 80, attack: 0.005, sustain: 0.3, decay: 0.2, volume: 0.14 }],
  playerRespawn: notes('triangle', [523, 659, 784, 1047], 0.06, 0.15, 0.12),
  creditLost: [
    { wave: 'sine', freq: 90, freqEnd: 40, attack: 0.002, sustain: 0.1, decay: 0.3, volume: 0.45 },
    ...notes('square', [392, 330, 262], 0.12, 0.09, 0.12, 0.06),
  ],
  playerDowned: [{ wave: 'square', freq: 520, freqEnd: 260, attack: 0.005, sustain: 0.2, decay: 0.2, volume: 0.12, vibrato: { rate: 9, depth: 20 } }],
  playerRevived: notes('triangle', [392, 523, 659, 784, 1047], 0.06, 0.15, 0.15, 0.04),
  jump: [{ wave: 'square', freq: 300, freqEnd: 700, attack: 0.002, sustain: 0.05, decay: 0.08, volume: 0.08 }],
  stomp: [
    { wave: 'sine', freq: 140, freqEnd: 50, attack: 0.001, sustain: 0.04, decay: 0.16, volume: 0.45 },
    { wave: 'noise', freq: 500, attack: 0.001, sustain: 0.02, decay: 0.1, volume: 0.2, lowpass: 900 },
  ],
  dash: [{ wave: 'noise', freq: 1800, attack: 0.005, sustain: 0.05, decay: 0.12, volume: 0.16, lowpass: 5000 }],
  boost: [{ wave: 'sawtooth', freq: 250, freqEnd: 1100, attack: 0.01, sustain: 0.15, decay: 0.15, volume: 0.09, lowpass: 3500 }],
  comboUp: notes('square', [784, 988, 1319], 0.05, 0.1, 0.12, 0.03),
  comboLost: notes('triangle', [440, 330], 0.09, 0.1, 0.14, 0.05),
  windup_shooter: [{ wave: 'square', freq: 900, freqEnd: 1500, attack: 0.01, sustain: 0.25, decay: 0.05, volume: 0.045 }],
  windup_bomber: notes('square', [1100, 1100, 1100, 1100, 1100, 1100], 0.09, 0.07, 0.03, 0.02),
  windup_rammer: [{ wave: 'sawtooth', freq: 90, freqEnd: 260, attack: 0.05, sustain: 0.55, decay: 0.15, volume: 0.13, lowpass: 1400 }],
  enemyShot: [{ wave: 'sawtooth', freq: 500, freqEnd: 180, attack: 0.002, sustain: 0.04, decay: 0.1, volume: 0.08, lowpass: 2500 }],
  explosion: [
    { wave: 'noise', freq: 600, attack: 0.002, sustain: 0.08, decay: 0.45, volume: 0.45, lowpass: 1000 },
    { wave: 'sine', freq: 90, freqEnd: 30, attack: 0.002, sustain: 0.08, decay: 0.35, volume: 0.4 },
  ],
  blastWarning: [{ wave: 'sawtooth', freq: 200, freqEnd: 800, attack: 0.03, sustain: 0.7, decay: 0.1, volume: 0.05, lowpass: 2000 }],
  nestPlanted: [
    { wave: 'noise', freq: 400, attack: 0.002, sustain: 0.04, decay: 0.1, volume: 0.3, lowpass: 700 },
    ...notes('square', [330, 440, 660], 0.09, 0.1, 0.1, 0.05),
  ],
  nestDestroyed: [
    { wave: 'noise', freq: 500, attack: 0.005, sustain: 0.3, decay: 1.3, volume: 0.5, lowpass: 1200 },
    { wave: 'sine', freq: 100, freqEnd: 20, attack: 0.005, sustain: 0.3, decay: 0.9, volume: 0.45 },
    ...notes('square', [523, 659, 784, 1047, 1319], 0.1, 0.11, 0.3).map(n => ({ ...n, at: (n.at ?? 0) + 0.5 })),
  ],
  alarm: siren(2, 450, 600, 0.22, 0.1),
  overload: siren(8, 450, 640, 0.35, 0.11),
  elevatorOpen: notes('triangle', [523, 784, 1047, 1568], 0.12, 0.16, 0.3, 0.08),
  offerOpened: notes('square', [659, 880, 1109], 0.06, 0.1, 0.12, 0.03),
  cardPicked: [
    ...notes('square', [523, 659, 784, 1047], 0.07, 0.12, 0.15),
    { wave: 'triangle', freq: 131, attack: 0.005, sustain: 0.25, decay: 0.2, volume: 0.25 },
  ],
  crateCoins: notes('square', [988, 1319, 1568, 1976], 0.05, 0.09, 0.1, 0.03),
  powerupSpawned: notes('triangle', [1319, 1568], 0.1, 0.1, 0.2, 0.05),
  powerupPicked: [{ wave: 'square', freq: 440, freqEnd: 1760, attack: 0.005, sustain: 0.12, decay: 0.2, volume: 0.12 }],
  kartEnter: [
    { wave: 'sawtooth', freq: 80, freqEnd: 220, attack: 0.02, sustain: 0.25, decay: 0.2, volume: 0.16, lowpass: 1200, vibrato: { rate: 30, depth: 12 } },
  ],
  kartRam: [
    { wave: 'noise', freq: 900, attack: 0.001, sustain: 0.03, decay: 0.1, volume: 0.3, lowpass: 1600 },
    { wave: 'square', freq: 180, freqEnd: 70, attack: 0.001, sustain: 0.03, decay: 0.08, volume: 0.14 },
  ],
  kartJump: [{ wave: 'square', freq: 250, freqEnd: 900, attack: 0.005, sustain: 0.18, decay: 0.15, volume: 0.1 }],
  kartLand: [
    { wave: 'sine', freq: 110, freqEnd: 40, attack: 0.001, sustain: 0.06, decay: 0.25, volume: 0.5 },
    { wave: 'noise', freq: 500, attack: 0.001, sustain: 0.03, decay: 0.15, volume: 0.25, lowpass: 900 },
  ],
  kartDestroyed: [
    { wave: 'noise', freq: 700, attack: 0.002, sustain: 0.1, decay: 0.5, volume: 0.45, lowpass: 1400 },
    { wave: 'square', freq: 300, freqEnd: 60, attack: 0.002, sustain: 0.1, decay: 0.3, volume: 0.12 },
  ],
  jetpackPicked: notes('square', [392, 523, 659, 784, 1047], 0.05, 0.1, 0.12, 0.03),
  jetpackEmpty: [{ wave: 'noise', freq: 800, freqEnd: 200, attack: 0.005, sustain: 0.15, decay: 0.2, volume: 0.15, lowpass: 1500 }],
  rare_slushMachine: [{ wave: 'noise', freq: 2600, attack: 0.01, sustain: 0.06, decay: 0.05, volume: 0.07, lowpass: 7000 }],
  rare_bubblegumBazooka: [{ wave: 'sine', freq: 200, freqEnd: 520, attack: 0.01, sustain: 0.1, decay: 0.15, volume: 0.25 }],
  rare_leafBlower: [{ wave: 'noise', freq: 500, attack: 0.02, sustain: 0.08, decay: 0.05, volume: 0.1, lowpass: 900 }],
  rare_pizzaCutter: [{ wave: 'sawtooth', freq: 900, freqEnd: 1300, attack: 0.005, sustain: 0.12, decay: 0.12, volume: 0.07, vibrato: { rate: 45, depth: 60 }, lowpass: 3500 }],
  rareExpired: notes('triangle', [784, 587, 440], 0.08, 0.1, 0.12, 0.04),
  bubblePop: [
    { wave: 'sine', freq: 700, freqEnd: 120, attack: 0.001, sustain: 0.03, decay: 0.12, volume: 0.3 },
    { wave: 'noise', freq: 900, attack: 0.001, sustain: 0.02, decay: 0.12, volume: 0.25, lowpass: 2000 },
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
  'explosion',
  'kartRam',
  'enemyShot',
  'rare_slushMachine',
  'rare_leafBlower',
]);

export const MAX_COIN_STREAK_STEPS = 12;
const SEMITONE = 1.059;

const WINDUP: Partial<Record<EnemyKind, SoundId>> = { shooter: 'windup_shooter', bomber: 'windup_bomber', rammer: 'windup_rammer' };

export function soundsForEvent(e: SimEvent): { id: SoundId; pitch: number }[] {
  const one = (id: SoundId, pitch = 1) => [{ id, pitch }];
  switch (e.type) {
    case 'shot':
      return one(`shot_${e.weapon}`);
    case 'weaponSelected':
      return one('select', 1 + e.slot * 0.06);
    case 'enemyHit':
      return one('enemyHit');
    case 'enemyKilled':
      return one('enemyKilled', e.kind === 'tank' || e.kind === 'rammer' || e.elite ? 0.7 : e.kind === 'splitling' ? 1.4 : 1);
    case 'coinPicked':
      return one('coin', SEMITONE ** Math.min(e.streak, MAX_COIN_STREAK_STEPS));
    case 'towerBuilt':
      return one('towerBuilt');
    case 'buildDenied':
      return one('buildDenied');
    case 'towerFired':
      return one(`tower_${e.kind}`);
    case 'playerHit':
      return one('playerHit');
    case 'playerDown':
      return one('playerDown');
    case 'playerRespawn':
      return one('playerRespawn');
    case 'creditLost':
      return one('creditLost');
    case 'playerDowned':
      return one('playerDowned');
    case 'playerRevived':
      return one('playerRevived');
    case 'teamWipe':
      return one('playerDown', 0.7);
    case 'jump':
      return one('jump');
    case 'stomp':
      return one('stomp');
    case 'dash':
      return one('dash');
    case 'boost':
      return one('boost');
    case 'comboUp':
      return one('comboUp', SEMITONE ** ((e.mult - 2) * 2));
    case 'comboLost':
      return one('comboLost');
    case 'enemyWindup':
      return one(WINDUP[e.kind] ?? 'windup_shooter');
    case 'enemyShot':
      return one('enemyShot');
    case 'explosion':
      return one('explosion', e.radius >= 5 ? 0.7 : e.radius >= 3 ? 0.85 : 1);
    case 'blastWarning':
      return one('blastWarning');
    case 'nestPlanted':
      return one('nestPlanted');
    case 'nestDestroyed':
      return one('nestDestroyed');
    case 'alarmChanged':
      return e.level >= 5 ? one('overload') : one('alarm', 1 + 0.08 * e.level);
    case 'elevatorOpen':
      return one('elevatorOpen');
    case 'offerOpened':
      return one('offerOpened');
    case 'cardPicked':
      return one('cardPicked');
    case 'crateCoins':
      return one('crateCoins');
    case 'powerupSpawned':
      return one('powerupSpawned');
    case 'powerupPicked':
      return one('powerupPicked');
    case 'kartEnter':
      return one('kartEnter');
    case 'kartRam':
      return one('kartRam');
    case 'kartJump':
      return one('kartJump');
    case 'kartLand':
      return one('kartLand');
    case 'kartDestroyed':
      return one('kartDestroyed');
    case 'jetpackPicked':
      return one('jetpackPicked');
    case 'jetpackEmpty':
      return one('jetpackEmpty');
    case 'rareFired':
      return one(`rare_${e.kind}`);
    case 'rareExpired':
      return one('rareExpired');
    case 'bubblePop':
      return one('bubblePop');
    case 'gameWon':
      return one('gameWon');
    case 'gameLost':
      return one('gameLost');
  }
}
