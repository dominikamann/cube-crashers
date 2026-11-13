import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { screenPoint } from '../src/render/project';
import { MARKER_MARGIN, edgeArrow } from '../src/ui/markers';

const W = 1600, H = 900, M = MARKER_MARGIN;
const VIEW = { left: 0, top: 0, width: W, height: H };

/** the camera of the view from above, over a player at `p` (see renderer.ts) */
function topCamera(p: { x: number; z: number }, zoom = 1, aspect = W / H): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(45, aspect, 0.1, 220);
  c.position.set(p.x, 15 * zoom, p.z + 11 * zoom);
  c.lookAt(p.x, 0, p.z - 2);
  c.updateMatrixWorld();
  return c;
}

/** first person: the eyes of a player at `p`, looking along `yaw` (0 = north, toward -z) */
function eyeCamera(p: { x: number; z: number }, yaw = 0, pitch = 0, aspect = W / H): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(72, aspect, 0.1, 220);
  const k = Math.cos(pitch);
  c.position.set(p.x, 1.3, p.z);
  c.lookAt(p.x - Math.sin(yaw) * k * 10, 1.3 + Math.sin(pitch) * 10, p.z - Math.cos(yaw) * k * 10);
  c.updateMatrixWorld();
  return c;
}

const ME = { x: 35, z: 35 };
const arrowTo = (cam: THREE.Camera, x: number, z: number, view = VIEW) => {
  const p = screenPoint(cam, x, 0.5, z, view);
  return edgeArrow({ x: p.x - view.left, y: p.y - view.top, behind: p.behind }, view.width, view.height);
};

describe('where a point in the world appears on screen', () => {
  it('what the camera looks at is in the middle of its view, also in the right half of a split screen', () => {
    const cam = topCamera(ME, 1, W / 2 / H);
    const p = screenPoint(cam, ME.x, 0, ME.z - 2, { left: W / 2, top: 0, width: W / 2, height: H });
    expect(p.x).toBeCloseTo(W * 0.75, 3);
    expect(p.y).toBeCloseTo(H / 2, 3);
    expect(p.behind).toBe(false);
  });

  it('knows what lies behind the camera, and does not take what is merely far away for it', () => {
    const cam = topCamera(ME);
    expect(screenPoint(cam, ME.x, 0.5, ME.z + 40, VIEW).behind).toBe(true);
    expect(screenPoint(cam, ME.x, 0.5, ME.z + 20, VIEW).behind).toBe(false);
    // further than the camera draws, but in front of it
    expect(screenPoint(cam, ME.x, 0.5, ME.z - 400, VIEW).behind).toBe(false);
    // exactly beside the camera: no numbers that are not numbers
    const eye = eyeCamera(ME);
    const beside = screenPoint(eye, ME.x + 10, 0.5, ME.z, VIEW);
    expect(Number.isFinite(beside.x) && Number.isFinite(beside.y)).toBe(true);
  });
});

describe('the arrows at the edge of the screen', () => {
  it('there is none for a target that is in view', () => {
    expect(arrowTo(topCamera(ME), ME.x + 3, ME.z - 4)).toBeNull();
    expect(arrowTo(eyeCamera(ME), ME.x, ME.z - 12)).toBeNull();
  });

  it('seen from above: east is right, west is left, north is up, south is down', () => {
    const cam = topCamera(ME);
    const east = arrowTo(cam, ME.x + 40, ME.z - 2)!;
    expect(east.x).toBeCloseTo(W - M, 3);
    expect(Math.cos(east.angle)).toBeGreaterThan(0.95);
    const west = arrowTo(cam, ME.x - 40, ME.z - 2)!;
    expect(west.x).toBeCloseTo(M, 3);
    expect(Math.cos(west.angle)).toBeLessThan(-0.95);
    const north = arrowTo(cam, ME.x, ME.z - 40)!;
    expect(north.y).toBeCloseTo(M, 3);
    expect(Math.sin(north.angle)).toBeLessThan(-0.95);
    // (still in front of the camera, which hangs 11 tiles south of the player)
    const south = arrowTo(cam, ME.x, ME.z + 20)!;
    expect(south.y).toBeCloseTo(H - M, 3);
    expect(Math.sin(south.angle)).toBeGreaterThan(0.95);
  });

  it('seen from above: a target far to the south is behind the camera, and its arrow still points down', () => {
    const cam = topCamera(ME);
    const south = arrowTo(cam, ME.x, ME.z + 34)!;
    expect(south.y).toBeCloseTo(H - M, 3);
    expect(Math.sin(south.angle)).toBeGreaterThan(0.95);
    const southEast = arrowTo(cam, ME.x + 30, ME.z + 34)!;
    expect(Math.cos(southEast.angle)).toBeGreaterThan(0);
    expect(Math.sin(southEast.angle)).toBeGreaterThan(0);
    const southWest = arrowTo(cam, ME.x - 30, ME.z + 34)!;
    expect(Math.cos(southWest.angle)).toBeLessThan(0);
    expect(Math.sin(southWest.angle)).toBeGreaterThan(0);
  });

  it('seen from above: all the way round the player the arrow points to the side the target is on', () => {
    for (const zoom of [1, 1.6]) {
      const cam = topCamera(ME, zoom);
      for (let deg = 0; deg < 360; deg += 5) {
        // (not along the axes, where one of the two signs is a coin toss)
        if (deg % 90 < 10 || deg % 90 > 80) continue;
        const a = (deg * Math.PI) / 180;
        const dx = Math.cos(a) * 60, dz = Math.sin(a) * 60;
        const at = arrowTo(cam, ME.x + dx, ME.z - 2 + dz);
        expect(at, `no arrow at ${deg} degrees`).not.toBeNull();
        expect(Math.sign(Math.cos(at!.angle)), `left or right at ${deg} degrees`).toBe(Math.sign(dx));
        expect(Math.sign(Math.sin(at!.angle)), `up or down at ${deg} degrees`).toBe(Math.sign(dz));
      }
    }
  });

  it('the arrow sits on the edge and points along the line from the middle of the view to where it sits', () => {
    const cam = topCamera(ME);
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const at = arrowTo(cam, ME.x + Math.cos(a) * 50, ME.z + Math.sin(a) * 50)!;
      expect(at.x).toBeGreaterThanOrEqual(M - 1e-6);
      expect(at.x).toBeLessThanOrEqual(W - M + 1e-6);
      expect(at.y).toBeGreaterThanOrEqual(M - 1e-6);
      expect(at.y).toBeLessThanOrEqual(H - M + 1e-6);
      const onEdge = [at.x - M, W - M - at.x, at.y - M, H - M - at.y].some(d => Math.abs(d) < 1e-6);
      expect(onEdge, `on the edge at ${deg} degrees`).toBe(true);
      const want = Math.atan2(at.y - H / 2, at.x - W / 2);
      expect(Math.cos(at.angle - want)).toBeCloseTo(1, 6);
    }
  });

  it('a target straight above or below the middle gets a straight arrow', () => {
    expect(edgeArrow({ x: W / 2, y: -500 }, W, H)).toEqual({ x: W / 2, y: M, angle: -Math.PI / 2 });
    expect(edgeArrow({ x: W / 2, y: H + 500 }, W, H)).toEqual({ x: W / 2, y: H - M, angle: Math.PI / 2 });
  });

  it('first person: a target beside you gets its arrow on that side', () => {
    const eye = eyeCamera(ME);
    const left = arrowTo(eye, ME.x - 30, ME.z - 5)!;
    expect(left.x).toBeCloseTo(M, 3);
    const right = arrowTo(eye, ME.x + 30, ME.z - 5)!;
    expect(right.x).toBeCloseTo(W - M, 3);
  });

  it('first person: a target behind you keeps its arrow, on the side to turn to', () => {
    for (const yaw of [0, 1, 2.5, -2]) {
      const eye = eyeCamera(ME, yaw);
      // the player's own right and forward, on the ground
      const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const spot = (r: number, f: number) => [ME.x + right.x * r + fwd.x * f, ME.z + right.z * r + fwd.z * f] as const;
      const behindLeft = arrowTo(eye, ...spot(-10, -20));
      expect(behindLeft, 'a target behind you is never "in view"').not.toBeNull();
      expect(behindLeft!.x).toBeLessThan(W / 2);
      const behindRight = arrowTo(eye, ...spot(10, -20))!;
      expect(behindRight.x).toBeGreaterThan(W / 2);
      // straight behind, on the ground below eye level: the arrow sits at the bottom
      const behind = arrowTo(eye, ...spot(0, -20))!;
      expect(behind.y).toBeCloseTo(H - M, 3);
      expect(behind.x).toBeCloseTo(W / 2, 0);
    }
  });

  it('first person: turning on the spot, the arrow goes round without jumping to the other side', () => {
    const target = [ME.x + 25, ME.z] as const;
    let last: number | null = null;
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.02) {
      const at = arrowTo(eyeCamera(ME, yaw), ...target);
      if (!at) {
        last = null;
        continue;
      }
      if (last !== null) expect(Math.cos(at.angle - last), `a jump at yaw ${yaw.toFixed(2)}`).toBeGreaterThan(0.5);
      last = at.angle;
    }
  });

  it('a target exactly behind the middle of the view points down instead of nowhere', () => {
    expect(edgeArrow({ x: W / 2, y: H / 2, behind: true }, W, H)).toEqual({ x: W / 2, y: H - M, angle: Math.PI / 2 });
  });
});
