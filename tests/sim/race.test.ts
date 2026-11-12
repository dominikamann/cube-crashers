import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { floorRace, RACE_CHECKPOINTS } from '../../src/sim/config/floor-race';
import { createSim, stepSim } from '../../src/sim/sim';
import { floorCleared } from '../../src/sim/systems/run';
import { RACE, enterRace } from '../../src/sim/systems/race';
import type { SimState, Vec2 } from '../../src/sim/types';
import { run } from './helpers';
import { spawnEnemy } from '../../src/sim/systems/enemies';

const centre = (i: number): Vec2 => {
  const c = RACE_CHECKPOINTS[i];
  return { x: (c.x0 + c.x1 + 1) / 2, z: (c.z0 + c.z1 + 1) / 2 };
};

/** every checkpoint in driving order, ending on the finish line */
const LAP = [...RACE_CHECKPOINTS.keys()].slice(1).concat(0);

/** puts player `id`'s kart onto checkpoint `i` and lets one tick pass */
function driveTo(s: SimState, id: number, i: number) {
  const p = s.players.find(x => x.id === id)!;
  const v = s.vehicles.find(x => x.id === p.vehicleId)!;
  v.pos = centre(i);
  stepSim(s, []);
}

function raceSim(players = 1): SimState {
  const s = createSim(floor01, 4, { mode: 'run', players });
  for (const n of s.nests) n.state = 'destroyed';
  s.enemies = [];
  floorCleared(s);
  return s;
}

describe('kart rally', () => {
  it('follows the first floor of a run, with every player in a kart of their own', () => {
    const s = raceSim(2);
    expect(s.run.stage).toBe('race');
    expect(s.map.id).toBe(floorRace.id);
    for (const p of s.players) {
      const v = s.vehicles.find(x => x.id === p.vehicleId);
      expect(v?.locked).toBe(true);
      expect(v?.driverId).toBe(p.id);
    }
  });

  it('you cannot get out of your kart during the race', () => {
    const s = raceSim();
    stepSim(s, [{ type: 'use', playerId: 0 }]);
    expect(s.players[0].vehicleId).not.toBeNull();
  });

  it('counts a lap only for passing every checkpoint in order', () => {
    const s = raceSim();
    // skipping checkpoint 2 does not count
    for (const i of LAP.filter(i => i !== 2)) driveTo(s, 0, i);
    expect(s.run.race!.laps[0]).toBe(0);
    for (const i of LAP.slice(1)) driveTo(s, 0, i);
    expect(s.run.race!.laps[0]).toBe(1);
    expect(s.events).toContainEqual({ type: 'raceLap', playerId: 0, lap: 1 });
  });

  it('a wrecked kart comes back on the track at the last checkpoint, driver inside', () => {
    const s = raceSim();
    driveTo(s, 0, 1);
    const v = s.vehicles.find(x => x.id === s.players[0].vehicleId)!;
    v.hp = 0;
    run(s, RACE.wreckTicks + 2);
    const again = s.vehicles.find(x => x.id === s.players[0].vehicleId);
    expect(again).toBeDefined();
    expect(again!.hp).toBeGreaterThan(0);
    const c = centre(1);
    expect(Math.hypot(again!.pos.x - c.x, again!.pos.z - c.z)).toBeLessThan(3);
  });

  it('ends as soon as the fifth lap is done: solo earns a medal by the time it took, then the elevator shop opens', () => {
    const s = raceSim();
    const coins = s.players[0].coins;
    for (let lap = 0; lap < RACE.laps - 1; lap++) for (const i of LAP) driveTo(s, 0, i);
    expect(s.run.stage).toBe('race');
    // the fifth lap, finished in silver time
    s.run.stageUntil = s.tick + RACE.maxTicks - (RACE.medals.gold.seconds + 20) * 60;
    for (const i of LAP) driveTo(s, 0, i);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'raceEnd', medal: 'silver' }));
    expect(s.players[0].coins).toBe(coins + RACE.laps * 0 + RACE.medals.silver.coins);
    expect(s.run.stage).toBe('shop');
  });

  it('with several players the first to drive five laps wins, and the race ends right then', () => {
    const s = raceSim(2);
    const before = s.players.map(p => p.coins);
    for (const i of LAP) driveTo(s, 1, i);
    for (let lap = 0; lap < RACE.laps; lap++) for (const i of LAP) driveTo(s, 0, i);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'raceEnd', winners: [0] }));
    expect(s.players[0].coins - before[0]).toBe(RACE.laps * RACE.coinsPerLap + RACE.winnerBonus);
    expect(s.players[1].coins - before[1]).toBe(RACE.coinsPerLap);
  });

  it('a kart never runs out of fuel in the race', () => {
    const s = raceSim();
    const v = s.vehicles[0];
    v.fuel = 1;
    v.vel = { x: 8, z: 0 };
    run(s, 120, () => [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }]);
    expect(s.players[0].vehicleId).toBe(v.id);
    expect(v.fuel).toBeGreaterThan(0);
  });

  it('ramming monsters on the track never wrecks the kart: nobody is thrown out mid-race', () => {
    const s = raceSim();
    const v = s.vehicles[0];
    const hp = v.hp;
    for (let i = 0; i < 40; i++) {
      spawnEnemy(s, 'tank', { x: v.pos.x + 0.6, z: v.pos.z });
      v.vel = { x: 8, z: 0 };
      stepSim(s, [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }]);
    }
    expect(v.hp).toBe(hp);
    expect(s.players[0].vehicleId).toBe(v.id);
  });

  it('nobody finishing: it still ends after the longest a race may take', () => {
    const s = raceSim();
    s.run.stageUntil = s.tick;
    stepSim(s, []);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'raceEnd', medal: null }));
  });

  it('can be played on its own as a single floor', () => {
    const s = createSim(floorRace, 2, { mode: 'quick' });
    expect(s.run.stage).toBe('race');
    s.run.stageUntil = s.tick;
    stepSim(s, []);
    expect(s.phase).toBe('won');
  });

  it('enterRace is safe to call twice (no duplicate karts)', () => {
    const s = raceSim();
    enterRace(s);
    expect(s.vehicles).toHaveLength(1);
  });
});

describe('the rally track', () => {
  it('is drivable: the starter bot does at least two laps in two minutes', async () => {
    const { createBot } = await import('./bot');
    const s = createSim(floorRace, 3, { mode: 'quick' });
    const bot = createBot();
    let laps = 0;
    for (let i = 0; i < 120 * 60 && s.phase === 'playing'; i++) {
      stepSim(s, bot(s));
      for (const e of s.events) if (e.type === 'raceLap') laps = e.lap;
    }
    expect(laps).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
