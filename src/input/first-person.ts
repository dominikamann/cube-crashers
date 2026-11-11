import type { Player, Vec2 } from '../sim/types';

/** how far ahead of the eyes the aim point sits in first person */
export const FP_AIM = 8;
/** radians per pixel of mouse movement */
export const MOUSE_TURN = 0.0025;
/** radians per second with the right stick pushed all the way */
export const PAD_TURN = 3.2;

/** yaw 0 looks up the map (-z); turning right makes it smaller */
export const forwardOf = (yaw: number): Vec2 => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
export const yawOf = (dir: Vec2): number => Math.atan2(-dir.x, -dir.z);

/** a stick or WASD input (side: right is +1, ahead: forward is +1) turned into a world direction for this view */
export function viewMove(yaw: number, side: number, ahead: number): Vec2 {
  const f = forwardOf(yaw);
  return { x: f.x * ahead - f.z * side, z: f.z * ahead + f.x * side };
}

/** where a player looks when first person is switched on: the way they drive, or where they aim on foot */
export const lookOf = (p: Pick<Player, 'vehicleId' | 'facing' | 'aim'>): Vec2 => (p.vehicleId !== null ? p.facing : p.aim);
