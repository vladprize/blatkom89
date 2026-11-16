/**
 * Fable cut: the picture's finish, in one camera pass over the match (the HUD is another scene and stays
 * crisp). The bright parts are taken out at half size, blurred and laid back as bloom — lamps, muzzle flashes
 * and tracers glow; then the frame is graded to the map's look (cool darks, warm lights), vignetted and given
 * a little grain. The tape look of the classic picture (scanlines, tracking, colour bleed) is folded in here
 * and follows the same «VHS» setting.
 */
import * as Phaser from 'phaser';
import type { MapLook } from './looks.js';

const VS = `
precision highp float;
attribute vec2 inPosition;
attribute vec2 inTexCoord;
varying vec2 outTexCoord;
void main () {
  outTexCoord = inTexCoord;
  gl_Position = vec4(inPosition, 0.0, 1.0);
}
`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
`;

/** Half-size copy of what is bright: four taps that land on the four texels under each half-size pixel. */
const BRIGHT = `${HEAD}
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
void main () {
  vec3 c = texture2D(uMainSampler, outTexCoord + uTexel * vec2(-0.5, -0.5)).rgb
         + texture2D(uMainSampler, outTexCoord + uTexel * vec2(0.5, -0.5)).rgb
         + texture2D(uMainSampler, outTexCoord + uTexel * vec2(-0.5, 0.5)).rgb
         + texture2D(uMainSampler, outTexCoord + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 0.0001);
  float k = max(soft, br - uThreshold) / max(br, 0.0001);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

/** One direction of a 9-tap Gaussian in five fetches (the half-size targets are sampled linearly). */
const BLUR = `${HEAD}
uniform vec2 uDir;
void main () {
  vec3 c = texture2D(uMainSampler, outTexCoord).rgb * 0.2270270270;
  c += texture2D(uMainSampler, outTexCoord + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(uMainSampler, outTexCoord - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(uMainSampler, outTexCoord + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(uMainSampler, outTexCoord - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

const FINAL = `${HEAD}
uniform sampler2D uBloomSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBloom;
uniform vec3 uShadows;
uniform vec3 uHighlights;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
uniform float uVhs;
uniform float uDamage;
uniform float uLowHp;
uniform float uKick;
uniform float uFade;

float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

void main () {
  vec2 uv = outTexCoord;
  vec2 d = uv - 0.5;
  // the tape: a rare tracking line
  float band = floor(uv.y * 90.0);
  float tracking = step(0.9965, rand(vec2(floor(uTime * 6.0), band)));
  uv.x += tracking * 0.0025 * uVhs;
  // colour fringing: a trace of it at the edges, more on a worn tape, a jolt when hit or on a kill
  float ca = dot(d, d) * (0.0012 + 0.0035 * uVhs) + 0.0007 * uVhs + uDamage * 0.003 + uKick * 0.0022;
  vec3 col;
  col.r = texture2D(uMainSampler, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(uMainSampler, uv).g;
  col.b = texture2D(uMainSampler, uv - vec2(ca, 0.0)).b;
  col += texture2D(uBloomSampler, uv).rgb * uBloom;

  // the grade: darks lean one way, lights the other
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(uShadows, uHighlights, smoothstep(0.04, 0.62, luma));
  luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, uSaturation * (1.0 - 0.8 * uFade) * (1.0 - 0.45 * uLowHp));
  col = (col - 0.4) * uContrast + 0.4;
  col = max(col, 0.0);
  // highlights roll off instead of clipping
  vec3 over = max(col - 0.78, 0.0);
  col = min(col, 0.78) + 0.22 * (1.0 - exp(-over * 4.5));

  float scan = 0.93 + 0.07 * sin(outTexCoord.y * uResolution.y * 3.14159);
  col *= mix(1.0, scan, uVhs);
  float g = rand(outTexCoord * uResolution + fract(uTime) * 7.0) - 0.5;
  col += g * (0.022 + 0.04 * uVhs);

  float vig = smoothstep(0.95, 0.3, length(d * vec2(1.0, 0.85)));
  col *= mix(1.0, 0.22 + 0.78 * vig, clamp(uVignette + 0.25 * uFade + 0.3 * uLowHp, 0.0, 1.0));
  // hurt: red creeps in from the edges; nearly dead: it stays and beats
  vec3 hurt = vec3(col.r * 1.3 + 0.08, col.g * 0.5, col.b * 0.5);
  col = mix(col, hurt, clamp(uDamage * 0.35 + uLowHp * 0.3, 0.0, 1.0) * (1.0 - vig));
  col *= 1.0 - 0.18 * uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;

type RT = Phaser.Renderer.WebGL.RenderTarget;
type Shader = Phaser.Renderer.WebGL.WebGLShader;

const NEUTRAL: readonly [number, number, number] = [1, 1, 1];

export class FablePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  /** The map's look (its grade and bloom); null — a neutral grade. */
  look: MapLook | null = null;
  /** Bloom passes (0: none). */
  bloomPasses = 3;
  /** The tape look, 0–1 (the «VHS» setting). */
  vhs = 0;
  /** Just hit, 0–1. */
  damage = 0;
  /** Nearly dead, 0–1 (pulsing). */
  lowHp = 0;
  /** A jolt of colour fringing (a kill, a blast nearby), 0–1. */
  kick = 0;
  /** The match is over: the colour drains, 0–1. */
  fade = 0;
  /** Extra bloom for a moment (a flashbang), added to the look's. */
  glare = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'Fable',
      vertShader: VS,
      shaders: [
        { name: 'final', fragShader: FINAL },
        { name: 'bright', fragShader: BRIGHT },
        { name: 'blur', fragShader: BLUR },
      ],
      renderTarget: [{ scale: 1 }, { scale: 0.5 }, { scale: 0.5 }],
    } as Phaser.Types.Renderer.WebGL.WebGLPipelineConfig);
  }

  /** The half-size targets are sampled linearly (the game's own textures are nearest: it is pixel art). */
  private linear(rt: RT) {
    const tex = rt.texture as unknown as { webGLTexture: WebGLTexture; minFilter: number; magFilter: number; fableLinear?: boolean };
    if (tex.fableLinear) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.webGLTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // a restored context makes the texture anew from these
    tex.minFilter = gl.LINEAR;
    tex.magFilter = gl.LINEAR;
    tex.fableLinear = true;
  }

  override onDraw(src: RT): void {
    const gl = this.gl;
    const [sFinal, sBright, sBlur] = this.shaders as [Shader, Shader, Shader];
    const half1 = this.renderTargets[1];
    const half2 = this.renderTargets[2];
    const look = this.look;
    const passes = half1 && half2 ? this.bloomPasses : 0;
    const bloom = passes > 0 ? (look?.bloom ?? 0.8) + this.glare : 0;
    if (passes > 0 && half1 && half2) {
      this.linear(half1);
      this.linear(half2);
      sBright.bind(true, false);
      this.set2f('uTexel', 1 / src.width, 1 / src.height, sBright);
      this.set1f('uThreshold', look?.threshold ?? 0.6, sBright);
      this.set1f('uKnee', 0.22, sBright);
      this.bindAndDraw(src, half1, true, true, sBright);
      sBlur.bind(true, false);
      for (let i = 0; i < passes; i++) {
        const s = 1 + i * 1.2;
        this.set2f('uDir', s / half1.width, 0, sBlur);
        this.bindAndDraw(half1, half2, true, true, sBlur);
        this.set2f('uDir', 0, s / half1.height, sBlur);
        this.bindAndDraw(half2, half1, true, true, sBlur);
      }
    }
    sFinal.bind(true, false);
    const sh = look?.shadows ?? NEUTRAL;
    const hi = look?.highlights ?? NEUTRAL;
    this.set1i('uBloomSampler', 1, sFinal);
    this.set2f('uResolution', src.width, src.height, sFinal);
    this.set1f('uTime', (this.game.loop.time / 1000) % 600, sFinal);
    this.set1f('uBloom', bloom, sFinal);
    this.set3f('uShadows', sh[0], sh[1], sh[2], sFinal);
    this.set3f('uHighlights', hi[0], hi[1], hi[2], sFinal);
    this.set1f('uSaturation', look?.saturation ?? 1, sFinal);
    this.set1f('uContrast', look?.contrast ?? 1, sFinal);
    this.set1f('uVignette', look?.vignette ?? 0.4, sFinal);
    this.set1f('uVhs', this.vhs, sFinal);
    this.set1f('uDamage', this.damage, sFinal);
    this.set1f('uLowHp', this.lowHp, sFinal);
    this.set1f('uKick', this.kick, sFinal);
    this.set1f('uFade', this.fade, sFinal);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ((passes > 0 && half1 ? half1 : src).texture as unknown as { webGLTexture: WebGLTexture }).webGLTexture);
    gl.activeTexture(gl.TEXTURE0);
    // the half-size passes left their viewport behind
    gl.viewport(0, 0, src.width, src.height);
    this.bindAndDraw(src, undefined, true, true, sFinal);
  }
}
