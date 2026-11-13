import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

/**
 * The passes of the picture that are our own. They draw what the stock ones draw, with less work for the
 * graphics card: only the scene itself is drawn with multisampling, and nothing is drawn twice.
 */

/**
 * Draws the scene with multisampling into a target of its own and hands the smoothed picture to the composer,
 * whose own buffers then need no multisampling. (With a multisampled composer every pass after the scene, each
 * of them one flat rectangle, wrote all the samples of every pixel and had them merged again: five times per
 * frame on the highest setting.)
 */
export class SmoothScenePass extends Pass {
  private scenePass: RenderPass;
  private target: THREE.WebGLRenderTarget;
  private copy: FullScreenQuad;
  private copyMaterial: THREE.ShaderMaterial;

  /**
   * `handOver`: the picture is copied into the composer's buffer for the next pass. Without it the next pass
   * has to take it from `picture` itself (see AmbientPass), which saves the copy.
   */
  constructor(scene: THREE.Scene, camera: THREE.Camera, samples: number, private handOver = true) {
    super();
    this.needsSwap = false;
    this.scenePass = new RenderPass(scene, camera);
    this.target = new THREE.WebGLRenderTarget(1, 1, { samples, type: THREE.HalfFloatType });
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.copy = new FullScreenQuad(this.copyMaterial);
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    this.scenePass.render(renderer, writeBuffer, this.target, deltaTime, maskActive);
    if (!this.handOver) return;
    this.copyMaterial.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(readBuffer);
    this.copy.render(renderer);
  }

  /** the scene as drawn, smoothed */
  get picture(): THREE.WebGLRenderTarget {
    return this.target;
  }

  dispose(): void {
    this.target.dispose();
    this.copyMaterial.dispose();
    this.copy.dispose();
  }
}

/**
 * Ambient occlusion that does not draw the shadow map again: its look at the scene's surfaces is a second
 * drawing of the scene, and every drawing of a scene renews the shadows of its lights. They are the same ones
 * the picture itself was just drawn with.
 */
export class AmbientPass extends GTAOPass {
  /** where the picture to shade comes from, if not from the composer's buffer (it is only read) */
  source: SmoothScenePass | null = null;

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    super.render(renderer, writeBuffer, this.source ? this.source.picture : readBuffer, deltaTime, maskActive);
  }

  renderOverride(renderer: THREE.WebGLRenderer, overrideMaterial: THREE.MeshNormalMaterial, renderTarget: THREE.WebGLRenderTarget | null, clearColor?: THREE.ColorRepresentation, clearAlpha?: number): void {
    const auto = renderer.shadowMap.autoUpdate, due = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    super.renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha);
    renderer.shadowMap.autoUpdate = auto;
    renderer.shadowMap.needsUpdate = due;
  }
}

/** what the grade does to the finished colours (see `gradedOutput`) */
export const GRADE = { vignette: 0.32, saturation: 1.12, contrast: 1.05 };

/**
 * The last pass: tone mapping and the screen's colour space as the stock output pass does them, and in the
 * same go the grade (a soft vignette and a touch of contrast and saturation, which make the colours pop
 * without blurring anything). One pass over the screen instead of two.
 */
export function gradedOutput(): OutputPass {
  const pass = new OutputPass();
  const uniforms = pass.uniforms as Record<string, THREE.IUniform>;
  uniforms.vignette = { value: GRADE.vignette };
  uniforms.saturation = { value: GRADE.saturation };
  uniforms.contrast = { value: GRADE.contrast };
  const source = pass.material.fragmentShader;
  const end = source.lastIndexOf('}');
  pass.material.fragmentShader =
    source.slice(0, end).replace('varying vec2 vUv;', 'uniform float vignette, saturation, contrast;\n\t\tvarying vec2 vUv;') +
    /* glsl */ `
			// the grade, on the colours as the screen gets them
			vec4 c = gl_FragColor;
			float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
			c.rgb = mix( vec3( l ), c.rgb, saturation );
			c.rgb = ( c.rgb - 0.5 ) * contrast + 0.5;
			vec2 d = vUv - 0.5;
			c.rgb *= 1.0 - vignette * smoothstep( 0.35, 0.85, length( d * vec2( 1.25, 1.0 ) ) );
			gl_FragColor = c;

		}`;
  return pass;
}
