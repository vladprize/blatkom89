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

const GAP = 6;
/** The room round the sheet's body: the layer's and the sheet's paddings, its head with the ✕, the gap under it. */
export interface PickerRoom {
  vw: number;
  vh: number;
  /** The screen's safe areas (a notch, Telegram's bars). */
  safe?: { top: number; bottom: number; left: number; right: number };
}
/**
 * The picker's sizes for a screen — always the characters at the left and the card at the right (the owner: «меню
 * со всеми персонажами слева от карточки»), the card's button under it: the card as tall as the sheet allows
 * while the grid keeps four columns of 40 px at least; the grid in whole rows where the number allows (36:
 * 6 × 6, 9 × 4) and as big as fits. Nothing in the sheet scrolls.
 */
export function pickerLayout(room: PickerRoom, n: number): { cols: number; cell: number; width: number } {
  const { vw, vh } = room;
  const safe = room.safe ?? { top: 0, bottom: 0, left: 0, right: 0 };
  // a phone held sideways: the sheet nearly the whole screen (ui/styles.css: .sheetlay:has(.sheet--pick))
  const sideways = vh <= 500 && vw > vh;
  const wide = vw >= 761 && !sideways;
  const W = (wide ? Math.min(1060, vw - 48) : vw - (sideways ? 16 : 12) - safe.left - safe.right) - 24;
  const H = (wide ? Math.min(760, vh - 48) : vh - (sideways ? 16 : 10) - safe.top - safe.bottom) - 76;
  // under the card: the gap and its button (two lines on a narrow card)
  const under = 64;
  const minGrid = 4 * 40 + 3 * GAP;
  const width = Math.floor(Math.max(100, Math.min(400, (H - under) / 1.42, W - 14 - minGrid)));
  const GW = W - 14 - width;
  let best = { cols: 4, cell: 0, score: -1 };
  for (let cols = 4; cols <= 12; cols++) {
    const rows = Math.ceil(n / cols);
    const cell = Math.floor(Math.min((GW - (cols - 1) * GAP) / cols, (H - (rows - 1) * GAP) / rows, 84));
    const score = cell * (n % cols === 0 ? 1.2 : 1);
    if (score > best.score) best = { cols, cell, score };
  }
  return { cols: best.cols, cell: Math.max(28, best.cell), width };
}

/** The screen's safe areas in pixels (the CSS works them out from the notch and Telegram's bars). */
export function safeInsets(root: HTMLElement): { top: number; bottom: number; left: number; right: number } {
  const probe = h('div', { style: 'position:fixed;visibility:hidden;pointer-events:none;padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)' });
  root.append(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  const r = { top: px(cs.paddingTop), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft), right: px(cs.paddingRight) };
  probe.remove();
  return r;
}

export interface CardPickerOptions {
  inTelegram?: boolean;
  /** The characters, in the picker's order. */
  ids: readonly string[];
  current: string;
  owned: (id: string) => boolean;
  /** The player's card with this character (their main weapon in its skin; the character's name on its strip). */
  card: (id: string) => FighterCardData;
  portrait: (id: string) => HTMLElement;
  /** «ПРУСАК «Подпольщик»» (the cells' names for a screen reader and a mouse's tooltip). */
  name: (id: string) => string;
  /** The character's grade, for the line under its portrait. */
  grade: (id: string) => string;
  /** A locked character's price («99 БЛАТ ($0.99)»), or null. */
  price: (id: string) => string | null;
  /** An owned character chosen (the menu behind updates once the sheet closes). */
  onPick: (id: string) => void;
  /** A locked one's «Buy»: the character screen at it. */
  onLocked: (id: string) => void;
  /** The sheet closed (with whatever was picked last). */
  onClose?: () => void;
}

/**
 * v0.2.25 (the owner: «при нажатии на карточку — меню со всеми персонажами слева от карточки, вместо только
 * «Поделиться»; легко закрыть»): every character at the left, the player's card big at the right — a tap on one
 * in the crew takes them at once (the card changes), a locked one shows their card greyed with a «Buy» that
 * leads to the character screen; an owned one keeps «Share». Closes with the big ✕, a tap outside, Escape or
 * the back button.
 */
export function openCardPicker(root: HTMLElement, o: CardPickerOptions): void {
  const vw = root.clientWidth || window.innerWidth;
  const vh = root.clientHeight || window.innerHeight;
  const { cols, cell, width } = pickerLayout({ vw, vh, safe: safeInsets(root) }, o.ids.length);
  let shown = o.current;
  const card = new FighterCard(o.card(shown), { shape: 'tall', width });
  const pic = h('div', { class: 'cardview__pic' }, card.el);
  const note = h('div', { class: 'muted cardview__note', hidden: true }, t('Press and hold the picture to save it.'));
  const lockMark = h('div', { class: 'cardpick__lock', hidden: true }, '🔒');
  const grid = h('div', { class: 'cardpick__grid', role: 'radiogroup', 'aria-label': t('Characters'), style: `--cell:${cell}px;--cols:${cols}` });
  const share = h(
    'button',
    {
      class: 'btn btn--red',
      'data-testid': 'card-share',
      onclick: () => {
        void shareCard(card).then((r) => {
          if (r === 'saved') toast(t('The card is saved as a picture'));
          else if (r === 'failed' || (o.inTelegram && r !== 'shared')) {
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
  const buy = h('button', { class: 'btn btn--red', 'data-testid': 'cardpick-buy', hidden: true, onclick: () => (sheet.close(), o.onLocked(shown)) }, `${t('Buy')} ›`);
  const priceEl = h('div', { class: 'cardpick__price', 'data-testid': 'cardpick-price', hidden: true });
  const draw = () => {
    grid.replaceChildren(
      ...o.ids.map((id) =>
        h(
          'button',
          {
            role: 'radio',
            'aria-checked': String(id === shown),
            'aria-label': o.name(id),
            title: o.name(id),
            class: `cardpick__cell chargrade--${o.grade(id)} ${o.owned(id) ? '' : 'locked'}`,
            'data-character': id,
            onclick: () => {
              if (id === shown) return;
              shown = id;
              if (o.owned(id)) o.onPick(id);
              card.set(o.card(id));
              draw();
            },
          },
          o.portrait(id),
        ),
      ),
    );
    const owned = o.owned(shown);
    lockMark.hidden = owned;
    card.el.classList.toggle('cardpick__card--locked', !owned);
    share.hidden = !owned;
    buy.hidden = owned;
    const price = owned ? null : o.price(shown);
    priceEl.textContent = price ?? '';
    priceEl.hidden = !price;
  };
  draw();
  const sheet = openSheet(root, {
    title: t('Fighter card'),
    testid: 'card-viewer',
    cls: 'sheet--card sheet--pick',
    body: h(
      'div',
      { class: 'cardpick' },
      grid,
      h('div', { class: 'cardpick__side', style: `width:${width}px` }, h('div', { class: 'cardpick__pic' }, pic, lockMark), note, h('div', { class: 'cardpick__acts' }, priceEl, share, buy)),
    ),
    onClose: () => {
      card.destroy();
      o.onClose?.();
    },
  });
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
