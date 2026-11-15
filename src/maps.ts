import { FLOORS, RUN_FLOORS } from './sim/config/floors';

/**
 * The maps of each game mode and how a choice becomes a map: one list for the menus, the LAN host and the
 * dedicated server alike (no screen needed here, so the server can read it).
 */

/** arenas for versus: every floor with room to fight, the boss floors and the Town too */
export const VERSUS_MAPS = ['neon', 'highway', 'floor01', 'candy', 'arena', 'rooftop', 'helipad', 'uplink', 'jungle', 'servers', 'underwater', 'waldsee'];
/** the map choice "rotation": a random arena for every match, a new one after each */
export const MAP_ROTATION = 'random';

/** where a Boss Brawl can be fought: the arena first (the default), then every other floor with room for it */
export const BRAWL_MAPS = ['arena', 'floor01', 'candy', 'neon', 'highway', 'rooftop', 'helipad', 'uplink', 'jungle', 'servers', 'underwater', 'waldsee'];

/** maps for "Single floor": the floors of the tower in their order, then the Town and the games between the floors */
export const QUICK_MAPS = [...RUN_FLOORS.slice(0, 4), 'highway', RUN_FLOORS[4], 'helipad', 'uplink', 'jungle', 'servers', 'underwater', 'waldsee', 'race', 'lane', 'maze'].filter(id => FLOORS[id] && FLOORS[id].kind !== 'shaft');

/** the maps of a list one may play: the Town is walked in first person only, so not with the view fixed from above */
export const withoutTown = (maps: string[], noTown: boolean): string[] => (noTown ? maps.filter(id => id !== 'waldsee') : maps);

/** The map of a Boss Brawl: the chosen one, or a random one. */
export function brawlMapFor(choice: string, random: () => number = Math.random, noTown = false): string {
  const maps = withoutTown(BRAWL_MAPS, noTown);
  if (choice === MAP_ROTATION) return maps[Math.floor(random() * maps.length)];
  return maps.includes(choice) ? choice : maps[0];
}

/** the Boss Rush's map choice "each boss on its own floor" (the default) */
export const RUSH_OWN = 'own';

/** The maps of a Boss Rush, one per boss: undefined for their own floors, else the chosen map or a random one each. */
export function rushMapsFor(choice: string, bosses: number, random: () => number = Math.random, noTown = false): string[] | undefined {
  const maps = withoutTown(BRAWL_MAPS, noTown);
  if (choice === MAP_ROTATION) return Array.from({ length: bosses }, () => maps[Math.floor(random() * maps.length)]);
  return maps.includes(choice) ? Array.from({ length: bosses }, () => choice) : undefined;
}

/** one of `maps`: the chosen one, or with the rotation a random one that is not `last` */
function pick(maps: string[], choice: string, last: string | null, random: () => number): string {
  if (choice !== MAP_ROTATION) return maps.includes(choice) ? choice : maps[0];
  const pool = maps.filter(m => m !== last);
  return pool[Math.floor(random() * pool.length)];
}

/** The arena to play on: the chosen one, or with the rotation a random one that is not `last`. */
export function versusMapFor(choice: string, last: string | null, random: () => number = Math.random, noTown = false): string {
  return pick(withoutTown(VERSUS_MAPS, noTown), choice, last, random);
}

/** The floor of a Single floor: the chosen one, or with the rotation a random one that is not `last`. */
export function quickMapFor(choice: string, last: string | null, random: () => number = Math.random, noTown = false): string {
  return pick(withoutTown(QUICK_MAPS, noTown), choice, last, random);
}
