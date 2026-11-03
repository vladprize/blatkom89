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

/**
 * The colour of one pixel: u, v in the weapon's units (u 0…64 along it), l the original lightness, hv the
 * height in units; ly where the pixel is in its own column of the weapon (0 top … 1 bottom) and th that
 * column's thickness in units — for designs that follow the body (a mouth on the handguard, flames along
 * the bottom edge); ph the phase (0…1) of a live finish's loop (v0.2.19; the others ignore it).
 */
type Painter = (u: number, v: number, l: number, hv: number, ly: number, th: number, ph: number) => [number, number, number];

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

/** A 3×5 bitmap font for the digits a finish writes on the weapon. */
const DIGITS: Record<string, readonly number[]> = { '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7] };
function glyph(ch: string, u: number, v: number, u0: number, v0: number, cell: number): boolean {
  const cx = Math.floor((u - u0) / cell);
  const cy = Math.floor((v - v0) / cell);
  if (cx < 0 || cx > 2 || cy < 0 || cy > 4) return false;
  return ((DIGITS[ch]![cy]! >> (2 - cx)) & 1) === 1;
}

/** A five-pointed star (one point up) of outer radius R round (cx, cy). */
function star(u: number, v: number, cx: number, cy: number, R: number): boolean {
  const dx = u - cx;
  const dy = v - cy;
  const r = Math.hypot(dx, dy);
  if (r > R) return false;
  const sector = (Math.PI * 2) / 5;
  const a = Math.abs(((((Math.atan2(dy, dx) + Math.PI / 2) % sector) + sector) % sector) - sector / 2);
  const inner = R * 0.4;
  return r <= inner + (R - inner) * (1 - a / (sector / 2));
}

/** The radiation sign: a dot and three blades, radius R round (cx, cy). */
function trefoil(u: number, v: number, cx: number, cy: number, R: number): boolean {
  const dx = u - cx;
  const dy = v - cy;
  const r = Math.hypot(dx, dy);
  if (r < R * 0.2) return true;
  if (r < R * 0.32 || r > R) return false;
  const third = (Math.PI * 2) / 3;
  const a = ((((Math.atan2(dy, dx) + Math.PI / 2 + Math.PI / 6) % third) + third) % third);
  return a < Math.PI / 3;
}

/**
 * The nearest and the second-nearest point of a jittered grid (cells of `s` units): d2 − d1 is small on
 * the borders between cells (cracks, a gem's facet edges); id (0…1) tells the cells apart; fx, fy is the
 * nearest point.
 */
function cells(u: number, v: number, s: number, seed: number): { d1: number; d2: number; id: number; fx: number; fy: number } {
  const gx = Math.floor(u / s);
  const gy = Math.floor(v / s);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  let fx = 0;
  let fy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i;
      const cy = gy + j;
      const px = (cx + 0.15 + 0.7 * hash(cx, cy, seed)) * s;
      const py = (cy + 0.15 + 0.7 * hash(cx, cy, seed + 1)) * s;
      const d = Math.hypot(u - px, v - py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(cx, cy, seed + 2);
        fx = px;
        fy = py;
      } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id, fx, fy };
}

/** A gem cut into facets: each a flat tone, lighter on its side towards the light, with a bright edge. */
function gem(u: number, v: number, l: number, stops: Stops, seed: number, s = 3.4) {
  const c = cells(u, v, s, seed);
  const e = c.d2 - c.d1;
  const tilt = (-(u - c.fx) * 0.5 - (v - c.fy) * 0.7) / s;
  let col = ramp(stops, 0.16 + c.id * 0.5 + tilt * 0.35 + l * 0.25);
  if (e < 0.24) col = mix(col, [255, 255, 255], 0.5 * (1 - e / 0.24));
  return { col, c };
}

/** A spade (♠) of size s round (cx, cy), point up. */
function spade(u: number, v: number, cx: number, cy: number, s: number): boolean {
  const x = (u - cx) / s;
  const y = (v - cy) / s;
  if (Math.hypot(x + 0.42, y - 0.2) < 0.46 || Math.hypot(x - 0.42, y - 0.2) < 0.46) return true;
  if (y < 0.22 && y > -0.95 && Math.abs(x) < (y + 0.95) * 0.74) return true;
  return y > 0.2 && y < 0.95 && Math.abs(x) < 0.12 + (y - 0.2) * 0.4;
}

/** The biohazard sign: three crescents round a ring, radius R round (cx, cy). */
function bioSign(u: number, v: number, cx: number, cy: number, R: number): boolean {
  const dx = u - cx;
  const dy = v - cy;
  const r = Math.hypot(dx, dy);
  if (r > R || r < R * 0.13) return false;
  if (Math.abs(r - R * 0.44) < R * 0.07) return true;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    if (Math.hypot(dx - ox * R * 0.5, dy - oy * R * 0.5) < R * 0.5 && Math.hypot(dx - ox * R * 0.64, dy - oy * R * 0.64) >= R * 0.36) return true;
  }
  return false;
}

/** A 4×5 Cyrillic font for the word on the tin («КИЛЬКА»). */
const CYR: Record<string, readonly number[]> = { К: [9, 10, 12, 10, 9], И: [9, 11, 13, 9, 9], Л: [7, 5, 5, 5, 13], Ь: [8, 8, 14, 9, 14], А: [6, 9, 15, 9, 9] };
function word(s: string, u: number, v: number, u0: number, v0: number, cell: number): boolean {
  const cx = Math.floor((u - u0) / cell);
  const cy = Math.floor((v - v0) / cell);
  if (cy < 0 || cy > 4 || cx < 0) return false;
  const i = Math.floor(cx / 5);
  const col = cx % 5;
  if (i >= s.length || col === 4) return false;
  return ((CYR[s[i]!]![cy]! >> (3 - col)) & 1) === 1;
}

/** A sprat on its side, nose forward, `s` long, round (cx, cy). */
function fish(u: number, v: number, cx: number, cy: number, s: number): boolean {
  const x = (u - cx) / s;
  const y = (v - cy) / s;
  if (x * x + (y / 0.42) ** 2 < 1) return true;
  return x < -0.85 && x > -1.5 && Math.abs(y) < (-0.85 - x) * 0.85;
}

const RED_GEM: Stops = [[0, hex('#3a0208')], [0.35, hex('#8a0a1c')], [0.62, hex('#d81c34')], [0.85, hex('#ff5a6a')], [1, hex('#ffc8d0')]];
const VIOLET_GEM: Stops = [[0, hex('#1e0a3a')], [0.35, hex('#4a1e8a')], [0.62, hex('#8a4ad8')], [0.85, hex('#c08af4')], [1, hex('#f0dcff')]];
/** A narrow bump (0…1) when the loop's phase `ph` passes `at`, `w` wide (it wraps round). */
const pulse = (ph: number, at: number, w: number) => Math.max(0, 1 - Math.abs(((((ph - at) % 1) + 1.5) % 1) - 0.5) / w);

const PAINTERS: Record<FinishId, Painter> = {
  // ── v0.2.18 part 2: the owner's line (references/64-skins-lineup.png) ──
  // «Хаки»: olive drab with darker and sandy patches
  haki: (u, v, l) => {
    const n = noise(u / 4.2, v / 4.2, 201);
    if (n > 0.62) return shade(hex('#4b4a26'), l, 0.65, 0.5);
    if (n < 0.3) return shade(hex('#9a8f5e'), l, 0.65, 0.5);
    return shade(mix(hex('#6b6a3a'), hex('#8c8a52'), l), l, 0.7, 0.45);
  },
  // «Изношенный»: dull gunmetal, scratched to bright steel, chipped to the brown primer
  iznos: (u, v, l) => {
    if (Math.abs(Math.sin(u * 0.9 + v * 2.3 + noise(u / 3, v / 3, 211) * 4)) > 0.992 || noise(u / 0.9, v / 0.9, 212) > 0.93) return shade(hex('#c8c2b8'), l, 0.75, 0.35);
    if (noise(u / 2.2, v / 2.2, 213) > 0.78) return shade(hex('#7a4a2a'), l, 0.6, 0.5);
    return ramp([[0, hex('#1e1c1a')], [0.5, hex('#4a4440')], [1, hex('#8a817a')]], l);
  },
  // «Акула» (the welcome gift): shark-grey with a red mouth full of teeth on the front of the body, an eye above it
  akulka: (u, _v, l, hv, ly, th) => {
    if (u > 38 && u < 60 && th > hv * 0.16) {
      const d = Math.abs(ly - 0.56) * 2;
      const tri = 1 - Math.abs(2 * (((u - 38) / 2.6) % 1) - 1);
      if (d < 0.16) return shade(hex('#5a0808'), l, 0.9, 0.4);
      if (d < 0.5 && tri > (0.5 - d) / 0.34) return shade(hex('#ffffff'), l, 0.85, 0.2);
      if (d < 0.62) return shade(hex('#c42b22'), l, 0.7, 0.5);
      if (u < 44 && ly < 0.3 && Math.abs(u - 41) < 1.3) return [16, 14, 14];
    }
    return ramp([[0, hex('#5a6470')], [0.5, hex('#b8c2cc')], [1, hex('#f4f6f8')]], l * 0.6 + 0.4);
  },
  // «Блатком ’89» (the welcome gift): deep blue, a white «89» on the stock, a red stripe below
  blatkom: (u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    const cell = Math.max(1.2, hv * 0.13);
    const v0 = hv * 0.45 - 2.5 * cell;
    if (glyph('8', u, v, 9, v0, cell) || glyph('9', u, v, 9 + 4 * cell, v0, cell)) return shade(hex('#f4f2ec'), l, 0.8, 0.3);
    if (Math.abs(y - 0.86) < 0.06) return shade(C.red, l, 0.75, 0.4);
    return shade(mix(hex('#1c3a8a'), hex('#3a64c8'), l), l, 0.6, 0.55);
  },
  // «Спартакиада ’80»: red and white diagonal stripes of the sports parade
  sparta: (u, v, l) => (((u + v * 0.9) / 3.4) % 2 < 1 ? shade(mix(C.red, C.redLight, l), l, 0.65, 0.5) : shade(hex('#f2ede2'), l, 0.75, 0.3)),
  // «Спортивный»: royal-blue tracksuit with two white stripes along the body
  sport: (_u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    if (Math.abs(y - 0.23) < 0.025 || Math.abs(y - 0.31) < 0.025) return shade(hex('#f4f4f2'), l, 0.8, 0.25);
    return shade(mix(hex('#1a3fa0'), hex('#3a66d8'), l), l, 0.6, 0.55);
  },
  // «Лихие 90-е»: black with flames licking up from below, growing towards the muzzle
  devyanostye: (u, _v, l, _hv, ly) => {
    const y = 1 - ly;
    const reach = Math.min(0.9, Math.max(0, (u - 12) / 40)) * (0.72 + 0.28 * Math.sin(u * 0.9 + noise(u / 3, 0, 301) * 3));
    if (y < reach) return shade(ramp([[0, hex('#ffe27a')], [0.45, hex('#ff8a1e')], [0.8, hex('#d02a10')], [1, hex('#6a0a04')]], y / Math.max(0.01, reach)), l, 0.75, 0.4);
    return shade(hex('#141216'), l, 0.9, 0.9);
  },
  // «Малиновый пиджак»: raspberry velvet with a gold chain draped along it
  malina: (u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    const cy = 0.3 + 0.38 * Math.sin((u / 64) * Math.PI);
    if (Math.abs(y - cy) < 0.07 && Math.floor(u / 1.6) % 2 === 0) return shade(C.gold, l, 0.75, 0.5);
    return shade(mix(hex('#7a0a2a'), hex('#c41e5a'), l + noise(u / 0.8, v / 0.8, 311) * 0.12), l, 0.62, 0.5);
  },
  // «Видеосалон»: black tape plastic, the colour bars of a test card and a white label
  video: (u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    if (u > 18 && u < 46 && y > 0.22 && y < 0.72) return shade(hex(['#e8e8e8', '#e8e020', '#20d8e0', '#20c820', '#e020c8', '#e02020', '#2020e0'][Math.min(6, Math.floor((u - 18) / 4))]!), l, 0.7, 0.4);
    if (y > 0.78 && u > 18 && u < 46) return shade(hex('#f0ece0'), l, 0.75, 0.3);
    return shade(hex('#16161a'), l, 0.9, 0.9);
  },
  // «Черкизон»: the market's checked bag — blue and red bands on white
  cherkizon: (u, v, l) => {
    const su = u % 8;
    const sv = v % 8;
    const bu = su < 2;
    const bv = sv < 2;
    const c = bu && bv ? hex('#14205a') : bu || bv ? hex('#2a3c8a') : (su > 4.4 && su < 5.4) || (sv > 4.4 && sv < 5.4) ? hex('#c42b22') : hex('#ece8e0');
    return shade(c, l, 0.7, 0.4);
  },
  // «Радиоактивный»: acid yellow-green with black radiation signs
  radiaciya: (u, v, l, hv) => {
    const R = Math.max(2.5, hv * 0.42);
    for (const cx of [17, 43]) if (trefoil(u, v, cx, hv * 0.5, R)) return shade(hex('#141414'), l, 1, 0.6);
    return shade(mix(hex('#a8d010'), hex('#e8f040'), noise(u / 3, v / 3, 401)), l, 0.6, 0.55);
  },
  // «Афган»: sand and dust camo with a red star on the stock
  afgan: (u, v, l, hv) => {
    if (star(u, v, 12, hv * 0.5, Math.max(2, hv * 0.34))) return shade(C.red, l, 0.8, 0.4);
    const n = noise(u / 3.8, v / 3.8, 411);
    return shade(n > 0.6 ? hex('#8a6a3e') : n < 0.32 ? hex('#d8c08a') : hex('#b89a64'), l, 0.65, 0.45);
  },
  // «Тату»: cream with black ink swirls and touches of red and blue (ornament, not prison marks)
  tatu: (u, v, l) => {
    const s = Math.sin(u * 0.32 + Math.sin(v * 0.55 + u * 0.08) * 2.0);
    if (Math.abs(s) < 0.1) return shade(hex('#141210'), l, 1, 0.5);
    if (s > 0.86) return shade(hex('#b8281e'), l, 0.75, 0.4);
    if (s < -0.9) return shade(hex('#1e4a8a'), l, 0.75, 0.4);
    return shade(hex('#e8dcc8'), l, 0.72, 0.32);
  },
  // «Плёнка»: a film strip — sprocket holes along the edges, frames with a black-and-white town
  plenka: (u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    if (y < 0.2 || y > 0.8) {
      const hole = u % 4 > 1.2 && u % 4 < 2.8 && ((y > 0.06 && y < 0.14) || (y > 0.86 && y < 0.94));
      return hole ? shade(hex('#e8e4dc'), l, 0.8, 0.25) : shade(hex('#121214'), l, 0.9, 0.9);
    }
    if (u % 12 < 0.9) return shade(hex('#121214'), l, 0.9, 0.9);
    const roof = 0.8 - (0.18 + 0.32 * hash(Math.floor(u / 1.7), 0, 421)) * 0.6;
    return y > roof ? shade(hex('#1c1c1e'), l, 0.9, 0.6) : shade(mix(hex('#8a8a8c'), hex('#e6e6e8'), 1 - (y - 0.2) / 0.6), l, 0.75, 0.3);
  },
  // «Космос ’88»: night-blue with stars and a red band edged in white
  kosmos: (u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    const d = Math.abs(y - 0.62);
    if (d < 0.08) return shade(C.red, l, 0.7, 0.5);
    if (Math.abs(d - 0.1) < 0.02) return shade(hex('#f2f2f4'), l, 0.8, 0.25);
    if (hash(Math.floor(u * 0.9), Math.floor(v * 0.9), 501) > 0.9) return shade(hex('#fffbe8'), l, 0.85, 0.2);
    return shade(mix(hex('#0a1440'), hex('#22389a'), l), l, 0.6, 0.55);
  },
  // «Золотой закат»: sunset gold running to red, with an engraved scroll
  zakat: (u, v, l, hv) => {
    const base = ramp([[0, hex('#ffd860')], [0.5, hex('#f08a24')], [1, hex('#a8321a')]], (v / Math.max(1, hv)) * 0.8 + (1 - l) * 0.3);
    return Math.abs(Math.sin(u * 0.7 + Math.cos(v * 0.9) * 2)) < 0.12 ? shade(base, 0.35, 0.6, 0.4) : shade(base, l, 0.7, 0.45);
  },
  // «Электроника»: a pale handheld game's casing — a green screen with segments, red and yellow buttons
  elektronika: (u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    if (u > 22 && u < 40 && y > 0.25 && y < 0.7) return Math.floor(u) % 3 === 0 && Math.abs(y - 0.48) < 0.12 ? shade(hex('#1a1e14'), l, 0.9, 0.3) : shade(hex('#8a9a6a'), l, 0.75, 0.35);
    if (Math.hypot(u - 46, (y - 0.45) * hv) < 1.5) return shade(C.red, l, 0.8, 0.4);
    if (Math.hypot(u - 50, (y - 0.6) * hv) < 1.5) return shade(hex('#e0b020'), l, 0.8, 0.4);
    if (Math.abs(y - 0.86) < 0.05) return shade(C.red, l, 0.7, 0.4);
    return shade(hex('#d8d6d0'), l, 0.7, 0.35);
  },
  // «Ледяной камуфляж»: blocky ice camo — white, pale blue, steel blue
  led: (u, v, l) => {
    const n = noise(Math.floor(u / 1.6) * 0.5, Math.floor(v / 1.6) * 0.5, 511);
    return shade(n > 0.66 ? hex('#5a8ab8') : n > 0.45 ? hex('#a8cce8') : hex('#eef6fc'), l, 0.7, 0.4);
  },
  // «Царский»: rich gold with engraved filigree and dark-red enamel insets
  carsky: (u, v, l, hv) => {
    const c = ramp([[0, hex('#3a2406')], [0.45, hex('#b88218')], [0.75, hex('#f0c040')], [1, hex('#fff2b0')]], l);
    if (Math.abs(v / Math.max(1, hv) - 0.5) < 0.1 && Math.floor(u / 5) % 2 === 0) return shade(hex('#7a0a14'), l, 0.75, 0.5);
    return Math.abs(Math.sin(u * 1.1 + Math.sin(v * 1.3) * 2.5) * Math.cos(v * 0.8 - u * 0.3)) < 0.08 ? shade(c, 0.3, 0.6, 0.4) : c;
  },
  // «Контора»: dark crimson lacquer with gold lines and gold stars
  kontora: (u, v, l, hv) => {
    const y = v / Math.max(1, hv);
    if (Math.abs(y - 0.2) < 0.03 || Math.abs(y - 0.8) < 0.03) return shade(C.gold, l, 0.75, 0.5);
    if (star(u, v, 31, hv * 0.5, Math.max(2, hv * 0.26)) || star(u, v, 15, hv * 0.5, Math.max(1.6, hv * 0.2))) return shade(C.gold, l, 0.8, 0.5);
    return shade(mix(hex('#4a0606'), hex('#8e1414'), l), l, 0.65, 0.55);
  },
  // «Ядерная зима»: frost white with ice-blue cracks and a yellow radiation sign
  yadernaya: (u, v, l, hv) => {
    const R = Math.max(2, hv * 0.32);
    const cx = 40;
    const cy = hv * 0.46;
    if (Math.hypot(u - cx, v - cy) < R * 1.15) return trefoil(u, v, cx, cy, R) ? shade(hex('#141414'), l, 1, 0.5) : shade(hex('#f0d020'), l, 0.8, 0.4);
    if (Math.abs(noise(u / 2.5, v / 2.5, 521) - 0.5) < 0.03) return shade(hex('#4a7ab0'), l, 0.75, 0.4);
    return shade(mix(hex('#cfe2f2'), hex('#ffffff'), noise(u / 1.2, v / 1.2, 522)), l, 0.72, 0.35);
  },
  // ── v0.2.19: the owner's AK sheet (references/83-skins-ak-sheet.png); the live four take the loop's phase ──
  // «Золотой браток» (live): polished gold, engraved scrolls and white stones; a glint sweeps along it
  bratok: (u, v, l, _hv, ly, _th, ph) => {
    let c = ramp([[0, hex('#5a3404')], [0.3, hex('#a8700c')], [0.6, hex('#e8b42a')], [0.82, hex('#ffd860')], [1, hex('#fff4c4')]], 0.36 + l * 0.32 + (0.5 - ly) * 0.5);
    if (Math.abs(Math.sin(u * 0.7 + 2.2 * Math.sin(v * 0.6 + u * 0.1)) * Math.cos(v * 0.8 - u * 0.2)) < 0.075) c = shade(c, 0.25, 0.52, 0.4);
    const st = cells(u, v, 7, 721);
    if (st.id > 0.8 && st.d1 < 0.62) c = mix(hex('#ffffff'), hex('#a8dcff'), st.d1 / 0.62);
    const d = u + v * 0.6 - (-16 + ph * 152);
    return mix(c, [255, 253, 240], Math.min(0.92, Math.exp(-(d * d) / 14) * 0.55 + Math.exp(-((d + 5) ** 2) / 1.4) * 0.55));
  },
  // «Король ржавчины»: dark gunmetal eaten by crusts of orange rust, pitted
  korol: (u, v, l) => {
    const n = noise(u / 3.4, v / 3.4, 601) * 0.65 + noise(u / 1.2, v / 1.2, 602) * 0.35;
    if (n > 0.56) {
      const c = ramp([[0, hex('#3a1606')], [0.45, hex('#8a3410')], [0.75, hex('#c45a1c')], [1, hex('#f09040')]], l * 0.8 + (n - 0.56) * 1.3);
      return noise(u / 0.6, v / 0.6, 603) > 0.8 ? shade(c, 0.3) : c;
    }
    if (n > 0.5) return shade(hex('#5a2a14'), l, 0.6, 0.5);
    return ramp([[0, hex('#14161a')], [0.5, hex('#3c4048')], [1, hex('#8a909a')]], l);
  },
  // «Неоновый район»: night-violet with glowing tubes — pink along the top, cyan along the bottom, a cyan zigzag
  neon: (u, _v, l, _hv, ly, th) => {
    const top = Math.abs(ly * th - 1.1);
    const bottom = Math.abs((1 - ly) * th - 1.1);
    const zig = th > 3 ? Math.abs(ly - (0.3 + 0.4 * Math.abs(((u / 6) % 1) - 0.5) * 2)) : 9;
    if (top < 0.42) return [255, 128, 240];
    if (bottom < 0.42) return [128, 250, 255];
    if (zig < 0.05) return [160, 255, 255];
    const base = shade(hex('#1a0a2c'), l, 0.8, 0.7);
    return mix(mix(mix(base, hex('#c020c0'), Math.max(0, 1 - top / 1.7) * 0.62), hex('#18b0d8'), Math.max(0, 1 - bottom / 1.7) * 0.56), hex('#20c4e8'), Math.max(0, 1 - zig / 0.17) * 0.5);
  },
  // «Мастер шашлыка»: chunks of grilled meat and rings of onion on a skewer, the length of the weapon
  shashlyk: (u, v, l, _hv, ly, th) => {
    const dc = (ly - 0.5) * th;
    const p = u % 8;
    if (p < 5.8) {
      const grill = (u + v * 1.1) % 2.4 < 0.45;
      const end = Math.min(p, 5.8 - p) < 0.45;
      const c = ramp([[0, hex('#3a1006')], [0.4, hex('#8a2a10')], [0.7, hex('#b84a1e')], [1, hex('#e88a4a')]], l * 0.7 + noise(u / 1.2, v / 1.2, 681) * 0.35 - (end ? 0.25 : 0));
      return grill ? shade(c, 0.25) : c;
    }
    if (p < 6.4 || p > 7.6) return Math.abs(dc) < 0.55 ? shade(hex('#c0c4c8'), l, 0.75, 0.4) : shade(hex('#161210'), l, 0.9, 0.6);
    return shade(Math.abs(p - 7) < 0.24 ? hex('#e8b0cc') : hex('#f8f0e6'), l, 0.85, 0.2);
  },
  // «Граффити»: black with red tags outlined in white sprayed over it, a white crown on the body, the red running down
  graffiti: (u, v, l, _hv, ly, th) => {
    const dc = (ly - 0.5) * th;
    if (th > 4) {
      const s = Math.min(3.4, th * 0.3);
      const x = (u - 45) / s;
      const y = dc / s;
      if (Math.abs(x) <= 1 && y < 0.6 && y > 0.3 - 1.1 * Math.abs(((x + 1) % 1) - 0.5) * 2) return shade(hex('#f6f2ea'), l, 0.85, 0.2);
    }
    const s1 = Math.abs(Math.sin(u * 0.42 + Math.sin(v * 0.55 + u * 0.13) * 2.4));
    const k = Math.floor(u / 2.2);
    const drip = u / 2.2 - k < 0.45 && hash(k, 0, 611) > 0.55 && ly > 0.5 && ly < 0.55 + 0.45 * hash(k, 1, 611);
    if (s1 < 0.28 || drip) return shade(mix(hex('#c0141a'), hex('#ff3a2a'), noise(u / 1.5, v / 1.5, 612)), l, 0.75, 0.45);
    if (s1 < 0.4) return shade(hex('#f2eee6'), l, 0.8, 0.25);
    if (noise(u / 0.7, v / 0.7, 613) > 0.9) return shade(hex('#e8e4dc'), l, 0.7, 0.3);
    return shade(hex('#141214'), l, 0.9, 0.9);
  },
  // «Пекло»: charcoal split by a net of glowing lava cracks
  peklo: (u, v, l) => {
    const c = cells(u, v, 4.2, 621);
    const e = c.d2 - c.d1;
    if (e < 0.36) return ramp([[0, hex('#fff0a0')], [0.5, hex('#ffa020')], [1, hex('#e04010')]], e / 0.36);
    if (e < 0.85) return mix(shade(hex('#1a0c08'), l, 0.9, 0.7), hex('#b02008'), ((0.85 - e) / 0.49) * 0.7);
    return shade(mix(hex('#120a0a'), hex('#2c1610'), noise(u / 2, v / 2, 622)), l, 0.85, 0.8);
  },
  // «Килька в томате»: a tin — gold with ribs, a red band with «КИЛЬКА» on a blue label, a sprat on the stock
  kilka: (u, v, l, _hv, ly, th) => {
    const dt = ly * th;
    if (u > 20 && u < 47) {
      if (dt < 0.6 || (dt > 5.5 && dt < 6.1)) return shade(hex('#f2eee4'), l, 0.8, 0.25);
      if (dt <= 5.5) return word('КИЛЬКА', u, dt, 21.6, 1.0, 0.82) ? shade(hex('#fbf8ee'), l, 0.85, 0.2) : shade(hex('#c8201c'), l, 0.7, 0.45);
      return shade(hex('#1c4a9c'), l, 0.65, 0.5);
    }
    if (th > 4 && fish(u, (ly - 0.5) * th, 10, 0, Math.min(4, th * 0.34))) return Math.hypot(u - 12, (ly - 0.5) * th + 0.4) < 0.5 ? [20, 20, 30] : shade(hex('#2a5ab0'), l, 0.75, 0.4);
    return shade(Math.abs(((v / 1.3) % 1) - 0.5) < 0.12 ? hex('#a87818') : mix(hex('#c89a2c'), hex('#f0cc5a'), l), l, 0.7, 0.45);
  },
  // «Кровавый жнец» (live): blackened steel with crimson blades curving forward; a red shimmer runs along them
  krovavy: (u, v, l, _hv, ly, _th, ph) => {
    const top = 0.38 * (1 - ((u / 7.5) % 1)) ** 1.4 + 0.04;
    const bottom = 0.32 * (1 - ((u / 7.5 + 0.5) % 1)) ** 1.4 + 0.03;
    const wave = Math.max(0, Math.sin(2 * Math.PI * (u / 40 - ph))) ** 2;
    if (ly < top || 1 - ly < bottom) {
      const edge = Math.min(Math.abs(ly - top), Math.abs(1 - ly - bottom)) < 0.05;
      const c = ramp([[0, hex('#4a0208')], [0.5, hex('#b8121e')], [1, hex('#ff4a3a')]], l * 0.55 + 0.38 + (edge ? 0.25 : 0));
      return mix(c, hex('#ffc0b0'), wave * 0.72);
    }
    if (Math.abs(noise(u / 3.5, v / 3.5, 711) - 0.5) < 0.03) return mix(shade(hex('#8a0a14'), l, 0.8, 0.5), hex('#ff5a4a'), wave * 0.6);
    return shade(mix(hex('#100809'), hex('#2e1416'), l), l, 0.85, 0.8);
  },
  // «Коллекционер костей»: ivory bone, porous, cracked brown-red, jointed like a spine; a skull on the stock
  kosti: (u, v, l, _hv, ly, th) => {
    const dc = (ly - 0.5) * th;
    if (th > 4 && ((u - 10) / 3.2) ** 2 + (dc / Math.min(2.8, th * 0.4)) ** 2 < 1) {
      if (Math.hypot(u - 9, dc + 0.6) < 0.8 || Math.hypot(u - 11.3, dc + 0.6) < 0.8) return [34, 22, 16];
      if (Math.abs(u - 10.15) < 0.35 && Math.abs(dc - 0.8) < 0.45) return [44, 28, 20];
      return shade(hex('#f6ecd4'), l, 0.82, 0.25);
    }
    if (Math.abs(noise(u / 3, v / 3, 631) - 0.5) < 0.03) return shade(hex('#6a2a1a'), l, 0.75, 0.4);
    const joint = Math.abs(((u / 5.5) % 1) - 0.5) > 0.44;
    return ramp([[0, hex('#8a7a5a')], [0.5, hex('#d8caa4')], [1, hex('#fbf4e0')]], l * 0.7 + 0.3 - (joint ? 0.25 : 0) - noise(u / 0.8, v / 0.8, 632) * 0.15);
  },
  // «Хозяин казино»: red lacquer edged in gold, a black band of red diamonds, the ace of spades on the stock
  kazino: (u, _v, l, _hv, ly, th) => {
    const dc = (ly - 0.5) * th;
    if (th > 4 && u > 3 && u < 14 && Math.abs(dc) < Math.min(th * 0.38, 3.6)) return spade(u, dc, 8.5, 0, Math.min(th * 0.3, 2.7)) ? shade(hex('#141014'), l, 1, 0.4) : shade(hex('#f6f2ea'), l, 0.85, 0.2);
    if (ly < 0.12 || ly > 0.88) return shade(C.gold, l, 0.75, 0.5);
    if (Math.abs(dc) < 1.8) return Math.abs((u % 4.4) - 2.2) / 1.5 + Math.abs(dc) / 1.5 < 1 ? shade(hex('#ec2a34'), l, 0.8, 0.4) : shade(hex('#121014'), l, 0.9, 0.6);
    return shade(mix(hex('#8a0a16'), hex('#d0202e'), l), l, 0.62, 0.5);
  },
  // «Синий хром»: blue chrome — a bright sky above the horizon line, deep blue below; white streaks on the stock
  hrom: (u, v, l, _hv, ly) => {
    const t = ly + Math.sin(u * 0.15) * 0.06;
    let c = t < 0.42 ? ramp([[0, hex('#e8f6ff')], [1, hex('#5aa8f0')]], t / 0.42) : ramp([[0, hex('#0a2a7a')], [1, hex('#3a78d8')]], (t - 0.42) / 0.58);
    if (u < 18 && ((u + v * 1.2) / 2.6) % 2 < 0.55) c = mix(c, [255, 255, 255], 0.65);
    return shade(c, l, 0.7, 0.45);
  },
  // «Пенсионер Делюкс»: grandma's cream knit with red roses and green leaves
  pensioner: (u, v, l) => {
    const c = cells(u, v, 6.5, 661);
    const dx = u - c.fx;
    const dy = v - c.fy;
    const r = Math.hypot(dx, dy);
    if (c.id > 0.25 && r < 2.1) return shade(Math.sin(r * 3.2 - Math.atan2(dy, dx)) > 0.3 ? hex('#e03040') : hex('#9a1020'), l, 0.75, 0.45);
    if (c.id > 0.25 && r < 3.3 && Math.cos(Math.atan2(dy, dx) * 2 + c.id * 6) > 0.55) return shade(mix(hex('#2a6a2a'), hex('#5aa04a'), l), l, 0.75, 0.4);
    const kx = u * 1.6;
    const ky = v * 1.6;
    return shade(Math.abs(((kx + Math.abs((ky % 2) - 1)) % 2) - 1) < 0.25 ? hex('#d8ccb0') : hex('#f4ecd8'), l, 0.75, 0.3);
  },
  // «Красный алмаз» (live): cut into red facets; the facets catch the light in turn and a star glints on a few
  almaz: (u, v, l, _hv, _ly, _th, ph) => {
    const { col, c } = gem(u, v, l, RED_GEM, 691);
    const b = pulse(ph, c.id, 0.12);
    let out = mix(col, hex('#ffd6dc'), b * 0.6);
    if (c.id > 0.72) {
      const dx = Math.abs(u - c.fx);
      const dy = Math.abs(v - c.fy);
      const size = 2.2 * b;
      if ((dx < 0.3 && dy < size) || (dy < 0.3 && dx < size)) out = mix(out, [255, 255, 255], 0.88 * b);
    }
    return out;
  },
  // «Аметист»: violet crystal facets
  ametist: (u, v, l) => gem(u, v, l, VIOLET_GEM, 731).col,
  // «Токсичные отходы»: black with acid-green slime running down from the top, splashes of it
  othody: (u, v, l, _hv, ly) => {
    const k = Math.floor(u / 1.8);
    const inDrip = u / 1.8 - k < 0.62 && hash(k, 0, 641) > 0.45;
    const edge = Math.max(0.2 + 0.04 * Math.sin(u * 1.3), inDrip ? 0.22 + 0.62 * hash(k, 1, 641) : 0);
    if (ly < edge || noise(u / 1.6, v / 1.6, 642) > 0.8) return ly < edge - 0.1 && hash(Math.floor(u * 2), Math.floor(v * 2), 643) > 0.9 ? [235, 255, 170] : shade(mix(hex('#5cc010'), hex('#b8f030'), l), l, 0.75, 0.4);
    if (ly < edge + 0.06) return shade(hex('#2a5a08'), l, 0.8, 0.4);
    return shade(hex('#16181a'), l, 0.9, 0.9);
  },
  // «Биоугроза X»: crimson with green tendrils grown over it and a yellow biohazard sign on the body
  biohazard: (u, v, l, _hv, ly, th) => {
    const R = Math.min(4.2, th * 0.46);
    if (th > 3 && bioSign(u, (ly - 0.5) * th, 40, 0, R)) return shade(hex('#f0c418'), l, 0.85, 0.3);
    const s = Math.sin(u * 0.42 + Math.sin(v * 0.6 + u * 0.07) * 2.4 + noise(u / 4, v / 4, 651) * 2);
    if (Math.abs(s) < 0.13) return shade(mix(hex('#3a6a1a'), hex('#8ab830'), l), l, 0.75, 0.45);
    if (Math.abs(s) < 0.22) return shade(hex('#1a2a0a'), l, 0.8, 0.4);
    return shade(mix(hex('#5a0610'), hex('#a01828'), l + noise(u / 2, v / 2, 652) * 0.2), l, 0.62, 0.55);
  },
  // «Обсидиановый император» (live): glossy black glass with a gold line along the top; veins of lava in it pulse along
  obsidian: (u, v, l, _hv, ly, th, ph) => {
    if (th > 2 && ly * th < 0.7) return shade(C.gold, l, 0.85, 0.45);
    const vein = Math.min(Math.abs(noise(u / 5, v / 5, 701) - 0.5), Math.abs(noise(u / 2.2, v / 2.2, 702) - 0.5) + 0.015);
    const b = 0.5 + 0.5 * Math.sin(2 * Math.PI * ph - u * 0.16);
    if (vein < 0.04) return ramp([[0, hex('#5a1a02')], [0.45, hex('#d05a0a')], [1, hex('#ffe080')]], 0.12 + 0.88 * b * (1 - (vein / 0.04) * 0.4));
    const sheen = Math.max(0, Math.sin(u * 0.09 + v * 0.3 - 0.6)) ** 6;
    const base = mix(ramp([[0, hex('#040405')], [0.6, hex('#16141c')], [1, hex('#3a3646')]], l), hex('#8a8aa8'), sheen * 0.35);
    return vein < 0.085 ? mix(base, hex('#c04008'), (1 - (vein - 0.04) / 0.045) * 0.4 * b) : base;
  },
  // «Борщ»: beet-red soup with drops of fat and dill, a white swirl of smetana on the stock
  borsch: (u, v, l, _hv, ly, th) => {
    const dc = (ly - 0.5) * th;
    const r = Math.hypot(u - 9, dc);
    if (th > 4 && r < Math.min(3, th * 0.4)) return Math.sin(r * 3.4 + Math.atan2(dc, u - 9)) > -0.2 ? shade(hex('#fbf6ec'), l, 0.85, 0.2) : shade(hex('#e8d4cc'), l, 0.8, 0.25);
    if (hash(Math.floor(u * 1.3), Math.floor(v * 1.3), 671) > 0.93) return shade(hex('#4a8a2a'), l, 0.8, 0.4);
    const c = cells(u, v, 3.2, 672);
    if (c.d1 < 0.55 && c.id > 0.5) return shade(hex('#f07040'), l, 0.8, 0.35);
    return shade(mix(hex('#7a0a20'), hex('#c4203a'), noise(u / 2.5, v / 2.5, 673) * 0.6 + l * 0.4), l, 0.62, 0.5);
  },
  // «Золотой унитаз»: mirror gold with the horizon in it, a roll of paper wound round the front
  unitaz: (u, v, l, _hv, ly) => {
    if (u > 49 && u < 57) {
      if (Math.abs(u - 53) > 3.4) return shade(hex('#d8d4cc'), l, 0.8, 0.25);
      return Math.abs(((u - 49) % 2.6) - 1.3) < 0.14 && (v * 2) % 1 < 0.5 ? shade(hex('#c8c4bc'), l, 0.8, 0.25) : shade(hex('#fbfaf6'), l, 0.85, 0.2);
    }
    const t = ly + Math.sin(u * 0.2) * 0.05;
    const c = t < 0.45 ? ramp([[0, hex('#fffbe0')], [1, hex('#f0c43a')]], t / 0.45) : ramp([[0, hex('#6a4206')], [0.6, hex('#c08a14')], [1, hex('#e8b83a')]], (t - 0.45) / 0.55);
    return shade(c, l, 0.72, 0.42);
  },
  // ── the first line (v0.23), retired: drawn for those who own them ──
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
 * scale down its height. `phase` (0…1): where a live finish's loop is (one image per frame of it).
 */
export function paintFinish(px: Uint8ClampedArray, w: number, h: number, finish: FinishId, phase = 0): void {
  const paint = PAINTERS[finish];
  // a finish this build doesn't know (a newer server's): the plain weapon
  if (!paint) return;
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
  // each column's own top and bottom (where the weapon's body is in it)
  const top = new Int32Array(w).fill(-1);
  const bot = new Int32Array(w).fill(-1);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (px[(y * w + x) * 4 + 3]! === 0) continue;
      if (top[x]! < 0) top[x] = y;
      bot[x] = y;
    }
  }
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
      const span = Math.max(1, bot[x]! - top[x]! + 1);
      const ly = (y - top[x]! + 0.5) / span;
      const th = span * scale;
      let c: [number, number, number];
      if (l < 0.11) {
        // the outline stays an outline: the finish's own tone, darkened to the outline's depth
        const tone = paint(u, v, 0.1, hv, ly, th, phase);
        const tl = (0.299 * tone[0] + 0.587 * tone[1] + 0.114 * tone[2]) / 255;
        c = shade(tone, 0, Math.min(0.35, 0.1 / Math.max(0.01, tl)), 0);
      } else {
        c = paint(u, v, l, hv, ly, th, phase);
        if (l > 0.86) c = mix(c, [255, 255, 255], (l - 0.86) * 2.5);
      }
      px[i] = Math.max(0, Math.min(255, Math.round(c[0])));
      px[i + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
      px[i + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
    }
  }
}
