import { describe, expect, it } from 'vitest';
import { SOUNDS, soundsForEvent } from '../../src/audio/sfx';
import type { SimEvent } from '../../src/sim/types';

const p = { x: 0, z: 0 };
const ALL_EVENTS: SimEvent[] = [
  { type: 'shot', weapon: 'pixelBlaster', pos: p },
  { type: 'shot', weapon: 'laserSword', pos: p },
  { type: 'shot', weapon: 'candyCannon', pos: p },
  { type: 'shot', weapon: 'hotdogSlinger', pos: p },
  { type: 'shot', weapon: 'joystickBoomerang', pos: p },
  { type: 'shot', weapon: 'discoBall', pos: p },
  { type: 'enemyHit', pos: p },
  { type: 'enemyKilled', kind: 'blob', pos: p },
  { type: 'coinPicked', playerId: 0, streak: 1 },
  { type: 'crateOpened', playerId: 0, weapon: 'discoBall', level: 1 },
  { type: 'towerBuilt', kind: 'laser', padId: 0 },
  { type: 'buildDenied', padId: 0, reason: 'coins' },
  { type: 'towerFired', kind: 'laser', pos: p, target: p },
  { type: 'towerFired', kind: 'popcorn', pos: p, target: p },
  { type: 'towerFired', kind: 'frost', pos: p, target: p },
  { type: 'baseHit', hp: 3 },
  { type: 'playerHit', playerId: 0, hp: 50 },
  { type: 'playerDown', playerId: 0 },
  { type: 'playerRespawn', playerId: 0 },
  { type: 'waveStart', wave: 2 },
  { type: 'bossSpawn', kind: 'worm' },
  { type: 'bossPhase', phase: 2 },
  { type: 'bossTelegraph', pos: p, radius: 2, delay: 1.2 },
  { type: 'bossImpact', pos: p, radius: 2 },
  { type: 'wormSplit', pos: p },
  { type: 'bossDead', pos: p },
  { type: 'gameWon', stars: 3 },
  { type: 'gameLost' },
];

describe('soundsForEvent', () => {
  it('maps every event (except waveCleared) to at least one known sound', () => {
    for (const e of ALL_EVENTS) {
      const s = soundsForEvent(e);
      expect(s.length, e.type).toBeGreaterThan(0);
      for (const x of s) expect(SOUNDS[x.id], x.id).toBeDefined();
    }
    expect(soundsForEvent({ type: 'waveCleared', wave: 1 })).toEqual([]);
  });

  it('gives every weapon its own shot sound', () => {
    const ids = ALL_EVENTS.filter(e => e.type === 'shot').map(e => soundsForEvent(e)[0].id);
    expect(new Set(ids).size).toBe(6);
  });

  it('raises the coin pitch with the streak, capped at 12', () => {
    expect(soundsForEvent({ type: 'coinPicked', playerId: 0, streak: 3 })[0].pitch).toBeCloseTo(1.059 ** 3);
    expect(soundsForEvent({ type: 'coinPicked', playerId: 0, streak: 50 })[0].pitch).toBeCloseTo(1.059 ** 12);
  });
});
