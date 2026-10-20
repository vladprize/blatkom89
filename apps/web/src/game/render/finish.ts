/**
 * Weapon finishes (skins) painted over the weapon's own pixel art: the same function paints the
 * in-hand sprite in a match, the HUD icon and the Arsenal's big icons, so a «Хохлома» AK looks the
 * same everywhere. Patterns are laid out in the weapon's own proportions (64 units along its length),
 * so the small in-hand sprite and the large icon carry the same design. The dark outline and the
 * shading of the original survive; transparency is never touched. Pure: RGBA in, RGBA out.
 */
import type { FinishId } from '@blatkom/shared';

type RGB = readonly [number, number, number];
type Stops = ReadonlyArray<readonly [number, RGB]>;

const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

function ramp(stops: Stops, t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i]!;
    if (x <= t1) {
      const [t0, c0] = stops[i - 1]!;
      const k = t1 === t0 ? 0 : (x - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  const last = stops[stops.length - 1]![1];
  return [last[0], last[1], last[2]];
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const shade = (c: RGB | [number, number, number], l: number, lo = 0.55, span = 0.75): [number, number, number] => {
  const k = lo + span * l;
  return [c[0] * k, c[1] * k, c[2] * k];
};
const mix = (a: RGB | [number, number, number], b: RGB | [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The colour of one pixel: u, v in the weapon's units (u 0…64 along it), l the original lightness, hv the height in units. */
type Painter = (u: number, v: number, l: number, hv: number) => [number, number, number];

const C = {
  olive: hex('#8f9d5c'),
  oliveLight: hex('#bcc58f'),
  oliveDark: hex('#4a5323'),
  birchBrown: hex('#6b5232'),
  white: hex('#f4f6f8'),
  winterGrey: hex('#8d959f'),
  floraGreen: hex('#66773a'),
  floraTan: hex('#9a7445'),
  floraDark: hex('#36432a'),
  porcelain: hex('#eef3fb'),
  cobalt: hex('#1f45a6'),
  cobaltLight: hex('#4b74d6'),
  red: hex('#c42b22'),
  redLight: hex('#e5503f'),
  gold: hex('#e0a92e'),
  black: hex('#17110e'),
};

const PAINTERS: Record<FinishId, Painter> = {
  // «Берёзка»: the light Soviet summer camo — pale olive with dark leaf blotches
  berezka: (u, v, l) => {
    const n = noise(u / 3.2, v / 3.2, 11) * 0.7 + noise(u / 1.3, v / 1.3, 12) * 0.3;
    const base = shade(mix(C.olive, C.oliveLight, l), l, 0.7, 0.45);
    if (n > 0.66) return shade(C.oliveDark, l);
    if (n < 0.24) return shade(C.birchBrown, l, 0.6, 0.6);
    return base;
  },
  // «Ржавчина»: everything gone to rust, pitted
  rzhavchina: (u, v, l) => {
    const pit = noise(u / 1.1, v / 1.1, 21);
    const c = ramp([[0, hex('#2e170c')], [0.45, hex('#8d3f1c')], [0.75, hex('#b7612c')], [1, hex('#e3a160')]], l * 0.95 + (noise(u / 4, v / 4, 22) - 0.5) * 0.25);
    return pit > 0.8 ? shade(c, 0.35) : c;
  },
  // «Зимний»: white winter camo with grey patches
  zima: (u, v, l) => {
    const n = noise(u / 3.6, v / 3.6, 31);
    const base = ramp([[0, hex('#5f6670')], [0.5, hex('#c6ccd4')], [1, C.white]], l * 0.6 + 0.4);
    return n > 0.63 ? shade(C.winterGrey, l, 0.7, 0.4) : base;
  },
  // «Флора»: the Soviet 1980s camo — slanted green, tan and dark stripes
  flora: (u, v, l) => {
    const w = (u * 0.55 + v * 1.25 + noise(u / 5, v / 5, 41) * 7) / 4.2;
    const band = ((Math.floor(w) % 3) + 3) % 3;
    return shade(band === 0 ? C.floraGreen : band === 1 ? C.floraTan : C.floraDark, l);
  },
  // «Гжель»: white porcelain with cobalt flourishes
  gzhel: (u, v, l) => {
    const s = Math.sin(u * 0.42 + Math.sin(v * 0.55) * 2.2) * Math.cos(v * 0.5 - u * 0.12);
    const base = ramp([[0, hex('#9aa8c4')], [0.5, C.porcelain], [1, hex('#ffffff')]], l * 0.55 + 0.45);
    if (s > 0.52) return shade(C.cobalt, l, 0.75, 0.45);
    if (Math.abs(s) < 0.07) return shade(C.cobaltLight, l, 0.8, 0.35);
    return base;
  },
  // «Пионер»: pioneer red with a white band and gold edging
  pioner: (_u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    const band = Math.abs(y - 0.5) < 0.075;
    const edge = Math.abs(Math.abs(y - 0.5) - 0.085) < 0.022;
    if (edge) return shade(C.gold, l, 0.75, 0.45);
    if (band) return shade(hex('#f2ede2'), l, 0.75, 0.3);
    return shade(mix(C.red, C.redLight, l), l, 0.65, 0.5);
  },
  // «Малахит»: Ural malachite — green bands curling round
  malahit: (u, v, l) => {
    const d = Math.hypot(u - 22, (v - 9) * 1.6) * 0.33 + noise(u / 6, v / 6, 71) * 2.2;
    const t = d - Math.floor(d);
    const c = ramp([[0, hex('#0a3d22')], [0.35, hex('#1a7a43')], [0.62, hex('#38a866')], [0.8, hex('#8be0ae')], [1, hex('#0f5530')]], t);
    return shade(c, l, 0.6, 0.6);
  },
  // «Хохлома»: black lacquer, gold leaves and red berries
  hohloma: (u, v, l) => {
    const s = Math.sin(u * 0.5 + Math.cos(v * 0.62) * 2.4);
    const berry = noise(u / 2.2, v / 2.2, 81) > 0.74;
    if (berry && s < 0.35) return shade(C.redLight, l, 0.8, 0.5);
    if (s > 0.62) return shade(C.gold, l, 0.7, 0.55);
    return shade(C.black, l, 0.9, 0.9);
  },
  // «Золото партии»: polished gold with an engraved line pattern
  zoloto: (u, v, l) => {
    const c = ramp([[0, hex('#4a3008')], [0.4, hex('#a8771a')], [0.7, hex('#ddb03e')], [1, hex('#fff3b8')]], l);
    const engraved = l > 0.25 && l < 0.8 && ((Math.floor((u + v * 0.8) / 2.2) & 3) === 0);
    return engraved ? shade(c, 0.45, 0.62, 0.4) : c;
  },
  // «Янтарь»: honey-yellow amber, lit from inside, with dark veins
  yantar: (u, v, l) => {
    const vein = Math.abs(noise(u / 4.5, v / 4.5, 101) - 0.5) < 0.035;
    const glow = noise(u / 3, v / 3, 103);
    const c = ramp([[0, hex('#6a3304')], [0.4, hex('#d9790f')], [0.7, hex('#ffb32a')], [1, hex('#fff0b0')]], l * 0.75 + glow * 0.35);
    return vein ? shade(hex('#5a2405'), l, 0.7, 0.4) : c;
  },
};

/**
 * Paints `finish` over an RGBA image in place. The weapon's units: u runs 0…64 along the weapon's own
 * opaque width (so a padded icon and a trimmed in-hand sprite carry the same design), v uses the same
 * scale down its height.
 */
export function paintFinish(px: Uint8ClampedArray, w: number, h: number, finish: FinishId): void {
  const paint = PAINTERS[finish];
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]! === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return;
  const scale = 64 / Math.max(1, maxX - minX + 1);
  const hv = (maxY - minY + 1) * scale;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * w + x) * 4;
      const a = px[i + 3]!;
      if (a === 0) continue;
      const r = px[i]!;
      const g = px[i + 1]!;
      const b = px[i + 2]!;
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const u = (x - minX + 0.5) * scale;
      const v = (y - minY + 0.5) * scale;
      let c: [number, number, number];
      if (l < 0.11) {
        // the outline stays an outline: the finish's own tone, darkened to the outline's depth
        const tone = paint(u, v, 0.1, hv);
        const tl = (0.299 * tone[0] + 0.587 * tone[1] + 0.114 * tone[2]) / 255;
        c = shade(tone, 0, Math.min(0.35, 0.1 / Math.max(0.01, tl)), 0);
      } else {
        c = paint(u, v, l, hv);
        if (l > 0.86) c = mix(c, [255, 255, 255], (l - 0.86) * 2.5);
      }
      px[i] = Math.max(0, Math.min(255, Math.round(c[0])));
      px[i + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
      px[i + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
    }
  }
}
