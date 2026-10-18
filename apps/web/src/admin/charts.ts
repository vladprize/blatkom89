/** Dependency-free SVG charts with labelled axes, gridlines, legends and native tooltips. */
import { h, s } from './dom.js';
import { NO_DATA } from './format.js';

export interface Series {
  name: string;
  color: string;
  values: Array<number | null>;
}

const W = 480;
const H = 230;
const M = { l: 44, r: 12, t: 12, b: 34 };

export const COLORS = { red: '#e0533f', blue: '#6f9fd8', amber: '#d9b44a', green: '#8fbf73', violet: '#b48ad6' };

export function emptyState(text = NO_DATA): HTMLElement {
  return h('div', { class: 'chart-empty' }, text);
}

/** Nice axis: step from {1, 2, 2.5, 5}×10^k and a max that is a whole number of steps. */
function niceScale(max: number, integer: boolean): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: integer ? 1 : 0.25 };
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  if (integer) step = Math.max(1, Math.round(step));
  return { max: Math.ceil(max / step - 1e-9) * step, step };
}

function legend(series: Series[]): HTMLElement | null {
  if (series.length < 2) return null;
  return h('div', { class: 'legend' }, ...series.map((x) => h('span', { class: 'legend-item' }, h('i', { style: `background:${x.color}` }), x.name)));
}

function axes(svg: SVGSVGElement, labels: string[], scale: { max: number; step: number }, yFmt: (v: number) => string, xAt: (i: number) => number) {
  const ticks = Math.round(scale.max / scale.step);
  for (let i = 0; i <= ticks; i++) {
    const v = scale.step * i;
    const y = M.t + (H - M.t - M.b) * (1 - v / scale.max);
    svg.append(s('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, class: i === 0 ? 'axis' : 'grid' }));
    svg.append(s('text', { x: M.l - 6, y: y + 4, 'text-anchor': 'end', class: 'tick' }, yFmt(v)));
  }
  const step = labels.length <= 8 ? 1 : Math.ceil(labels.length / 7);
  const last = labels.length - 1;
  labels.forEach((lb, i) => {
    const regular = i % step === 0 && (i === last || last - i >= Math.ceil(step / 2));
    if (!regular && i !== last) return;
    const x = xAt(i);
    const anchor = x > W - M.r - 18 ? 'end' : x < M.l + 18 ? 'start' : 'middle';
    svg.append(s('text', { x: anchor === 'end' ? W - 2 : x, y: H - M.b + 17, 'text-anchor': anchor, class: 'tick' }, lb));
  });
}

/** Multi-series line chart; null values create gaps (e.g. immature retention cohorts). */
export function lineChart(labels: string[], series: Series[], opts: { percent?: boolean; yFormat?: (v: number) => string; ariaLabel: string }): HTMLElement {
  const all = series.flatMap((x) => x.values).filter((v): v is number => v !== null);
  if (labels.length === 0 || all.length === 0) return emptyState();
  const integer = !opts.percent && all.every((v) => Number.isInteger(v));
  const scale = opts.percent ? { max: 1, step: 0.25 } : niceScale(Math.max(...all), integer);
  const yMax = scale.max;
  const fmt = opts.yFormat ?? (opts.percent ? (v: number) => `${Math.round(v * 100)}%` : (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel, class: 'chart' });
  const n = labels.length;
  const xAt = (i: number) => (n === 1 ? (M.l + W - M.r) / 2 : M.l + ((W - M.l - M.r) * i) / (n - 1));
  const yAt = (v: number) => M.t + (H - M.t - M.b) * (1 - v / yMax);
  axes(svg, labels, scale, fmt, xAt);
  for (const ser of series) {
    let d = '';
    ser.values.forEach((v, i) => {
      if (v === null) return;
      const prevNull = i === 0 || ser.values[i - 1] === null;
      d += `${prevNull ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)} `;
    });
    if (d) svg.append(s('path', { d, fill: 'none', stroke: ser.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
    ser.values.forEach((v, i) => {
      if (v === null) return;
      const c = s('circle', { cx: xAt(i), cy: yAt(v), r: n > 40 ? 1.8 : 3, fill: ser.color });
      c.append(s('title', {}, `${labels[i]} · ${ser.name}: ${fmt(v)}`));
      svg.append(c);
    });
  }
  return h('div', { class: 'chart-wrap' }, legend(series), svg);
}

/** Vertical bar chart (counts per day / histogram buckets). */
export function barChart(labels: string[], values: number[], opts: { color?: string; ariaLabel: string; yFormat?: (v: number) => string }): HTMLElement {
  if (labels.length === 0) return emptyState();
  const scale = niceScale(Math.max(0, ...values), values.every((v) => Number.isInteger(v)));
  const yMax = scale.max;
  const fmt = opts.yFormat ?? ((v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel, class: 'chart' });
  const n = labels.length;
  const slot = (W - M.l - M.r) / n;
  const bw = Math.max(2, Math.min(42, slot * 0.7));
  const xAt = (i: number) => M.l + slot * i + slot / 2;
  axes(svg, labels, scale, fmt, xAt);
  values.forEach((v, i) => {
    const hgt = ((H - M.t - M.b) * v) / yMax;
    const r = s('rect', { x: xAt(i) - bw / 2, y: H - M.b - hgt, width: bw, height: Math.max(0, hgt), fill: opts.color ?? COLORS.red, rx: 1.5 });
    r.append(s('title', {}, `${labels[i]}: ${fmt(v)}`));
    svg.append(r);
  });
  return h('div', { class: 'chart-wrap' }, svg);
}

/** Horizontal bars for categorical breakdowns (maps, characters, platforms). */
export function hBarChart(rows: Array<{ label: string; value: number }>, opts: { color?: string; ariaLabel: string }): HTMLElement {
  if (rows.length === 0) return emptyState();
  const total = rows.reduce((a, r) => a + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const rowH = 30;
  const height = rows.length * rowH + 8;
  const labelW = 150;
  const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': opts.ariaLabel, class: 'chart' });
  rows.forEach((r, i) => {
    const y = 4 + i * rowH;
    const w = ((W - labelW - 84) * r.value) / max;
    svg.append(s('text', { x: labelW - 10, y: y + 19, 'text-anchor': 'end', class: 'label' }, r.label));
    const rect = s('rect', { x: labelW, y: y + 5, width: Math.max(2, w), height: rowH - 12, fill: opts.color ?? COLORS.blue, rx: 2 });
    rect.append(s('title', {}, `${r.label}: ${r.value}`));
    svg.append(rect);
    svg.append(s('text', { x: labelW + Math.max(2, w) + 8, y: y + 19, class: 'value' }, `${r.value} · ${total ? Math.round((r.value / total) * 100) : 0}%`));
  });
  return h('div', { class: 'chart-wrap' }, svg);
}
