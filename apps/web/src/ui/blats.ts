/**
 * v0.2.18 (the owner: «сделай в арсенале раздел для покупки БЛАТ и рекламный баннер, что их можно купить»):
 * the BLATS banner — on the menu under the Dossier and the Arsenal, and as the head of the Arsenal's
 * «Buy BLATS» section — and the packs' «enough for» hints.
 *
 * The banner never promises what the server can't do: «Buy» only when a payment provider is connected —
 * on the website `ShopConfig.card` (Xsolla or Stripe), inside Telegram Telegram Stars (`ShopConfig.stars`,
 * v0.2.18 part 3); otherwise «On sale soon».
 */
import { CHARACTER_GRADE_PRICES, DIAMOND_PACKS, SKIN_PRICES } from '@blatkom/shared';
import type { ShopConfig } from '@blatkom/shared';
import { asset, h } from './dom.js';
import { getLang, t } from '../i18n/index.js';
import { blatsCoin, fmtNum } from './coin.js';

/**
 * What a purchase can do right now: buy on the website, buy for Telegram Stars inside Telegram, or wait
 * («soon» on the website, «stars-soon» inside Telegram while Stars are not on sale).
 */
export type BlatsSale = 'buy' | 'soon' | 'stars' | 'stars-soon';

export function blatsSale(cfg: Pick<ShopConfig, 'card'> & Partial<Pick<ShopConfig, 'stars'>> | null, inTelegram: boolean): BlatsSale {
  if (inTelegram) return cfg?.stars ? 'stars' : 'stars-soon';
  return cfg?.card ? 'buy' : 'soon';
}

/** The smallest pack's price in Stars (inside Telegram), for the banner's line. */
let firstStars: number | null = null;
export function setBannerStars(stars: Record<string, number> | null | undefined): void {
  const first = DIAMOND_PACKS[0];
  firstStars = (first && stars?.[first.id]) || null;
}

/** $0.99 */
export function usdOf(blats: number): string {
  return `$${(blats / 100).toFixed(2)}`;
}

/** A small pile of red coins — 1 to 6 — growing with the pack (each coin a little up and to the right). */
export function coinPile(n: number, size = 28): HTMLElement {
  const count = Math.max(1, Math.min(6, Math.round(n)));
  const dx = Math.round(size * 0.34);
  const dy = Math.round(size * 0.2);
  const pile = h('span', { class: 'coinpile', 'aria-hidden': 'true', style: `width:${size + (count - 1) * dx}px;height:${size + (count - 1) * dy}px` });
  for (let i = 0; i < count; i++) {
    const c = blatsCoin(size, '');
    c.style.left = `${i * dx}px`;
    c.style.bottom = `${i * dy}px`;
    pile.append(c);
  }
  return pile;
}

/**
 * What a pack is enough for — the biggest single thing it buys, from the price tables (so a price change
 * changes the hint): a regular skin (99), a regular character (199), a rare character (399), a legendary
 * skin (499), an epic character (799), a legendary character (1 099), a legendary and an epic one, or N
 * legendary characters.
 */
export function packHint(amount: number): string | null {
  const L = CHARACTER_GRADE_PRICES.legendary;
  const E = CHARACTER_GRADE_PRICES.epic;
  const R = CHARACTER_GRADE_PRICES.rare;
  const C = CHARACTER_GRADE_PRICES.common;
  if (amount >= 2 * L) return t('{n} × legendary character', { n: Math.floor(amount / L) });
  if (amount >= L + E) return t('a legendary and an epic character');
  if (amount >= L) return t('a legendary character');
  if (amount >= E) return t('an epic character');
  if (amount >= SKIN_PRICES.legendary) return t('a legendary skin');
  if (amount >= R) return t('a rare character');
  if (amount >= C) return t('a regular character');
  if (amount >= SKIN_PRICES.common) return t('a regular skin');
  return null;
}

/**
 * The banner: the coins, «BLATS», what they buy, the smallest pack and its price (and «on sale soon» while
 * nothing can be bought), and «Buy →» — or, at the head of the Arsenal's section, `right` (the player's
 * balance) in place of the button and the section's own `line` / `note`.
 */
export function blatsBanner(o: { kind: 'menu' | 'section'; sale: BlatsSale; onClick?: () => void; right?: HTMLElement; line?: string; note?: string }): HTMLElement {
  const cta = o.right ?? h('span', { class: 'blatsban__cta', 'data-testid': `blats-banner-${o.kind}-cta` });
  const body = [
    coinPile(3, o.kind === 'menu' ? 30 : 36),
    h(
      'span',
      { class: 'blatsban__txt' },
      h('b', { class: 'blatsban__title' }, o.kind === 'menu' ? t('BLATS') : t('Buy BLATS')),
      h('span', { class: 'blatsban__line' }, o.line ?? t('Characters, skins and the case — for BLATS')),
      h('small', { class: 'blatsban__from' }, o.note ?? ''),
    ),
    cta,
  ];
  const el = o.onClick
    ? h('button', { class: `blatsban blatsban--${o.kind}`, type: 'button', 'data-testid': `blats-banner-${o.kind}`, 'aria-label': t('Open the BLATS section'), onclick: o.onClick }, ...body)
    : h('div', { class: `blatsban blatsban--${o.kind}`, 'data-testid': `blats-banner-${o.kind}` }, ...body);
  if (o.note !== undefined) el.dataset.fixedNote = '1';
  setBannerSale(el, o.sale);
  return el;
}

/**
 * v0.2.19 (the owner: «замени на главной странице баннер BLAT на тот, который я тебе прикрепил»): the menu's
 * banner is the owner's art (laid out 4:1 by tools/make-menu-art.py, in the player's language) with the packs'
 * line and the arrow over its skyline; the same «Buy» rules as the drawn banner.
 */
export function blatsArtBanner(o: { sale: BlatsSale; onClick: () => void }): HTMLElement {
  const lang = getLang() === 'ru' ? 'ru' : 'en';
  const el = h(
    'button',
    { class: 'blatsart', type: 'button', 'data-testid': 'blats-banner-menu', 'aria-label': t('Open the BLATS section'), onclick: o.onClick },
    h('img', { class: 'blatsart__img', 'data-testid': 'blats-banner-art', src: asset(`assets/ui/blats_banner_${lang}.jpg`), alt: t('Buy BLATS'), width: '1600', height: '400', draggable: 'false' }),
    h('span', { class: 'blatsart__foot' }, h('small', { class: 'blatsban__from' }), h('span', { class: 'blatsban__cta', 'data-testid': 'blats-banner-menu-cta' })),
  );
  setBannerSale(el, o.sale);
  return el;
}

/** Repaints the banner's «Buy →» and its packs line when the shop's configuration arrives. */
export function setBannerSale(el: HTMLElement, sale: BlatsSale): void {
  el.dataset.sale = sale;
  const cta = el.querySelector<HTMLElement>('.blatsban__cta');
  if (cta) cta.textContent = sale === 'buy' || sale === 'stars' ? t('Buy →') : '→';
  const from = el.querySelector<HTMLElement>('.blatsban__from');
  const first = DIAMOND_PACKS[0];
  if (from && !el.dataset.fixedNote && first) {
    const price = sale === 'stars' && firstStars ? `⭐ ${fmtNum(firstStars)}` : usdOf(first.usdCents);
    const packs = t('Packs from {n} · {usd}', { n: fmtNum(first.diamonds), usd: price });
    from.textContent = sale === 'buy' || sale === 'stars' ? packs : `${packs} · ${t('on sale soon')}`;
  }
}
