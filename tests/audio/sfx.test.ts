import { describe, expect, it } from 'vitest';
import { SOUNDS, soundsForEvent } from '../../src/audio/sfx';
import { ALL_WEAPONS } from '../../src/sim/config/weapons';
import type { SimEvent } from '../../src/sim/types';

const p = { x: 0, z: 0 };

/** one example per event type; the Record type makes the compiler insist that none is missing */
const EXAMPLES: { [K in SimEvent['type']]: Extract<SimEvent, { type: K }> } = {
  shot: { type: 'shot', weapon: 'pixelBlaster', pos: p },
  weaponSelected: { type: 'weaponSelected', playerId: 0, slot: 1 },
  enemyHit: { type: 'enemyHit', id: 1, pos: p, amount: 5 },
  enemyKilled: { type: 'enemyKilled', kind: 'blob', pos: p, elite: false },
  coinPicked: { type: 'coinPicked', playerId: 0, streak: 1 },
  towerBuilt: { type: 'towerBuilt', kind: 'laser', padId: 0, playerId: 0 },
  buildDenied: { type: 'buildDenied', padId: 0, reason: 'coins', playerId: 0 },
  upgradeDenied: { type: 'upgradeDenied', padId: 0, reason: 'coins', playerId: 0 },
  towerUpgrade: { type: 'towerUpgrade', padId: 0, level: 2, playerId: 0 },
  towerDone: { type: 'towerDone', padId: 0, level: 1 },
  raceLap: { type: 'raceLap', playerId: 0, lap: 1 },
  pvpKill: { type: 'pvpKill', killerId: 0, victimId: 1 },
  gunLevel: { type: 'gunLevel', playerId: 0, level: 1, weapon: 'candyCannon' },
  railFired: { type: 'railFired', from: { x: 0, z: 0 }, to: { x: 5, z: 0 } },
  magnetPull: { type: 'magnetPull', from: { x: 0, z: 0 }, to: { x: 5, z: 0 } },
  cubeTaken: { type: 'cubeTaken', team: 1, playerId: 0 },
  cubeDropped: { type: 'cubeDropped', team: 1, pos: { x: 0, z: 0 } },
  cubeReturned: { type: 'cubeReturned', team: 1 },
  cubeCaptured: { type: 'cubeCaptured', team: 0, playerId: 0 },
  kingMoved: { type: 'kingMoved', pos: { x: 0, z: 0 } },
  versusRound: { type: 'versusRound', winner: 0, round: 1 },
  versusEnd: { type: 'versusEnd', winners: [0] },
  mazePower: { type: 'mazePower', playerId: 0 },
  mazeGhost: { type: 'mazeGhost', playerId: 0, pos: { x: 0, z: 0 } },
  mazeCaught: { type: 'mazeCaught', playerId: 0 },
  mazeEnd: { type: 'mazeEnd', cleared: true, collected: { 0: 10 } },
  laneLeak: { type: 'laneLeak', pos: { x: 0, z: 0 }, coreHp: 90 },
  laneEnd: { type: 'laneEnd', coreLeft: 1, coins: 120 },
  raceEnd: { type: 'raceEnd', laps: { 0: 2 }, medal: 'bronze', winners: [] },
  raceWreck: { type: 'raceWreck', playerId: 0, pos: { x: 0, z: 0 } },
  towerFired: { type: 'towerFired', kind: 'laser', pos: p, target: p },
  towerDestroyed: { type: 'towerDestroyed', kind: 'laser', pos: p },
  playerHit: { type: 'playerHit', playerId: 0, hp: 50 },
  playerDown: { type: 'playerDown', playerId: 0 },
  playerRespawn: { type: 'playerRespawn', playerId: 0 },
  playerDowned: { type: 'playerDowned', playerId: 1 },
  playerRevived: { type: 'playerRevived', playerId: 1, by: 0 },
  teamWipe: { type: 'teamWipe' },
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
  blastWarning: { type: 'blastWarning', pos: p, radius: 1.8 },
  nestPlanted: { type: 'nestPlanted', id: 1 },
  nestAppeared: { type: 'nestAppeared', id: 1, pos: p },
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
  jetpackPicked: { type: 'jetpackPicked', playerId: 0 },
  jetpackEmpty: { type: 'jetpackEmpty', playerId: 0 },
  rareFired: { type: 'rareFired', kind: 'slushMachine', playerId: 0, pos: p },
  rareExpired: { type: 'rareExpired', playerId: 0 },
  bubblePop: { type: 'bubblePop', pos: p },
  floorCleared: { type: 'floorCleared', floor: 0 },
  floorStart: { type: 'floorStart', floor: 1, mapId: 'candy' },
  bought: { type: 'bought', playerId: 0, offer: 0, kind: 'heal' },
  buyDenied: { type: 'buyDenied', playerId: 0, offer: 0 },
  bossSpawn: { type: 'bossSpawn', kind: 'worm' },
  bossPhase: { type: 'bossPhase', phase: 2 },
  bossDead: { type: 'bossDead', pos: p },
  wormSplit: { type: 'wormSplit', pos: p },
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

  it('gives every rare weapon its own sound', () => {
    const ids = (['slushMachine', 'bubblegumBazooka', 'leafBlower', 'pizzaCutter'] as const).map(kind => soundsForEvent({ type: 'rareFired', kind, playerId: 0, pos: p })[0].id);
    expect(new Set(ids).size).toBe(4);
  });

  it('plays the long siren when the alarm hits 5', () => {
    expect(soundsForEvent({ type: 'alarmChanged', level: 5 })[0].id).toBe('overload');
    expect(soundsForEvent({ type: 'alarmChanged', level: 2 })[0].id).toBe('alarm');
  });
});
