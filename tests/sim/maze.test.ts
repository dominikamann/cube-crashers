import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { floorMaze, MAZE_CAGE, MAZE_CUBES, MAZE_DOTS } from '../../src/sim/config/floor-maze';
import { reachable, BLOCKS_WALKER, Tile } from '../../src/sim/map/tilemap';
import { applySnapshot, serializeSnapshot } from '../../src/net/snapshot';
import { createSim, stepSim } from '../../src/sim/sim';
import { MAZE } from '../../src/sim/systems/maze';
import { floorCleared } from '../../src/sim/systems/run';
import { TICK_RATE, type SimState } from '../../src/sim/types';
import { createBot } from './bot';

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
    expect(s.run.maze!.pixels.length).toBe(MAZE_DOTS.length);
    expect(s.enemies.filter(e => e.kind === 'ghost').length).toBeGreaterThanOrEqual(MAZE.ghosts);
    s.players[0].weapons = [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }];
    stepSim(s, [{ type: 'fire', playerId: 0 }]);
    expect(s.projectiles).toHaveLength(0);
  });

  it('walking past a pixel collects it for that player, and says so', () => {
    const s = mazeSim();
    const p = s.players[0];
    const i = s.run.maze!.pixels[0];
    // the pixel lies in the middle of the corridor, the player walks along its wall
    p.pos = { x: MAZE_DOTS[i].x, z: MAZE_DOTS[i].z + 0.6 };
    const left = s.run.maze!.pixels.length;
    stepSim(s, []);
    expect(s.run.maze!.pixels).not.toContain(i);
    expect(s.run.maze!.pixels.length).toBe(left - 1);
    expect(s.run.maze!.collected[p.id]).toBe(1);
    expect(s.events).toContainEqual({ type: 'mazePixel', playerId: p.id, streak: 1, left: left - 1 });
  });

  it('pixels collected one after the other are a streak, a pause starts it over', () => {
    const s = mazeSim();
    const p = s.players[0];
    const streaks: number[] = [];
    const take = () => {
      p.pos = { ...MAZE_DOTS[s.run.maze!.pixels[0]] };
      stepSim(s, []);
      for (const e of s.events) if (e.type === 'mazePixel') streaks.push(e.streak);
    };
    take();
    take();
    take();
    // stand where nothing is left to collect, for longer than a streak lasts
    for (let t = 0; t < TICK_RATE; t++) stepSim(s, []);
    take();
    expect(streaks).toEqual([1, 2, 3, 1]);
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

  it('has no clock: it goes on for as long as pixels are left', () => {
    const s = mazeSim();
    s.run.maze!.pixels = [s.run.maze!.pixels[0]];
    // far longer than any stage lasts, standing safe at the start
    for (let t = 0; t < 5 * 60 * TICK_RATE; t++) {
      s.players[0].invulnUntil = s.tick + 10;
      stepSim(s, []);
    }
    expect(s.run.stage).toBe('maze');
    expect(s.run.maze!.pixels).toHaveLength(1);
  });

  it('crashing every ghost does not end it either: they come back', () => {
    const s = mazeSim();
    const p = s.players[0];
    s.run.maze!.powerUntil = s.tick + 1000;
    for (const g of s.enemies) g.pos = { ...p.pos };
    for (let t = 0; t < 4 && s.enemies.length > 0; t++) stepSim(s, []);
    expect(s.enemies).toHaveLength(0);
    stepSim(s, []);
    expect(s.run.stage).toBe('maze');
  });

  it('ends with the last pixel: coins for the pixels each player collected, a bonus for all, then the shop', () => {
    const s = mazeSim(2);
    const [a, b] = s.players;
    const coins = [a.coins, b.coins];
    s.run.maze!.collected[a.id] = 50;
    const last = s.run.maze!.pixels[0];
    s.run.maze!.pixels = [last];
    b.pos = { ...MAZE_DOTS[last] };
    stepSim(s, []);
    expect(s.events).toContainEqual({ type: 'mazeEnd', collected: { [a.id]: 50, [b.id]: 1 } });
    expect(a.coins).toBe(coins[0] + Math.round(50 * MAZE.coinsPerPixel) + MAZE.clearBonus);
    expect(b.coins).toBe(coins[1] + Math.round(1 * MAZE.coinsPerPixel) + MAZE.clearBonus);
    expect(s.run.stage).toBe('shop');
    expect(s.run.maze).toBeNull();
  });

  it('two players collect at the same time, each for their own count', () => {
    const s = mazeSim(2);
    const [a, b] = s.players;
    const far = s.run.maze!.pixels[s.run.maze!.pixels.length - 1];
    a.pos = { ...MAZE_DOTS[s.run.maze!.pixels[0]] };
    b.pos = { ...MAZE_DOTS[far] };
    const left = s.run.maze!.pixels.length;
    stepSim(s, []);
    expect(s.run.maze!.pixels.length).toBe(left - 2);
    expect(s.run.maze!.collected).toEqual({ [a.id]: 1, [b.id]: 1 });
  });

  it('survives the trip to a LAN client: the pixels left and who collected them', () => {
    const s = mazeSim(2);
    s.players[1].pos = { ...MAZE_DOTS[s.run.maze!.pixels[5]] };
    stepSim(s, []);
    const client = createSim(floor01, 4, { mode: 'run', players: 2 });
    const snap = JSON.parse(serializeSnapshot(s, s.events));
    applySnapshot(client, snap.state);
    expect(client.map.id).toBe(floorMaze.id);
    expect(client.run.stage).toBe('maze');
    expect(client.run.maze).toEqual(s.run.maze);
    // the client plays the blip from the event that came along
    expect(snap.events).toContainEqual(expect.objectContaining({ type: 'mazePixel', playerId: s.players[1].id }));
  });

  it('can be played on its own as a single floor', () => {
    const s = createSim(floorMaze, 2, { mode: 'quick' });
    expect(s.run.stage).toBe('maze');
    s.run.maze!.pixels = [];
    stepSim(s, []);
    expect(s.phase).toBe('won');
  });
});

describe('glitch maze layout', () => {
  it('has one line of pixels down the middle of the corridors, not a carpet', () => {
    const open = floorMaze.tiles.filter(t => t === Tile.Floor).length;
    // far fewer pixels than open tiles (there used to be one on nearly every tile: 542)
    expect(MAZE_DOTS.length).toBeLessThan(open / 2);
    expect(MAZE_DOTS.length).toBeGreaterThan(120);
    expect(MAZE_DOTS.length).toBeLessThan(200);
    for (const d of MAZE_DOTS) {
      // in the middle of a corridor two tiles wide: open on all four sides of the point
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) expect(floorMaze.tiles[(d.z + dz) * floorMaze.w + d.x + dx]).toBe(Tile.Floor);
      // one line: its neighbours are a tile away along the corridor, never closer
      for (const o of MAZE_DOTS) if (o !== d) expect(Math.hypot(o.x - d.x, o.z - d.z)).toBeGreaterThanOrEqual(1);
    }
  });

  it('every pixel and every power cube can be reached from the start', () => {
    const seen = reachable(floorMaze, floorMaze.spawn, BLOCKS_WALKER);
    for (const p of [...MAZE_DOTS, ...MAZE_CUBES]) expect(seen[p.z * floorMaze.w + p.x], `${p.x},${p.z}`).toBeTruthy();
  });

  it('is the same on both sides', () => {
    const key = new Set(MAZE_DOTS.map(d => `${d.x},${d.z}`));
    // the corridors span x 2..28, so the middle line of the maze is x = 15.5
    for (const d of MAZE_DOTS) expect(key.has(`${31 - d.x},${d.z}`), `${d.x},${d.z}`).toBe(true);
  });

  it('no pixel lies in the ghost cage, at the start or under a power cube', () => {
    for (const d of MAZE_DOTS) {
      expect(Math.hypot(d.x - MAZE_CAGE.x, d.z - MAZE_CAGE.z)).toBeGreaterThanOrEqual(4);
      expect(Math.hypot(d.x - floorMaze.spawn.x, d.z - floorMaze.spawn.z)).toBeGreaterThanOrEqual(1.5);
      for (const c of MAZE_CUBES) expect(Math.hypot(d.x - c.x, d.z - c.z)).toBeGreaterThan(0.5);
    }
  });

  it('a player who runs along either wall of a corridor misses no pixel', () => {
    // 0.6 off the middle line is as far as a player gets in a corridor two tiles wide
    expect(Math.hypot(0.6, 0.5)).toBeLessThan(MAZE.pixelRadius);
  });

  it('takes the scripted player about a minute to clear, ghosts and all', () => {
    const s = createSim(floorMaze, 1, { mode: 'quick' });
    const bot = createBot();
    while (s.phase === 'playing' && s.tick < 5 * 60 * TICK_RATE) stepSim(s, bot(s));
    expect(s.phase).toBe('won');
    // the bot never hesitates: a person takes somewhat longer
    expect(s.tick / TICK_RATE).toBeGreaterThan(35);
    expect(s.tick / TICK_RATE).toBeLessThan(90);
  });
});

describe('glitch maze fairness', () => {
  it('a catch also sends the ghosts waiting at the start back to their cage, but not the ones far away', () => {
    const s = mazeSim();
    const p = s.players[0];
    p.invulnUntil = 0;
    const [catcher, camper, far] = s.enemies.filter(e => e.kind === 'ghost');
    catcher.pos = { x: 3.5, z: 8.5 };
    p.pos = { ...catcher.pos };
    camper.pos = { x: s.map.spawn.x + 2, z: s.map.spawn.z };
    far.pos = { x: 27.5, z: 3.5 };
    stepSim(s, []);
    const fromCage = (e: { pos: { x: number; z: number } }) => Math.hypot(e.pos.x - MAZE_CAGE.x, e.pos.z - MAZE_CAGE.z);
    expect(fromCage(catcher)).toBeLessThan(1.5);
    expect(fromCage(camper)).toBeLessThan(1.5);
    expect(fromCage(far)).toBeGreaterThan(10);
  });

  it('the ghost that caught a player goes back to its cage, and weapons or dashes cannot hurt ghosts', async () => {
    const { damageEnemy } = await import('../../src/sim/systems/combat');
    const s = mazeSim();
    const p = s.players[0];
    p.invulnUntil = 0;
    const ghost = s.enemies.find(e => e.kind === 'ghost')!;
    ghost.pos = { x: 10.5, z: 7.5 };
    for (const o of s.enemies) if (o !== ghost) o.pos = { x: 27.5, z: 3.5 };
    p.pos = { ...ghost.pos };
    stepSim(s, []);
    expect(Math.hypot(ghost.pos.x - MAZE_CAGE.x, ghost.pos.z - MAZE_CAGE.z)).toBeLessThan(1.5);
    const hp = ghost.hp;
    damageEnemy(s, ghost, 50, 'dash', p.id);
    expect(ghost.hp).toBe(hp);
  });
});
