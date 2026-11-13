import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { floorRace, RACE_CHECKPOINTS, RACE_GRID } from '../../src/sim/config/floor-race';
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
  const s = createSim(floor01, 4, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], players });
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

  it('is three laps long', () => {
    expect(RACE.laps).toBe(3);
  });

  it('ends as soon as the last lap is done: solo earns a medal by the time it took, then the elevator shop opens', () => {
    const s = raceSim();
    const coins = s.players[0].coins;
    for (let lap = 0; lap < RACE.laps - 1; lap++) for (const i of LAP) driveTo(s, 0, i);
    expect(s.run.stage).toBe('race');
    // the last lap, finished in silver time
    s.run.stageUntil = s.tick + RACE.maxTicks - ((RACE.medals.gold.seconds + RACE.medals.silver.seconds) / 2) * 60;
    for (const i of LAP) driveTo(s, 0, i);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'raceEnd', medal: 'silver' }));
    expect(s.players[0].coins).toBe(coins + RACE.laps * 0 + RACE.medals.silver.coins);
    expect(s.run.stage).toBe('shop');
  });

  it('with several players the first to drive all the laps wins, and the race ends right then', () => {
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

describe('the starting grid of the kart rally', () => {
  /** a run of `scores.length` players with these scores (and these of them bots), at the start of the race */
  function grid(scores: number[], bots: number[] = []): SimState {
    const s = createSim(floor01, 4, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], players: scores.length, bots: scores.map((_, i) => bots.includes(i)) });
    s.players.forEach((p, i) => (p.stats.score = scores[i]));
    for (const n of s.nests) n.state = 'destroyed';
    s.enemies = [];
    floorCleared(s);
    expect(s.run.stage).toBe('race');
    return s;
  }
  /** the grid place (0 = pole position) of each player, in player order */
  const places = (s: SimState) => s.players.map(p => RACE_GRID.findIndex(g => g.x === p.pos.x && g.z === p.pos.z));

  it('is rows of two, each row behind the one before', () => {
    expect(RACE_GRID.length).toBeGreaterThanOrEqual(10);
    for (let i = 0; i < RACE_GRID.length; i += 2) {
      // side by side
      expect(RACE_GRID[i + 1].x).toBe(RACE_GRID[i].x);
      expect(RACE_GRID[i + 1].z).not.toBe(RACE_GRID[i].z);
      // the karts drive off toward +x: further back is a smaller x
      if (i > 0) expect(RACE_GRID[i].x).toBeLessThan(RACE_GRID[i - 2].x);
    }
  });

  it('puts whoever leads in score in front and whoever has the fewest points at the back', () => {
    const s = grid([300, 900, 100, 500]);
    expect(places(s)).toEqual([2, 0, 3, 1]);
  });

  it('puts bots behind every human, whatever their score, and orders them by score among themselves', () => {
    const s = grid([50, 9000, 10, 7000, 20], [1, 3]);
    expect(places(s)).toEqual([0, 3, 2, 4, 1]);
  });

  it('gives everyone a place and a kart of their own, from one player to ten', () => {
    for (let n = 1; n <= 10; n++) {
      const s = grid(Array.from({ length: n }, (_, i) => ((i * 7) % n) * 100));
      const got = places(s);
      expect([...got].sort((a, b) => a - b), `${n} players`).toEqual(Array.from({ length: n }, (_, i) => i));
      // the order of the places is the order of the scores
      const byPlace = [...s.players].sort((a, b) => got[s.players.indexOf(a)] - got[s.players.indexOf(b)]);
      for (let i = 1; i < n; i++) expect(byPlace[i].stats.score).toBeLessThanOrEqual(byPlace[i - 1].stats.score);
      for (const p of s.players) expect(s.vehicles.find(v => v.id === p.vehicleId)?.driverId).toBe(p.id);
    }
  });

  it('is the same every time: players level on points keep their order', () => {
    expect(places(grid([200, 200, 500, 200]))).toEqual([1, 2, 0, 3]);
    expect(places(grid([0, 0, 0]))).toEqual([0, 1, 2]);
  });
});
