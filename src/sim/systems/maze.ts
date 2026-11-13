import { PLAYER_RADIUS, STREAK_WINDOW_TICKS } from '../config/balance';
import { floorMaze, MAZE_CAGE, MAZE_CUBES, MAZE_DOTS } from '../config/floor-maze';
import { TICK_RATE, type SimState } from '../types';
import { dist } from '../util';
import { spawnPoint } from './coop';
import { spawnEnemy } from './enemies';
import { openShop } from './shop';

export const MAZE = {
  ghosts: 4,
  /** one more ghost for every two extra players */
  ghostsPerTwoPlayers: 1,
  powerTicks: 8 * TICK_RATE,
  ghostCoins: 15,
  ghostRespawnTicks: 5 * TICK_RATE,
  coinsPerPixel: 0.25,
  /** for everyone, once the last pixel is gone */
  clearBonus: 40,
  /**
   * how close a player has to come to a pixel. The pixels lie in the middle of corridors two tiles wide, a player
   * hugging the wall is 0.6 off that line: this still reaches every pixel in passing
   */
  pixelRadius: 0.85,
  /** after being caught a player is safe for a moment */
  catchInvulnTicks: 2 * TICK_RATE,
  /** ghosts this close to the start go back to their cage when a player is sent there: nobody is caught in a loop */
  startClearRadius: 8,
  cubeRadius: 1,
};

function spawnGhost(s: SimState, i: number): void {
  spawnEnemy(s, 'ghost', { x: MAZE_CAGE.x + (i % 3) - 1, z: MAZE_CAGE.z + (Math.floor(i / 3) % 2) });
}

/**
 * Glitch Maze between two floors: collect the pixels, dodge the ghosts, power cubes turn the tables. No weapons.
 * It lasts until the last pixel is collected: there is no clock.
 */
export function enterMaze(s: SimState): void {
  s.run.stage = 'maze';
  s.run.stageUntil = 0;
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
  const pixels = MAZE_DOTS.map((_, i) => i);
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
    p.coinStreak = 0;
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
    const left = maze.pixels.filter(i => dist(MAZE_DOTS[i], p.pos) > MAZE.pixelRadius);
    const got = maze.pixels.length - left.length;
    if (got > 0) {
      maze.pixels = left;
      maze.collected[p.id] = (maze.collected[p.id] ?? 0) + got;
      // pixels picked up in quick succession are a streak (the sound climbs with it), like coins on a floor
      p.coinStreak = s.tick - p.lastCoinTick <= STREAK_WINDOW_TICKS ? p.coinStreak + got : got;
      p.lastCoinTick = s.tick;
      s.events.push({ type: 'mazePixel', playerId: p.id, streak: p.coinStreak, left: left.length });
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
      // caught: back to the start, no harm done; the ghost goes back to its cage too, and so does every ghost
      // waiting near the start (no camping there: without a clock a player could be caught over and over)
      for (const o of s.enemies) {
        if (o.kind === 'ghost' && (o === g || dist(o.pos, s.map.spawn) < MAZE.startClearRadius)) o.pos = { x: MAZE_CAGE.x, z: MAZE_CAGE.z };
      }
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

  // the only way out: every pixel collected (no clock, and crashed ghosts come back, so they do not end it either)
  if (maze.pixels.length === 0) finishMaze(s);
}

function finishMaze(s: SimState): void {
  const maze = s.run.maze!;
  for (const p of s.players) p.coins += Math.round((maze.collected[p.id] ?? 0) * MAZE.coinsPerPixel) + MAZE.clearBonus;
  s.events.push({ type: 'mazeEnd', collected: { ...maze.collected } });
  s.enemies = [];
  s.run.maze = null;
  if (s.run.mode !== 'run') {
    s.phase = 'won';
    s.events.push({ type: 'gameWon', score: s.score });
    return;
  }
  openShop(s);
}
