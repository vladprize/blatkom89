/** Subtle, configurable VHS post-processing (scanlines, grain, chroma bleed, vignette, rare tracking line). */
import * as Phaser from 'phaser';

const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uIntensity;
uniform vec2 uResolution;
uniform float uDamage;
varying vec2 outTexCoord;

float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = outTexCoord;
  float band = floor(uv.y * 90.0);
  float tracking = step(0.9965, rand(vec2(floor(uTime * 6.0), band)));
  uv.x += tracking * 0.0025 * uIntensity;
  vec2 d = uv - 0.5;
  float ca = (0.0007 + dot(d, d) * 0.0035) * uIntensity + uDamage * 0.004;
  vec4 col;
  col.r = texture2D(uMainSampler, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(uMainSampler, uv).g;
  col.b = texture2D(uMainSampler, uv - vec2(ca, 0.0)).b;
  col.a = 1.0;
  float scan = 0.93 + 0.07 * sin(outTexCoord.y * uResolution.y * 3.14159);
  col.rgb *= mix(1.0, scan, uIntensity);
  float g = rand(outTexCoord * uResolution + fract(uTime) * 7.0) - 0.5;
  col.rgb += g * 0.05 * uIntensity;
  float vig = smoothstep(0.9, 0.28, length(d * vec2(1.0, 0.85)));
  col.rgb *= mix(1.0, 0.35 + vig * 0.65, 0.32 * uIntensity + 0.08);
  col.rgb = mix(col.rgb, col.rgb * vec3(1.05, 0.98, 0.9), 0.6 * uIntensity);
  col.rgb = mix(col.rgb, vec3(col.r * 1.3 + 0.08, col.g * 0.5, col.b * 0.5), uDamage * 0.35 * (1.0 - vig));
  gl_FragColor = col;
}
`;

export class VhsPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  intensity = 0.6;
  damage = 0;

  constructor(game: Phaser.Game) {
    super({ game, name: 'Vhs', fragShader: FRAG });
  }

  override onPreRender(): void {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uIntensity', this.intensity);
    this.set1f('uDamage', this.damage);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}

export function vhsIntensity(level: 0 | 1 | 2): number {
  return level === 0 ? 0 : level === 1 ? 0.55 : 1;
}
