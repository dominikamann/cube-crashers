import { describe, expect, it } from 'vitest';
import { FLOORS, RUN_FLOORS } from '../../src/sim/config/floors';
import { floor01 } from '../../src/sim/config/floor01';
import { BLOCKS_ENEMY, BLOCKS_WALKER, isFree, reachable, Tile, tileAt } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { SHOP } from '../../src/sim/systems/shop';
import { addKart } from '../../src/sim/systems/vehicles';
import { damagePlayer } from '../../src/sim/systems/player';
import type { Command, SimState, Vec2 } from '../../src/sim/types';
import { move, run } from './helpers';

const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** a run on its first floor with all nests destroyed and the elevator open */
function clearedRun(players = 1): SimState {
  const s = createSim(floor01, 5, { mode: 'run', players });
  for (const n of s.nests) n.state = 'destroyed';
  s.elevatorOpen = true;
  s.enemies = [];
  s.hordes = [];
  return s;
}

/** steps into the elevator and, when there is a next floor, rides the shaft to the shop */
function enterElevator(s: SimState) {
  for (const p of s.players) p.pos = { ...s.map.elevator };
  stepSim(s, []);
  if (s.run.stage === 'shaft') {
    s.run.stageUntil = s.tick;
    stepSim(s, []);
  }
}

describe('floor maps', () => {
  for (const id of Object.keys(FLOORS)) {
    it(`${id} is a sound map`, () => {
      const m = FLOORS[id].map;
      const mask = reachable(m, m.spawn, BLOCKS_ENEMY);
      const ok = (p: Vec2) => mask[Math.floor(p.z) * m.w + Math.floor(p.x)] === 1;
      expect(ok(m.elevator), 'elevator').toBe(true);
      if (FLOORS[id].kind === 'nests') {
        expect(m.nestSpots.length).toBeGreaterThanOrEqual(5);
        for (const n of m.nestSpots) {
          expect(ok(n.pos), `nest ${n.id}`).toBe(true);
          expect(n.padIds.length, `pads of nest ${n.id}`).toBeGreaterThanOrEqual(2);
          expect(n.entries.length, `entries of nest ${n.id}`).toBeGreaterThanOrEqual(2);
          for (const e of n.entries) expect(ok(e) && d(e, n.pos) >= 10, `entry ${e.x},${e.z}`).toBe(true);
        }
        expect(m.waypoints.length).toBeGreaterThanOrEqual(12);
        expect(m.vehicleSpots.length).toBeGreaterThanOrEqual(2);
        expect(m.powerSpots.length).toBeGreaterThanOrEqual(4);
        expect(m.crateSpots.length).toBeGreaterThanOrEqual(4);
      }
      for (const p of [...m.pads.map(x => x.pos), ...m.vehicleSpots, ...m.powerSpots, ...m.crateSpots, ...m.waypoints]) expect(ok(p), `${p.x},${p.z}`).toBe(true);
    });
  }
});

describe('a run', () => {
  it('goes through several floors with different themes', () => {
    expect(RUN_FLOORS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(RUN_FLOORS.map(id => FLOORS[id].theme)).size).toBe(RUN_FLOORS.length);
  });

  it('opens the shop instead of ending when the elevator is entered before the last floor', () => {
    const s = clearedRun();
    s.players[0].pos = { ...s.map.elevator };
    stepSim(s, []);
    expect(s.events.some(e => e.type === 'floorCleared')).toBe(true);
    expect(s.run.stage).toBe('shaft');
    s.run.stageUntil = s.tick;
    stepSim(s, []);
    expect(s.phase).toBe('playing');
    expect(s.run.stage).toBe('shop');
    expect(s.run.shop!.offers[0]).toHaveLength(SHOP.offers);
  });

  it('moves on after the shop, keeping weapons, perks, coins and credits but nothing of the old floor', () => {
    const s = clearedRun();
    const p = s.players[0];
    p.weapons.push({ kind: 'bomb', level: 3, cooldown: 0 });
    p.perks.speed = 2;
    p.coins = 77;
    s.credits = 2;
    s.towers.push({ id: 99, kind: 'laser', padId: 0, pos: { x: 5, z: 5 }, hp: 40, maxHp: 40, cooldown: 0 });
    s.alarm.level = 4;
    enterElevator(s);
    stepSim(s, [{ type: 'ready', playerId: 0 }]);
    run(s, 2);
    expect(s.run.stage).toBe('floor');
    expect(s.run.floor).toBe(1);
    expect(s.map.id).toBe(RUN_FLOORS[1]);
    expect(p.weapons.find(w => w.kind === 'bomb')?.level).toBe(3);
    expect(p.perks.speed).toBe(2);
    expect(p.coins).toBe(77);
    expect(s.credits).toBe(2);
    expect(s.towers).toHaveLength(0);
    expect(s.alarm.level).toBe(0);
    expect(s.nests.length).toBeGreaterThan(0);
    expect(d(p.pos, s.map.spawn)).toBeLessThan(2);
    expect(s.elevatorOpen).toBe(false);
  });

  it('ends the shop by itself after a while', () => {
    const s = clearedRun();
    enterElevator(s);
    run(s, SHOP.ticks + 2);
    expect(s.run.stage).toBe('floor');
  });

  it('leaves nobody in a broken state when the floor changes', () => {
    const s = clearedRun(3);
    const [a, b, c] = s.players;
    addKart(s, { ...a.pos }, 0);
    stepSim(s, [{ type: 'use', playerId: 0 }]);
    damagePlayer(s, b, 1000);
    c.jetFuel = 100;
    c.flying = true;
    for (const p of s.players) p.pos = { ...s.map.elevator };
    c.pos = { ...s.map.elevator };
    stepSim(s, []);
    for (const id of [0, 1, 2]) stepSim(s, [{ type: 'ready', playerId: id }]);
    run(s, 2);
    for (const p of s.players) {
      expect(p.vehicleId).toBeNull();
      expect(p.downUntil).toBeNull();
      expect(p.reviveUntil).toBeNull();
      expect(p.flying).toBe(false);
      expect(isFree(s.map, p.pos, 0.4, BLOCKS_WALKER)).toBe(true);
    }
    expect(s.vehicles.every(v => v.driverId === null)).toBe(true);
  });

  it('wins on the last floor', () => {
    const s = clearedRun();
    s.run.floor = RUN_FLOORS.length - 1;
    enterElevator(s);
    expect(s.phase).toBe('won');
  });

  it('quick floor ends after one floor as before', () => {
    const s = createSim(floor01, 5);
    for (const n of s.nests) n.state = 'destroyed';
    s.elevatorOpen = true;
    enterElevator(s);
    expect(s.phase).toBe('won');
  });
});

describe('the shop', () => {
  function shop(coins: number) {
    const s = clearedRun(2);
    for (const p of s.players) p.coins = coins;
    enterElevator(s);
    return s;
  }
  const buy = (playerId: number, offer: number): Command => ({ type: 'buy', playerId, offer });

  it('sells an offer once for its price', () => {
    const s = shop(500);
    const offer = s.run.shop!.offers[0][0];
    stepSim(s, [buy(0, 0)]);
    expect(s.players[0].coins).toBe(500 - offer.cost);
    expect(s.run.shop!.offers[0][0].sold).toBe(true);
    expect(s.events.some(e => e.type === 'bought')).toBe(true);
    stepSim(s, [buy(0, 0)]);
    expect(s.players[0].coins).toBe(500 - offer.cost);
  });

  it('refuses when the coins are not enough', () => {
    const s = shop(0);
    stepSim(s, [buy(0, 0)]);
    expect(s.players[0].coins).toBe(0);
    expect(s.events).toContainEqual({ type: 'buyDenied', playerId: 0, offer: 0 });
  });

  it('sells the team credit only once per shop', () => {
    const s = shop(1000);
    const credits = s.credits;
    const idx = (pid: number) => s.run.shop!.offers[pid].findIndex(o => o.kind === 'credit');
    stepSim(s, [buy(0, idx(0))]);
    stepSim(s, [buy(1, idx(1))]);
    expect(s.credits).toBe(credits + 1);
    expect(s.players[1].coins).toBe(1000);
  });

  it('heals fully', () => {
    const s = shop(1000);
    s.players[0].hp = 10;
    const i = s.run.shop!.offers[0].findIndex(o => o.kind === 'heal');
    stepSim(s, [buy(0, i)]);
    expect(s.players[0].hp).toBe(s.players[0].maxHp);
  });

  it('starts the next floor as soon as everyone is ready', () => {
    const s = shop(0);
    stepSim(s, [{ type: 'ready', playerId: 0 }]);
    expect(s.run.stage).toBe('shop');
    stepSim(s, [{ type: 'ready', playerId: 1 }]);
    run(s, 1);
    expect(s.run.stage).toBe('floor');
  });
});

describe('conveyor belts', () => {
  it('push whoever stands on them', () => {
    const candy = FLOORS.candy.map;
    const s = createSim(candy, 1);
    s.enemies = [];
    s.hordes = [];
    const p = s.players[0];
    let spot: Vec2 | null = null;
    for (let tz = 1; tz < candy.h - 1 && !spot; tz++) for (let tx = 1; tx < candy.w - 1 && !spot; tx++) if (tileAt(candy, tx + 0.5, tz + 0.5) === Tile.ConveyorE) spot = { x: tx + 0.5, z: tz + 0.5 };
    expect(spot).not.toBeNull();
    p.pos = { ...spot! };
    run(s, 30, () => [move(0, 0)]);
    expect(p.pos.x - spot!.x).toBeGreaterThan(0.8);
  });
});

describe('a whole run', () => {
  it('can be played through by a well-armed bot', async () => {
    const { createBot } = await import('./bot');
    for (const seed of [1, 2]) {
      const s = createSim(floor01, seed, { mode: 'run' });
      s.players[0].weapons = (['pixelBlaster', 'laserSword', 'candyCannon', 'bomb', 'discoBall', 'joystickBoomerang'] as const).map(kind => ({ kind, level: 5, cooldown: 0 }));
      const bot = createBot();
      for (let i = 0; i < 40 * 3600 && s.phase === 'playing'; i++) stepSim(s, bot(s));
      expect(s.phase, `seed ${seed} floor ${s.run.floor} after ${(s.tick / 3600).toFixed(1)} min`).toBe('won');
    }
  }, 120_000);
});
