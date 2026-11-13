import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { floorLane, LANE_CORE } from '../../src/sim/config/floor-lane';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { LANE } from '../../src/sim/systems/lane';
import { floorCleared } from '../../src/sim/systems/run';
import type { SimState } from '../../src/sim/types';
import { run } from './helpers';

/** a run whose second floor was just cleared: the lane comes next */
function laneSim(players = 1): SimState {
  const s = createSim(floor01, 4, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], players });
  s.run.floor = 1;
  for (const n of s.nests) n.state = 'destroyed';
  s.enemies = [];
  floorCleared(s);
  return s;
}

describe('lane defense', () => {
  it('follows the second floor of a run, on its own long lane', () => {
    const s = laneSim();
    expect(s.run.stage).toBe('lane');
    expect(s.map.id).toBe(floorLane.id);
    expect(s.run.lane!.coreHp).toBe(LANE.coreHp);
  });

  it('sends waves from the far end down the lane', () => {
    const s = laneSim();
    // keep the player out of the way, far from the lane's middle
    s.players[0].pos = { x: LANE_CORE.x, z: LANE_CORE.z - 1 };
    run(s, LANE.waveTicks + 2);
    expect(s.enemies.length).toBeGreaterThan(2);
    const top = Math.max(...s.enemies.map(e => LANE_CORE.z - e.pos.z));
    run(s, 120);
    const after = Math.max(...s.enemies.map(e => LANE_CORE.z - e.pos.z));
    expect(after).toBeLessThan(top);
  });

  it('the waves vary (fast ones, tough ones, shooters, splitters...) and keep coming, even on Ultra Low', () => {
    const s = createSim(floor01, 4, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], difficulty: 'ultraLow' });
    s.run.floor = 1;
    for (const n of s.nests) n.state = 'destroyed';
    s.enemies = [];
    floorCleared(s);
    s.players[0].pos = { x: LANE_CORE.x, z: LANE_CORE.z - 1 };
    s.players[0].invulnUntil = Number.MAX_SAFE_INTEGER;
    const kinds = new Set<string>();
    let spawned = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 60 * 60 && s.run.stage === 'lane'; i++) {
      // nobody defends here: keep the cabinet standing so the whole minute runs
      s.run.lane!.coreHp = LANE.coreHp;
      stepSim(s, []);
      for (const e of s.enemies) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        kinds.add(e.kind);
        spawned++;
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    expect(spawned).toBeGreaterThan(90);
  });

  it('a monster that reaches the cabinet damages it and is gone', () => {
    const s = laneSim();
    s.players[0].pos = { x: 2.5, z: 10.5 };
    const e = spawnEnemy(s, 'tank', { x: LANE_CORE.x, z: LANE_CORE.z - 0.5 });
    stepSim(s, []);
    expect(s.run.lane!.coreHp).toBe(LANE.coreHp - LANE.leak.tank!);
    expect(s.enemies.find(x => x.id === e.id)).toBeUndefined();
  });

  it('ends after its time: coins by the cabinet health left, then the shop', () => {
    const s = laneSim();
    const coins = s.players[0].coins;
    s.run.lane!.coreHp = LANE.coreHp / 2;
    s.run.stageUntil = s.tick;
    stepSim(s, []);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'laneEnd', coreLeft: 0.5 }));
    expect(s.players[0].coins).toBe(coins + Math.round(LANE.rewardCoins * 0.5));
    expect(s.run.stage).toBe('shop');
  });

  it('a perfect defence pays a bonus; a destroyed cabinet ends it early with nothing', () => {
    const perfect = laneSim();
    const before = perfect.players[0].coins;
    perfect.run.stageUntil = perfect.tick;
    stepSim(perfect, []);
    expect(perfect.players[0].coins).toBe(before + LANE.rewardCoins + LANE.perfectBonus);

    const lost = laneSim();
    const coins = lost.players[0].coins;
    lost.run.lane!.coreHp = 1;
    lost.players[0].pos = { x: 2.5, z: 10.5 };
    spawnEnemy(lost, 'tank', { x: LANE_CORE.x, z: LANE_CORE.z - 0.5 });
    stepSim(lost, []);
    expect(lost.events).toContainEqual(expect.objectContaining({ type: 'laneEnd', coreLeft: 0 }));
    expect(lost.players[0].coins).toBe(coins);
    expect(lost.run.stage).toBe('shop');
  });

  it('can be played on its own as a single floor', () => {
    const s = createSim(floorLane, 2, { mode: 'quick' });
    expect(s.run.stage).toBe('lane');
    s.run.stageUntil = s.tick;
    stepSim(s, []);
    expect(s.phase).toBe('won');
  });
});
