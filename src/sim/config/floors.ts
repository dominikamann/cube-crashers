import type { FloorMap } from '../map/tilemap';
import type { ThemeId } from '../types';
import { floor01 } from './floor01';
import { floorCandy } from './floor-candy';
import { floorNeon } from './floor-neon';
import { floorShaft } from './floor-shaft';
import { floorArena } from './floor-arena';
import { floorRooftop } from './floor-rooftop';
import { floorRace } from './floor-race';
import { floorLane } from './floor-lane';
import { floorMaze } from './floor-maze';

export interface FloorDef {
  map: FloorMap;
  theme: ThemeId;
  kind: 'nests' | 'boss' | 'shaft' | 'race' | 'lane' | 'maze';
  boss?: 'megaBlock' | 'worm';
  /** shown in the HUD */
  name: string;
  /** extra chance for elites in hordes */
  eliteBonus: number;
}

/** every floor by map id */
export const FLOORS: Record<string, FloorDef> = {
  [floor01.id]: { map: floor01, theme: 'plaza', kind: 'nests', name: 'floor.plaza', eliteBonus: 0 },
  [floorCandy.id]: { map: floorCandy, theme: 'candy', kind: 'nests', name: 'floor.candy', eliteBonus: 0.05 },
  [floorNeon.id]: { map: floorNeon, theme: 'neon', kind: 'nests', name: 'floor.neon', eliteBonus: 0.15 },
  [floorArena.id]: { map: floorArena, theme: 'arena', kind: 'boss', boss: 'megaBlock', name: 'floor.arena', eliteBonus: 0 },
  [floorRooftop.id]: { map: floorRooftop, theme: 'rooftop', kind: 'boss', boss: 'worm', name: 'floor.rooftop', eliteBonus: 0 },
  [floorShaft.id]: { map: floorShaft, theme: 'shaft', kind: 'shaft', name: 'floor.shaft', eliteBonus: 0 },
  [floorRace.id]: { map: floorRace, theme: 'race', kind: 'race', name: 'floor.race', eliteBonus: 0 },
  [floorLane.id]: { map: floorLane, theme: 'lane', kind: 'lane', name: 'floor.lane', eliteBonus: 0 },
  [floorMaze.id]: { map: floorMaze, theme: 'maze', kind: 'maze', name: 'floor.maze', eliteBonus: 0 },
};

/** the floors of a full run, bottom to top */
export const RUN_FLOORS: string[] = [floor01.id, floorCandy.id, floorArena.id, floorNeon.id, floorRooftop.id];

export function floorDef(mapId: string): FloorDef | undefined {
  return FLOORS[mapId];
}
