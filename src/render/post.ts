import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * The passes of the picture that are our own. They draw what the stock ones draw, with less work for the
 * graphics card: only the scene itself is drawn with multisampling, nothing is drawn twice, and the picture
 * is not copied from buffer to buffer on the way.
 */

/**
 * Draws the scene with multisampling into a target of its own. The passes after it take the smoothed picture
 * from `picture` (they only read it), and the composer's own buffers need no multisampling. (With a
 * multisampled composer every pass after the scene, each of them one flat rectangle, wrote all the samples of
 * every pixel and had them merged again: five times per frame on the highest setting.)
 */
export class SmoothScenePass extends Pass {
  private scenePass: RenderPass;
  private target: THREE.WebGLRenderTarget;

  constructor(scene: THREE.Scene, camera: THREE.Camera, samples: number) {
    super();
    this.needsSwap = false;
    this.scenePass = new RenderPass(scene, camera);
    this.target = new THREE.WebGLRenderTarget(1, 1, { samples, type: THREE.HalfFloatType });
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, _readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    this.scenePass.render(renderer, writeBuffer, this.target, deltaTime, maskActive);
  }

  /** the scene as drawn, smoothed */
  get picture(): THREE.WebGLRenderTarget {
    return this.target;
  }

  dispose(): void {
    this.target.dispose();
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

const ACROSS = new THREE.Vector2(1, 0), DOWN = new THREE.Vector2(0, 1);

/**
 * The glow of the bright parts of the picture, kept as a layer of its own (`layer`) for the last pass to add,
 * instead of being added to the picture in a pass over the whole screen. The steps are the stock pass's, up to
 * that last one.
 */
export class GlowPass extends UnrealBloomPass {
  /** where the picture comes from, if not from the composer's buffer (it is only read) */
  source: SmoothScenePass | null = null;
  private before = new THREE.Color();

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, _deltaTime: number, maskActive: boolean): void {
    const picture = (this.source ? this.source.picture : readBuffer).texture;
    renderer.getClearColor(this.before);
    const beforeAlpha = renderer.getClearAlpha(), autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    if (maskActive) renderer.state.buffers.stencil.setTest(false);
    const draw = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
      this.fsQuad.material = material;
      renderer.setRenderTarget(target);
      renderer.clear();
      this.fsQuad.render(renderer);
    };
    // the bright parts
    const highPass = this.highPassUniforms as Record<string, THREE.IUniform>;
    highPass.tDiffuse.value = picture;
    highPass.luminosityThreshold.value = this.threshold;
    draw(this.materialHighPassFilter, this.renderTargetBright);
    // blurred, smaller and wider at every step
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const blur = this.separableBlurMaterials[i];
      blur.uniforms.colorTexture.value = input.texture;
      blur.uniforms.direction.value = ACROSS;
      draw(blur, this.renderTargetsHorizontal[i]);
      blur.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      blur.uniforms.direction.value = DOWN;
      draw(blur, this.renderTargetsVertical[i]);
      input = this.renderTargetsVertical[i];
    }
    // all of them together
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    draw(this.compositeMaterial, this.renderTargetsHorizontal[0]);
    if (maskActive) renderer.state.buffers.stencil.setTest(true);
    renderer.setClearColor(this.before, beforeAlpha);
    renderer.autoClear = autoClear;
  }

  /** the glow to add to the picture: colour times alpha, as the stock pass blends it */
  get layer(): THREE.Texture {
    return this.renderTargetsHorizontal[0].texture;
  }
}

/** what the grade does to the finished colours (see FinishPass) */
export const GRADE = { vignette: 0.32, saturation: 1.12, contrast: 1.05 };

/**
 * The last pass: tone mapping and the screen's colour space as the stock output pass does them, and in the
 * same go the glow layer added (before tone mapping, as the stock bloom pass adds it) and the grade (a soft
 * vignette and a touch of contrast and saturation, which make the colours pop without blurring anything; on
 * the colours as the screen gets them). One pass over the screen instead of three.
 */
export class FinishPass extends OutputPass {
  /** where the picture comes from, if not from the composer's buffer */
  source: SmoothScenePass | null = null;

  constructor(private glow: GlowPass | null, grade: boolean) {
    super();
    const uniforms = this.uniforms as Record<string, THREE.IUniform>;
    let shader = this.material.fragmentShader;
    if (glow) {
      uniforms.tGlow = { value: null };
      shader = shader.replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\n\t\tuniform sampler2D tGlow;');
      const take = 'gl_FragColor = texture2D( tDiffuse, vUv );';
      if (!shader.includes(take)) throw new Error('the output shader is not the one this pass was written for');
      shader = shader.replace(take, `${take}\n\t\t\tvec4 glow = texture2D( tGlow, vUv );\n\t\t\tgl_FragColor.rgb += glow.rgb * glow.a;`);
    }
    if (grade) {
      uniforms.vignette = { value: GRADE.vignette };
      uniforms.saturation = { value: GRADE.saturation };
      uniforms.contrast = { value: GRADE.contrast };
      shader =
        shader.slice(0, shader.lastIndexOf('}')).replace('varying vec2 vUv;', 'uniform float vignette, saturation, contrast;\n\t\tvarying vec2 vUv;') +
        /* glsl */ `
			vec4 c = gl_FragColor;
			float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
			c.rgb = mix( vec3( l ), c.rgb, saturation );
			c.rgb = ( c.rgb - 0.5 ) * contrast + 0.5;
			vec2 d = vUv - 0.5;
			c.rgb *= 1.0 - vignette * smoothstep( 0.35, 0.85, length( d * vec2( 1.25, 1.0 ) ) );
			gl_FragColor = c;

		}`;
    }
    this.material.fragmentShader = shader;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    if (this.glow) (this.uniforms as Record<string, THREE.IUniform>).tGlow.value = this.glow.layer;
    super.render(renderer, writeBuffer, this.source ? this.source.picture : readBuffer, deltaTime, maskActive);
  }
}
