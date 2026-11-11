import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { floorMaze, MAZE_CAGE, MAZE_CUBES } from '../../src/sim/config/floor-maze';
import { createSim, stepSim } from '../../src/sim/sim';
import { MAZE, pixelAt } from '../../src/sim/systems/maze';
import { floorCleared } from '../../src/sim/systems/run';
import type { SimState } from '../../src/sim/types';

/** a run whose third floor was just cleared: the maze comes next */
function mazeSim(players = 1): SimState {
  const s = createSim(floor01, 4, { mode: 'run', players });
  s.run.floor = 2;
  for (const n of s.nests) n.state = 'destroyed';
  s.enemies = [];
  floorCleared(s);
  return s;
}

describe('glitch maze', () => {
  it('follows the third floor of a run: a maze full of pixels, ghosts in the cage, no weapons', () => {
    const s = mazeSim();
    expect(s.run.stage).toBe('maze');
    expect(s.map.id).toBe(floorMaze.id);
    expect(s.run.maze!.pixels.length).toBeGreaterThan(300);
    expect(s.enemies.filter(e => e.kind === 'ghost').length).toBeGreaterThanOrEqual(MAZE.ghosts);
    s.players[0].weapons = [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }];
    stepSim(s, [{ type: 'fire', playerId: 0 }]);
    expect(s.projectiles).toHaveLength(0);
  });

  it('walking over a pixel collects it for that player', () => {
    const s = mazeSim();
    const p = s.players[0];
    const i = s.run.maze!.pixels[0];
    p.pos = { x: (i % s.map.w) + 0.5, z: Math.floor(i / s.map.w) + 0.5 };
    const left = s.run.maze!.pixels.length;
    stepSim(s, []);
    expect(s.run.maze!.pixels.length).toBeLessThan(left);
    expect(s.run.maze!.collected[p.id]).toBeGreaterThan(0);
    expect(pixelAt(s, p.pos)).toBe(false);
  });

  it('a ghost that catches a player sends them back to the start: no damage, no credit lost', () => {
    const s = mazeSim();
    const p = s.players[0];
    p.invulnUntil = 0;
    const ghost = s.enemies.find(e => e.kind === 'ghost')!;
    p.pos = { ...ghost.pos };
    const credits = s.credits;
    stepSim(s, []);
    expect(Math.hypot(p.pos.x - s.map.spawn.x, p.pos.z - s.map.spawn.z)).toBeLessThan(2);
    expect(p.hp).toBe(p.maxHp);
    expect(s.credits).toBe(credits);
    expect(s.events).toContainEqual({ type: 'mazeCaught', playerId: p.id });
  });

  it('a power cube turns the tables: touching a ghost crashes it', () => {
    const s = mazeSim();
    const p = s.players[0];
    p.pos = { ...MAZE_CUBES[0] };
    stepSim(s, []);
    expect(s.run.maze!.powerUntil).toBeGreaterThan(s.tick);
    const ghost = s.enemies.find(e => e.kind === 'ghost')!;
    const coins = p.coins;
    p.pos = { ...ghost.pos };
    stepSim(s, []);
    expect(s.enemies.find(e => e.id === ghost.id)).toBeUndefined();
    expect(p.coins).toBe(coins + MAZE.ghostCoins);
  });

  it('crashed ghosts come back to the cage', () => {
    const s = mazeSim();
    const before = s.enemies.filter(e => e.kind === 'ghost').length;
    s.run.maze!.powerUntil = s.tick + 100;
    const ghost = s.enemies.find(e => e.kind === 'ghost')!;
    s.players[0].pos = { ...ghost.pos };
    stepSim(s, []);
    // walk away from the cage and wait for the crashed one to come back
    s.players[0].pos = { ...s.map.spawn };
    s.run.maze!.powerUntil = s.tick;
    for (let i = 0; i < MAZE.ghostRespawnTicks + 2; i++) {
      s.players[0].pos = { ...s.map.spawn };
      s.players[0].invulnUntil = s.tick + 10;
      stepSim(s, []);
    }
    const ghosts = s.enemies.filter(e => e.kind === 'ghost');
    expect(ghosts.length).toBe(before);
    expect(ghosts.some(g => Math.hypot(g.pos.x - MAZE_CAGE.x, g.pos.z - MAZE_CAGE.z) < 4)).toBe(true);
  });

  it('ends when time is up: coins for the pixels each player collected, then the shop', () => {
    const s = mazeSim();
    const p = s.players[0];
    s.run.maze!.collected[p.id] = 50;
    const coins = p.coins;
    s.run.stageUntil = s.tick;
    stepSim(s, []);
    expect(p.coins).toBe(coins + Math.round(50 * MAZE.coinsPerPixel));
    expect(s.run.stage).toBe('shop');
  });

  it('clearing every pixel ends it early with a bonus', () => {
    const s = mazeSim();
    const p = s.players[0];
    const coins = p.coins;
    s.run.maze!.collected[p.id] = 10;
    s.run.maze!.pixels = [];
    stepSim(s, []);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'mazeEnd', cleared: true }));
    expect(p.coins).toBe(coins + Math.round(10 * MAZE.coinsPerPixel) + MAZE.clearBonus);
  });

  it('can be played on its own as a single floor', () => {
    const s = createSim(floorMaze, 2, { mode: 'quick' });
    expect(s.run.stage).toBe('maze');
    s.run.stageUntil = s.tick;
    stepSim(s, []);
    expect(s.phase).toBe('won');
  });
});
