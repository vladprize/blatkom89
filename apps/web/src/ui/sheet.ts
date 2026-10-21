/**
 * A bottom sheet for phones (a centred dialog on wide screens): the place for details that would
 * otherwise make a screen scroll — the map grid, a personal file, a weapon's modifications. It is
 * sized to the viewport (never taller than the screen); a body that is still longer scrolls inside
 * the sheet, never the page. Closes with the ✕, a tap on the backdrop, Escape or the browser's back.
 */
import { h } from './dom.js';
import { t } from '../i18n/index.js';

export interface SheetOptions {
  title: string;
  /** The sheet's content (built by the caller; may be replaced later through `setBody`). */
  body: HTMLElement;
  /** Buttons pinned at the bottom of the sheet (they never scroll away). */
  actions?: HTMLElement | null;
  testid?: string;
  onClose?: () => void;
  /** Extra class on the sheet panel (e.g. `sheet--tall`). */
  cls?: string;
}

export interface Sheet {
  el: HTMLElement;
  close: () => void;
  setBody: (body: HTMLElement) => void;
  setActions: (actions: HTMLElement | null) => void;
}

/** Opens a sheet over `root` (the UI root). Only one sheet is open at a time. */
export function openSheet(root: HTMLElement, o: SheetOptions): Sheet {
  root.querySelector(':scope > .sheetlay')?.dispatchEvent(new Event('sheet-close'));
  let closed = false;
  const bodyBox = h('div', { class: 'sheet__body' }, o.body);
  const actBox = h('div', { class: 'sheet__actions' }, o.actions ?? null);
  if (!o.actions) actBox.hidden = true;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    lay.remove();
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  const panel = h(
    'div',
    { class: `panel sheet ${o.cls ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, ...(o.testid ? { 'data-testid': o.testid } : {}) },
    h('div', { class: 'sheet__head' }, h('span', { class: 'tag sheet__tag' }, o.title), h('button', { class: 'sheet__x', 'aria-label': t('Close'), 'data-testid': 'sheet-close', onclick: close }, '✕')),
    bodyBox,
    actBox,
  );
  const lay: HTMLElement = h('div', { class: 'sheetlay' }, panel);
  lay.addEventListener('click', (e) => e.target === lay && close());
  lay.addEventListener('sheet-close', close);
  document.addEventListener('keydown', onKey, true);
  root.append(lay);
  return {
    el: panel,
    close,
    setBody: (b) => bodyBox.replaceChildren(b),
    setActions: (a) => {
      actBox.replaceChildren(a ?? '');
      actBox.hidden = !a;
    },
  };
}
