import { TICK_RATE, type KillCategory, type PerkKind, type SimState, type WeaponKind } from './sim/types';

/** A small record of one run, used to see how the game is actually played. Never leaves the machine. */
export interface RunLog {
  version: 1;
  seed: number;
  map: string;
  result: 'won' | 'lost' | 'playing';
  durationSeconds: number;
  score: number;
  credits: number;
  alarm: number;
  nestsDestroyed: number;
  nests: number;
  weapons: { kind: WeaponKind; level: number }[];
  perks: Record<PerkKind, number>;
  kills: Record<KillCategory, number>;
  maxCombo: number;
  damageTaken: number;
  downs: number;
  distance: number;
  /** share of the run the player did not move (0..1) */
  idleShare: number;
  /** what happened in each 10 second slice */
  samples: { t: number; distance: number; idleSeconds: number; kills: number; alarm: number }[];
}

export function buildRunLog(s: SimState): RunLog {
  const p = s.players[0];
  let prev = { distance: 0, idleTicks: 0, kills: 0 };
  const samples = s.stats.samples.map(x => {
    const out = {
      t: x.t,
      distance: x.distance - prev.distance,
      idleSeconds: (x.idleTicks - prev.idleTicks) / TICK_RATE,
      kills: x.kills - prev.kills,
      alarm: x.alarm,
    };
    prev = x;
    return out;
  });
  return {
    version: 1,
    seed: s.seed,
    map: s.map.id,
    result: s.phase,
    durationSeconds: s.tick / TICK_RATE,
    score: s.score,
    credits: s.credits,
    alarm: s.alarm.level,
    nestsDestroyed: s.nests.filter(n => n.state === 'destroyed').length,
    nests: s.nests.length,
    weapons: p.weapons.map(w => ({ kind: w.kind, level: w.level })),
    perks: { ...p.perks },
    kills: { ...s.stats.kills },
    maxCombo: s.stats.maxCombo,
    damageTaken: Math.round(s.stats.damageTaken),
    downs: s.stats.downs,
    distance: s.stats.distance,
    idleShare: s.tick > 0 ? s.stats.idleTicks / s.tick : 0,
    samples,
  };
}

const STORAGE_KEY = 'cube-crashers.runs';
const KEEP = 20;

declare global {
  interface Window {
    /** set by the desktop app's preload script */
    cubeCrashers?: {
      saveRunLog(json: string): Promise<void>;
      lan?: import('./net/electron-lan').LanBridge;
      updates?: import('./ui/update-banner').UpdateBridge;
    };
  }
}

/** Dev server: a file in logs/. Desktop app: a file in the user data folder. Always: the last 20 in localStorage. */
export function saveRunLog(log: RunLog): void {
  const json = JSON.stringify(log, null, 2);
  try {
    const runs: RunLog[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    runs.push(log);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(-KEEP)));
  } catch {
    // storage unavailable
  }
  if (window.cubeCrashers) {
    void window.cubeCrashers.saveRunLog(json).catch(() => {});
  } else if (import.meta.env.DEV) {
    void fetch('/__runlog', { method: 'POST', body: json }).catch(() => {});
  }
}
