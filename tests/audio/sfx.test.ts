import { describe, expect, it } from 'vitest';
import { SOUNDS, soundsForEvent } from '../../src/audio/sfx';
import { ALL_WEAPONS } from '../../src/sim/config/weapons';
import type { SimEvent } from '../../src/sim/types';

const p = { x: 0, z: 0 };

/** one example per event type; the Record type makes the compiler insist that none is missing */
const EXAMPLES: { [K in SimEvent['type']]: Extract<SimEvent, { type: K }> } = {
  shot: { type: 'shot', weapon: 'pixelBlaster', pos: p },
  weaponSelected: { type: 'weaponSelected', playerId: 0, slot: 1 },
  enemyHit: { type: 'enemyHit', pos: p },
  enemyKilled: { type: 'enemyKilled', kind: 'blob', pos: p, elite: false },
  coinPicked: { type: 'coinPicked', playerId: 0, streak: 1 },
  towerBuilt: { type: 'towerBuilt', kind: 'laser', padId: 0 },
  buildDenied: { type: 'buildDenied', padId: 0, reason: 'coins' },
  towerFired: { type: 'towerFired', kind: 'laser', pos: p, target: p },
  playerHit: { type: 'playerHit', playerId: 0, hp: 50 },
  playerDown: { type: 'playerDown', playerId: 0 },
  playerRespawn: { type: 'playerRespawn', playerId: 0 },
  creditLost: { type: 'creditLost', credits: 2 },
  jump: { type: 'jump', playerId: 0 },
  stomp: { type: 'stomp', pos: p, radius: 1.2 },
  dash: { type: 'dash', playerId: 0 },
  boost: { type: 'boost', playerId: 0 },
  comboUp: { type: 'comboUp', playerId: 0, mult: 2 },
  comboLost: { type: 'comboLost', playerId: 0 },
  enemyWindup: { type: 'enemyWindup', id: 1, kind: 'rammer', pos: p, dir: p },
  enemyShot: { type: 'enemyShot', pos: p },
  explosion: { type: 'explosion', pos: p, radius: 2 },
  nestPlanted: { type: 'nestPlanted', id: 1 },
  nestDestroyed: { type: 'nestDestroyed', id: 1, pos: p },
  alarmChanged: { type: 'alarmChanged', level: 2 },
  elevatorOpen: { type: 'elevatorOpen' },
  offerOpened: { type: 'offerOpened', pos: p },
  cardPicked: { type: 'cardPicked', playerId: 0, card: { type: 'perk', perk: 'speed' }, level: 1 },
  crateCoins: { type: 'crateCoins', playerId: 0, coins: 25 },
  powerupSpawned: { type: 'powerupSpawned', kind: 'heart', pos: p },
  powerupPicked: { type: 'powerupPicked', kind: 'heart', playerId: 0 },
  kartEnter: { type: 'kartEnter', playerId: 0 },
  kartRam: { type: 'kartRam', pos: p },
  kartJump: { type: 'kartJump', pos: p },
  kartLand: { type: 'kartLand', pos: p },
  kartDestroyed: { type: 'kartDestroyed', pos: p },
  gameWon: { type: 'gameWon', score: 1000 },
  gameLost: { type: 'gameLost' },
};

describe('soundsForEvent', () => {
  it('gives every event at least one known sound', () => {
    for (const e of Object.values(EXAMPLES)) {
      const s = soundsForEvent(e);
      expect(s.length, e.type).toBeGreaterThan(0);
      for (const x of s) expect(SOUNDS[x.id], x.id).toBeDefined();
    }
  });

  it('gives every weapon its own shot sound', () => {
    const ids = ALL_WEAPONS.map(weapon => soundsForEvent({ type: 'shot', weapon, pos: p })[0].id);
    expect(new Set(ids).size).toBe(ALL_WEAPONS.length);
  });

  it('gives every telegraphing enemy its own warning', () => {
    const ids = (['shooter', 'bomber', 'rammer'] as const).map(kind => soundsForEvent({ type: 'enemyWindup', id: 1, kind, pos: p, dir: p })[0].id);
    expect(new Set(ids).size).toBe(3);
  });

  it('raises the coin pitch with the streak, capped at 12', () => {
    expect(soundsForEvent({ type: 'coinPicked', playerId: 0, streak: 3 })[0].pitch).toBeCloseTo(1.059 ** 3);
    expect(soundsForEvent({ type: 'coinPicked', playerId: 0, streak: 50 })[0].pitch).toBeCloseTo(1.059 ** 12);
  });

  it('raises the combo jingle with the multiplier', () => {
    const pitch = (mult: number) => soundsForEvent({ type: 'comboUp', playerId: 0, mult })[0].pitch;
    expect(pitch(3)).toBeGreaterThan(pitch(2));
    expect(pitch(10)).toBeGreaterThan(pitch(9));
  });

  it('plays the long siren when the alarm hits 5', () => {
    expect(soundsForEvent({ type: 'alarmChanged', level: 5 })[0].id).toBe('overload');
    expect(soundsForEvent({ type: 'alarmChanged', level: 2 })[0].id).toBe('alarm');
  });
});
