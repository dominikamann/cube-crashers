import type { FloorMap } from '../map/tilemap';
import type { ThemeId } from '../types';
import { floor01 } from './floor01';
import { floorCandy } from './floor-candy';
import { floorNeon } from './floor-neon';

export interface FloorDef {
  map: FloorMap;
  theme: ThemeId;
  kind: 'nests' | 'boss' | 'shaft';
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
};

/** the floors of a full run, bottom to top */
export const RUN_FLOORS: string[] = [floor01.id, floorCandy.id, floorNeon.id];

export function floorDef(mapId: string): FloorDef | undefined {
  return FLOORS[mapId];
}
