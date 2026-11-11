import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { MapDef, SimEvent, SimState } from '../sim/types';
import { createActors } from './actors';
import { createEntities } from './entities';
import { createFx } from './fx';
import { blendTheme, THEMES } from './theme';
import { createWorld } from './world';

export interface GameRenderer {
  /** `alpha` is the fraction of a sim tick since the last step (positions are not interpolated yet). */
  render(s: SimState, alpha: number, events: SimEvent[], frameDt: number): void;
  dispose(): void;
}

const LOOK_BLEND_SECONDS = 1.5;

export function createRenderer(canvas: HTMLCanvasElement, map: MapDef): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEMES.day.background);
  scene.fog = new THREE.Fog(THEMES.day.background, THEMES.day.fogNear, THEMES.day.fogFar);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  const hemi = new THREE.HemisphereLight(THEMES.day.hemiSky, THEMES.day.hemiGround, THEMES.day.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(THEMES.day.sunColor, THEMES.day.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 22, bottom: -22, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // 4x MSAA render target keeps voxel edges crisp through the bloom pass
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), THEMES.day.bloomStrength, THEMES.day.bloomRadius, THEMES.day.bloomThreshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const world = createWorld(scene, map);
  const entities = createEntities(scene);
  const actors = createActors(scene);
  const fx = createFx(scene);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let night = 0;
  let time = 0;
  const camPos = new THREE.Vector3(0, 13, 14);
  const camLook = new THREE.Vector3(0, 0, -3);
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();

  return {
    render(s, _alpha, events, frameDt) {
      time += frameDt;
      const wantNight = s.look === 'night' ? 1 : 0;
      const step = frameDt / LOOK_BLEND_SECONDS;
      night = wantNight > night ? Math.min(1, night + step) : Math.max(0, night - step);
      const theme = blendTheme(THEMES.day, THEMES.night, night);

      (scene.background as THREE.Color).setHex(theme.background);
      const fog = scene.fog as THREE.Fog;
      fog.color.setHex(theme.background);
      fog.near = theme.fogNear;
      fog.far = theme.fogFar;
      hemi.color.setHex(theme.hemiSky);
      hemi.groundColor.setHex(theme.hemiGround);
      hemi.intensity = theme.hemiIntensity;
      sun.color.setHex(theme.sunColor);
      sun.intensity = theme.sunIntensity;
      bloom.strength = theme.bloomStrength;
      bloom.radius = theme.bloomRadius;
      bloom.threshold = theme.bloomThreshold;

      world.update(s, theme, time);
      entities.update(s, theme, time);
      actors.update(s, theme, time, frameDt);
      fx.update(s, events, theme, frameDt);

      const p = actors.playerPos();
      wantPos.set(p.x * 0.3, 13, p.z + 9);
      wantLook.set(p.x * 0.3, 0, p.z - 8);
      const k = 1 - Math.exp(-frameDt * 5);
      camPos.lerp(wantPos, k);
      camLook.lerp(wantLook, k);
      camera.position.copy(camPos).add(fx.shake());
      camera.lookAt(camLook);
      sun.position.set(camLook.x + 8, 20, camLook.z + 10);
      sun.target.position.copy(camLook);

      composer.render();
    },
    dispose() {
      observer.disconnect();
      renderer.dispose();
    },
  };
}
