/**
 * The comic before and after a story mission (and the prologue), one line at a time.
 *
 * Where the place has its big picture (story/scenes.ts — every map, and 2089's hall) the page is that
 * scene on the whole screen — the camera slowly pushing in — or the place's map faint behind; a new place
 * fades in. v0.2.20 (the owner: «сначала сверху первая, снизу вторая, потом они стираются…; по два
 * персонажа с репликами, расположены по центру»): the lines come two to a page, in the middle of the
 * screen — the first speaker on top (portrait on the left, the bubble on its right), the next speaker's
 * reply under it, mirrored (the bubble, then the portrait on the right); the next tap clears both. A line
 * by the same speaker, the narrator's caption or a new place starts a new page. 2089 in neon, 1989 on
 * tape. The soundtrack plays very quietly behind the pages. A tap, a click, Space, Enter or → shows the
 * next line; «Skip» ends it.
 */
import type { MapId } from '@blatkom/shared';
import { t } from '../i18n/index.js';
import { asset, h } from '../ui/dom.js';
import { music } from '../game/audio/Music.js';
import { line } from './script.js';
import type { Beat } from './script.js';
import { speakerArt, speakerName } from './overlay.js';
import { SCENE_FOCUS, beatScene, sceneUrl } from './scenes.js';
import type { SceneId } from './scenes.js';

export interface ComicOptions {
  /** A line over the pages («Mission 1 · Reveille»). */
  title?: string;
  /** The mission's map, faint behind pages without a scene (where it all happens). */
  map?: MapId;
  /** The place's big picture behind the pages (a page in 2089 shows the BLATKOM hall unless it names one). */
  scene?: SceneId | null;
  onDone: () => void;
}

/** Shows the pages over `root`; returns a function that closes them (without calling `onDone`). */
export function playComic(root: HTMLElement, beats: readonly Beat[], o: ComicOptions): () => void {
  // the pictures load while the first page is read
  const scenes = new Set<SceneId>();
  for (const b of beats) {
    const art = b.art ?? speakerArt(b.who);
    if (art) new Image().src = asset(`assets/heroes/${art}.jpg`);
    const sc = beatScene(b, o.scene);
    if (sc) scenes.add(sc);
  }
  for (const sc of scenes) new Image().src = sceneUrl(sc);
  let i = -1;
  let closed = false;
  /** The speaker of the page's first line while the page has room for a reply (null: the next line starts a page). */
  let opener: Beat['who'] | null = null;
  let shown: SceneId | null = null;
  const stage = h('div', { class: 'comic__stage' });
  const backdrop = h('div', { class: 'comic__scenes', 'aria-hidden': 'true' });
  const dots = h('div', { class: 'comic__dots', 'aria-hidden': 'true' }, ...beats.map(() => h('i')));
  const skip = h('button', { class: 'btn btn--ghost btn--small comic__skip', 'data-testid': 'comic-skip' }, t('Skip'));
  const el = h(
    'div',
    { class: 'comic', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title ?? t('Story'), 'data-testid': 'comic', tabindex: '-1' },
    o.map ? h('div', { class: 'comic__bg', style: `background-image:url("${asset(`assets/maps/${o.map}.jpg`)}")` }) : null,
    backdrop,
    h('div', { class: 'comic__shade', 'aria-hidden': 'true' }),
    h('div', { class: 'comic__top' }, h('span', { class: 'comic__title' }, o.title ?? ''), skip),
    stage,
    h('div', { class: 'comic__bottom' }, dots, h('span', { class: 'comic__hint' }, t('Tap to continue'))),
  );
  /** The big picture: the same place stays (and keeps its slow push), a new one fades in over it. */
  const showScene = (sc: SceneId | null) => {
    el.classList.toggle('comic--scene', !!sc);
    if (sc === shown) return;
    shown = sc;
    for (const old of [...backdrop.children]) {
      old.classList.add('comic__scene--out');
      setTimeout(() => old.remove(), 700);
    }
    if (!sc) return;
    const [fx, fy] = SCENE_FOCUS[sc];
    backdrop.append(h('img', { class: 'comic__scene', 'data-testid': 'comic-scene', 'data-scene': sc, src: sceneUrl(sc), alt: '', draggable: 'false', style: `--fx:${fx}%;--fy:${fy}%` }));
  };
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    el.remove();
    // back to the menu level — or, when a mission starts now, faded out with the match
    music.setQuiet(false);
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
    const sc = beatScene(b, o.scene);
    el.classList.toggle('comic--neon', fx === 'neon');
    el.classList.toggle('comic--vhs', fx === 'vhs');
    showScene(sc);
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= i));
    const art = b.who === 'caption' ? null : (b.art ?? speakerArt(b.who));
    // v0.2.17: a caption page sits in the middle of the screen, big
    el.classList.toggle('comic--captionpage', !art);
    const prev = i > 0 ? beats[i - 1]! : null;
    // a reply joins the page: another speaker, straight after a speaker's line, in the same place and look
    const reply = !!art && opener !== null && opener !== b.who && !!prev && beatScene(prev, o.scene) === sc && (prev.fx ?? null) === fx;
    let panel: HTMLElement;
    if (!art) {
      panel = h('figure', { class: 'comic__panel comic__panel--caption', 'data-testid': 'comic-panel' }, h('div', { class: 'comic__caption' }, line(b.say)));
    } else {
      panel = h(
        'figure',
        { class: `comic__panel comic__panel--${reply ? 'right' : 'left'}`, 'data-testid': 'comic-panel', 'data-who': b.who },
        h('img', { class: 'comic__art', src: asset(`assets/heroes/${art}.jpg`), alt: '', draggable: 'false' }),
        h('figcaption', { class: 'comic__bubble' }, h('b', { class: 'comic__who' }, speakerName(b.who)), h('span', null, line(b.say))),
      );
    }
    if (reply) {
      stage.append(panel);
      opener = null;
    } else {
      stage.replaceChildren(panel);
      opener = art ? b.who : null;
    }
    el.classList.toggle('comic--pair', stage.children.length > 1);
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
  // the soundtrack very quietly behind the pages (before a mission, after it, the prologue)
  music.setWanted(true);
  music.setQuiet(true);
  next();
  return close;
}
