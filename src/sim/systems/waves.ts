import { WAVE_PAUSE_SECONDS, WAVES } from '../config/waves';
import { TICK_RATE, type SimState } from '../types';
import { spawnEnemy } from './enemies';

function startWave(s: SimState): void {
  s.wave.index++;
  s.wave.pauseUntil = null;
  const def = WAVES[s.wave.index];
  const queue: SimState['wave']['spawnQueue'] = [];
  for (const g of def.groups) {
    for (let i = 0; i < g.count; i++) {
      queue.push({ kind: g.kind, at: s.tick + Math.round(i * g.interval * TICK_RATE) });
    }
  }
  const duration = Math.max(...queue.map(q => q.at - s.tick), 0);
  for (let i = 0; i < def.crates; i++) {
    queue.push({ kind: 'crate', at: s.tick + Math.round(((i + 1) / (def.crates + 1)) * duration) });
  }
  queue.sort((a, b) => a.at - b.at);
  s.wave.spawnQueue = queue;
  s.events.push({ type: 'waveStart', wave: s.wave.index + 1 });
}

export function updateWaves(s: SimState): void {
  const w = s.wave;
  if (w.pauseUntil !== null) {
    if (s.tick >= w.pauseUntil && w.index < WAVES.length - 1) startWave(s);
    return;
  }
  while (w.spawnQueue.length > 0 && w.spawnQueue[0].at <= s.tick) {
    const item = w.spawnQueue.shift()!;
    const x = s.rng.range(-s.map.laneHalfWidth + 0.5, s.map.laneHalfWidth - 0.5);
    if (item.kind !== 'crate') spawnEnemy(s, item.kind, { x, z: s.map.spawnZ });
  }
  if (w.spawnQueue.length === 0 && s.enemies.length === 0 && s.boss === null) {
    s.events.push({ type: 'waveCleared', wave: w.index + 1 });
    w.pauseUntil = s.tick + WAVE_PAUSE_SECONDS * TICK_RATE;
  }
}
