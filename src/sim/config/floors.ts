import type { FloorMap } from '../map/tilemap';
import type { BossKind, ThemeId } from '../types';
import { floor01 } from './floor01';
import { floorCandy } from './floor-candy';
import { floorNeon } from './floor-neon';
import { floorShaft } from './floor-shaft';
import { floorArena } from './floor-arena';
import { floorRooftop } from './floor-rooftop';
import { floorRace } from './floor-race';
import { floorLane } from './floor-lane';
import { floorMaze } from './floor-maze';
import { floorHighway } from './floor-highway';
import { floorJungle } from './floor-jungle';
import { floorServers } from './floor-servers';
import { floorWaldsee } from './floor-waldsee';
import { floorUnderwater } from './floor-underwater';

export interface FloorDef {
  map: FloorMap;
  theme: ThemeId;
  kind: 'nests' | 'boss' | 'shaft' | 'race' | 'lane' | 'maze';
  boss?: BossKind;
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
  [floorHighway.id]: { map: floorHighway, theme: 'neon', kind: 'nests', name: 'floor.highway', eliteBonus: 0.15 },
  [floorArena.id]: { map: floorArena, theme: 'arena', kind: 'boss', boss: 'megaBlock', name: 'floor.arena', eliteBonus: 0 },
  [floorRooftop.id]: { map: floorRooftop, theme: 'rooftop', kind: 'boss', boss: 'worm', name: 'floor.rooftop', eliteBonus: 0 },
  [floorJungle.id]: { map: floorJungle, theme: 'jungle', kind: 'nests', name: 'floor.jungle', eliteBonus: 0.05 },
  [floorServers.id]: { map: floorServers, theme: 'servers', kind: 'nests', name: 'floor.servers', eliteBonus: 0.15 },
  [floorWaldsee.id]: { map: floorWaldsee, theme: 'waldsee', kind: 'nests', name: 'floor.waldsee', eliteBonus: 0.05 },
  [floorUnderwater.id]: { map: floorUnderwater, theme: 'underwater', kind: 'boss', boss: 'kraken', name: 'floor.underwater', eliteBonus: 0 },
  [floorShaft.id]: { map: floorShaft, theme: 'shaft', kind: 'shaft', name: 'floor.shaft', eliteBonus: 0 },
  [floorRace.id]: { map: floorRace, theme: 'race', kind: 'race', name: 'floor.race', eliteBonus: 0 },
  [floorLane.id]: { map: floorLane, theme: 'lane', kind: 'lane', name: 'floor.lane', eliteBonus: 0 },
  [floorMaze.id]: { map: floorMaze, theme: 'maze', kind: 'maze', name: 'floor.maze', eliteBonus: 0 },
};

/** the floors of a full run, bottom to top */
export const RUN_FLOORS: string[] = [floor01.id, floorCandy.id, floorArena.id, floorNeon.id, floorRooftop.id];

/** the worlds each floor of a run can be: picked by the seed, so every run looks a little different (and every LAN player gets the same) */
export const RUN_CHOICES: string[][] = [
  [floor01.id],
  [floorCandy.id, floorJungle.id],
  [floorArena.id, floorUnderwater.id],
  [floorNeon.id, floorHighway.id, floorServers.id],
  [floorRooftop.id],
];

/** the floors of one run, one of each floor's choices */
export function runFloors(seed: number): string[] {
  // a different slice of the seed for each floor, so the choices do not move in step
  return RUN_CHOICES.map((choices, i) => choices[Math.floor(seed / [1, 1, 2, 4, 1][i]) % choices.length]);
}

/** Boss Rush: every boss in a row, each on its own arena, with a shop between them */
export const BOSS_RUSH: { map: string; boss: BossKind }[] = [
  { map: floorArena.id, boss: 'megaBlock' },
  { map: floorRooftop.id, boss: 'worm' },
  { map: floorUnderwater.id, boss: 'kraken' },
  { map: floorJungle.id, boss: 'rhino' },
  { map: floorServers.id, boss: 'spider' },
  { map: floorNeon.id, boss: 'rex' },
  // the very last one comes to the roof, at night, in a thunderstorm
  { map: floorRooftop.id, boss: 'dominik' },
];

export function floorDef(mapId: string): FloorDef | undefined {
  return FLOORS[mapId];
}
