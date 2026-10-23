/**
 * The comic before and after a story mission (and the prologue): one panel at a time — a character's
 * art with a speech bubble, alternating sides when the speaker changes, or the narrator's caption box;
 * 2089 in neon, 1989 on tape. A tap, a click, Space, Enter or → turns the page; «Skip» ends it.
 */
import type { MapId } from '@blatkom/shared';
import { t } from '../i18n/index.js';
import { asset, h } from '../ui/dom.js';
import { line } from './script.js';
import type { Beat } from './script.js';
import { speakerArt, speakerName } from './overlay.js';

export interface ComicOptions {
  /** A line over the pages («Mission 1 · Reveille»). */
  title?: string;
  /** The mission's map, faint behind the pages (where it all happens). */
  map?: MapId;
  onDone: () => void;
}

/** Shows the pages over `root`; returns a function that closes them (without calling `onDone`). */
export function playComic(root: HTMLElement, beats: readonly Beat[], o: ComicOptions): () => void {
  // the pictures load while the first page is read
  for (const b of beats) {
    const art = speakerArt(b.who);
    if (art) new Image().src = asset(`assets/heroes/${art}.jpg`);
  }
  let i = -1;
  let closed = false;
  let side: 'left' | 'right' = 'right';
  let lastWho: Beat['who'] | null = null;
  const stage = h('div', { class: 'comic__stage' });
  const dots = h('div', { class: 'comic__dots', 'aria-hidden': 'true' }, ...beats.map(() => h('i')));
  const skip = h('button', { class: 'btn btn--ghost btn--small comic__skip', 'data-testid': 'comic-skip' }, t('Skip'));
  const el = h(
    'div',
    { class: 'comic', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title ?? t('Story'), 'data-testid': 'comic', tabindex: '-1' },
    o.map ? h('div', { class: 'comic__bg', style: `background-image:url("${asset(`assets/maps/${o.map}.jpg`)}")` }) : null,
    h('div', { class: 'comic__top' }, h('span', { class: 'comic__title' }, o.title ?? ''), skip),
    stage,
    h('div', { class: 'comic__bottom' }, dots, h('span', { class: 'comic__hint' }, t('Tap to continue'))),
  );
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    el.remove();
  };
  const finish = () => {
    if (closed) return;
    close();
    o.onDone();
  };
  const next = () => {
    if (closed) return;
    i++;
    if (i >= beats.length) return finish();
    const b = beats[i]!;
    const fx = b.fx ?? null;
    el.classList.toggle('comic--neon', fx === 'neon');
    el.classList.toggle('comic--vhs', fx === 'vhs');
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= i));
    const art = speakerArt(b.who);
    let panel: HTMLElement;
    if (!art) {
      panel = h('figure', { class: 'comic__panel comic__panel--caption', 'data-testid': 'comic-panel' }, h('div', { class: 'comic__caption' }, line(b.say)));
    } else {
      if (lastWho !== null && lastWho !== b.who) side = side === 'left' ? 'right' : 'left';
      lastWho = b.who;
      panel = h(
        'figure',
        { class: `comic__panel comic__panel--${side}`, 'data-testid': 'comic-panel', 'data-who': b.who },
        h('img', { class: 'comic__art', src: asset(`assets/heroes/${art}.jpg`), alt: '', draggable: 'false' }),
        h('figcaption', { class: 'comic__bubble' }, h('b', { class: 'comic__who' }, speakerName(b.who)), h('span', null, line(b.say))),
      );
    }
    stage.replaceChildren(panel);
  };
  const onKey = (e: KeyboardEvent) => {
    if (closed) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  };
  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    finish();
  });
  el.addEventListener('click', () => next());
  window.addEventListener('keydown', onKey, true);
  root.append(el);
  el.focus({ preventScroll: true });
  next();
  return close;
}
