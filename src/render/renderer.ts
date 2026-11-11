import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { FloorMap } from '../sim/map/tilemap';
import type { SimEvent, SimState, Vec2 } from '../sim/types';
import { createActors } from './actors';
import { createEntities } from './entities';
import { createFx } from './fx';
import { createPickups } from './pickups';
import { blendTheme, THEMES, themeFor } from './theme';
import { createWorld } from './world';

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
  setQuality(q: GraphicsQuality): void;
  setDamageNumbers(on: boolean): void;
  /** The point on the ground under a screen position, or null if the ray misses the ground. */
  groundPoint(clientX: number, clientY: number): Vec2 | null;
  dispose(): void;
}

const LOOK_BLEND_SECONDS = 1.5;

/** Soft vignette and a touch of contrast and saturation: makes the colours pop without blurring anything. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, saturation: { value: 1.12 }, contrast: { value: 1.05 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette, saturation, contrast;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = c;
    }`,
};

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

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
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
  let composer: EffectComposer;
  let bloom: UnrealBloomPass | null = null;

  function buildComposer() {
    const q = QUALITY[quality];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    renderer.shadowMap.enabled = q.shadows > 0;
    sun.castShadow = q.shadows > 0;
    if (q.shadows > 0 && sun.shadow.mapSize.x !== q.shadows) {
      sun.shadow.mapSize.set(q.shadows, q.shadows);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    // shadows of every mesh need a material update after switching shadows on or off
    scene.traverse(o => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach(x => (x.needsUpdate = true));
    });
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: q.msaa, type: THREE.HalfFloatType });
    composer?.dispose();
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    if (q.ao) {
      const ao = new GTAOPass(scene, camera, 1, 1);
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
      composer.addPass(ao);
    }
    bloom = q.bloom ? new UnrealBloomPass(new THREE.Vector2(256, 256), THEMES.day.bloomStrength, THEMES.day.bloomRadius, THEMES.day.bloomThreshold) : null;
    if (bloom) composer.addPass(bloom);
    composer.addPass(new OutputPass());
    if (q.grade) composer.addPass(new ShaderPass(GradeShader));
    resize();
  }

  let world = createWorld(scene, map);
  let mapId = map.id;
  const overlay = new THREE.Scene();
  const entities = createEntities(scene, overlay);
  const actors = createActors(scene, map);
  const fx = createFx(scene);
  const pickups = createPickups(scene);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0 || !composer) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  buildComposer();

  let localId = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  let night = 0;
  let time = 0;
  const camPos = new THREE.Vector3(map.spawn.x, 15, map.spawn.z + 11);
  const camLook = new THREE.Vector3(map.spawn.x, 0, map.spawn.z - 2);
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
        actors.setMap(s.map);
        mapId = s.map.id;
        camPos.set(s.map.spawn.x, 15, s.map.spawn.z + 11);
        camLook.set(s.map.spawn.x, 0, s.map.spawn.z - 2);
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
      if (bloom) {
        bloom.strength = theme.bloomStrength;
        bloom.radius = theme.bloomRadius;
        bloom.threshold = theme.bloomThreshold;
      }

      world.update(s, theme, time);
      entities.update(s, theme, time, events, frameDt);
      actors.update(s, events, theme, time, frameDt, localId);
      pickups.update(s, theme, time);
      fx.update(s, events, theme, frameDt, time);

      const p = actors.playerPos();
      wantPos.set(p.x, 15, p.z + 11);
      wantLook.set(p.x, 0, p.z - 2);
      const k = 1 - Math.exp(-frameDt * 5);
      camPos.lerp(wantPos, k);
      camLook.lerp(wantLook, k);
      camera.position.copy(camPos).add(fx.shake());
      camera.lookAt(camLook);
      sky.mesh.position.copy(camera.position);
      sun.position.set(camLook.x + 9, 22, camLook.z + 8);
      sun.target.position.copy(camLook);
      fill.position.set(camLook.x - 10, 12, camLook.z - 6);
      fill.target.position.copy(camLook);

      composer.render();
      // damage numbers and other screen text go on top, untouched by bloom and ambient occlusion
      renderer.autoClear = false;
      renderer.render(overlay, camera);
      renderer.autoClear = true;
    },
    setLocalPlayer(id) {
      localId = id;
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      fx.setParticleScale(QUALITY[q].particles);
      buildComposer();
    },
    setDamageNumbers(on) {
      entities.setDamageNumbers(on);
    },
    groundPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(ground, hitPoint);
      return hit ? { x: hit.x, z: hit.z } : null;
    },
    dispose() {
      observer.disconnect();
      renderer.dispose();
    },
  };
}
