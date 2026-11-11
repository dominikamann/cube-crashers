import { createSim, stepSim } from '../../src/sim/sim';
import { floor01 } from '../../src/sim/config/floor01';
import type { Command, SimEvent, SimState, Vec2 } from '../../src/sim/types';

/** A sim on the Arcade Plaza with nothing in it: tests add exactly what they need. */
export function quietSim(seed = 7): SimState {
  const s = createSim(floor01, seed);
  s.enemies = [];
  s.hordes = [];
  s.nests = [];
  s.crates = [];
  s.mines = [];
  s.vehicles = [];
  s.powerups = [];
  s.nextPowerupAt = Number.MAX_SAFE_INTEGER;
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  return s;
}

export function run(s: SimState, ticks: number, commands: () => Command[] = () => []): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    stepSim(s, commands());
    all.push(...s.events);
  }
  return all;
}

export const move = (x: number, z: number): Command => ({ type: 'move', playerId: 0, dir: { x, z } });
export const rel = (p: Vec2, dx: number, dz: number): Vec2 => ({ x: p.x + dx, z: p.z + dz });

/** Id of the pad whose centre is at (x, z). Pad ids follow the map's row order, so tests look them up. */
export function padAtPos(s: SimState, x: number, z: number): number {
  const pad = s.map.pads.find(p => p.pos.x === x && p.pos.z === z);
  if (!pad) throw new Error(`no pad at ${x},${z}`);
  return pad.id;
}

/** the pad on the ring road just north-west of the spawn room gate */
export const GATE_PAD = { x: 31.5, z: 56.5 };

export const aimAt = (point: Vec2): Command => ({ type: 'aim', playerId: 0, point });
export const fire: Command = { type: 'fire', playerId: 0 };
export const jump: Command = { type: 'jump', playerId: 0 };
export const dash: Command = { type: 'dash', playerId: 0 };
