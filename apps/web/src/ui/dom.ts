/** Tiny DOM helpers (no framework). All text goes through textContent — no innerHTML with data. */
import { inlineAsset } from '../app/inline.js';
import { t } from '../i18n/index.js';

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

/** Replaces an element's children, skipping null/false like h() does. */
export function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren(...children.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false).map((c) => (c instanceof Node ? c : String(c))));
}

export function toast(text: string): void {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  // v0.2.20: over a match turned sideways (app/landscape.ts) the note turns with it
  const turned = document.documentElement.classList.contains('rot') ? document.getElementById('ui') : null;
  const host = turned ?? document.body;
  // v0.2.21 (the usability audit: the note covered «Continue as guest» at the bottom of the welcome window): over
  // a dialog or a sheet the note goes to the top of the screen, clear of the buttons at their bottom
  const top = !!document.querySelector('.overlay, .sheetlay');
  if (top) t.classList.add('toast--top');
  // v0.2.20: a second note at the same moment stands above the first instead of over it (below it at the top)
  const live = host.querySelectorAll(`:scope > .toast${top ? '.toast--top' : ':not(.toast--top)'}`).length;
  if (live) {
    if (top) t.style.top = `calc(${16 + live * 54}px + var(--safe-top, 0px))`;
    else t.style.bottom = `calc(${24 + live * 54}px + var(--safe-bottom, 0px))`;
  }
  host.append(t);
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


/** v0.2.17: the founder's gold badge by the alias («СОЗДАТЕЛЬ» / «FOUNDER»). */
export function founderTag(): HTMLElement {
  return h('span', { class: 'founder-tag', 'data-testid': 'founder-tag', title: t('Founder of BLATKOM ’89') }, t('Founder'));
}
