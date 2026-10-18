/** Shared materials of the procedural art (separate module so characters and weapons can share it). */
import { hex } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material } from './lib/model.js';

const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));

export const MAT = {
  gunmetal: { ramp: H('#0e0f12', '#1b1d22', '#2b2e35', '#444852', '#666c78'), spec: { color: hex('#a9b2c4'), power: 22, threshold: 0.82 } } as Material,
  wood: { ramp: H('#3a1a0a', '#5e2c12', '#86441e', '#a85c2c', '#c87a40') } as Material,
  steel: { ramp: H('#24272d', '#3f444d', '#626874', '#8b929e', '#b4bac4'), spec: { color: hex('#e6ecf4'), power: 18, threshold: 0.8 } } as Material,
  redPaint: { ramp: H('#4a0a0c', '#86120f', '#c0201a', '#e8452e') } as Material,
  gold: { ramp: H('#5e400c', '#9a6c18', '#d4a232', '#f6d470'), spec: { color: hex('#fff7d0'), power: 12, threshold: 0.7 } } as Material,
  cigarette: { ramp: H('#9a958a', '#c9c4b8', '#efebe2') } as Material,
  ember: { ramp: H('#ff8a24'), flat: true } as Material,
  black: { ramp: H('#060608', '#101014', '#1c1c22') } as Material,
  eyeDark: { ramp: H('#0a0806'), flat: true } as Material,
  eyeYellow: { ramp: H('#ffd23c'), flat: true } as Material,
  eyeAmber: { ramp: H('#f0b030'), flat: true } as Material,
  glint: { ramp: H('#fff8e8'), flat: true } as Material,
};

