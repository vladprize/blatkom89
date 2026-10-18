/** Tiny DOM helpers (no framework). All text goes through textContent — no innerHTML with data. */
import { inlineAsset } from '../app/inline.js';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((ev: Event) => void) | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(text: string): void {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2700);
}

export function asset(path: string): string {
  const inl = inlineAsset(path);
  if (typeof inl === 'string') return inl;
  const u = new URL(path, document.baseURI);
  u.searchParams.set('v', __ASSET_VERSION__);
  return u.href;
}

export function portrait(c: string, small = false): HTMLImageElement {
  return h('img', { src: asset(`assets/portraits/${c}${small ? '_small' : ''}.png`), alt: '', draggable: 'false' });
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Russian plural: plural(5, ['очко', 'очка', 'очков']) → 'очков'. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
