import { PLAYER_RADIUS } from '../config/balance';
import { BLOCKS_ENEMY, BLOCKS_KART, BLOCKS_WALKER, conveyorDir, moveCircle, tileAt } from '../map/tilemap';
import { DT, type SimState, type Vec2 } from '../types';
import { isBossBody } from './combat';
import { KART } from './vehicles';
import { HELIPAD } from '../config/floor-helipad';

export const CONVEYOR_SPEED = 2.5;
/** the rotor wash of the helicopter parked on the helipad: right by it, it blows harder than a belt carries (a player
 *  runs 6), further out as hard as one */
export const WASH_SPEED = 3.2;
const WASH_NEAR = 1.5;

/** within reach of the hull or the tail boom of the parked helicopter */
function byHeli(pos: Vec2): boolean {
  const { heli } = HELIPAD;
  const off = (x0: number, x1: number, z0: number, z1: number) => Math.hypot(Math.max(x0 - pos.x, 0, pos.x - x1), Math.max(z0 - pos.z, 0, pos.z - z1));
  return Math.min(off(heli.x0, heli.x1 + 1, heli.z0, heli.z1 + 1), off(heli.tailX0, heli.tailX1 + 1, heli.tailZ, heli.tailZ + 1)) <= WASH_NEAR;
}

function push(s: SimState, pos: Vec2): Vec2 | null {
  const dir = conveyorDir(tileAt(s.map, pos.x, pos.z));
  const speed = s.map.id === 'helipad' && byHeli(pos) ? WASH_SPEED : CONVEYOR_SPEED;
  return dir ? { x: dir.x * speed * DT, z: dir.z * speed * DT } : null;
}

/**
 * Conveyor belts carry whatever stands on them: players on foot, monsters and parked or driven karts. A boss's body is
 * too heavy for a belt (and for the rotor wash on the helipad): it walks across as if the floor stood still.
 */
export function updateConveyors(s: SimState): void {
  for (const p of s.players) {
    if (p.downUntil !== null || p.air > 0 || p.flying || p.vehicleId !== null) continue;
    const d = push(s, p.pos);
    if (d) moveCircle(s.map, p.pos, d.x, d.z, PLAYER_RADIUS, BLOCKS_WALKER);
  }
  for (const e of s.enemies) {
    const d = e.hp > 0 ? push(s, e.pos) : null;
    if (d && !isBossBody(s, e)) moveCircle(s.map, e.pos, d.x, d.z, e.radius, BLOCKS_ENEMY);
  }
  for (const v of s.vehicles) {
    const d = v.air === 0 ? push(s, v.pos) : null;
    if (!d) continue;
    moveCircle(s.map, v.pos, d.x, d.z, KART.radius, BLOCKS_KART);
    const driver = s.players.find(p => p.id === v.driverId);
    if (driver) driver.pos = { ...v.pos };
  }
}
