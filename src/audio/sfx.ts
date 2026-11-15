import type { BossKind, EnemyKind, RareKind, SimEvent, WeaponKind } from '../sim/types';
import type { SynthParams } from './synth';

export type SoundId =
  | `shot_${WeaponKind}`
  | 'discoZap'
  | 'swordOn'
  | 'swordOff'
  | 'swordClash'
  | 'select'
  | 'enemyHit'
  | 'enemyKilled'
  | 'coin'
  | 'mazePixel'
  | 'towerBuilt'
  | 'buildDenied'
  | 'tower_laser'
  | 'tower_popcorn'
  | 'tower_frost'
  | 'tower_tesla'
  | 'tower_bumper'
  | 'tower_medic'
  | 'playerHit'
  | 'vehicleHit'
  | 'hitConfirm'
  | 'killConfirm'
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
  | 'waveStart'
  | 'bossSpawn'
  | `roar_${BossKind}`
  | 'growl_croc'
  | 'bossBurst'
  | 'thunder'
  | 'hammerSlam'
  | 'laserAim'
  | 'laserFire'
  | 'screech_monkey'
  | 'bossPhase'
  | 'bossDead'
  | 'wormSplit'
  | 'witchDrum'
  | 'fireCrackle'
  | 'fireWhoosh'
  | 'witchPress'
  | 'witchGiggle'
  | 'witchShriek'
  | 'witchLaugh'
  | 'siren'
  | 'sharkLeap'
  | 'maskTurn'
  | 'gameWon'
  | 'gameLost'
  | 'uiClick'
  | 'announce'
  | 'lockOn'
  | 'lockWarn'
  | 'heliRotor'
  | 'heliRotorLow'
  | 'heliMissiles'
  | 'heliGun'
  | 'heliWhine'
  | 'heliCrash';

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
  // the Laser Sword cuts the air: the blade's buzz is pushed up as it swings out and falls back as it slows, two
  // voices a little apart that beat; under it the air itself, noise through a ringing filter that sweeps up and down
  shot_laserSword: [
    { wave: 'sawtooth', freq: 118, freqEnd: 250, attack: 0.006, sustain: 0.03, decay: 0.05, volume: 0.075, lowpass: 1500, vibrato: { rate: 31, depth: 4 } },
    { wave: 'sawtooth', freq: 121, freqEnd: 257, attack: 0.006, sustain: 0.03, decay: 0.05, volume: 0.06, lowpass: 1500 },
    { wave: 'sawtooth', freq: 250, freqEnd: 92, attack: 0.004, sustain: 0.03, decay: 0.15, volume: 0.075, lowpass: 1300, at: 0.06 },
    { wave: 'sawtooth', freq: 257, freqEnd: 95, attack: 0.004, sustain: 0.03, decay: 0.15, volume: 0.06, lowpass: 1300, at: 0.06 },
    { wave: 'noise', freq: 1000, attack: 0.04, sustain: 0.015, decay: 0.03, volume: 0.13, lowpass: 450, lowpassEnd: 3400, resonance: 6 },
    { wave: 'noise', freq: 1000, attack: 0.004, sustain: 0.02, decay: 0.13, volume: 0.11, lowpass: 3400, lowpassEnd: 500, resonance: 6, at: 0.06 },
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
  // its beams leave the ball: three quick zaps, each a little higher
  discoZap: [
    { wave: 'square', freq: 1700, freqEnd: 520, attack: 0.002, sustain: 0.015, decay: 0.09, volume: 0.045, lowpass: 5000, at: 0.02 },
    { wave: 'square', freq: 2100, freqEnd: 640, attack: 0.002, sustain: 0.015, decay: 0.09, volume: 0.04, lowpass: 5000, at: 0.07 },
    { wave: 'triangle', freq: 2600, freqEnd: 800, attack: 0.002, sustain: 0.015, decay: 0.11, volume: 0.06, at: 0.12 },
  ],
  shot_bananaMine: [
    { wave: 'triangle', freq: 500, freqEnd: 250, attack: 0.003, sustain: 0.04, decay: 0.08, volume: 0.14 },
    { wave: 'noise', freq: 500, attack: 0.002, sustain: 0.01, decay: 0.05, volume: 0.1, lowpass: 900 },
  ],
  shot_bomb: [{ wave: 'sine', freq: 260, freqEnd: 520, attack: 0.01, sustain: 0.12, decay: 0.12, volume: 0.22 }],
  // a charged zap
  shot_pixelRail: [
    { wave: 'sawtooth', freq: 1800, freqEnd: 300, attack: 0.002, sustain: 0.05, decay: 0.18, volume: 0.13, lowpass: 4000 },
    { wave: 'square', freq: 90, freqEnd: 40, attack: 0.001, sustain: 0.04, decay: 0.1, volume: 0.1 },
  ],
  // a soft blown bubble
  shot_bubbleWand: [
    { wave: 'sine', freq: 400, freqEnd: 900, attack: 0.01, sustain: 0.06, decay: 0.12, volume: 0.12, vibrato: { rate: 14, depth: 30 } },
  ],
  // a magnetic hum that pulls up
  shot_magnetGlove: [
    { wave: 'sawtooth', freq: 90, freqEnd: 260, attack: 0.02, sustain: 0.18, decay: 0.12, volume: 0.1, lowpass: 900, vibrato: { rate: 30, depth: 20 } },
  ],
  // a zip out on the string
  shot_yoyoLauncher: [{ wave: 'triangle', freq: 600, freqEnd: 1400, attack: 0.003, sustain: 0.05, decay: 0.06, volume: 0.1 }],
  // a whoosh and a wet KLATSCH
  shot_flySwatter: [
    { wave: 'noise', freq: 600, attack: 0.02, sustain: 0.04, decay: 0.05, volume: 0.1, lowpass: 1800 },
    { wave: 'noise', freq: 2500, attack: 0.001, sustain: 0.02, decay: 0.09, volume: 0.32, lowpass: 5000 },
    { wave: 'square', freq: 140, freqEnd: 60, attack: 0.001, sustain: 0.02, decay: 0.08, volume: 0.14 },
  ],
  // the blade lights: a snap at the hilt, a buzz that climbs as the blade runs out and drops back into the hum
  swordOn: [
    { wave: 'noise', freq: 3000, attack: 0.001, sustain: 0.008, decay: 0.05, volume: 0.13, lowpass: 7000 },
    { wave: 'sawtooth', freq: 55, freqEnd: 230, attack: 0.03, sustain: 0.1, decay: 0.04, volume: 0.08, lowpass: 700, lowpassEnd: 2600, vibrato: { rate: 23, depth: 3 } },
    { wave: 'sawtooth', freq: 57, freqEnd: 237, attack: 0.03, sustain: 0.1, decay: 0.04, volume: 0.065, lowpass: 700, lowpassEnd: 2600 },
    { wave: 'sawtooth', freq: 230, freqEnd: 84, attack: 0.01, sustain: 0.04, decay: 0.22, volume: 0.07, lowpass: 1800, lowpassEnd: 500, at: 0.12 },
    { wave: 'noise', freq: 1000, attack: 0.08, sustain: 0.04, decay: 0.1, volume: 0.07, lowpass: 400, lowpassEnd: 3000, resonance: 5 },
  ],
  // and goes out: the buzz sinks and thins away into the hilt, with a soft click at its end
  swordOff: [
    { wave: 'sawtooth', freq: 200, freqEnd: 42, attack: 0.005, sustain: 0.05, decay: 0.2, volume: 0.08, lowpass: 1800, lowpassEnd: 260 },
    { wave: 'sawtooth', freq: 206, freqEnd: 44, attack: 0.005, sustain: 0.05, decay: 0.2, volume: 0.06, lowpass: 1800, lowpassEnd: 260 },
    { wave: 'noise', freq: 1000, attack: 0.01, sustain: 0.04, decay: 0.16, volume: 0.06, lowpass: 2600, lowpassEnd: 300, resonance: 4 },
    { wave: 'square', freq: 1500, freqEnd: 900, attack: 0.001, sustain: 0.004, decay: 0.025, volume: 0.025, at: 0.19 },
  ],
  // the blade meets something: a hard electric crack, a stutter of sparks, a buzz knocked down, and a thin ring
  swordClash: [
    { wave: 'noise', freq: 4200, attack: 0.001, sustain: 0.015, decay: 0.07, volume: 0.28, lowpass: 8000 },
    { wave: 'square', freq: 1800, freqEnd: 650, attack: 0.001, sustain: 0.03, decay: 0.09, volume: 0.05, vibrato: { rate: 70, depth: 520 }, lowpass: 5000 },
    { wave: 'sawtooth', freq: 330, freqEnd: 105, attack: 0.001, sustain: 0.03, decay: 0.16, volume: 0.12, lowpass: 2200 },
    { wave: 'triangle', freq: 2350, freqEnd: 2180, attack: 0.001, sustain: 0.01, decay: 0.22, volume: 0.035 },
    ...[0.035, 0.06, 0.1, 0.13].map((at, i): SynthParams => ({ wave: 'noise', freq: 3000, attack: 0.001, sustain: 0.003, decay: 0.02, volume: 0.09 - i * 0.015, lowpass: 6500 - i * 700, at })),
  ],
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
  // one for every pixel of the Glitch Maze, several a second: a short soft blip with a little chirp up
  mazePixel: [{ wave: 'triangle', freq: 660, freqEnd: 880, attack: 0.002, sustain: 0.02, decay: 0.06, volume: 0.09 }],
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
  // a crackling zap
  tower_tesla: [
    { wave: 'noise', freq: 3000, attack: 0.001, sustain: 0.06, decay: 0.08, volume: 0.12, lowpass: 6000 },
    { wave: 'sawtooth', freq: 220, freqEnd: 180, attack: 0.001, sustain: 0.08, decay: 0.05, volume: 0.06, vibrato: { rate: 60, depth: 80 } },
  ],
  // a pinball BOING
  tower_bumper: [{ wave: 'square', freq: 300, freqEnd: 700, attack: 0.002, sustain: 0.04, decay: 0.12, volume: 0.1 }],
  // a soft two-note chime, like a hospital call bell
  tower_medic: notes('sine', [784, 1047], 0.09, 0.05, 0.25),
  playerHit: [{ wave: 'square', freq: 300, freqEnd: 150, attack: 0.001, sustain: 0.02, decay: 0.06, volume: 0.07 }],
  // a clank on metal (or a unicorn's hide): the vehicle took it
  vehicleHit: [
    { wave: 'square', freq: 900, freqEnd: 520, attack: 0.001, sustain: 0.015, decay: 0.08, volume: 0.07 },
    { wave: 'triangle', freq: 1800, freqEnd: 1500, attack: 0.001, sustain: 0.01, decay: 0.12, volume: 0.05 },
  ],
  // the shooter's "got them": a short bright tick when a shot lands on a rival (a lower, fuller one for the kill)
  hitConfirm: [{ wave: 'square', freq: 1400, freqEnd: 1250, attack: 0.001, sustain: 0.012, decay: 0.04, volume: 0.06 }],
  killConfirm: notes('square', [1047, 1568], 0.05, 0.03, 0.08),
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
  rare_missileLauncher: [
    { wave: 'noise', freq: 1800, freqEnd: 500, attack: 0.01, sustain: 0.18, decay: 0.3, volume: 0.16, lowpass: 2600 },
    { wave: 'sawtooth', freq: 180, freqEnd: 520, attack: 0.01, sustain: 0.12, decay: 0.2, volume: 0.08, lowpass: 1800 },
  ],
  rareExpired: notes('triangle', [784, 587, 440], 0.08, 0.1, 0.12, 0.04),
  bubblePop: [
    { wave: 'sine', freq: 700, freqEnd: 120, attack: 0.001, sustain: 0.03, decay: 0.12, volume: 0.3 },
    { wave: 'noise', freq: 900, attack: 0.001, sustain: 0.02, decay: 0.12, volume: 0.25, lowpass: 2000 },
  ],
  waveStart: notes('square', [659, 784, 1047], 0.1, 0.1, 0.15, 0.05),
  bossSpawn: siren(6, 450, 600, 0.5, 0.1),
  bossPhase: [
    { wave: 'noise', freq: 500, attack: 0.002, sustain: 0.1, decay: 0.4, volume: 0.4, lowpass: 900 },
    { wave: 'square', freq: 300, freqEnd: 600, attack: 0.01, sustain: 0.15, decay: 0.1, volume: 0.1 },
  ],
  bossDead: [
    { wave: 'noise', freq: 500, attack: 0.005, sustain: 0.3, decay: 1.5, volume: 0.5, lowpass: 1200 },
    { wave: 'sine', freq: 100, freqEnd: 20, attack: 0.005, sustain: 0.3, decay: 1.0, volume: 0.45 },
    ...notes('square', [523, 659, 784, 1047, 1319], 0.1, 0.11, 0.3).map(n => ({ ...n, at: (n.at ?? 0) + 0.6 })),
  ],
  // monster voices. King Rex and every T-Rex: a long, deep roar that growls and drops
  roar_rex: [
    { wave: 'sawtooth', freq: 120, freqEnd: 46, attack: 0.08, sustain: 0.75, decay: 0.55, volume: 0.34, vibrato: { rate: 31, depth: 16 }, lowpass: 760 },
    { wave: 'square', freq: 62, freqEnd: 34, attack: 0.1, sustain: 0.7, decay: 0.5, volume: 0.16, vibrato: { rate: 23, depth: 6 }, lowpass: 420 },
    { wave: 'noise', freq: 400, attack: 0.12, sustain: 0.6, decay: 0.6, volume: 0.3, lowpass: 620 },
    { wave: 'sawtooth', freq: 210, freqEnd: 90, attack: 0.02, sustain: 0.18, decay: 0.3, volume: 0.14, vibrato: { rate: 38, depth: 30 }, lowpass: 1100 },
  ],
  // the Rhino: two snorts through the nose, then a low bellow that rises
  roar_rhino: [
    { wave: 'noise', freq: 600, attack: 0.005, sustain: 0.09, decay: 0.1, volume: 0.36, lowpass: 950 },
    { wave: 'noise', freq: 600, attack: 0.005, sustain: 0.11, decay: 0.14, volume: 0.4, lowpass: 1100, at: 0.24 },
    { wave: 'sawtooth', freq: 68, freqEnd: 128, attack: 0.06, sustain: 0.4, decay: 0.3, volume: 0.28, vibrato: { rate: 19, depth: 9 }, lowpass: 640, at: 0.42 },
    { wave: 'square', freq: 45, freqEnd: 60, attack: 0.06, sustain: 0.4, decay: 0.3, volume: 0.14, lowpass: 380, at: 0.42 },
  ],
  // the Mega Block: a machine growl, square and grinding
  roar_megaBlock: [
    { wave: 'square', freq: 58, freqEnd: 40, attack: 0.03, sustain: 0.5, decay: 0.4, volume: 0.24, vibrato: { rate: 14, depth: 10 }, lowpass: 520 },
    { wave: 'sawtooth', freq: 116, freqEnd: 80, attack: 0.03, sustain: 0.5, decay: 0.35, volume: 0.14, vibrato: { rate: 52, depth: 22 }, lowpass: 900 },
    { wave: 'noise', freq: 300, attack: 0.01, sustain: 0.25, decay: 0.5, volume: 0.22, lowpass: 480 },
  ],
  // the Segment Worm: a hiss with a dry chitter over it
  roar_worm: [
    { wave: 'noise', freq: 3000, attack: 0.04, sustain: 0.45, decay: 0.35, volume: 0.2, lowpass: 5200 },
    { wave: 'square', freq: 980, freqEnd: 420, attack: 0.01, sustain: 0.4, decay: 0.2, volume: 0.07, vibrato: { rate: 44, depth: 260 }, lowpass: 2600 },
    { wave: 'sawtooth', freq: 150, freqEnd: 95, attack: 0.05, sustain: 0.4, decay: 0.3, volume: 0.12, vibrato: { rate: 36, depth: 18 }, lowpass: 800 },
  ],
  // the Kraken: a deep groan from under water that wavers, with a gurgle
  roar_kraken: [
    { wave: 'sine', freq: 150, freqEnd: 58, attack: 0.15, sustain: 0.7, decay: 0.6, volume: 0.36, vibrato: { rate: 6, depth: 22 } },
    { wave: 'triangle', freq: 300, freqEnd: 120, attack: 0.15, sustain: 0.6, decay: 0.5, volume: 0.14, vibrato: { rate: 11, depth: 40 }, lowpass: 900 },
    { wave: 'noise', freq: 200, attack: 0.1, sustain: 0.5, decay: 0.6, volume: 0.2, lowpass: 340 },
  ],
  // Angry Dominik: an angry shout, short and rough
  roar_dominik: [
    { wave: 'sawtooth', freq: 210, freqEnd: 150, attack: 0.02, sustain: 0.28, decay: 0.2, volume: 0.26, vibrato: { rate: 26, depth: 14 }, lowpass: 1500 },
    { wave: 'square', freq: 105, freqEnd: 80, attack: 0.02, sustain: 0.28, decay: 0.2, volume: 0.12, lowpass: 700 },
    { wave: 'noise', freq: 800, attack: 0.01, sustain: 0.12, decay: 0.2, volume: 0.14, lowpass: 1800 },
  ],
  // the attack helicopter: its warning horn, two harsh tones in turn, with static over them
  roar_heli: [
    ...[620, 465, 620, 465].map((freq, i): SynthParams => ({ wave: 'square', freq, attack: 0.01, sustain: 0.09, decay: 0.03, volume: 0.1, lowpass: 2200, at: i * 0.13 })),
    ...[310, 232, 310, 232].map((freq, i): SynthParams => ({ wave: 'sawtooth', freq, attack: 0.01, sustain: 0.09, decay: 0.03, volume: 0.07, lowpass: 1200, at: i * 0.13 })),
    { wave: 'noise', freq: 2400, attack: 0.01, sustain: 0.45, decay: 0.1, volume: 0.04, lowpass: 3600 },
  ],
  // its rotor, a second of it: eight dull beats of the blades (far off while it circles, heavy while it hovers low)
  heliRotor: Array.from({ length: 8 }, (_, i): SynthParams[] => [
    { wave: 'sine', freq: 82, freqEnd: 50, attack: 0.004, sustain: 0.02, decay: 0.07, volume: 0.085, at: i * 0.125 },
    { wave: 'noise', freq: 500, attack: 0.004, sustain: 0.02, decay: 0.05, volume: 0.03, lowpass: 700, at: i * 0.125 },
  ]).flat(),
  heliRotorLow: [
    ...Array.from({ length: 8 }, (_, i): SynthParams[] => [
      { wave: 'sine', freq: 74, freqEnd: 42, attack: 0.004, sustain: 0.03, decay: 0.08, volume: 0.17, at: i * 0.125 },
      { wave: 'noise', freq: 700, attack: 0.004, sustain: 0.03, decay: 0.06, volume: 0.06, lowpass: 1000, at: i * 0.125 },
    ]).flat(),
    { wave: 'noise', freq: 1200, attack: 0.2, sustain: 0.6, decay: 0.2, volume: 0.035, lowpass: 1800 },
  ],
  // a salvo leaves its pods: the hiss of the motors and a whistle that falls
  heliMissiles: [
    { wave: 'noise', freq: 2600, attack: 0.03, sustain: 0.25, decay: 0.5, volume: 0.16, lowpass: 3400 },
    { wave: 'noise', freq: 500, attack: 0.05, sustain: 0.3, decay: 0.5, volume: 0.14, lowpass: 700 },
    { wave: 'sine', freq: 1500, freqEnd: 520, attack: 0.05, sustain: 0.5, decay: 0.4, volume: 0.05, vibrato: { rate: 30, depth: 30 } },
  ],
  // its gun: a short dry rattle
  heliGun: Array.from({ length: 7 }, (_, i): SynthParams[] => [
    { wave: 'noise', freq: 1800, attack: 0.001, sustain: 0.012, decay: 0.035, volume: 0.2, lowpass: 2600, at: i * 0.07 },
    { wave: 'square', freq: 150, freqEnd: 90, attack: 0.001, sustain: 0.012, decay: 0.03, volume: 0.1, at: i * 0.07 },
  ]).flat(),
  // its engine as it comes down, climbs away or swoops: a whine that bends (the pitch says which way)
  heliWhine: [
    { wave: 'sawtooth', freq: 520, freqEnd: 300, attack: 0.15, sustain: 0.5, decay: 0.4, volume: 0.07, vibrato: { rate: 18, depth: 12 }, lowpass: 1600 },
    { wave: 'noise', freq: 900, attack: 0.2, sustain: 0.5, decay: 0.4, volume: 0.08, lowpass: 1200 },
  ],
  // shot down: the engine howls and sputters as it spins to the floor
  heliCrash: [
    { wave: 'sawtooth', freq: 900, freqEnd: 180, attack: 0.03, sustain: 0.9, decay: 0.3, volume: 0.13, vibrato: { rate: 11, depth: 70 }, lowpass: 2400 },
    ...[0.1, 0.32, 0.5, 0.74, 0.9].map((at): SynthParams => ({ wave: 'noise', freq: 700, attack: 0.002, sustain: 0.03, decay: 0.08, volume: 0.2, lowpass: 1100, at })),
  ],
  // thunder: a crack, then a long rumble that rolls away
  thunder: [
    { wave: 'noise', freq: 4000, attack: 0.001, sustain: 0.05, decay: 0.12, volume: 0.6, lowpass: 7000 },
    { wave: 'noise', freq: 300, attack: 0.02, sustain: 0.5, decay: 1.6, volume: 0.55, lowpass: 420, at: 0.06 },
    { wave: 'sine', freq: 70, freqEnd: 28, attack: 0.02, sustain: 0.5, decay: 1.4, volume: 0.45, vibrato: { rate: 9, depth: 6 }, at: 0.06 },
    { wave: 'noise', freq: 200, attack: 0.1, sustain: 0.4, decay: 1.2, volume: 0.3, lowpass: 260, at: 0.7 },
  ],
  // Angry Dominik's hammer meets the floor, a second after he raises it (BOSS.warnTicks): the swish of the
  // swing, then a heavy thud with a crack on top and a rumble that rolls away under it
  hammerSlam: [
    { wave: 'noise', freq: 900, attack: 0.1, sustain: 0.05, decay: 0.05, volume: 0.12, lowpass: 2400, at: 0.8 },
    { wave: 'sine', freq: 95, freqEnd: 24, attack: 0.002, sustain: 0.12, decay: 0.7, volume: 0.9, at: 1 },
    { wave: 'noise', freq: 3000, attack: 0.001, sustain: 0.03, decay: 0.1, volume: 0.5, lowpass: 5000, at: 1 },
    { wave: 'noise', freq: 220, attack: 0.01, sustain: 0.3, decay: 1.1, volume: 0.5, lowpass: 320, at: 1.02 },
    { wave: 'sine', freq: 52, freqEnd: 30, attack: 0.02, sustain: 0.3, decay: 0.9, volume: 0.4, vibrato: { rate: 11, depth: 5 }, at: 1.05 },
  ],
  // Angry Dominik's eyes: a short rising charge while they aim (BOSS.laser.aimTicks), then the beam for as long
  // as it burns (BOSS.laser.burnTicks), like an energy blade held still: a crackle as it lights, and a low hum of
  // two tones a few hertz apart that beat against each other, with a soft waver
  laserAim: [
    { wave: 'sawtooth', freq: 70, freqEnd: 230, attack: 0.3, sustain: 0.4, decay: 0.12, volume: 0.07, lowpass: 900, vibrato: { rate: 14, depth: 5 } },
    { wave: 'sine', freq: 280, freqEnd: 840, attack: 0.4, sustain: 0.3, decay: 0.1, volume: 0.05 },
  ],
  laserFire: [
    { wave: 'noise', freq: 3200, attack: 0.001, sustain: 0.05, decay: 0.18, volume: 0.3, lowpass: 6000 },
    { wave: 'sawtooth', freq: 140, freqEnd: 92, attack: 0.02, sustain: 0.1, decay: 0.1, volume: 0.12, lowpass: 1200 },
    { wave: 'sawtooth', freq: 92, attack: 0.05, sustain: 1.3, decay: 0.22, volume: 0.13, lowpass: 520, vibrato: { rate: 5, depth: 2.5 } },
    { wave: 'sawtooth', freq: 95.5, attack: 0.05, sustain: 1.3, decay: 0.22, volume: 0.13, lowpass: 520 },
    { wave: 'square', freq: 184, attack: 0.08, sustain: 1.25, decay: 0.22, volume: 0.025, lowpass: 800, vibrato: { rate: 4, depth: 3 } },
  ],
  rare_thunderHammer: [
    { wave: 'noise', freq: 2500, attack: 0.001, sustain: 0.03, decay: 0.1, volume: 0.4, lowpass: 5000 },
    { wave: 'sine', freq: 120, freqEnd: 40, attack: 0.002, sustain: 0.06, decay: 0.25, volume: 0.4 },
    { wave: 'square', freq: 1400, freqEnd: 500, attack: 0.001, sustain: 0.03, decay: 0.1, volume: 0.06, vibrato: { rate: 60, depth: 300 } },
  ],
  // the Tarantula Queen: a long dry hiss with a rattle of clicks under it
  roar_spider: [
    { wave: 'noise', freq: 4000, attack: 0.05, sustain: 0.5, decay: 0.4, volume: 0.24, lowpass: 6500 },
    { wave: 'square', freq: 1500, freqEnd: 700, attack: 0.01, sustain: 0.45, decay: 0.2, volume: 0.06, vibrato: { rate: 55, depth: 500 }, lowpass: 3200 },
    { wave: 'sawtooth', freq: 110, freqEnd: 70, attack: 0.04, sustain: 0.4, decay: 0.35, volume: 0.14, vibrato: { rate: 42, depth: 22 }, lowpass: 700 },
  ],
  // the witch: a cackle, high and nasal, that falls and wavers ("hä-hä-hä-hä"), with a breath of air in it
  roar_witch: [
    ...[1180, 1090, 1150, 1020, 940].map((freq, i): SynthParams => ({ wave: 'square', freq, freqEnd: freq * 0.82, attack: 0.006, sustain: 0.05, decay: 0.06, volume: 0.075, vibrato: { rate: 34, depth: 60 }, lowpass: 2600, at: i * 0.105 })),
    ...[590, 545, 575, 510, 470].map((freq, i): SynthParams => ({ wave: 'sawtooth', freq, freqEnd: freq * 0.8, attack: 0.006, sustain: 0.05, decay: 0.06, volume: 0.05, lowpass: 1500, at: i * 0.105 })),
    { wave: 'noise', freq: 2000, attack: 0.02, sustain: 0.4, decay: 0.15, volume: 0.05, lowpass: 3800 },
  ],
  // a drum of the Schrättelestanz: a low skin struck hard, a slap on top
  witchDrum: [
    { wave: 'sine', freq: 118, freqEnd: 48, attack: 0.002, sustain: 0.03, decay: 0.32, volume: 0.5 },
    { wave: 'noise', freq: 500, attack: 0.001, sustain: 0.015, decay: 0.07, volume: 0.22, lowpass: 1300 },
    { wave: 'triangle', freq: 74, freqEnd: 55, attack: 0.004, sustain: 0.05, decay: 0.25, volume: 0.2 },
  ],
  // the bonfire: a few dry cracks of the wood, one after the other, and a soft roar under them
  fireCrackle: [
    ...[0, 0.07, 0.19, 0.24, 0.41].map((at, i): SynthParams => ({ wave: 'noise', freq: 3000, attack: 0.001, sustain: 0.004, decay: 0.025 + (i % 2) * 0.02, volume: 0.07 + (i % 3) * 0.02, lowpass: 5200 - i * 500, at })),
    { wave: 'noise', freq: 300, attack: 0.15, sustain: 0.25, decay: 0.2, volume: 0.05, lowpass: 420 },
  ],
  // fire swept through the air: a rushing breath that swells and dies away
  fireWhoosh: [
    { wave: 'noise', freq: 800, attack: 0.12, sustain: 0.1, decay: 0.3, volume: 0.24, lowpass: 900 },
    { wave: 'noise', freq: 2000, attack: 0.05, sustain: 0.08, decay: 0.2, volume: 0.08, lowpass: 2600 },
    { wave: 'sine', freq: 80, freqEnd: 140, attack: 0.1, sustain: 0.1, decay: 0.2, volume: 0.12 },
  ],
  // she comes down on someone: a heavy, muffled thump, and the breath pressed out of them
  witchPress: [
    { wave: 'sine', freq: 90, freqEnd: 36, attack: 0.002, sustain: 0.06, decay: 0.35, volume: 0.6 },
    { wave: 'noise', freq: 400, attack: 0.002, sustain: 0.05, decay: 0.2, volume: 0.25, lowpass: 700 },
    { wave: 'sawtooth', freq: 160, freqEnd: 95, attack: 0.05, sustain: 0.25, decay: 0.3, volume: 0.08, vibrato: { rate: 9, depth: 6 }, lowpass: 600, at: 0.08 },
  ],
  // a little witch near by: a nasty giggle, quick and thin, that climbs and tips over into a croak at its end
  witchGiggle: [
    ...[1500, 1640, 1780, 1700, 1860, 1620, 1380].map((freq, i): SynthParams => ({ wave: 'square', freq, freqEnd: freq * (i < 5 ? 1.08 : 0.7), attack: 0.004, sustain: 0.028, decay: 0.035, volume: 0.05, vibrato: { rate: 41, depth: 90 }, lowpass: 3400, at: i * 0.072 })),
    ...[750, 820, 890, 850, 930, 810, 690].map((freq, i): SynthParams => ({ wave: 'sawtooth', freq, freqEnd: freq * (i < 5 ? 1.06 : 0.6), attack: 0.004, sustain: 0.028, decay: 0.035, volume: 0.03, lowpass: 1900, at: i * 0.072 })),
    { wave: 'sawtooth', freq: 240, freqEnd: 150, attack: 0.01, sustain: 0.08, decay: 0.12, volume: 0.045, vibrato: { rate: 23, depth: 30 }, lowpass: 900, at: 0.5 },
    { wave: 'noise', freq: 2600, attack: 0.02, sustain: 0.42, decay: 0.12, volume: 0.03, lowpass: 4200 },
  ],
  // the witch herself laughs: slow and deep in the throat, hoarse, each "ha" lower than the last, and the last one
  // drawn out and falling away
  witchLaugh: [
    ...[330, 312, 296, 278, 262, 244].map((freq, i): SynthParams => ({ wave: 'sawtooth', freq, freqEnd: freq * 0.78, attack: 0.012, sustain: 0.08, decay: 0.07, volume: 0.11, vibrato: { rate: 19, depth: 26 }, lowpass: 1500, at: i * 0.19 })),
    ...[660, 624, 592, 556, 524, 488].map((freq, i): SynthParams => ({ wave: 'square', freq, freqEnd: freq * 0.8, attack: 0.012, sustain: 0.07, decay: 0.06, volume: 0.04, vibrato: { rate: 31, depth: 50 }, lowpass: 2300, at: i * 0.19 })),
    { wave: 'sawtooth', freq: 226, freqEnd: 96, attack: 0.02, sustain: 0.35, decay: 0.5, volume: 0.12, vibrato: { rate: 11, depth: 22 }, lowpass: 1200, at: 1.14 },
    { wave: 'square', freq: 452, freqEnd: 190, attack: 0.02, sustain: 0.3, decay: 0.4, volume: 0.035, vibrato: { rate: 27, depth: 60 }, lowpass: 2000, at: 1.14 },
    { wave: 'noise', freq: 1800, attack: 0.05, sustain: 1.5, decay: 0.4, volume: 0.035, lowpass: 2600 },
  ],
  // a little witch sees someone and comes for them: a shriek that shoots up, shrill and ragged, and breaks off
  witchShriek: [
    { wave: 'square', freq: 980, freqEnd: 2500, attack: 0.02, sustain: 0.3, decay: 0.16, volume: 0.07, vibrato: { rate: 27, depth: 170 }, lowpass: 4200 },
    { wave: 'sawtooth', freq: 1470, freqEnd: 3300, attack: 0.03, sustain: 0.26, decay: 0.14, volume: 0.04, vibrato: { rate: 33, depth: 240 }, lowpass: 5200 },
    { wave: 'noise', freq: 3200, attack: 0.03, sustain: 0.28, decay: 0.16, volume: 0.07, lowpass: 6000 },
    { wave: 'square', freq: 1900, freqEnd: 900, attack: 0.005, sustain: 0.03, decay: 0.09, volume: 0.05, lowpass: 3000, at: 0.44 },
  ],
  // the police car's siren: the two tones of the horn, high and low and again, as long as it is till the next one
  siren: [
    ...[585, 435, 585, 435].flatMap((freq, i): SynthParams[] => [
      { wave: 'square', freq, attack: 0.02, sustain: 0.33, decay: 0.05, volume: 0.05, lowpass: 1500, at: i * 0.4 },
      { wave: 'sawtooth', freq: freq * 2, attack: 0.02, sustain: 0.33, decay: 0.05, volume: 0.022, lowpass: 2400, at: i * 0.4 },
    ]),
  ],
  // a shark breaks out of the lake: the water bursts, a deep snarl under it, and the splash rains down
  sharkLeap: [
    { wave: 'noise', freq: 1200, attack: 0.01, sustain: 0.12, decay: 0.45, volume: 0.32, lowpass: 2200 },
    { wave: 'sawtooth', freq: 150, freqEnd: 70, attack: 0.03, sustain: 0.3, decay: 0.3, volume: 0.16, vibrato: { rate: 26, depth: 18 }, lowpass: 700, at: 0.05 },
    { wave: 'noise', freq: 5000, attack: 0.05, sustain: 0.2, decay: 0.5, volume: 0.07, lowpass: 7000, at: 0.25 },
  ],
  // the wooden mask turns round: a slow creak of wood
  maskTurn: [
    { wave: 'sawtooth', freq: 140, freqEnd: 105, attack: 0.03, sustain: 0.4, decay: 0.15, volume: 0.12, vibrato: { rate: 23, depth: 18 }, lowpass: 1100 },
    { wave: 'square', freq: 280, freqEnd: 230, attack: 0.03, sustain: 0.35, decay: 0.1, volume: 0.04, vibrato: { rate: 41, depth: 30 }, lowpass: 1400 },
  ],
  // she bursts: a wet pop, and a swarm of small clicks running off
  bossBurst: [
    { wave: 'noise', freq: 900, attack: 0.002, sustain: 0.08, decay: 0.3, volume: 0.5, lowpass: 1400 },
    { wave: 'sine', freq: 160, freqEnd: 40, attack: 0.002, sustain: 0.06, decay: 0.3, volume: 0.4 },
    ...Array.from({ length: 9 }, (_, i): SynthParams => ({ wave: 'square', freq: 1800 + (i % 3) * 400, attack: 0.001, sustain: 0.012, decay: 0.03, volume: 0.07, at: 0.18 + i * 0.07 })),
  ],
  growl_croc: [
    { wave: 'sawtooth', freq: 95, freqEnd: 70, attack: 0.03, sustain: 0.28, decay: 0.2, volume: 0.2, vibrato: { rate: 27, depth: 12 }, lowpass: 700 },
    { wave: 'noise', freq: 400, attack: 0.02, sustain: 0.2, decay: 0.2, volume: 0.14, lowpass: 600 },
  ],
  screech_monkey: [
    { wave: 'square', freq: 880, freqEnd: 1320, attack: 0.01, sustain: 0.1, decay: 0.08, volume: 0.07, vibrato: { rate: 21, depth: 140 } },
    { wave: 'square', freq: 1040, freqEnd: 1480, attack: 0.01, sustain: 0.1, decay: 0.1, volume: 0.07, vibrato: { rate: 21, depth: 140 }, at: 0.17 },
  ],
  wormSplit: [
    { wave: 'noise', freq: 900, attack: 0.002, sustain: 0.05, decay: 0.2, volume: 0.3, lowpass: 1200 },
    { wave: 'square', freq: 200, freqEnd: 60, attack: 0.002, sustain: 0.05, decay: 0.2, volume: 0.12 },
  ],
  gameWon: notes('square', [523, 659, 784, 1047, 784, 1047, 1319], 0.12, 0.11, 0.25, 0.06),
  gameLost: notes('sawtooth', [523, 466, 415, 392], 0.25, 0.1, 0.3, 0.12).map(n => ({ ...n, lowpass: 1800 })),
  // a run of kills, said to everyone
  announce: notes('square', [523, 659, 784, 1047, 1319], 0.07, 0.09, 0.14, 0.05),
  // the Lock-On Launcher has its target; and for whoever a missile is after
  lockOn: notes('square', [1320, 1760], 0.05, 0.07, 0.05, 0.02),
  lockWarn: notes('sawtooth', [880, 660, 880, 660], 0.07, 0.08, 0.05, 0.03),
  uiClick: [{ wave: 'square', freq: 1200, attack: 0.001, sustain: 0.01, decay: 0.03, volume: 0.06 }],
};

/** Sounds whose pitch is randomly varied a little each time, so repeats don't get monotonous. */
export const JITTER: ReadonlySet<SoundId> = new Set<SoundId>([
  'enemyHit',
  'enemyKilled',
  'shot_pixelBlaster',
  'shot_candyCannon',
  'shot_laserSword',
  'swordClash',
  'tower_laser',
  'tower_popcorn',
  'playerHit',
  'vehicleHit',
  'hitConfirm',
  'explosion',
  'kartRam',
  'enemyShot',
  'rare_slushMachine',
  'rare_leafBlower',
  'witchGiggle',
  'witchShriek',
]);

export const MAX_COIN_STREAK_STEPS = 12;
/** a run of maze pixels climbs half a semitone a pixel, an octave in all: then it stays up there */
export const MAX_MAZE_STREAK_STEPS = 24;
const SEMITONE = 1.059;

const WINDUP: Partial<Record<EnemyKind, SoundId>> = { witchling: 'witchShriek', shooter: 'windup_shooter', bomber: 'windup_bomber', rammer: 'windup_rammer', teleporter: 'windup_shooter', croc: 'growl_croc', monkey: 'screech_monkey', trex: 'roar_rex' };

/** how far from where a sword was swung a hit can still be its own (the longest blade, and a little more) */
const SWORD_HIT_REACH = 4;

/**
 * The clash of a Laser Sword on what it cut: one for every swing in `events` that hit something near it (a
 * monster, another player, a vehicle), a little lower the more it hit at once. The game says only that a sword
 * was swung and, separately, what was hit where: a hit close to the swing that is not the swinger is its own.
 */
export function swordClashes(events: readonly SimEvent[]): { id: SoundId; pitch: number }[] {
  const out: { id: SoundId; pitch: number }[] = [];
  for (const e of events) {
    if (e.type !== 'shot' || e.weapon !== 'laserSword') continue;
    let hits = 0;
    for (const h of events) {
      // (a hit on a player or a vehicle says who dealt it: then it must be the swinger)
      const pos = h.type === 'enemyHit' ? h.pos : (h.type === 'playerHit' || h.type === 'vehicleHit') && (h.by ?? -1) === (e.playerId ?? -2) ? h.pos : null;
      if (pos && Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z) <= SWORD_HIT_REACH) hits++;
    }
    if (hits > 0) out.push({ id: 'swordClash', pitch: Math.max(0.8, 1.05 - 0.05 * hits) });
  }
  return out;
}

export function soundsForEvent(e: SimEvent): { id: SoundId; pitch: number }[] {
  const one = (id: SoundId, pitch = 1) => [{ id, pitch }];
  switch (e.type) {
    case 'shot':
      return one(`shot_${e.weapon}`);
    case 'discoZap':
      return one('discoZap');
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
    case 'towerDone':
      return one('towerBuilt', 1.25 + 0.1 * e.level);
    case 'towerUpgrade':
      return one('towerBuilt', 0.8);
    case 'buildDenied':
    case 'upgradeDenied':
      return one('buildDenied');
    case 'towerFired':
      return one(`tower_${e.kind}`);
    case 'railFired':
      // the zap itself comes with the shot; this is the crack where the beam ends
      return one('enemyHit', 0.6);
    case 'enemyHealed':
      return one('coin', 0.6);
    case 'enemyBlink':
      return one('jetpackPicked', 1.6);
    case 'teslaChain':
      return one('tower_tesla');
    case 'towerHealed':
      return one('tower_medic');
    case 'magnetPull':
      // the hum comes with the shot; this is the clack of things pulled together
      return one('enemyHit', 0.45);
    case 'playerHit':
      return one('playerHit');
    case 'vehicleHit':
      return one('vehicleHit');
    case 'playerDown':
      return one('playerDown');
    case 'playerRespawn':
      return one('playerRespawn');
    case 'creditLost':
      return one('creditLost');
    case 'logoHit':
      // every hit rings a little higher
      return one('coin', 0.8 + 0.04 * e.hits);
    case 'logoEgg':
      return e.prize === 'nothing' ? one('buildDenied') : one('elevatorOpen', 1.4);
    case 'heartFound':
      return one('elevatorOpen', 1.3);
    case 'playerOut':
      return one('playerDown', 0.6);
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
    case 'nestAppeared':
      return one('alarm', 0.8);
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
    case 'siren':
      return one('siren');
    case 'witchCackle':
      // (the witch herself: a bigger, lower shriek, and her own laugh)
      if (e.boss) return e.shriek ? [{ id: 'witchShriek', pitch: 0.7 }] : one('witchLaugh');
      return one(e.shriek ? 'witchShriek' : 'witchGiggle');
    case 'kartRam':
      return one('kartRam');
    case 'kartJump':
      return one('kartJump');
    case 'kartLand':
      return one('kartLand');
    case 'kartDestroyed':
    case 'raceWreck':
      return one('kartDestroyed');
    case 'countdown':
      // a beep for every number, rising, and a fanfare at GO!
      return e.n > 0 ? one('comboUp', 0.7 + 0.07 * (6 - e.n)) : one('elevatorOpen', 1.15);
    case 'raceLap':
      return one('comboUp', 1 + 0.1 * Math.min(e.lap, 6));
    case 'raceEnd':
    case 'versusEnd':
      return one('gameWon');
    case 'gunLevel':
      return one('cardPicked', 1.2);
    case 'pvpKill':
      return one('enemyKilled', 0.7);
    case 'killStreak':
      return one('announce', 1 + 0.12 * Math.max(0, e.n - 3));
    case 'killBonus':
      return one('powerupPicked', 1.25);
    case 'versusRound':
    case 'kingMoved':
      return one('elevatorOpen');
    case 'emote':
      // a ping chirps higher than a message
      return one('select', e.pos ? 1.6 : 1.3);
    case 'krakenGrab':
      return one('kartRam', 0.6);
    case 'krakenRelease':
      return one('dash', 1.2);
    case 'unicornAppeared':
      return one('cardPicked', 1.5);
    case 'sharkLeap':
      return one('sharkLeap');
    case 'coinOpRule':
      // an arcade jingle: the rules just changed
      return one('cardPicked', 1.15);
    case 'cubeTaken':
      return one('powerupPicked', 0.8);
    case 'cubeDropped':
      return one('buildDenied');
    case 'cubeReturned':
      return one('select');
    case 'cubeCaptured':
      return one('gameWon');
    case 'mazePixel':
      return one('mazePixel', SEMITONE ** (Math.min(e.streak - 1, MAX_MAZE_STREAK_STEPS) / 2));
    case 'mazePower':
      return one('powerupPicked');
    case 'mazeGhost':
      return one('enemyKilled', 1.4);
    case 'mazeCaught':
      return one('playerHit');
    case 'mazeEnd':
      return one('gameWon');
    case 'laneLeak':
      return one('playerHit');
    case 'laneEnd':
      return one(e.coreLeft > 0 ? 'gameWon' : 'gameLost');
    case 'towerDestroyed':
      return one('kartDestroyed', 0.8);
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
    case 'floorCleared':
      return one('elevatorOpen');
    case 'floorStart':
      return one('waveStart');
    case 'bought':
      return one('crateCoins');
    case 'buyDenied':
      return one('buildDenied');
    case 'bossSpawn':
      // the siren, then the boss itself (Angry Dominik arrives with thunder)
      return [{ id: e.kind === 'dominik' ? 'thunder' : 'bossSpawn', pitch: 1 }, { id: `roar_${e.kind}`, pitch: 0.9 }];
    case 'bossAttack':
      return one(`roar_${e.kind}`);
    case 'bossPhase':
      return one('bossPhase');
    case 'bossDead':
      // (the witch goes up in her fire)
      return e.kind === 'dominik' ? [{ id: 'thunder', pitch: 1 }, { id: 'bossDead', pitch: 1 }] : e.kind === 'witch' ? [{ id: 'fireWhoosh', pitch: 0.55 }, { id: 'bossDead', pitch: 1 }, { id: 'roar_witch', pitch: 1.6 }] : one('bossDead');
    case 'heliMissiles':
      return one('heliMissiles');
    case 'heliGun':
      return one('heliGun');
    case 'heliDown':
      return one('heliWhine');
    case 'heliUp':
      return one('heliWhine', 1.5);
    case 'heliSwoop':
      return one('heliWhine', 0.8);
    case 'heliRotor':
      return one(e.low ? 'heliRotorLow' : 'heliRotor');
    case 'heliCrash':
      return one('heliCrash');
    case 'dominikJoined':
      return [{ id: 'thunder', pitch: 1.3 }, { id: 'roar_dominik', pitch: 1.5 }];
    case 'dominikLeft':
      return one('dash', 0.7);
    case 'hammerThrow':
      return one('dash', 0.6);
    case 'hammerSlam':
      return one('hammerSlam');
    case 'lightning':
      // a short, sharp crack (the long thunder is for his arrival and his end)
      return one('rare_thunderHammer', 1.25);
    case 'laserAim':
      return one('laserAim');
    case 'laserFire':
      return one('laserFire');
    case 'bossBurst':
      return [{ id: 'bossBurst', pitch: 1 }, { id: `roar_${e.kind}`, pitch: 1.5 }];
    case 'eggHatch':
      // the shell cracks, and a very small roar
      return [{ id: 'bubblePop', pitch: 0.8 }, { id: 'roar_rex', pitch: 2.4 }];
    case 'wormSplit':
      return one('wormSplit');
    case 'witchPress':
      return [{ id: 'witchPress', pitch: 1 }, { id: 'witchLaugh', pitch: 1.1 }];
    case 'witchRelease':
      return one('dash', e.broke ? 1.2 : 0.9);
    case 'witchDance':
      return [{ id: 'witchDrum', pitch: 1 }, { id: 'roar_witch', pitch: 1.15 }];
    case 'witchDrum':
      // (every third beat a deeper one)
      return one('witchDrum', e.beat % 3 === 0 ? 0.8 : 1 + (e.beat % 2) * 0.12);
    case 'witchDanceEnd':
      return [{ id: 'fireWhoosh', pitch: 0.7 }, { id: 'roar_witch', pitch: 0.7 }];
    case 'witchFace':
      return [{ id: 'maskTurn', pitch: 1 }, { id: 'witchLaugh', pitch: 0.85 }];
    case 'witchSweep':
      return one('fireWhoosh');
    case 'witchTwigs':
      return one('fireWhoosh', 1.4);
    case 'fireCrackle':
      return one('fireCrackle');
    case 'gameWon':
      return one('gameWon');
    case 'gameLost':
      return one('gameLost');
  }
}
