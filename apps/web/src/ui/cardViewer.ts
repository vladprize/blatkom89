/**
 * v0.2.23: a fighter card big, in a sheet — and «Share»: the card as a picture through the system's share
 * sheet (a phone: Telegram, WhatsApp, stories…) with the game's address, or saved as a file where sharing
 * files isn't there (a computer). Inside Telegram, where neither works everywhere, the picture is shown so a
 * long press saves it.
 */
import { FighterCard } from './fighterCard.js';
import type { FighterCardData } from './fighterCard.js';
import { openSheet } from './sheet.js';
import { h, toast } from './dom.js';
import { t } from '../i18n/index.js';

const FILE = 'blatkom89-card.png';

/** Shares (or saves) a card as a PNG; says what happened. */
export async function shareCard(card: FighterCard): Promise<'shared' | 'saved' | 'cancelled' | 'failed'> {
  const blob = await card.toBlob();
  if (!blob) return 'failed';
  const text = `${t('My fighter in BLATKOM ’89')} — ${location.origin}`;
  try {
    const file = new File([blob], FILE, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text, title: 'BLATKOM ’89' });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: FILE, style: 'display:none' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** Opens the card big over `root`. */
export function openCardViewer(root: HTMLElement, d: FighterCardData, o: { inTelegram?: boolean } = {}): void {
  const vw = root.clientWidth || window.innerWidth;
  const vh = root.clientHeight || window.innerHeight;
  const width = Math.floor(Math.max(200, Math.min(340, vw - 64, (vh - 190) / 1.42)));
  const card = new FighterCard(d, { shape: 'tall', width });
  const pic = h('div', { class: 'cardview__pic' }, card.el);
  const note = h('div', { class: 'muted cardview__note', hidden: true }, t('Press and hold the picture to save it.'));
  const share = h(
    'button',
    {
      class: 'btn btn--red',
      'data-testid': 'card-share',
      onclick: () => {
        void shareCard(card).then((r) => {
          if (r === 'saved') toast(t('The card is saved as a picture'));
          else if (r === 'failed' || (o.inTelegram && r !== 'shared')) {
            // Telegram's own browser: show the picture itself — a long press saves it
            void card.toBlob().then((b) => {
              if (!b) return;
              const img = h('img', { class: 'cardview__img', src: URL.createObjectURL(b), alt: t('Your fighter card'), width: String(width) });
              pic.replaceChildren(img);
              note.hidden = false;
            });
          }
        });
      },
    },
    t('Share'),
  );
  openSheet(root, {
    title: t('Fighter card'),
    testid: 'card-viewer',
    cls: 'sheet--card',
    body: h('div', { class: 'cardview' }, pic, note),
    actions: share,
    onClose: () => card.destroy(),
  });
}
