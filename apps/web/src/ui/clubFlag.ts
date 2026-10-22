/**
 * Club flags (v0.3): a 3 : 2 field drawn from a pattern and three colours of the palette, with an
 * emblem in the middle (an outline keeps it readable on any colour). Pure SVG, no images: every flag a
 * player puts together is drawn the same way everywhere (the table, the club's page, the editor).
 */
import { CLUB_PALETTE } from '@blatkom/shared';
import type { ClubEmblem, ClubFlag, EmblemIcon, FlagPattern } from '@blatkom/shared';

const NS = 'http://www.w3.org/2000/svg';
const W = 60;
const H = 40;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const color = (i: number) => CLUB_PALETTE[i] ?? CLUB_PALETTE[0];

/** The field's shapes for a pattern: [path, colour slot]. */
export function patternShapes(p: FlagPattern): Array<[string, 0 | 1 | 2]> {
  const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;
  switch (p) {
    case 'solid':
      return [[rect(0, 0, W, H), 0]];
    case 'h2':
      return [[rect(0, 0, W, H / 2), 0], [rect(0, H / 2, W, H / 2), 1]];
    case 'h3':
      return [[rect(0, 0, W, H / 3), 0], [rect(0, H / 3, W, H / 3), 1], [rect(0, (2 * H) / 3, W, H / 3), 2]];
    case 'v2':
      return [[rect(0, 0, W / 2, H), 0], [rect(W / 2, 0, W / 2, H), 1]];
    case 'v3':
      return [[rect(0, 0, W / 3, H), 0], [rect(W / 3, 0, W / 3, H), 1], [rect((2 * W) / 3, 0, W / 3, H), 2]];
    case 'diag':
      return [[`M0 0H${W}L0 ${H}z`, 0], [`M${W} 0V${H}H0z`, 1]];
    case 'band':
      return [[rect(0, 0, W, H), 0], [rect(0, H * 0.32, W, H * 0.36), 1], [rect(0, H * 0.3, W, H * 0.02), 2], [rect(0, H * 0.68, W, H * 0.02), 2]];
    case 'frame':
      return [[rect(0, 0, W, H), 0], [rect(5, 5, W - 10, H - 10), 1]];
    case 'corner':
      return [[rect(0, 0, W, H), 0], [rect(0, 0, W / 2, H / 2), 1]];
    case 'wedge':
      return [[rect(0, 0, W, H), 0], [`M0 0L${W * 0.5} ${H / 2}L0 ${H}z`, 1]];
  }
}

interface Icon {
  /** Filled shapes (even-odd: holes are cut out). */
  fill?: string;
  /** Lines drawn with a pen. */
  line?: string;
}

/** The emblems on a 24 × 24 grid. */
export const ICONS: Record<Exclude<EmblemIcon, 'none'>, Icon> = {
  star: { fill: 'M12 1.8l3 6.7 7.2.7-5.4 4.9 1.6 7.1L12 17.5l-6.4 3.7 1.6-7.1-5.4-4.9 7.2-.7z' },
  gear: { fill: gearPath() },
  wrench: { fill: 'M21.5 6.8a5.4 5.4 0 0 1-7 5.2l-7.8 7.8a2.1 2.1 0 0 1-3-3L11.5 9a5.4 5.4 0 0 1 6.7-6.9l-3.3 3.3.6 2.8 2.8.6z' },
  cassette: { fill: 'M3 5.5h18a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 17V7A1.5 1.5 0 0 1 3 5.5zM8 9.2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6zm8 0a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6zM7 16.5l1-2h8l1 2z' },
  bolt: { fill: 'M13.5 1.5L4 13.5h6.2L9 22.5l10-12.6h-6.4z' },
  rocket: { fill: 'M12 1.5c3.4 2.4 5.2 6.3 5.2 10.4l2.3 3.4-2.1 3.2-2.6-2.2H9.2l-2.6 2.2-2.1-3.2 2.3-3.4c0-4.1 1.8-8 5.2-10.4zm0 6a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2zM10 18h4l-.8 4.3h-2.4z' },
  satellite: { fill: 'M12 6.8a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2z', line: 'M9 14.8L3 21.5M10.4 16.2L7.6 23M15 14.8l6 6.7M13.6 16.2l2.8 6.8' },
  anchor: { fill: 'M12 1.5a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6z', line: 'M12 6v15.5M7.5 9.5h9M3.8 13.5a8.2 8.2 0 0 0 16.4 0' },
  key: { fill: 'M7 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 3.4a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2zM12 10.8h10.5v2.4h-2v3.3h-2.4v-3.3h-1.6v2.3h-2.4v-2.3H12z' },
  ball: { fill: 'M12 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 0 1 0-21zm0 5.3l-4.2 3 1.6 4.9h5.2l1.6-4.9z' },
  flame: { fill: 'M12.3 1.5c.8 4.4 6.2 6.6 6.2 12.6a6.5 6.5 0 0 1-13 0c0-3.4 2-5.7 3.3-7.6.1 2.3 1 3.6 2.4 3.9-.4-3.4.1-6.3 1.1-8.9z' },
  paw: { fill: 'M5.5 8.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zm13 0a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM9.4 3.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zm5.2 0a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM12 10.3c3.2 0 6.3 4.3 6.3 7.3a3 3 0 0 1-3 3c-1.2 0-2.1-.8-3.3-.8s-2.1.8-3.3.8a3 3 0 0 1-3-3c0-3 3.1-7.3 6.3-7.3z' },
  crosshair: { line: 'M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6' },
  tower: { line: 'M12 4.5L7.2 22M12 4.5L16.8 22M8.6 16.5h6.8M10.1 10.8h3.8M5.2 2.5a8 8 0 0 0 0 7.5M18.8 2.5a8 8 0 0 1 0 7.5' },
  eye: { fill: 'M12 4.8c5.2 0 9.2 3.8 10.5 7.2-1.3 3.4-5.3 7.2-10.5 7.2S2.8 15.4 1.5 12C2.8 8.6 6.8 4.8 12 4.8zm0 3a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4zm0 2.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z' },
  sun: { fill: 'M12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6z', line: 'M12 .8v3.6M12 19.6v3.6M.8 12h3.6M19.6 12h3.6M4.1 4.1l2.5 2.5M17.4 17.4l2.5 2.5M4.1 19.9l2.5-2.5M17.4 6.6l2.5-2.5' },
};

/** A cog with eight teeth and a hole. */
function gearPath(): string {
  const teeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 === 0 || i % 4 === 1 ? 10.5 : 7.6;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z`;
}

/** A dark outline or a light one: whichever stands out from the emblem's colour. */
function outlineFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.45 ? 'rgba(10,8,7,.75)' : 'rgba(239,232,218,.6)';
}

/**
 * The flag as an SVG element. `size` is its width in CSS pixels (the height is two thirds of it);
 * `label` becomes its accessible name.
 */
export function clubFlag(flag: ClubFlag, emblem: ClubEmblem, o: { size?: number; label?: string; className?: string } = {}): SVGSVGElement {
  const size = o.size ?? 60;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: size, height: Math.round((size * H) / W), class: `clubflag ${o.className ?? ''}`.trim(), role: 'img', 'aria-label': o.label ?? '' });
  if (!o.label) svg.setAttribute('aria-hidden', 'true');
  for (const [d, slot] of patternShapes(flag.pattern)) svg.append(el('path', { d, fill: color(flag.colors[slot]) }));
  if (emblem.icon !== 'none') {
    const icon = ICONS[emblem.icon];
    const c = color(emblem.color);
    const out = outlineFor(c);
    // the emblem: 24 units scaled to 28 of the field's 40, centred
    const g = el('g', { transform: `translate(${W / 2 - 14} ${H / 2 - 14}) scale(${28 / 24})` });
    if (icon.fill) {
      g.append(el('path', { d: icon.fill, fill: 'none', stroke: out, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
      g.append(el('path', { d: icon.fill, fill: c, 'fill-rule': 'evenodd' }));
    }
    if (icon.line) {
      g.append(el('path', { d: icon.line, fill: 'none', stroke: out, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      g.append(el('path', { d: icon.line, fill: 'none', stroke: c, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    }
    svg.append(g);
  }
  // a thin edge so a dark flag doesn't melt into the panel
  svg.append(el('rect', { x: 0.5, y: 0.5, width: W - 1, height: H - 1, fill: 'none', stroke: 'rgba(239,232,218,.25)', 'stroke-width': 1 }));
  return svg;
}
