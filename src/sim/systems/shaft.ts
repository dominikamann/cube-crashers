import { floorShaft, SHAFT_CENTER, SHAFT_SPAWN_RADIUS } from '../config/floor-shaft';
import { TICK_RATE, type SimState } from '../types';
import { spawnPoint } from './coop';
import { spawnEnemy } from './enemies';
import { openShop } from './shop';

export const SHAFT = {
  /** 45 seconds */
  ticks: 45 * TICK_RATE,
  waveTicks: 150,
  baseWave: 4,
  perPlayer: 2,
  /** waves grow a little as the ride goes on */
  growth: 0.15,
};

/** The elevator ride between two floors: hold out on the platform against flying swarms. */
export function enterShaft(s: SimState): void {
  s.run.stage = 'shaft';
  s.run.stageUntil = s.tick + SHAFT.ticks;
  s.map = floorShaft;
  s.theme = 'shaft';
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
  s.players.forEach((p, i) => {
    p.pos = spawnPoint(s, i);
    p.safePoint = { ...p.pos };
    p.vehicleId = null;
    p.flying = false;
    p.air = 0;
    p.plantTicks = 0;
    // the ride starts fresh: whoever was down gets back up
    if (p.downUntil !== null) {
      p.downUntil = null;
      p.hp = p.maxHp;
    }
    p.reviveUntil = null;
    p.reviveProgress = 0;
    p.invulnUntil = s.tick + 120;
  });
}

export function updateShaft(s: SimState): void {
  if (s.run.stage !== 'shaft') return;
  if (s.tick >= s.run.stageUntil) {
    s.enemies = [];
    s.projectiles = [];
    s.areas = [];
    openShop(s);
    return;
  }
  const elapsed = SHAFT.ticks - (s.run.stageUntil - s.tick);
  if (elapsed % SHAFT.waveTicks !== 30) return;
  const wave = Math.floor(elapsed / SHAFT.waveTicks);
  const count = Math.round((SHAFT.baseWave + SHAFT.perPlayer * (s.players.length - 1)) * (1 + SHAFT.growth * wave));
  const from = s.rng.range(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    // a swarm comes from one side, spread over a quarter of the circle
    const a = from + s.rng.range(-0.8, 0.8);
    spawnEnemy(s, 'swarmer', { x: SHAFT_CENTER.x + Math.cos(a) * SHAFT_SPAWN_RADIUS, z: SHAFT_CENTER.z + Math.sin(a) * SHAFT_SPAWN_RADIUS });
  }
}
