import * as THREE from 'three';

const clip = new THREE.Vector4();

/**
 * Where a point in the world appears in a view: `rect` is the part of the window that view is drawn into (client
 * pixels). The camera's matrices must be up to date (they are after a frame was drawn).
 * A point behind the camera has no place on screen: the numbers it gets are the point mirrored through the middle
 * of the view, and `behind` says so. Whoever draws something there has to turn it round (see ui/markers.ts).
 */
export function screenPoint(camera: THREE.Camera, x: number, y: number, z: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number; behind: boolean } {
  clip.set(x, y, z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  // (w is the distance in front of the camera: zero beside it, negative behind it)
  const behind = clip.w <= 0;
  const w = Math.abs(clip.w) < 1e-6 ? (behind ? -1e-6 : 1e-6) : clip.w;
  return { x: rect.left + ((clip.x / w + 1) / 2) * rect.width, y: rect.top + ((1 - clip.y / w) / 2) * rect.height, behind };
}
