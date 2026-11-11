import { PLAYER_RADIUS } from '../config/balance';
import { BLOCKS_ENEMY, BLOCKS_KART, BLOCKS_WALKER, conveyorDir, moveCircle, tileAt } from '../map/tilemap';
import { DT, type SimState, type Vec2 } from '../types';
import { KART } from './vehicles';

export const CONVEYOR_SPEED = 2.5;

function push(s: SimState, pos: Vec2): Vec2 | null {
  const dir = conveyorDir(tileAt(s.map, pos.x, pos.z));
  return dir ? { x: dir.x * CONVEYOR_SPEED * DT, z: dir.z * CONVEYOR_SPEED * DT } : null;
}

/** Conveyor belts carry whatever stands on them: players on foot, monsters and parked or driven karts. */
export function updateConveyors(s: SimState): void {
  for (const p of s.players) {
    if (p.downUntil !== null || p.air > 0 || p.flying || p.vehicleId !== null) continue;
    const d = push(s, p.pos);
    if (d) moveCircle(s.map, p.pos, d.x, d.z, PLAYER_RADIUS, BLOCKS_WALKER);
  }
  for (const e of s.enemies) {
    const d = e.hp > 0 ? push(s, e.pos) : null;
    if (d) moveCircle(s.map, e.pos, d.x, d.z, e.radius, BLOCKS_ENEMY);
  }
  for (const v of s.vehicles) {
    const d = v.air === 0 ? push(s, v.pos) : null;
    if (!d) continue;
    moveCircle(s.map, v.pos, d.x, d.z, KART.radius, BLOCKS_KART);
    const driver = s.players.find(p => p.id === v.driverId);
    if (driver) driver.pos = { ...v.pos };
  }
}
