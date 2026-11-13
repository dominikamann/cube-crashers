import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { FloorMap } from '../sim/map/tilemap';
import type { SimEvent, SimState, Vec2 } from '../sim/types';
import { createActors } from './actors';
import { createEntities } from './entities';
import { createFx } from './fx';
import { createPickups } from './pickups';
import { blendTheme, THEMES, themeFor } from './theme';
import { createWorld } from './world';
import { createViewModel } from './viewmodel';
import { EYE_HEIGHT } from '../input/first-person';
import { createHealthBars } from './health-bars';
import { AmbientPass, gradedOutput, SmoothScenePass } from './post';
import { attachPerfRenderer } from '../dev/perf-probe';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
export const GRAPHICS_QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];

interface QualityDef {
  pixelRatio: number;
  shadows: number;
  msaa: number;
  bloom: boolean;
  ao: boolean;
  grade: boolean;
  particles: number;
}

export const QUALITY: Record<GraphicsQuality, QualityDef> = {
  low: { pixelRatio: 1, shadows: 0, msaa: 0, bloom: false, ao: false, grade: false, particles: 0.5 },
  medium: { pixelRatio: 1.5, shadows: 1024, msaa: 4, bloom: true, ao: false, grade: true, particles: 1 },
  high: { pixelRatio: 2, shadows: 2048, msaa: 4, bloom: true, ao: false, grade: true, particles: 1 },
  ultra: { pixelRatio: 3, shadows: 4096, msaa: 4, bloom: true, ao: true, grade: true, particles: 1 },
};

export interface GameRenderer {
  /** `alpha` is the fraction of a sim tick since the last step (positions are not interpolated yet). */
  render(s: SimState, alpha: number, events: SimEvent[], frameDt: number): void;
  /** whose eyes we look through (the camera follows this player) */
  setLocalPlayer(id: number): void;
  /** split screen: one view per player id, side by side (one id = full screen) */
  setViews(ids: number[]): void;
  /** zoomed out for a wider view (per view) */
  setZoomedOut(view: number, out: boolean): void;
  /** the camera slides toward where the player aims (controllers: from the aim point in the world) */
  setLookAhead(view: number, on: boolean): void;
  /**
   * Mouse players: the camera leans by where the pointer is on screen (-1..1 from the centre of the view).
   * Taken from the screen, not the world, so moving the camera never moves the point under the pointer.
   */
  setMouseLook(view: number, offset: { x: number; y: number } | null): void;
  /** dev: the camera circles this spot at eye level instead of following the player (to look at a figure); null ends it */
  setShowroom(at: { x: number; z: number; height: number; radius: number; angle?: number; look?: number } | null): void;
  /** first person for view `view`, looking along `yaw` tilted by `pitch` (see input/first-person); null = the view from above */
  setFirstPerson(view: number, look: { yaw: number; pitch: number } | null): void;
  setQuality(q: GraphicsQuality): void;
  setDamageNumbers(on: boolean): void;
  /** Where a ground point appears on screen in view `view`, in CSS pixels of the canvas. */
  /** a point on screen (client pixels); `y` is the height above the ground; `behind` = behind the camera */
  project(x: number, z: number, view?: number, y?: number): { x: number; y: number; behind: boolean };
  /** The point on the ground under a screen position, or null if the ray misses the ground. */
  groundPoint(clientX: number, clientY: number): Vec2 | null;
  dispose(): void;
}

const LOOK_BLEND_SECONDS = 1.5;
/** share of the aim distance the camera moves ahead, and the most it moves (tiles) */
const LOOK_AHEAD = 0.45;
const LOOK_AHEAD_MAX = 3;
/** camera distance when zoomed out */
const ZOOM_OUT = 1.5;
/** first person: a wider lens (the eye height comes from the input side, so the crosshair meets the aim point) */
const FP_FOV = 72;

/** A big sphere around the camera with a gradient from horizon to zenith. */
function makeSky(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon;
      varying vec3 vDir;
      void main() { gl_FragColor = vec4(mix(horizon, top, smoothstep(-0.05, 0.6, vDir.y)), 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 16), material);
  mesh.renderOrder = -1;
  return { mesh, material };
}

export function createRenderer(canvas: HTMLCanvasElement, map: FloorMap): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(THEMES.day.background, THEMES.day.fogNear, THEMES.day.fogFar);
  const sky = makeSky();
  scene.add(sky.mesh);
  if (import.meta.env.DEV) attachPerfRenderer(renderer, scene);

  const hemi = new THREE.HemisphereLight(THEMES.day.hemiSky, THEMES.day.hemiGround, THEMES.day.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(THEMES.day.sunColor, THEMES.day.sunIntensity);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 24, bottom: -24, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  // cool fill from the other side keeps the shadow sides of the voxels from going flat
  const fill = new THREE.DirectionalLight(THEMES.day.fillColor, THEMES.day.fillIntensity);
  scene.add(fill, fill.target);

  let quality: GraphicsQuality = 'high';
  interface View {
    id: number;
    camera: THREE.PerspectiveCamera;
    composer: EffectComposer | null;
    bloom: UnrealBloomPass | null;
    camPos: THREE.Vector3;
    camLook: THREE.Vector3;
    /** 1 = normal, higher = further away */
    zoom: number;
    wantZoom: number;
    lookAhead: boolean;
    mouseLook: { x: number; y: number } | null;
    /** first person: where the eyes look, or null for the view from above */
    fp: { yaw: number; pitch: number } | null;
  }
  const makeView = (id: number, at: { x: number; z: number }): View => ({
    id,
    camera: new THREE.PerspectiveCamera(45, 1, 0.1, 220),
    composer: null,
    bloom: null,
    camPos: new THREE.Vector3(at.x, 15, at.z + 11),
    camLook: new THREE.Vector3(at.x, 0, at.z - 2),
    zoom: 1,
    wantZoom: 1,
    lookAhead: false,
    mouseLook: null,
    fp: null,
  });
  let views: View[] = [makeView(0, map.spawn)];

  /** frees a composer with all its passes (EffectComposer.dispose alone keeps the bloom and AO targets) */
  function disposeComposer(c: EffectComposer | null) {
    if (!c) return;
    for (const pass of c.passes) (pass as { dispose?: () => void }).dispose?.();
    c.dispose();
  }

  function buildComposer() {
    const q = QUALITY[quality];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    const shadowsToggled = renderer.shadowMap.enabled !== q.shadows > 0;
    renderer.shadowMap.enabled = q.shadows > 0;
    sun.castShadow = q.shadows > 0;
    if (q.shadows > 0 && sun.shadow.mapSize.x !== q.shadows) {
      sun.shadow.mapSize.set(q.shadows, q.shadows);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    // shadows of every mesh need a material update after switching shadows on or off (and only then:
    // it recompiles every shader)
    if (shadowsToggled) {
      scene.traverse(o => {
        const m = (o as THREE.Mesh).material;
        if (m) (Array.isArray(m) ? m : [m]).forEach(x => (x.needsUpdate = true));
      });
    }
    for (const v of views) {
      // only the scene itself is drawn with multisampling (see post.ts); without it (low) it goes straight
      // into the composer's buffer, which then needs the depth
      const smooth = q.msaa > 0 ? new SmoothScenePass(scene, v.camera, q.msaa, !q.ao) : null;
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: !smooth });
      disposeComposer(v.composer);
      const composer = new EffectComposer(renderer, target);
      composer.addPass(smooth ?? new RenderPass(scene, v.camera));
      if (q.ao) {
        const ao = new AmbientPass(scene, v.camera, 1, 1);
        ao.source = smooth;
        ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
        composer.addPass(ao);
      }
      v.bloom = q.bloom ? new UnrealBloomPass(new THREE.Vector2(256, 256), THEMES.day.bloomStrength, THEMES.day.bloomRadius, THEMES.day.bloomThreshold) : null;
      if (v.bloom) composer.addPass(v.bloom);
      // tone mapping and, where the setting has it, the grade in the same pass
      composer.addPass(q.grade ? gradedOutput() : new OutputPass());
      v.composer = composer;
    }
    resize();
  }

  let world = createWorld(scene, map);
  let mapId = map.id;
  const overlay = new THREE.Scene();
  const entities = createEntities(scene, overlay);
  const actors = createActors(scene, map);
  const viewModel = createViewModel();
  const healthBars = createHealthBars(scene);
  const fx = createFx(scene);
  const pickups = createPickups(scene);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0 || views.some(v => !v.composer)) return;
    renderer.setSize(w, h, false);
    const vw = Math.floor(w / views.length);
    for (const v of views) {
      v.composer!.setSize(vw, h);
      v.camera.aspect = vw / h;
      v.camera.updateProjectionMatrix();
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  buildComposer();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  let night = 0;
  let time = 0;
  let showroom: { x: number; z: number; height: number; radius: number; angle?: number; look?: number } | null = null;
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();

  return {
    render(s, _alpha, events, frameDt) {
      time += frameDt;
      const wantNight = s.look === 'night' ? 1 : 0;
      const step = frameDt / LOOK_BLEND_SECONDS;
      night = wantNight > night ? Math.min(1, night + step) : Math.max(0, night - step);
      if (s.map.id !== mapId) {
        // a new floor: rebuild the static world and jump the camera to the new spawn
        world.dispose();
        world = createWorld(scene, s.map);
        world.setDetail(quality === 'low');
        actors.setMap(s.map);
        mapId = s.map.id;
        for (const v of views) {
          v.camPos.set(s.map.spawn.x, 15, s.map.spawn.z + 11);
          v.camLook.set(s.map.spawn.x, 0, s.map.spawn.z - 2);
        }
      }
      const palette = themeFor(s.theme);
      const theme = blendTheme(palette.day, palette.night, night);

      sky.material.uniforms.top.value.setHex(theme.skyTop);
      sky.material.uniforms.horizon.value.setHex(theme.background);
      const fog = scene.fog as THREE.Fog;
      fog.color.setHex(theme.background);
      fog.near = theme.fogNear;
      fog.far = theme.fogFar;
      hemi.color.setHex(theme.hemiSky);
      hemi.groundColor.setHex(theme.hemiGround);
      hemi.intensity = theme.hemiIntensity;
      sun.color.setHex(theme.sunColor);
      sun.intensity = theme.sunIntensity;
      fill.color.setHex(theme.fillColor);
      fill.intensity = theme.fillIntensity;
      for (const v of views) {
        if (!v.bloom) continue;
        // in first person glowing things come close to the lens: much less bloom, or they turn into floodlights
        v.bloom.strength = theme.bloomStrength * (v.fp ? 0.35 : 1);
        v.bloom.radius = theme.bloomRadius;
        v.bloom.threshold = theme.bloomThreshold;
      }

      world.update(s, theme, time);
      entities.update(s, theme, time, events, frameDt);
      actors.update(s, events, theme, time, frameDt, views.map(v => v.id));
      pickups.update(s, theme, time);
      fx.update(s, events, theme, frameDt, time);
      healthBars.update(s);

      const shake = fx.shake();
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const vw = Math.floor(w / views.length);
      const k = 1 - Math.exp(-frameDt * 5);
      views.forEach((v, i) => {
        if (showroom) {
          // a slow turn round the figure, with a look from a little above
          const a = showroom.angle ?? time * 0.45;
          // (or, with `look`, a close look at that height: his face, his hammer)
          const look = showroom.look;
          v.camera.position.set(showroom.x + Math.sin(a) * showroom.radius, look === undefined ? showroom.height * 1.05 : look + showroom.radius * 0.2, showroom.z + Math.cos(a) * showroom.radius);
          v.camera.lookAt(showroom.x, look ?? showroom.height * 0.62, showroom.z);
          return;
        }
        const p = actors.playerPos(i);
        // in a boss fight the camera leans toward the boss so both stay in the picture
        let ox = 0, oz = 0;
        // (not toward a wild boss: the fight is not about it, and in versus the rivals matter more)
        const boss = s.boss && !s.boss.wild ? (s.boss.enemyId !== null ? s.enemies.find(e => e.id === s.boss!.enemyId)?.pos : s.enemies.find(e => e.id === s.boss!.worms[0]?.[0])?.pos) ?? s.boss.lastPos : null;
        if (boss) {
          const dx = boss.x - p.x, dz = boss.z - p.z;
          const d = Math.hypot(dx, dz);
          const lean = Math.min(d * 0.3, 3.5);
          if (d > 0.01) {
            ox = (dx / d) * lean;
            oz = (dz / d) * lean;
          }
        }
        // look-ahead: the camera slides toward where the player aims (right stick or mouse)
        const me = s.players.find(pl => pl.id === v.id);
        if (me && me.downUntil === null && v.lookAhead) {
          const ax = me.aimPoint.x - me.pos.x, az = me.aimPoint.z - me.pos.z;
          const ad = Math.hypot(ax, az);
          const ahead = Math.min(ad * LOOK_AHEAD, LOOK_AHEAD_MAX);
          if (ad > 0.01) {
            ox += (ax / ad) * ahead;
            oz += (az / ad) * ahead;
          }
        }
        v.zoom += (v.wantZoom - v.zoom) * k;
        if (v.mouseLook) {
          ox += v.mouseLook.x * LOOK_AHEAD_MAX;
          oz += v.mouseLook.y * LOOK_AHEAD_MAX;
        }
        const fov = v.fp === null ? 45 : FP_FOV;
        if (v.camera.fov !== fov) {
          v.camera.fov = fov;
          v.camera.updateProjectionMatrix();
        }
        if (v.fp !== null) {
          // first person: the eyes sit in the head, looking along the view, no lag
          const model = actors.playerModel(v.id);
          const eyeY = (model?.position.y ?? 0) + EYE_HEIGHT;
          const c = Math.cos(v.fp.pitch);
          const fx = -Math.sin(v.fp.yaw) * c, fz = -Math.cos(v.fp.yaw) * c;
          v.camPos.set(p.x, eyeY, p.z);
          v.camLook.set(p.x + fx * 10, eyeY + Math.sin(v.fp.pitch) * 10, p.z + fz * 10);
          v.camera.position.copy(v.camPos).addScaledVector(shake, 0.3);
          v.camera.lookAt(v.camLook);
          return;
        }
        wantPos.set(p.x + ox, 15 * v.zoom, p.z + oz + 11 * v.zoom);
        wantLook.set(p.x + ox, 0, p.z + oz - 2);
        v.camPos.lerp(wantPos, k);
        v.camLook.lerp(wantLook, k);
        v.camera.position.copy(v.camPos).add(shake);
        v.camera.lookAt(v.camLook);
      });
      // one sun for all views: centred between them, with a shadow area wide enough for both
      const mid = views.reduce((acc, v) => acc.add(v.camLook), new THREE.Vector3()).multiplyScalar(1 / views.length);
      const spread = views.length > 1 ? views[0].camLook.distanceTo(views[1].camLook) / 2 : 0;
      const sc = sun.shadow.camera;
      if (sc.right !== 20 + spread) {
        Object.assign(sc, { left: -20 - spread, right: 20 + spread, top: 24 + spread, bottom: -24 - spread });
        sc.updateProjectionMatrix();
      }
      sun.position.set(mid.x + 9, 22, mid.z + 8);
      sun.target.position.copy(mid);
      fill.position.set(mid.x - 10, 12, mid.z - 6);
      fill.target.position.copy(mid);

      views.forEach((v, i) => {
        if (views.length > 1) {
          renderer.setViewport(i * vw, 0, vw, h);
          renderer.setScissor(i * vw, 0, vw, h);
          renderer.setScissorTest(true);
        }
        sky.mesh.position.copy(v.camera.position);
        healthBars.face(v.camera, views.map(x => x.id));
        // first person: you do not see the inside of your own head
        // (nor the ground crosshair: the screen has one in the middle)
        // (a lobbed weapon keeps it, as the spot where the throw will land)
        const me = s.players.find(pl => pl.id === v.id);
        const lob = me ? ['hotdogSlinger', 'bomb'].includes(me.weapons[me.selected]?.kind ?? '') && !me.rareSelected : false;
        const hidden = v.fp !== null ? [actors.playerModel(v.id), lob ? undefined : actors.reticle(i)].filter((o): o is THREE.Object3D => !!o) : [];
        const shown = hidden.map(o => o.visible);
        for (const o of hidden) o.visible = false;
        v.composer!.render();
        hidden.forEach((o, k) => (o.visible = shown[k]));
        // damage numbers and other screen text go on top, untouched by bloom and ambient occlusion
        renderer.autoClear = false;
        renderer.render(overlay, v.camera);
        // first person: the weapon in your hand on top of everything
        if (v.fp !== null) {
          viewModel.update(s, v.id, time, frameDt);
          viewModel.render(renderer, v.camera.aspect);
        }
        renderer.autoClear = true;
      });
      if (views.length > 1) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, w, h);
      }
    },
    setLocalPlayer(id) {
      if (views.length === 1) views[0].id = id;
    },
    setShowroom(at) {
      showroom = at;
    },
    setMouseLook(view, offset) {
      if (views[view]) views[view].mouseLook = offset;
    },
    setFirstPerson(view, look) {
      if (views[view]) views[view].fp = look;
    },
    setLookAhead(view, on) {
      if (views[view]) views[view].lookAhead = on;
    },
    setZoomedOut(view, out) {
      if (views[view]) views[view].wantZoom = out ? ZOOM_OUT : 1;
    },
    setViews(ids) {
      if (ids.length === views.length && ids.every((id, i) => views[i].id === id)) return;
      // only whose eyes changed: keep the composers
      if (ids.length === views.length) {
        ids.forEach((id, i) => (views[i].id = id));
        return;
      }
      const at = views[0].camLook;
      for (const v of views.slice(ids.length)) disposeComposer(v.composer);
      views = ids.map((id, i) => views[i] ? Object.assign(views[i], { id }) : makeView(id, { x: at.x, z: at.z + 2 }));
      buildComposer();
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      world.setDetail(q === 'low');
      fx.setParticleScale(QUALITY[q].particles);
      buildComposer();
    },
    setDamageNumbers(on) {
      entities.setDamageNumbers(on);
    },
    project(x, z, view = 0, y = 0.5) {
      const v = new THREE.Vector3(x, y, z).project(views[view].camera);
      const rect = canvas.getBoundingClientRect();
      const vw = rect.width / views.length;
      return { x: rect.left + view * vw + ((v.x + 1) / 2) * vw, y: rect.top + ((1 - v.y) / 2) * rect.height, behind: v.z > 1 };
    },
    groundPoint(clientX, clientY) {
      // the mouse belongs to the first view (player 1 on the left)
      const rect = canvas.getBoundingClientRect();
      const vw = rect.width / views.length;
      ndc.set(((clientX - rect.left) / vw) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, views[0].camera);
      const hit = raycaster.ray.intersectPlane(ground, hitPoint);
      return hit ? { x: hit.x, z: hit.z } : null;
    },
    dispose() {
      observer.disconnect();
      renderer.dispose();
    },
  };
}
