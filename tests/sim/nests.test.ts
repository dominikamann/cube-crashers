import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { ENEMY_CAP, HOLD_RADIUS, HOLD_TICKS } from '../../src/sim/config/balance';
import { BLOCKS_WALKER } from '../../src/sim/map/tilemap';
import { zoneTiles } from '../../src/sim/systems/nests';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { spawnHorde } from '../../src/sim/systems/hordes';
import { damagePlayer } from '../../src/sim/systems/player';
import type { Command, SimEvent, SimState, Vec2 } from '../../src/sim/types';
import { quietSim, rel, run } from './helpers';
import { RUSH_BASE_SIZE } from '../../src/sim/config/balance';

const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const hold: Command = { type: 'hold', playerId: 0 };

/** quiet sim with a single nest in the north room and the player standing next to it */
function nestSim(state: 'idle' | 'planted' = 'idle', progress = 0): SimState {
  const s = quietSim();
  const spot = s.map.nestSpots.find(n => n.pos.x === 35.5 && n.pos.z === 5.5)!;
  s.nests = [{ id: 1, spotId: spot.id, pos: { ...spot.pos }, state, progress, nextSpawnAt: 1e9, nextRushAt: 1e9, nextBlastAt: state === 'planted' ? 0 : 1e9 }];
  s.players[0].pos = rel(spot.pos, 1.5, 0);
  return s;
}

describe('floor setup', () => {
  it('places 4 idle nests with a horde each and keeps the start area clear', () => {
    const s = createSim(floor01, 1);
    expect(s.nests).toHaveLength(4);
    expect(s.nests.every(n => n.state === 'idle')).toBe(true);
    expect(new Set(s.nests.map(n => n.spotId)).size).toBe(4);
    expect(s.hordes.length).toBeGreaterThanOrEqual(8);
    for (const e of s.enemies) expect(d(e.pos, s.map.spawn)).toBeGreaterThan(12);
  });

  it('picks different nest spots for different seeds', () => {
    const sets = [1, 2, 3, 4, 5].map(seed => createSim(floor01, seed).nests.map(n => n.spotId).sort().join());
    expect(new Set(sets).size).toBeGreaterThan(1);
  });
});

describe('planting', () => {
  it('takes one second of holding E next to the nest', () => {
    const s = nestSim();
    run(s, 59, () => [hold]);
    expect(s.nests[0].state).toBe('idle');
    stepSim(s, [hold]);
    expect(s.nests[0].state).toBe('planted');
    expect(s.events).toContainEqual({ type: 'nestPlanted', id: 1 });
  });

  it('starts over when E is released', () => {
    const s = nestSim();
    run(s, 40, () => [hold]);
    stepSim(s, []);
    run(s, 59, () => [hold]);
    expect(s.nests[0].state).toBe('idle');
  });

  it('does not work from further away', () => {
    const s = nestSim();
    s.players[0].pos = rel(s.nests[0].pos, 4, 0);
    run(s, 90, () => [hold]);
    expect(s.nests[0].state).toBe('idle');
  });
});

describe('holding', () => {
  it('the zone is the walkable tiles whose centre is within 6 tiles of the nest', () => {
    const s = nestSim('planted');
    const tiles = zoneTiles(s.map, s.nests[0].pos);
    expect(tiles.length).toBeGreaterThan(20);
    for (const t of tiles) {
      expect(d({ x: t.tx + 0.5, z: t.tz + 0.5 }, s.nests[0].pos)).toBeLessThanOrEqual(HOLD_RADIUS);
      expect(BLOCKS_WALKER(s.map.tiles[t.tz * s.map.w + t.tx])).toBe(false);
    }
  });

  it('counts on a zone tile even past the circle, and not on a tile outside the zone even inside the circle', () => {
    const s = nestSim('planted', 100);
    const nest = s.nests[0].pos;
    const inside = new Set(zoneTiles(s.map, nest).map(t => `${t.tx},${t.tz}`));
    let edgeIn: Vec2 | null = null, edgeOut: Vec2 | null = null;
    for (let tz = 0; tz < s.map.h && !(edgeIn && edgeOut); tz++) {
      for (let tx = 0; tx < s.map.w; tx++) {
        if (BLOCKS_WALKER(s.map.tiles[tz * s.map.w + tx])) continue;
        for (const c of [{ x: tx + 0.05, z: tz + 0.05 }, { x: tx + 0.95, z: tz + 0.05 }, { x: tx + 0.05, z: tz + 0.95 }, { x: tx + 0.95, z: tz + 0.95 }]) {
          if (inside.has(`${tx},${tz}`) && d(c, nest) > HOLD_RADIUS) edgeIn ??= c;
          if (!inside.has(`${tx},${tz}`) && d(c, nest) < HOLD_RADIUS) edgeOut ??= c;
        }
      }
    }
    s.players[0].pos = edgeIn!;
    run(s, 10);
    expect(s.nests[0].progress).toBe(110);
    s.players[0].pos = edgeOut!;
    run(s, 10);
    expect(s.nests[0].progress).toBe(105);
  });

  it('counts up while a player is within 6 tiles and back at half speed otherwise, never below 0', () => {
    const s = nestSim('planted', 100);
    run(s, 10);
    expect(s.nests[0].progress).toBe(110);
    s.players[0].pos = rel(s.nests[0].pos, 0, 12);
    run(s, 20);
    expect(s.nests[0].progress).toBe(100);
    run(s, 400);
    expect(s.nests[0].progress).toBe(0);
    expect(s.nests[0].state).toBe('planted');
  });

  it('sends rush hordes from an entry at least 10 tiles away, sized by the alarm level', () => {
    const s = nestSim('planted');
    s.nests[0].nextRushAt = 0;
    stepSim(s, []);
    expect(s.hordes).toHaveLength(1);
    expect(s.hordes[0].rush).toBe(true);
    expect(s.enemies).toHaveLength(RUSH_BASE_SIZE);
    for (const e of s.enemies) expect(d(e.pos, s.nests[0].pos)).toBeGreaterThanOrEqual(7.5);
    const spot = s.map.nestSpots.find(n => n.id === s.nests[0].spotId)!;
    expect(spot.entries.some(en => d(en, s.hordes[0].waypoint) < 0.01)).toBe(true);

    s.alarm.level = 2;
    s.enemies = [];
    run(s, 300);
    expect(s.enemies.length).toBeGreaterThanOrEqual(10);
  });

  it('sends nothing while nobody is holding', () => {
    const s = nestSim('planted');
    s.nests[0].nextRushAt = 0;
    s.players[0].pos = rel(s.nests[0].pos, 0, 12);
    run(s, 600);
    expect(s.enemies).toHaveLength(0);
  });

  it('destroys the nest after 25 seconds: blast, coins, crate, alarm -1, new safe point', () => {
    const s = nestSim('planted', HOLD_TICKS - 1);
    s.alarm.level = 2;
    const tank = spawnEnemy(s, 'tank', rel(s.nests[0].pos, -3, 0));
    stepSim(s, []);
    expect(s.nests[0].state).toBe('destroyed');
    expect(s.events).toContainEqual({ type: 'nestDestroyed', id: 1, pos: s.nests[0].pos });
    expect(tank.hp).toBeLessThanOrEqual(0);
    expect(s.coins.length).toBeGreaterThanOrEqual(25);
    expect(s.crates).toHaveLength(1);
    expect(s.alarm.level).toBe(1);
    expect(s.players[0].safePoint).toEqual(s.nests[0].pos);
    expect(s.players[0].hp).toBe(100);
  });

  it('keeps the charge when the holder goes down', () => {
    const s = nestSim('planted', 500);
    damagePlayer(s, s.players[0], 1000);
    expect(s.credits).toBe(2);
    run(s, 100);
    expect(s.nests[0].state).toBe('planted');
    expect(s.nests[0].progress).toBe(450);
    run(s, 100);
    expect(s.players[0].pos).toEqual(s.map.spawn);
  });
});

describe('alarm', () => {
  it('rises every 60 seconds and turns the lights out at 5', () => {
    const s = quietSim();
    s.alarm.nextAt = 3600;
    const events = run(s, 3601);
    expect(s.alarm.level).toBe(1);
    expect(events).toContainEqual({ type: 'alarmChanged', level: 1 });
    expect(s.look).toBe('day');
    s.alarm.level = 4;
    s.alarm.nextAt = s.tick;
    run(s, 2);
    expect(s.alarm.level).toBe(5);
    expect(s.look).toBe('night');
    run(s, 4000);
    expect(s.alarm.level).toBe(5);
  });

  it('sends the nearest roaming horde after the players whenever it rises', () => {
    const s = quietSim();
    const near = spawnHorde(s, { x: 30.5, z: 54.5 }, [{ kind: 'blob', count: 3 }]);
    const far = spawnHorde(s, { x: 15.5, z: 5.5 }, [{ kind: 'blob', count: 3 }]);
    s.players[0].invulnUntil = 1e9;
    near.aggro = false;
    s.alarm.nextAt = s.tick + 1;
    run(s, 3);
    expect(s.alarm.level).toBe(1);
    expect(near.rush).toBe(true);
    expect(far.rush).toBe(false);
  });

  it('never lets the enemy count exceed the cap, even in a long overload', () => {
    const s = createSim(floor01, 3);
    s.players[0].invulnUntil = 1e9;
    s.alarm.level = 5;
    let max = 0;
    for (let i = 0; i < 6 * 60 * 60; i++) {
      stepSim(s, []);
      max = Math.max(max, s.enemies.length);
    }
    expect(max).toBeGreaterThan(60);
    expect(max).toBeLessThanOrEqual(ENEMY_CAP);
  }, 30_000);
});

describe('elevator', () => {
  function cleared(): SimState {
    const s = nestSim('planted', HOLD_TICKS - 1);
    stepSim(s, []);
    return s;
  }

  it('opens when the last nest is gone', () => {
    const s = cleared();
    expect(s.elevatorOpen).toBe(true);
    expect(s.events).toContainEqual({ type: 'elevatorOpen' });
    const later = run(s, 10);
    expect(later.some(e => e.type === 'elevatorOpen')).toBe(false);
  });

  it('wins the floor when a player steps in, exactly once, with a bonus for credits left', () => {
    const s = cleared();
    s.coins = [];
    const before = s.score;
    s.players[0].pos = rel(s.map.elevator, 0.5, 0);
    const events: SimEvent[] = run(s, 3);
    const won = events.filter(e => e.type === 'gameWon');
    expect(won).toHaveLength(1);
    expect(s.phase).toBe('won');
    expect(s.score).toBeGreaterThanOrEqual(before + 3 * 500);
    expect(won[0]).toEqual({ type: 'gameWon', score: s.score });
  });

  it('stays closed while a nest is alive', () => {
    const s = nestSim();
    s.players[0].pos = { ...s.map.elevator };
    run(s, 10);
    expect(s.phase).toBe('playing');
  });

  it('gives exactly one outcome when the last credit is lost on the elevator', () => {
    const s = cleared();
    s.credits = 1;
    const p = s.players[0];
    p.hp = 1;
    p.pos = rel(s.map.elevator, 1.2, 0);
    const bomber = spawnEnemy(s, 'bomber', rel(p.pos, 0.5, 0));
    bomber.state = 'fuse';
    bomber.stateUntil = s.tick;
    const events = run(s, 5);
    expect(events.filter(e => e.type === 'gameWon' || e.type === 'gameLost')).toHaveLength(1);
    expect(s.phase).toBe('lost');
  });
});

describe('nest defence', () => {
  it('blasts the spot where a holder stands, after a visible warning', () => {
    const s = nestSim('planted');
    const p = s.players[0];
    const events = run(s, 240);
    expect(events.some(e => e.type === 'blastWarning')).toBe(true);
    expect(p.hp).toBeLessThanOrEqual(80);
  });

  it('misses a holder who keeps moving inside the zone', () => {
    const s = nestSim('planted');
    const p = s.players[0];
    const nest = s.nests[0].pos;
    let angle = 0;
    for (let i = 0; i < 600; i++) {
      // walk in a circle around the nest
      angle = Math.atan2(p.pos.z - nest.z, p.pos.x - nest.x);
      stepSim(s, [{ type: 'move', playerId: 0, dir: { x: -Math.sin(angle), z: Math.cos(angle) } }]);
    }
    expect(d(p.pos, nest)).toBeLessThan(6);
    expect(p.hp).toBe(100);
    expect(s.nests[0].progress).toBe(600);
  });

  it('stops when nobody is in the zone', () => {
    const s = nestSim('planted');
    s.players[0].pos = rel(s.nests[0].pos, 0, 12);
    const events = run(s, 600);
    expect(events.some(e => e.type === 'blastWarning')).toBe(false);
  });
});
