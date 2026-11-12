/**
 * v0.2.25 — the hidden comic (the owner: «пасхалка — отсылка на мем „цветочный лох“ с репликами оттуда»).
 * The meme's lines, said by our own characters (no real people): Borka with a bouquet asks Gosha not to film
 * a fight, Gosha unloads on him, a week later they shake hands. Opens with five quick taps on Borka's
 * portrait in his personal file, or by typing «цветы» / «flowers» in the menu.
 */
import { playComic } from './comic.js';
import { FLOWERS } from './flowers.js';
import { t } from '../i18n/index.js';

export { FLOWERS };

/** Plays the comic over `root`; `onDone` once it is over (or skipped). */
export function playFlowers(root: HTMLElement, onDone: () => void = () => {}): () => void {
  return playComic(root, FLOWERS, { title: t('«Flower Loser»'), scene: 'yard', onDone });
}

/** Counts quick taps: true on the `n`-th within `ms` of the first. */
export function tapCounter(n = 5, ms = 4000): () => boolean {
  let taps: number[] = [];
  return () => {
    const now = Date.now();
    taps = [...taps.filter((x) => now - x < ms), now];
    if (taps.length < n) return false;
    taps = [];
    return true;
  };
}

/** Watches the keyboard for a word typed outside text fields («цветы» or «flowers»). */
export function watchWord(words: readonly string[], onWord: () => void): () => void {
  let typed = '';
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-16);
    if (words.some((w) => typed.endsWith(w))) {
      typed = '';
      onWord();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
