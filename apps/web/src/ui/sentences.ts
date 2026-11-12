/**
 * v0.2.25 (the owner: «съезжает текст по строчкам… новые предложения должны чаще всего начинаться с новой
 * строчки»): in the game's descriptions every sentence starts on a line of its own. The texts themselves stay
 * one string; `watchSentences` breaks the text of the description blocks (SELECTOR) wherever they appear —
 * a screen, a sheet, a tab drawn again — and the CSS shows the breaks (white-space: pre-line).
 */

/** What may stand before a full stop without ending a sentence: an initial («А. Аркадьев»), «No. 3», «т. е.». */
const ABBR = /(?:^|[\s«("„“])(?:[A-ZА-ЯЁ]|No|Nr|г|гг|ул|им|т|т\.\s?е|т\.\s?д|Dr|Mr|Mrs|Ms|St|vs|etc|e\.g|i\.e)$/u;

/** The text with a line break after every sentence that has another one after it. */
export function bySentence(s: string): string {
  return s.replace(/([.!?…]+[»"”]?)([ \t]+)(?=[«"„“(A-ZА-ЯЁ0-9])/gu, (m: string, end: string, _sp: string, at: number) => {
    if (/^\.(?!\.)/.test(end) && ABBR.test(s.slice(0, at))) return m;
    return `${end}\n`;
  });
}

/** The blocks of description text (ui/styles.css gives them `white-space: pre-line`). */
export const SENTENCE_BLOCKS = '.lore, .arsnote, .dressing__blurb, .itemsheet__blurb, .casetab__note, .dossier__note, .charsheet__marks, .sents, .dossier__fields .field > span, .dossier__marks > span';

/** Breaks the sentences of the description blocks inside `root` (and `root` itself), each block once. */
export function breakSentences(root: Element): void {
  const blocks = [...(root.matches(SENTENCE_BLOCKS) ? [root] : []), ...root.querySelectorAll(SENTENCE_BLOCKS)];
  for (const el of blocks) {
    if (!(el instanceof HTMLElement) || el.dataset.sents === '1') continue;
    el.dataset.sents = '1';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue ?? '';
      const b = bySentence(v);
      if (b !== v) n.nodeValue = b;
    }
  }
}

/** Keeps breaking the sentences of whatever is drawn inside `root` from now on. */
export function watchSentences(root: HTMLElement): () => void {
  breakSentences(root);
  const mo = new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n instanceof Element) breakSentences(n);
  });
  mo.observe(root, { childList: true, subtree: true });
  return () => mo.disconnect();
}
