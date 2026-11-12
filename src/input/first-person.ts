import type { Player, Vec2 } from '../sim/types';

/** eye height above the ground (the renderer puts the camera there) */
export const EYE_HEIGHT = 1.3;
/** the aim point when looking level or up, and the most the view tilts up and down (radians) */
export const FP_MAX_AIM = 14;
export const PITCH_UP = 0.35;
export const PITCH_DOWN = -0.75;
/** the view tilts a little down at first, so the aim point lands about 8 tiles ahead */
export const PITCH_START = -Math.atan(EYE_HEIGHT / 8);

/** where the line of sight meets the ground: that is the aim point (and where a lobbed hotdog lands) */
export function aimDistance(pitch: number): number {
  if (pitch >= -0.02) return FP_MAX_AIM;
  return Math.max(1.5, Math.min(FP_MAX_AIM, EYE_HEIGHT / Math.tan(-pitch)));
}

export const clampPitch = (p: number) => Math.max(PITCH_DOWN, Math.min(PITCH_UP, p));
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
