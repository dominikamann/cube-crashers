import { Rng } from './rng';
import { updatePlayers } from './systems/player';
import type { Command, MapDef, SimState, Vec2 } from './types';

export function createSim(map: MapDef, seed: number): SimState {
  return {
    tick: 0,
    rng: new Rng(seed),
    map,
    players: [
      {
        id: 0,
        pos: { ...map.playerSpawn },
        hp: 100,
        maxHp: 100,
        coins: 0,
        downUntil: null,
        weapons: [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }],
        coinStreak: 0,
        lastCoinTick: -1000,
      },
    ],
    enemies: [],
    projectiles: [],
    coins: [],
    crates: [],
    towers: [],
    base: { hp: 20, maxHp: 20 },
    wave: { index: 0 },
    boss: null,
    phase: 'playing',
    look: 'day',
    nextId: 1,
    events: [],
  };
}

export function stepSim(s: SimState, commands: Command[]): void {
  s.events = [];
  const moves = new Map<number, Vec2>();
  for (const c of commands) {
    if (c.type === 'move') moves.set(c.playerId, c.dir);
  }
  updatePlayers(s, moves);
  s.tick++;
}
