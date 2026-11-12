import { describe, expect, it } from 'vitest';
import { ALARM_TICKS, REVIVE_HOLD_TICKS, REVIVE_TICKS, RESPAWN_TICKS } from '../../src/sim/config/balance';
import { DIFFICULTY } from '../../src/sim/config/difficulty';
import { ENEMIES } from '../../src/sim/config/enemies';
import { floor01 } from '../../src/sim/config/floor01';
import { BLOCKS_WALKER, isFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { damageEnemy } from '../../src/sim/systems/combat';
import { addPlayer, backIn, removePlayer } from '../../src/sim/systems/coop';
import { enterFloor, floorCleared } from '../../src/sim/systems/run';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { spawnHorde } from '../../src/sim/systems/hordes';
import { damagePlayer } from '../../src/sim/systems/player';
import { addKart } from '../../src/sim/systems/vehicles';
import type { Command, Difficulty, SimEvent, SimState } from '../../src/sim/types';
import { rel, run } from './helpers';

function team(players: number, difficulty: Difficulty = 'medium'): SimState {
  const s = createSim(floor01, 9, { players, difficulty });
  s.enemies = [];
  s.hordes = [];
  s.nests = [];
  s.crates = [];
  s.vehicles = [];
  s.jetpacks = [];
  s.nextJetpackAt = Number.MAX_SAFE_INTEGER;
  s.nextPowerupAt = Number.MAX_SAFE_INTEGER;
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  return s;
}

const hold = (playerId: number): Command => ({ type: 'hold', playerId });

describe('a team', () => {
  it('spawns on separate free tiles with their own colours and names', () => {
    const s = team(3);
    expect(s.players.map(p => p.id)).toEqual([0, 1, 2]);
    expect(new Set(s.players.map(p => p.color)).size).toBe(3);
    expect(new Set(s.players.map(p => `${p.pos.x},${p.pos.z}`)).size).toBe(3);
    for (const p of s.players) {
      expect(isFree(s.map, p.pos, 0.4, BLOCKS_WALKER)).toBe(true);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it('can take in a late joiner and lose a player again', () => {
    const s = team(1);
    const p = addPlayer(s, 7, 'Kim');
    expect(s.players).toHaveLength(2);
    expect(p.name).toBe('Kim');
    expect(p.color).not.toBe(s.players[0].color);
    removePlayer(s, 0);
    expect(s.players.map(x => x.id)).toEqual([7]);
  });
});

describe('reviving', () => {
  it('a downed player waits 8 seconds and is brought back by a teammate holding E', () => {
    const s = team(2);
    const [a, b] = s.players;
    b.pos = rel(a.pos, 1, 0);
    damagePlayer(s, b, 1000);
    expect(s.events).toContainEqual({ type: 'playerDowned', playerId: 1 });
    expect(s.players.map(p => p.lives)).toEqual([3, 3]);
    expect(b.reviveUntil).toBe(s.tick + REVIVE_TICKS);
    const events = run(s, REVIVE_HOLD_TICKS + 1, () => [hold(0)]);
    expect(events).toContainEqual({ type: 'playerRevived', playerId: 1, by: 0 });
    expect(b.downUntil).toBeNull();
    expect(b.hp).toBe(b.maxHp / 2);
    expect(s.players.map(p => p.lives)).toEqual([3, 3]);
    expect(a.stats.revives).toBe(1);
  });

  it('costs the downed player one of their own lives when nobody comes in time', () => {
    const s = team(2);
    const [a, b] = s.players;
    expect([a.lives, b.lives]).toEqual([3, 3]);
    b.pos = rel(a.pos, 8, 0);
    damagePlayer(s, b, 1000);
    const events = run(s, REVIVE_TICKS + 1);
    expect(events).toContainEqual({ type: 'creditLost', credits: 2, playerId: b.id });
    expect([a.lives, b.lives]).toEqual([3, 2]);
    expect(b.reviveUntil).toBeNull();
    run(s, RESPAWN_TICKS + 1);
    expect(b.downUntil).toBeNull();
  });

  it('when the whole team is down, everyone loses a life and gets back up', () => {
    const s = team(2);
    damagePlayer(s, s.players[1], 1000);
    damagePlayer(s, s.players[0], 1000);
    expect(s.players.map(p => p.lives)).toEqual([2, 2]);
    expect(s.events).toContainEqual({ type: 'teamWipe' });
    run(s, RESPAWN_TICKS + 1);
    expect(s.players.every(p => p.downUntil === null)).toBe(true);
  });

  it('a player out of lives is out, the others play on, and the next floor brings them back with one', () => {
    const s = createSim(floor01, 9, { mode: 'run', players: 2 });
    const [a, b] = s.players;
    b.lives = 1;
    b.pos = rel(a.pos, 8, 0);
    damagePlayer(s, b, 1000);
    const events = run(s, REVIVE_TICKS + 1);
    expect(b.out).toBe(true);
    expect(events).toContainEqual({ type: 'playerOut', playerId: b.id });
    expect(s.phase).toBe('playing');
    // still out a while later: no respawn without a life
    run(s, RESPAWN_TICKS + 1);
    expect(b.downUntil).not.toBeNull();
    enterFloor(s, 1);
    expect(b.out).toBe(false);
    expect(b.lives).toBe(1);
    expect(b.downUntil).toBeNull();
  });

  it('who was out is back as soon as the floor is cleared, so they play the game between the floors too', () => {
    const s = createSim(floor01, 9, { mode: 'run', players: 2 });
    const b = s.players[1];
    b.lives = 0;
    b.out = true;
    b.downUntil = Number.MAX_SAFE_INTEGER;
    for (const n of s.nests) n.state = 'destroyed';
    s.enemies = [];
    floorCleared(s);
    expect(b.out).toBe(false);
    expect(b.lives).toBe(1);
    expect(b.downUntil).toBeNull();
    expect(s.credits).toBe(s.players[0].lives! + 1);
  });

  it('the run is lost when the last player still in the game leaves', () => {
    const s = team(2);
    const [a] = s.players;
    a.lives = 1;
    damagePlayer(s, a, 1000);
    run(s, REVIVE_TICKS + 1);
    expect(a.out).toBe(true);
    removePlayer(s, s.players[1].id);
    expect(s.phase).toBe('lost');
  });

  it('a life from the shop brings an out player back, and the next floor does not take it away', () => {
    const s = createSim(floor01, 9, { mode: 'run', players: 2 });
    const b = s.players[1];
    b.lives = 0;
    b.out = true;
    b.downUntil = Number.MAX_SAFE_INTEGER;
    backIn(s, 2);
    expect([b.out, b.lives, b.downUntil]).toEqual([false, 2, null]);
    enterFloor(s, 1);
    expect(b.lives).toBe(2);
  });

  it('the bonus for lives left does not grow with the team: it counts the average', () => {
    const score = (players: number) => {
      const s = createSim(floor01, 9, { mode: 'quick', players });
      for (const n of s.nests) n.state = 'destroyed';
      s.enemies = [];
      s.tick = 0;
      floorCleared(s);
      return s.score;
    };
    expect(score(4)).toBe(score(1));
  });

  it('ends the run exactly once when the last players are out', () => {
    const s = team(3);
    for (const p of s.players) p.lives = 1;
    const all: SimEvent[] = [];
    for (const p of s.players) {
      damagePlayer(s, p, 1000);
      all.push(...s.events);
    }
    all.push(...run(s, 5));
    expect(s.phase).toBe('lost');
    expect(all.filter(e => e.type === 'gameLost')).toHaveLength(1);
  });
});

describe('teammates leaving', () => {
  it('when the last helper leaves, the downed ones lose a life each and get back up', () => {
    const s = team(3);
    const [a, b] = s.players;
    damagePlayer(s, a, 1000);
    damagePlayer(s, b, 1000);
    removePlayer(s, 2);
    expect([a.lives, b.lives]).toEqual([2, 2]);
    run(s, RESPAWN_TICKS + 1);
    expect(s.players.every(p => p.downUntil === null)).toBe(true);
  });
});

describe('scaling with the team size', () => {
  it('makes hordes bigger and monsters tougher', () => {
    const s = team(4);
    spawnHorde(s, { x: 15.5, z: 5.5 }, [{ kind: 'blob', count: 20 }]);
    expect(s.enemies).toHaveLength(Math.ceil(20 * 2.05));
    expect(s.enemies[0].hp).toBeCloseTo(ENEMIES.blob.hp * 1.45);
  });
});

describe('leaving', () => {
  it('frees the kart and removes the mines of a player who leaves', () => {
    const s = team(2);
    const b = s.players[1];
    const kart = addKart(s, { ...b.pos }, 0);
    stepSim(s, [{ type: 'use', playerId: 1 }]);
    expect(kart.driverId).toBe(1);
    s.mines.push({ id: 99, pos: { ...b.pos }, ownerId: 1, damage: 40, armedAt: 0, expiresAt: 1e9 });
    removePlayer(s, 1);
    expect(kart.driverId).toBeNull();
    expect(s.mines).toHaveLength(0);
    expect(s.players).toHaveLength(1);
    run(s, 10);
  });
});

describe('player stats', () => {
  it('credit kills and score to the player who made them', () => {
    const s = team(2);
    const e = spawnEnemy(s, 'blob', { x: 15.5, z: 5.5 });
    damageEnemy(s, e, 1000, 'pixelBlaster', 1);
    expect(s.players[1].stats.kills).toBe(1);
    expect(s.players[1].stats.score).toBe(s.score);
    expect(s.players[0].stats.kills).toBe(0);
  });
});

describe('difficulty', () => {
  it('Medium keeps the normal numbers', () => {
    const s = team(1, 'medium');
    expect(s.credits).toBe(3);
    expect(spawnEnemy(s, 'tank', { x: 15.5, z: 5.5 }).hp).toBe(ENEMIES.tank.hp);
  });

  it('Ultra High has 2 credits, tougher monsters, harder hits, a faster alarm and double points', () => {
    const s = team(1, 'ultraHigh');
    expect(s.credits).toBe(2);
    expect(spawnEnemy(s, 'tank', { x: 15.5, z: 5.5 }).hp).toBeCloseTo(ENEMIES.tank.hp * 1.5);
    damagePlayer(s, s.players[0], 10);
    expect(s.players[0].hp).toBe(85);
    const blob = spawnEnemy(s, 'blob', { x: 15.5, z: 7.5 });
    damageEnemy(s, blob, 1000, 'pixelBlaster', 0);
    expect(s.score).toBe(ENEMIES.blob.score * 2);
    const fresh = createSim(floor01, 1, { difficulty: 'ultraHigh' });
    expect(fresh.alarm.nextAt).toBe(Math.round(ALARM_TICKS / DIFFICULTY.ultraHigh.alarmSpeed));
  });

  it('Ultra Low has 4 lives and hordes of half the size', () => {
    const s = team(1, 'ultraLow');
    expect(s.credits).toBe(4);
    spawnHorde(s, { x: 15.5, z: 5.5 }, [{ kind: 'blob', count: 10 }]);
    expect(s.enemies).toHaveLength(5);
  });
});
