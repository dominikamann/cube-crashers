import { PLAYER_RADIUS } from '../config/balance';
import { floorMaze, MAZE_CAGE, MAZE_CUBES } from '../config/floor-maze';
import { Tile } from '../map/tilemap';
import { TICK_RATE, type SimState, type Vec2 } from '../types';
import { dist } from '../util';
import { spawnPoint } from './coop';
import { spawnEnemy } from './enemies';
import { openShop } from './shop';

export const MAZE = {
  /** 90 seconds, or until every pixel is gone */
  ticks: 90 * TICK_RATE,
  ghosts: 4,
  /** one more ghost for every two extra players */
  ghostsPerTwoPlayers: 1,
  powerTicks: 8 * TICK_RATE,
  ghostCoins: 15,
  ghostRespawnTicks: 5 * TICK_RATE,
  coinsPerPixel: 0.2,
  clearBonus: 60,
  /** after being caught a player is safe for a moment */
  catchInvulnTicks: 2 * TICK_RATE,
  cubeRadius: 1,
};

const tileIndex = (s: SimState, p: Vec2) => Math.floor(p.z) * s.map.w + Math.floor(p.x);

/** whether a pixel is still lying on the tile under `pos` */
export function pixelAt(s: SimState, pos: Vec2): boolean {
  return !!s.run.maze?.pixels.includes(tileIndex(s, pos));
}

function spawnGhost(s: SimState, i: number): void {
  spawnEnemy(s, 'ghost', { x: MAZE_CAGE.x + (i % 3) - 1, z: MAZE_CAGE.z + (Math.floor(i / 3) % 2) });
}

/** Glitch Maze between two floors: collect the pixels, dodge the ghosts, power cubes turn the tables. No weapons. */
export function enterMaze(s: SimState): void {
  s.run.stage = 'maze';
  s.run.stageUntil = s.tick + MAZE.ticks;
  s.map = floorMaze;
  s.theme = 'maze';
  s.look = 'night';
  s.enemies = [];
  s.hordes = [];
  s.projectiles = [];
  s.areas = [];
  s.mines = [];
  s.coins = [];
  s.crates = [];
  s.offers = [];
  s.towers = [];
  s.nests = [];
  s.boss = null;
  s.blasts = [];
  s.vehicles = [];
  s.vehicleRespawns = [];
  s.powerups = [];
  s.jetpacks = [];
  s.bubbles = [];
  s.flow = null;
  s.elevatorOpen = false;
  // a pixel on every open tile, except in the ghost cage and right at the start
  const pixels: number[] = [];
  for (let i = 0; i < s.map.tiles.length; i++) {
    if (s.map.tiles[i] !== Tile.Floor) continue;
    const c = { x: (i % s.map.w) + 0.5, z: Math.floor(i / s.map.w) + 0.5 };
    if (dist(c, MAZE_CAGE) < 3.5 || dist(c, s.map.spawn) < 1.5) continue;
    pixels.push(i);
  }
  s.run.maze = { pixels, total: pixels.length, collected: {}, cubes: MAZE_CUBES.map((_, i) => i), powerUntil: 0, respawns: [] };
  s.players.forEach((p, i) => {
    p.pos = spawnPoint(s, i);
    p.safePoint = { ...p.pos };
    p.vehicleId = null;
    p.flying = false;
    p.jetpack = false;
    p.jetFuel = 0;
    p.air = 0;
    p.plantTicks = 0;
    if (p.downUntil !== null) {
      p.downUntil = null;
      p.hp = p.maxHp;
    }
    p.reviveUntil = null;
    p.reviveProgress = 0;
    p.invulnUntil = s.tick + 120;
    s.run.maze!.collected[p.id] = 0;
  });
  const ghosts = MAZE.ghosts + Math.floor((s.players.length - 1) / 2) * MAZE.ghostsPerTwoPlayers;
  for (let i = 0; i < ghosts; i++) spawnGhost(s, i);
}

export function updateMaze(s: SimState): void {
  const maze = s.run.maze;
  if (s.run.stage !== 'maze' || !maze) return;
  const powered = s.tick < maze.powerUntil;

  for (const p of s.players) {
    if (p.downUntil !== null) continue;
    const i = maze.pixels.indexOf(tileIndex(s, p.pos));
    if (i >= 0) {
      maze.pixels.splice(i, 1);
      maze.collected[p.id] = (maze.collected[p.id] ?? 0) + 1;
    }
    for (const c of [...maze.cubes]) {
      if (dist(MAZE_CUBES[c], p.pos) > MAZE.cubeRadius) continue;
      maze.cubes = maze.cubes.filter(x => x !== c);
      maze.powerUntil = s.tick + MAZE.powerTicks;
      s.events.push({ type: 'mazePower', playerId: p.id });
    }
  }

  const live = s.tick < maze.powerUntil;
  for (const g of s.enemies) {
    if (g.kind !== 'ghost' || g.hp <= 0) continue;
    // powered up: the ghosts crawl
    if (live) g.slowUntil = Math.max(g.slowUntil, s.tick + 2);
    for (const p of s.players) {
      if (p.downUntil !== null || dist(p.pos, g.pos) > g.radius + PLAYER_RADIUS) continue;
      if (live || powered) {
        g.hp = 0;
        p.coins += MAZE.ghostCoins;
        maze.respawns.push(s.tick + MAZE.ghostRespawnTicks);
        s.events.push({ type: 'mazeGhost', playerId: p.id, pos: { ...g.pos } });
        break;
      }
      if (s.tick < p.invulnUntil) continue;
      // caught: back to the start, no harm done; the ghost goes back to its cage too (no camping at the start)
      g.pos = { x: MAZE_CAGE.x, z: MAZE_CAGE.z };
      p.pos = { ...s.map.spawn };
      p.safePoint = { ...p.pos };
      p.invulnUntil = s.tick + MAZE.catchInvulnTicks;
      s.events.push({ type: 'mazeCaught', playerId: p.id });
    }
  }
  s.enemies = s.enemies.filter(e => e.hp > 0);
  const due = maze.respawns.filter(t => s.tick >= t);
  maze.respawns = maze.respawns.filter(t => s.tick < t);
  due.forEach((_, i) => spawnGhost(s, i));

  if (maze.pixels.length === 0 || s.tick >= s.run.stageUntil) finishMaze(s);
}

function finishMaze(s: SimState): void {
  const maze = s.run.maze!;
  const cleared = maze.pixels.length === 0;
  for (const p of s.players) p.coins += Math.round((maze.collected[p.id] ?? 0) * MAZE.coinsPerPixel) + (cleared ? MAZE.clearBonus : 0);
  s.events.push({ type: 'mazeEnd', cleared, collected: { ...maze.collected } });
  s.enemies = [];
  s.run.maze = null;
  if (s.run.mode !== 'run') {
    s.phase = 'won';
    s.events.push({ type: 'gameWon', score: s.score });
    return;
  }
  openShop(s);
}
