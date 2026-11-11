import type { EnemyKind } from '../types';

export interface WaveDef {
  /** groups spawn in parallel from the wave start; interval in seconds */
  groups: { kind: EnemyKind; count: number; interval: number }[];
  boss?: 'miniboss' | 'worm';
  crates: number;
}

export const WAVES: WaveDef[] = [
  { groups: [{ kind: 'blob', count: 12, interval: 1.0 }], crates: 1 },
  { groups: [{ kind: 'blob', count: 20, interval: 0.8 }], crates: 1 },
  { groups: [{ kind: 'blob', count: 20, interval: 0.7 }, { kind: 'dasher', count: 8, interval: 1.5 }], crates: 1 },
  {
    groups: [
      { kind: 'blob', count: 25, interval: 0.6 },
      { kind: 'dasher', count: 10, interval: 1.2 },
      { kind: 'tank', count: 3, interval: 5 },
    ],
    crates: 1,
  },
  {
    groups: [{ kind: 'blob', count: 30, interval: 0.6 }, { kind: 'dasher', count: 10, interval: 1.2 }],
    boss: 'miniboss',
    crates: 1,
  },
  {
    groups: [
      { kind: 'blob', count: 30, interval: 0.5 },
      { kind: 'splitter', count: 8, interval: 2 },
      { kind: 'tank', count: 4, interval: 4 },
    ],
    crates: 1,
  },
  {
    groups: [
      { kind: 'blob', count: 35, interval: 0.45 },
      { kind: 'dasher', count: 20, interval: 0.8 },
      { kind: 'splitter', count: 10, interval: 1.8 },
    ],
    crates: 1,
  },
  {
    groups: [
      { kind: 'blob', count: 40, interval: 0.4 },
      { kind: 'tank', count: 8, interval: 3 },
      { kind: 'splitter', count: 12, interval: 1.5 },
    ],
    crates: 2,
  },
  {
    groups: [
      { kind: 'blob', count: 50, interval: 0.35 },
      { kind: 'dasher', count: 25, interval: 0.6 },
      { kind: 'tank', count: 10, interval: 2.5 },
      { kind: 'splitter', count: 14, interval: 1.4 },
    ],
    crates: 2,
  },
  {
    groups: [{ kind: 'blob', count: 30, interval: 0.8 }, { kind: 'dasher', count: 15, interval: 1.2 }],
    boss: 'worm',
    crates: 1,
  },
];

export const WAVE_PAUSE_SECONDS = 5;
